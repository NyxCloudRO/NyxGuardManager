import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { verifyNyxGuardEnvelope, PRODUCT, CAPABILITY } from "../licensing/verify.mjs";
import { LicensingClient } from "../licensing/client.mjs";
import { seal, unseal } from "../licensing/store.mjs";

const installation = "11111111-1111-4111-8111-111111111111";
const activation = "22222222-2222-4222-8222-222222222222";
const entitlement = "33333333-3333-4333-8333-333333333333";
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicRaw = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
const trust = { "synthetic-test-key": { publicKey: publicRaw.toString("base64"),
	fingerprint: createHash("sha256").update(publicRaw).digest("base64url"), status: "active" } };
const now = Date.parse("2026-09-24T12:00:00Z");
const format = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");
function envelope(overrides = {}) {
	const p = { activation_id: activation, capabilities: [CAPABILITY], entitlement_id: entitlement,
		expires_at: format(now + 86400000), installation_id: installation, issued_at: format(now - 3600000),
		kid: "synthetic-test-key", not_before: format(now - 3600000), offline_grace_seconds: 604800,
		policy_version: 1, product: PRODUCT, revision: 1, schema_version: 1, status: "active", subject: "synthetic_subject_1234", ...overrides };
	const bytes = Buffer.from(JSON.stringify(p));
	return { envelope_version: 1, alg: "Ed25519", kid: "synthetic-test-key", payload: bytes.toString("base64url"),
		signature: sign(null, bytes, privateKey).toString("base64url") };
}
const verify = (value, options = {}) => verifyNyxGuardEnvelope(Buffer.from(JSON.stringify(value)), { trust, installationId: installation, activationId: activation, now, ...options });

test("signed NyxGuard envelope and all product/binding denials", () => {
	assert.equal(verify(envelope()).payload.product, PRODUCT);
	for (const [name, value] of Object.entries({
		veleis: { product: "veleis-professional-support" }, unknown: { product: "unknown-product" },
		capability: { capabilities: ["diagnostics_support"] }, installation: { installation_id: "44444444-4444-4444-8444-444444444444" },
		activation: { activation_id: "44444444-4444-4444-8444-444444444444" },
		expired: { expires_at: format(now - 1000) }, revoked: { status: "revoked" },
	})) assert.throws(() => verify(envelope(value)), undefined, name);
	assert.throws(() => verify(envelope(), { minimumRevision: 2 }), /stale_revision/);
	const altered = envelope(); altered.payload = altered.payload.replace(/.$/, altered.payload.at(-1) === "A" ? "B" : "A");
	assert.throws(() => verify(altered));
	assert.throws(() => verifyNyxGuardEnvelope('{"alg":"Ed25519","alg":"Ed25519"}', { trust, now }));
});

test("vault encryption rejects tampering and plaintext leakage", () => {
	const key = Buffer.alloc(32, 0x7d);
	const secret = { refreshCredential: "SYNTHETIC-SECRET-CREDENTIAL" };
	const sealed = seal(secret, key);
	assert.ok(!sealed.includes(secret.refreshCredential));
	assert.deepEqual(unseal(sealed, key), secret);
	const tampered = Buffer.from(sealed, "base64url"); tampered[tampered.length - 1] ^= 1;
	assert.throws(() => unseal(tampered.toString("base64url"), key));
});

class MemoryStore {
	constructor() { this.data = { installationId: installation, revisionFloor: 0, state: null }; this.upload = null; }
	async read() { return structuredClone(this.data); }
	async write(state, floor) { if (floor < this.data.revisionFloor) throw Error("revision_rollback"); this.data.state = structuredClone(state); this.data.revisionFloor = floor; }
	async pendingUpload() { return this.upload; }
	async createUpload(key, sha256, bundle) { this.upload = { key, sha256, bundle }; }
	async completeUpload(key, supportId) { assert.equal(key, this.upload.key); this.supportId = supportId; this.upload = null; }
}
const response = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

