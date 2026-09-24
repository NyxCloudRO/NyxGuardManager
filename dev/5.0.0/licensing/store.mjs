import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

export async function loadVaultKey(path) {
	if (!path || !path.startsWith("/")) throw new Error("vault_key_unavailable");
	const info = await stat(path);
	if (!info.isFile() || (info.mode & 0o077) !== 0) throw new Error("vault_key_permissions_invalid");
	const key = await readFile(path);
	if (key.length !== 32) throw new Error("vault_key_invalid");
	return key;
}

export function seal(value, key) {
	if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("vault_key_invalid");
	const nonce = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, nonce);
	const plaintext = Buffer.from(JSON.stringify(value), "utf8");
	const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function unseal(encoded, key) {
	if (typeof encoded !== "string" || encoded.length > 2_000_000) throw new Error("sealed_state_invalid");
	const raw = Buffer.from(encoded, "base64url");
	if (raw.length < 29 || raw.toString("base64url") !== encoded) throw new Error("sealed_state_invalid");
	const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
	decipher.setAuthTag(raw.subarray(12, 28));
	return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
}

export class SqlStore {
	constructor(knex, vaultKey) { this.knex = knex; this.key = vaultKey; }
	async installationId() {
		await this.knex("nyxcloud_license_state").insert({ id: 1, installation_id: randomUUID(), revision_floor: 0, updated_on: new Date() }).onConflict("id").ignore();
		const row = await this.knex("nyxcloud_license_state").where({ id: 1 }).first("installation_id");
		if (!row?.installation_id) throw new Error("installation_state_unavailable");
		return row.installation_id;
	}
	async read() {
		const row = await this.knex("nyxcloud_license_state").where({ id: 1 }).first();
		if (!row) return { installationId: await this.installationId(), revisionFloor: 0, state: null };
		return { installationId: row.installation_id, revisionFloor: Number(row.revision_floor), state: row.sealed_state ? unseal(row.sealed_state, this.key) : null };
	}
	async write(state, revisionFloor) {
		const current = await this.read();
		if (!Number.isSafeInteger(revisionFloor) || revisionFloor < current.revisionFloor) throw new Error("revision_rollback");
		const changed = await this.knex("nyxcloud_license_state").where({ id: 1 }).andWhere("revision_floor", "<=", revisionFloor).update({
			sealed_state: state ? seal(state, this.key) : null, revision_floor: revisionFloor, updated_on: new Date(),
		});
		if (changed !== 1) throw new Error("revision_rollback");
	}
	async replaceInstallation(installationId, state, revisionFloor) {
		const current = await this.read();
		if (!Number.isSafeInteger(revisionFloor) || revisionFloor < 1 ||
			(installationId === current.installationId && revisionFloor < current.revisionFloor)) throw new Error("revision_rollback");
		const query = this.knex("nyxcloud_license_state").where({ id: 1 });
		if (installationId === current.installationId) query.andWhere("revision_floor", "<=", revisionFloor);
		const changed = await query.update({
			installation_id: installationId, sealed_state: seal(state, this.key), revision_floor: revisionFloor, updated_on: new Date(),
		});
		if (changed !== 1) throw new Error("revision_rollback");
	}
	async pendingUpload() {
		const row = await this.knex("nyxcloud_support_upload").where({ state: "pending" }).orderBy("id", "desc").first();
		return row ? { id: row.id, key: row.idempotency_key, sha256: row.bundle_sha256, bundle: unseal(row.sealed_bundle, this.key) } : null;
	}
	async createUpload(key, sha256, bundle) {
		await this.knex("nyxcloud_support_upload").insert({ idempotency_key: key, bundle_sha256: sha256,
			sealed_bundle: seal(bundle, this.key), state: "pending", created_on: new Date(), updated_on: new Date() });
	}
	async completeUpload(key, supportId, expiresAt) {
		await this.knex("nyxcloud_support_upload").where({ idempotency_key: key, state: "pending" }).update({
			state: "accepted", support_id: supportId, expires_at: new Date(expiresAt), updated_on: new Date(),
		});
	}
}
