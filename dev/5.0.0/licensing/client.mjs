import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PRODUCT, PREMIUM_PRODUCT, verifyNyxGuardEnvelope } from "./verify.mjs";

export const STATES = Object.freeze(["NOT_CONFIGURED", "ACTIVE", "EXPIRED", "REVOKED", "INVALID", "REFRESH_REQUIRED", "OFFLINE_GRACE", "AUTHORITY_UNAVAILABLE"]);
const AUTHORITY_PREFIX = Object.freeze({ [PRODUCT]: "/api/v1/nyxguard", [PREMIUM_PRODUCT]: "/api/v1/premium" });
const SUPPORT_PATH = "/v1/nyxguard/support-bundles";
const MAX_BUNDLE = 1_000_000;
const fail = (code) => { throw new Error(code); };
const validOrigin = (raw) => {
	const url = new URL(raw);
	if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
		(url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) fail("endpoint_configuration_invalid");
	return url.origin;
};
const readLimited = async (response, maximum) => {
	if (Number(response.headers.get("content-length")) > maximum) fail("response_too_large");
	const chunks = []; let length = 0;
	if (!response.body) return {};
	for await (const chunk of response.body) {
		length += chunk.length;
		if (length > maximum) { await response.body.cancel?.(); fail("response_too_large"); }
		chunks.push(chunk);
	}
	try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { fail("invalid_response"); }
};
const accepted = (status) => status >= 200 && status < 300;
const authorityPath = (product, path) => {
	if (!Object.hasOwn(AUTHORITY_PREFIX, product)) fail("invalid_product_policy");
	const prefix = AUTHORITY_PREFIX[product];
	return prefix + path;
};