test("claim, activation, refresh denial and core-independent support state", async () => {
	const store = new MemoryStore();
	const signed = envelope();
	const requests = [];
	const fetchImpl = async (url, options) => {
		requests.push({ url, options });
		if (url.endsWith("/claims/exchange")) return response(200, { activation_proof: "a".repeat(43) });
		if (url.endsWith("/activations")) return response(200, { activation_id: activation, refresh_credential: "b".repeat(43), signed_entitlement: signed, authoritative_revision: 1 });
		if (url.endsWith("/refresh")) return response(403, { result: "requires_reactivation", authoritative_revision: 2 });
		throw Error("unexpected request");
	};
	const client = new LicensingClient({ store, authorityOrigin: "https://authority.example.invalid", fetchImpl, trust, now: () => now });
	assert.equal((await client.status()).state, "NOT_CONFIGURED");
	await client.claim("c".repeat(43));
	assert.equal((await client.status()).state, "NOT_CONFIGURED");
	await client.activate();
	assert.equal((await client.status()).state, "ACTIVE");
	assert.equal((await client.status()).product, PRODUCT);
	assert.equal(store.data.revisionFloor, 1);
	await assert.rejects(client.refresh(), /license_revoked/);
	assert.equal((await client.status()).state, "REVOKED");
	assert.equal(store.data.state.refreshCredential, undefined);
	assert.equal(requests.length, 3);
});

test("offline grace is bounded and upload requires current online state", async () => {
	const store = new MemoryStore(); store.data.state = { activationId: activation, refreshCredential: "b".repeat(43),
		envelope: envelope(), lastVerified: now - 1000, authorityUnavailable: true }; store.data.revisionFloor = 1;
	const client = new LicensingClient({ store, authorityOrigin: "https://authority.example.invalid", supportOrigin: "https://support.example.invalid", trust, now: () => now });
	assert.equal((await client.status()).state, "OFFLINE_GRACE");
	await assert.rejects(client.upload('{}', "5.0.0"), /support_upload_not_authorized/);
	store.data.state.lastVerified = now - 8 * 86400000;
	assert.equal((await client.status()).state, "AUTHORITY_UNAVAILABLE");
});

test("invalid authority refresh fails closed despite a cached valid grant", async () => {
	const store = new MemoryStore();
	store.data.state = { activationId: activation, refreshCredential: "b".repeat(43), envelope: envelope(), lastVerified: now };
	store.data.revisionFloor = 1;
	const client = new LicensingClient({ store, authorityOrigin: "https://authority.example.invalid",
		fetchImpl: async () => response(200, { signed_entitlement: envelope({ product: "veleis-professional-support" }), authoritative_revision: 1 }),
		trust, now: () => now });
	assert.equal((await client.status()).state, "ACTIVE");
	await assert.rejects(client.refresh(), /invalid_product_policy/);
	assert.equal((await client.status()).state, "INVALID");
});

test("support upload retries exact bytes and never selects storage", async () => {
	const store = new MemoryStore(); store.data.state = { activationId: activation, refreshCredential: "b".repeat(43),
		envelope: envelope(), lastVerified: now, authorityUnavailable: false }; store.data.revisionFloor = 1;
	const sent = [];
	const fetchImpl = async (url, options) => {
		sent.push({ url, body: options.body, headers: options.headers });
		return sent.length === 1 ? response(503, { category: "storage_unavailable" }) :
			response(201, { support_id: "NYX-20260924-" + "A".repeat(24), expires_at: "2026-10-24T12:00:00Z" });
	};
	const client = new LicensingClient({ store, authorityOrigin: "https://authority.example.invalid",
		supportOrigin: "https://support.example.invalid", fetchImpl, trust, now: () => now });
	const bundle = JSON.stringify({ format: "nyxguard-support-bundle-v1", generated_at: format(now) });
	await assert.rejects(client.upload(bundle, "5.0.0"), /upload_failed/);
	const receipt = await client.upload("changed body", "5.0.0");
	assert.match(receipt.support_id, /^NYX-/);
	assert.equal(sent.length, 2);
	assert.equal(sent[0].body, sent[1].body);
	assert.equal(sent[0].headers["Idempotency-Key"], sent[1].headers["Idempotency-Key"]);
	assert.equal(sent[0].url, "https://support.example.invalid/v1/nyxguard/support-bundles");
	assert.ok(!/bucket|object_prefix|storage_credentials/.test(sent[0].body));
});
