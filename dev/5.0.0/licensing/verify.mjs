import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";

export const PRODUCT = "nyxguard-manager-professional-support";
export const CAPABILITY = "nyxguard_diagnostics_support";
const MAX_ENVELOPE = 64 * 1024;
const MAX_PAYLOAD = 32 * 1024;
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const PAYLOAD_KEYS = ["activation_id", "capabilities", "entitlement_id", "expires_at", "installation_id", "issued_at", "kid", "not_before", "offline_grace_seconds", "policy_version", "product", "revision", "schema_version", "status", "subject"];
const ENVELOPE_KEYS = ["alg", "envelope_version", "kid", "payload", "signature"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBJECT = /^[A-Za-z0-9_-]{16,128}$/;
const TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
const keyNames = (value, keys) => Object.keys(value).sort().join("\0") === keys.join("\0");
const validInteger = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const fail = (code) => { throw new Error(code); };
const decodeB64URL = (value, max) => {
	if (typeof value !== "string" || !B64URL.test(value) || value.length > max * 2) fail("malformed_base64url");
	const bytes = Buffer.from(value, "base64url");
	if (bytes.length > max || bytes.toString("base64url") !== value) fail("malformed_base64url");
	return bytes;
};
const parseTime = (value) => {
	if (typeof value !== "string" || !TIME.test(value) || /\.\d*0Z$/.test(value)) fail("invalid_time");
	const time = Date.parse(value);
	if (!Number.isFinite(time)) fail("invalid_time");
	return time;
};

// The public key is the platform build-time verification root, not an authority response.
export const BUILTIN_TRUST = Object.freeze({
	"dev-primary-2026-09-08-01": Object.freeze({
		publicKey: "wsb0aGkJAxOPlsYGKK8SktaktgLUhQuFQ8/unWg0oR0=",
		fingerprint: "IflA5NtpE8yNqJsm-dRKdzKb_zFc8jUPvoG4JI2Rt8w",
		status: "active",
	}),
});

export function verifyNyxGuardEnvelope(encoded, { trust = BUILTIN_TRUST, installationId, activationId, minimumRevision = 0, now = Date.now() } = {}) {
	const raw = Buffer.isBuffer(encoded) ? encoded : Buffer.from(encoded ?? "");
	if (raw.length === 0 || raw.length > MAX_ENVELOPE) fail("malformed_envelope");
	let envelope;
	try { envelope = JSON.parse(raw.toString("utf8")); } catch { fail("malformed_envelope"); }
	if (!envelope || Array.isArray(envelope) || typeof envelope !== "object" || !keyNames(envelope, ENVELOPE_KEYS)) fail("malformed_envelope");
	// Outer JSON is not signed. Reject duplicates rather than letting JSON.parse choose one.
	for (const key of ENVELOPE_KEYS) {
		const matches = raw.toString("utf8").match(new RegExp(`"${key}"\\s*:`, "g"));
		if (matches?.length !== 1) fail("malformed_envelope");
	}
	if (envelope.envelope_version !== 1 || envelope.alg !== "Ed25519" || typeof envelope.kid !== "string") fail("invalid_envelope_policy");
	const trusted = trust[envelope.kid];
	if (!trusted || !["active", "retired"].includes(trusted.status)) fail("unknown_trust_key");
	const publicKey = Buffer.from(trusted.publicKey, "base64");
	if (publicKey.length !== 32 || createHash("sha256").update(publicKey).digest("base64url") !== trusted.fingerprint) fail("invalid_trust_key");
	const payloadBytes = decodeB64URL(envelope.payload, MAX_PAYLOAD);
	const signature = decodeB64URL(envelope.signature, 64);
	if (signature.length !== 64) fail("invalid_signature");
	const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, publicKey]), type: "spki", format: "der" });
	if (!verifySignature(null, payloadBytes, key, signature)) fail("invalid_signature");
	let payload;
	try { payload = JSON.parse(payloadBytes.toString("utf8")); } catch { fail("malformed_payload"); }
	if (!payload || Array.isArray(payload) || typeof payload !== "object" || !keyNames(payload, PAYLOAD_KEYS)) fail("malformed_payload");
	// Go's CanonicalPayload writes this exact fixed order. Re-encoding catches duplicate
	// keys, alternate whitespace, unsorted capabilities and non-canonical numbers.
	const canonical = Object.fromEntries(PAYLOAD_KEYS.map((name) => [name, payload[name]]));
	if (JSON.stringify(canonical) !== payloadBytes.toString("utf8")) fail("noncanonical_payload");
	if (payload.schema_version !== 1 || payload.product !== PRODUCT || payload.status !== "active" ||
		!Array.isArray(payload.capabilities) || payload.capabilities.length !== 1 || payload.capabilities[0] !== CAPABILITY ||
		payload.kid !== envelope.kid || !validInteger(payload.revision, 1, Number.MAX_SAFE_INTEGER) ||
		!validInteger(payload.policy_version, 1, Number.MAX_SAFE_INTEGER) ||
		!validInteger(payload.offline_grace_seconds, 0, 604800) || !SUBJECT.test(payload.subject) ||
		![payload.entitlement_id, payload.installation_id, payload.activation_id].every((value) => typeof value === "string" && UUID.test(value))) fail("invalid_product_policy");
	const issued = parseTime(payload.issued_at);
	const notBefore = parseTime(payload.not_before);
	const expires = parseTime(payload.expires_at);
	if (issued > notBefore || notBefore >= expires || issued > now + 300000 || notBefore > now + 300000) fail("invalid_entitlement_time");
	if (now >= expires) fail("expired_entitlement");
	if (installationId && payload.installation_id !== installationId) fail("wrong_installation");
	if (activationId && payload.activation_id !== activationId) fail("wrong_activation");
	if (payload.revision < minimumRevision) fail("stale_revision");
	return Object.freeze({ payload, envelope, expiresAt: new Date(expires).toISOString() });
}