export class LicensingClient {
	constructor({ store, authorityOrigin, supportOrigin, fetchImpl = fetch, trust, now = () => Date.now() }) {
		this.store = store;
		this.authorityOrigin = authorityOrigin ? validOrigin(authorityOrigin) : null;
		this.supportOrigin = supportOrigin ? validOrigin(supportOrigin) : null;
		this.fetch = fetchImpl;
		this.trust = trust;
		this.now = now;
	}
	async request(origin, path, { bearer, body, headers = {}, maximum = 65536, timeout = 5000 } = {}) {
		if (!origin || !path.startsWith("/")) fail("endpoint_unavailable");
		let response;
		try {
			response = await this.fetch(origin + path, { method: "POST", redirect: "error", signal: AbortSignal.timeout(timeout),
				headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...headers },
				body: typeof body === "string" ? body : JSON.stringify(body) });
		} catch { fail("authority_unavailable"); }
		const data = await readLimited(response, maximum);
		return { status: response.status, data };
	}
	async stored() { return this.store.read(); }
	verify(envelope, installationId, activationId, revisionFloor = 0) {
		return verifyNyxGuardEnvelope(Buffer.from(JSON.stringify(envelope)), { trust: this.trust, installationId, activationId, minimumRevision: revisionFloor, now: this.now() });
	}
	async status() {
		let record;
		try { record = await this.stored(); } catch { return { state: "INVALID", enabled: false }; }
		const { installationId, revisionFloor, state } = record;
		if (!state) return { state: "NOT_CONFIGURED", enabled: false, installation_id: installationId };
		if (state.revoked) return { state: "REVOKED", enabled: false, installation_id: installationId, activation_pending: Boolean(state.pendingProof) };
		if (state.invalid) return { state: "INVALID", enabled: false, installation_id: installationId, activation_pending: Boolean(state.pendingProof) };
		if (!state.envelope || !state.activationId) return { state: "NOT_CONFIGURED", enabled: false, installation_id: installationId, activation_pending: Boolean(state.pendingProof) };
		let verified;
		try { verified = this.verify(state.envelope, installationId, state.activationId, revisionFloor); }
		catch (err) { return { state: err.message === "expired_entitlement" ? "EXPIRED" : "INVALID", enabled: false, installation_id: installationId }; }
		const last = Number(state.lastVerified || 0);
		const grace = Math.min(verified.payload.offline_grace_seconds * 1000, 604800000);
		let result = "ACTIVE";
		if (state.authorityUnavailable) result = grace > 0 && this.now() >= last && this.now() - last <= grace ? "OFFLINE_GRACE" : "AUTHORITY_UNAVAILABLE";
		else if (this.now() - last > 12 * 3600000) result = "REFRESH_REQUIRED";
		return { state: result, enabled: result === "ACTIVE" || result === "OFFLINE_GRACE" || result === "REFRESH_REQUIRED", activation_pending: Boolean(state.pendingProof),
			expires_at: verified.expiresAt, installation_id: installationId, revision: verified.payload.revision,
			product: verified.payload.product };
	}
	async claim(code, product = PRODUCT) {
		if (!/^[A-Za-z0-9_-]{32,128}$/.test(code ?? "")) fail("claim_code_invalid");
		const current = await this.stored();
		const pendingInstallationId = current.revisionFloor > 0 ? randomUUID() : current.installationId;
		const result = await this.request(this.authorityOrigin, authorityPath(product, "/claims/exchange"), { bearer: code, body: { contract_version: 1, installation_id: pendingInstallationId } });
		if (!accepted(result.status) || !/^[A-Za-z0-9_-]{32,128}$/.test(result.data.activation_proof ?? "")) fail("claim_rejected");
		await this.store.write({ ...(current.state || {}), pendingProof: result.data.activation_proof, pendingProduct: product, pendingInstallationId }, current.revisionFloor);
		return { result: "claim_exchanged" };
	}
	async activate() {
		const current = await this.stored();
		if (!current.state?.pendingProof || !current.state?.pendingProduct || !current.state?.pendingInstallationId) fail("activation_proof_missing");
		const result = await this.request(this.authorityOrigin, authorityPath(current.state.pendingProduct, "/activations"), { bearer: current.state.pendingProof,
			body: { contract_version: 1, installation_id: current.state.pendingInstallationId } });
		if (!accepted(result.status) || !result.data.signed_entitlement || !result.data.refresh_credential) fail("activation_rejected");
		const activationId = result.data.activation_id;
		const revisionFloor = current.state.pendingInstallationId === current.installationId ? current.revisionFloor : 0;
		const verified = this.verify(result.data.signed_entitlement, current.state.pendingInstallationId, activationId, revisionFloor);
		if (verified.payload.product !== current.state.pendingProduct) fail("invalid_product_policy");
		if (result.data.authoritative_revision !== verified.payload.revision) fail("revision_mismatch");
		await this.store.replaceInstallation(current.state.pendingInstallationId, { activationId, refreshCredential: result.data.refresh_credential,
			envelope: result.data.signed_entitlement, lastVerified: this.now(), authorityUnavailable: false }, verified.payload.revision);
		return { result: "active" };
	}
	async refresh() {
		const current = await this.stored();
		if (!current.state?.refreshCredential || !current.state?.activationId) fail("refresh_not_configured");
		const currentProduct = this.verify(current.state.envelope, current.installationId, current.state.activationId, current.revisionFloor).payload.product;
		let result;
		try { result = await this.request(this.authorityOrigin, authorityPath(currentProduct, "/entitlements/refresh"), { bearer: current.state.refreshCredential,
				body: { contract_version: 1, installation_id: current.installationId, activation_id: current.state.activationId } }); }
		catch (err) {
			if (err.message === "authority_unavailable" || err.message === "endpoint_unavailable") {
				await this.store.write({ ...current.state, authorityUnavailable: true }, current.revisionFloor);
			} else {
				await this.store.write({ ...current.state, invalid: true }, current.revisionFloor);
			}
			throw err;
		}
		if (result.status === 401 || result.status === 403) {
			const floor = Math.max(current.revisionFloor, Number(result.data.authoritative_revision) || 0);
			await this.store.write({ revoked: true }, floor);
			fail("license_revoked_or_reactivation_required");
		}
		if (!accepted(result.status)) {
			if (result.status >= 500 || result.status === 429) {
				await this.store.write({ ...current.state, authorityUnavailable: true }, current.revisionFloor);
				fail("authority_unavailable");
			}
			await this.store.write({ ...current.state, invalid: true }, current.revisionFloor);
			fail("authority_denied");
		}
		let verified;
		try {
			verified = this.verify(result.data.signed_entitlement, current.installationId, current.state.activationId, current.revisionFloor);
			if (verified.payload.product !== currentProduct) fail("invalid_product_policy");
			if (result.data.authoritative_revision !== verified.payload.revision) fail("revision_mismatch");
		} catch (err) {
			await this.store.write({ ...current.state, invalid: true }, current.revisionFloor);
			throw err;
		}
		await this.store.write({ ...current.state, envelope: result.data.signed_entitlement, lastVerified: this.now(), authorityUnavailable: false, invalid: false }, verified.payload.revision);
		return this.status();
	}
	async requestRecovery(email, product = PRODUCT) {
		if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("email_invalid");
		const current = await this.stored();
		const newInstallationId = randomUUID();
		const result = await this.request(this.authorityOrigin, authorityPath(product, "/recoveries/request"), { body: { contract_version: 1, installation_id: newInstallationId, email } });
		if (!accepted(result.status)) fail("recovery_unavailable");
		await this.store.write({ ...(current.state || {}), recoveryInstallationId: newInstallationId, recoveryProduct: product }, current.revisionFloor);
		return { result: "request_accepted" };
	}
	async confirmRecovery(code) {
		const current = await this.stored();
		const newId = current.state?.recoveryInstallationId;
		if (!newId || !current.state?.recoveryProduct || !/^[A-Za-z0-9_-]{32,128}$/.test(code ?? "")) fail("recovery_invalid");
		const exchange = await this.request(this.authorityOrigin, authorityPath(current.state.recoveryProduct, "/claims/exchange"), { bearer: code, body: { contract_version: 1, installation_id: newId } });
		if (!accepted(exchange.status) || !exchange.data.activation_proof) fail("recovery_rejected");
		const result = await this.request(this.authorityOrigin, authorityPath(current.state.recoveryProduct, "/recoveries/confirm"), { bearer: exchange.data.activation_proof,
			body: { contract_version: 1, installation_id: newId } });
		if (!accepted(result.status) || !result.data.signed_entitlement || !result.data.refresh_credential) fail("recovery_rejected");
		const verified = this.verify(result.data.signed_entitlement, newId, result.data.activation_id, current.revisionFloor);
		if (verified.payload.product !== current.state.recoveryProduct) fail("invalid_product_policy");
		if (result.data.authoritative_revision !== verified.payload.revision) fail("revision_mismatch");
		await this.store.replaceInstallation(newId, { activationId: result.data.activation_id, refreshCredential: result.data.refresh_credential,
			envelope: result.data.signed_entitlement, lastVerified: this.now(), authorityUnavailable: false }, verified.payload.revision);
		return { result: "active" };
	}
	async deactivate() {
		const current = await this.stored();
		if (!current.state?.activationId || !current.state?.refreshCredential) fail("deactivation_not_configured");
		const product = this.verify(current.state.envelope, current.installationId, current.state.activationId, current.revisionFloor).payload.product;
		const result = await this.request(this.authorityOrigin,
			authorityPath(product, `/activations/${current.state.activationId}/deactivate`), {
				bearer: current.state.refreshCredential, body: { contract_version: 1, installation_id: current.installationId },
			});
		if (!accepted(result.status) || result.data.result !== "deactivated") fail("deactivation_failed");
		await this.store.write({ revoked: true }, Math.max(current.revisionFloor, Number(result.data.authoritative_revision) || 0));
		return { result: "deactivated" };
	}
	async replace() {
		const current = await this.stored();
		if (!current.state?.activationId || !current.state?.refreshCredential) fail("replacement_not_configured");
		const product = this.verify(current.state.envelope, current.installationId, current.state.activationId, current.revisionFloor).payload.product;
		const newId = current.state.pendingReplacementId || randomUUID();
		if (!current.state.pendingReplacementId) await this.store.write({ ...current.state, pendingReplacementId: newId }, current.revisionFloor);
		const result = await this.request(this.authorityOrigin,
			authorityPath(product, `/activations/${current.state.activationId}/replace`), {
				bearer: current.state.refreshCredential, body: { contract_version: 1, installation_id: newId },
			});
		if (!accepted(result.status) || !result.data.signed_entitlement || !result.data.refresh_credential) fail("replacement_failed");
		const verified = this.verify(result.data.signed_entitlement, newId, result.data.activation_id, current.revisionFloor);
		if (verified.payload.product !== product) fail("invalid_product_policy");
		if (result.data.authoritative_revision !== verified.payload.revision) fail("revision_mismatch");
		await this.store.replaceInstallation(newId, { activationId: result.data.activation_id, refreshCredential: result.data.refresh_credential,
			envelope: result.data.signed_entitlement, lastVerified: this.now(), authorityUnavailable: false }, verified.payload.revision);
		return { result: "active" };
	}
	async upload(bundle, version) {
		const status = await this.status();
		if (status.state !== "ACTIVE") fail("support_upload_not_authorized");
		if (!this.supportOrigin) fail("support_endpoint_unavailable");
		const current = await this.stored();
		const verified = this.verify(current.state.envelope, current.installationId, current.state.activationId, current.revisionFloor);
		if (verified.payload.product !== PRODUCT && verified.payload.product !== PREMIUM_PRODUCT) fail("invalid_product_policy");
		let operation = await this.store.pendingUpload();
		if (!operation) {
			if (typeof bundle !== "string" || Buffer.byteLength(bundle) > MAX_BUNDLE || Buffer.byteLength(bundle) < 2) fail("bundle_size_invalid");
			const key = randomBytes(24).toString("base64url");
			const sha256 = createHash("sha256").update(bundle).digest("hex");
			await this.store.createUpload(key, sha256, bundle);
			operation = { key, sha256, bundle };
		}
		const bearer = Buffer.from(JSON.stringify(current.state.envelope)).toString("base64url");
		if (!/^\d+\.\d+\.\d+(?:-dev)?$/.test(version ?? "")) fail("version_invalid");
		const result = await this.request(this.supportOrigin, SUPPORT_PATH, { bearer, body: operation.bundle, maximum: 16384, timeout: 30000,
			headers: { "X-NyxGuard-Version": version, "X-NyxGuard-Installation-ID": current.installationId,
				"Idempotency-Key": operation.key } });
		if (!accepted(result.status)) fail(result.status === 409 ? "upload_conflict" : "upload_failed");
		if (!/^NYX-\d{8}-[A-Z2-7]{24}$/.test(result.data.support_id ?? "")) fail("support_id_invalid");
		await this.store.completeUpload(operation.key, result.data.support_id, result.data.expires_at);
		return { support_id: result.data.support_id, expires_at: result.data.expires_at };
	}
}
