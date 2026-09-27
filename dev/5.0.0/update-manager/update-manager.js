import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import db from "../db.js";
import { updateManager as logger } from "../logger.js";
import pjson from "../package.json" with { type: "json" };

const UPDATE_REPO = "nyxmael/nyxguardmanager";
const UPDATE_NAMESPACE = "nyxmael";
const UPDATE_NAME = "nyxguardmanager";
const STATE_DIR = "/data/update-manager";
const STATE_FILE = path.join(STATE_DIR, "state.json");
const BACKUP_DIR = path.join(STATE_DIR, "backups");
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
const CHECK_SOON_MS = 30 * 1000;
const JOB_RETENTION_MS = 24 * 60 * 60 * 1000;
const BACKUP_EXCLUDE_TABLES = new Set(["migrations", "sqlite_sequence"]);

function nowIso() {
	return new Date().toISOString();
}

function sanitizeVersion(v) {
	return String(v || "")
		.trim()
		.replace(/^v/i, "")
		.replace(/-.+$/, "");
}

function getRuntimeVersion() {
	return sanitizeVersion(process.env.NPM_BUILD_VERSION || pjson.version);
}

function getImageTag(version) {
	return sanitizeVersion(version);
}

function compareSemverDesc(a, b) {
	const pa = sanitizeVersion(a)
		.split(".")
		.map((n) => Number.parseInt(n || "0", 10) || 0);
	const pb = sanitizeVersion(b)
		.split(".")
		.map((n) => Number.parseInt(n || "0", 10) || 0);
	for (let i = 0; i < 3; i++) {
		const av = pa[i] || 0;
		const bv = pb[i] || 0;
		if (av > bv) return -1;
		if (av < bv) return 1;
	}
	return 0;
}

function isStrictSemver(tag) {
	return /^v?\d+\.\d+\.\d+$/.test(String(tag || "").trim());
}

function semverGt(a, b) {
	return compareSemverDesc(a, b) < 0;
}

async function ensureDirs() {
	await fs.mkdir(STATE_DIR, { recursive: true });
	await fs.mkdir(BACKUP_DIR, { recursive: true });
}

async function readJson(file, fallback) {
	try {
		const raw = await fs.readFile(file, "utf8");
		return JSON.parse(raw);
	} catch {
		return fallback;
	}
}

async function writeJson(file, data) {
	await ensureDirs();
	await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

async function fetchJson(url) {
	return await new Promise((resolve, reject) => {
		const client = url.startsWith("https://") ? https : http;
		const req = client.get(
			url,
			{
				headers: {
					"User-Agent": `NyxGuardManager/${getRuntimeVersion()}`,
					Accept: "application/json",
				},
			},
			(res) => {
				let raw = "";
				res.setEncoding("utf8");
				res.on("data", (chunk) => {
					raw += chunk;
				});
				res.on("end", () => {
					if (res.statusCode && res.statusCode >= 400) {
						reject(new Error(`Fetch failed ${res.statusCode}: ${url}`));
						return;
					}
					try {
						resolve(JSON.parse(raw));
					} catch (e) {
						reject(e);
					}
				});
			},
		);
		req.on("error", reject);
	});
}

async function dockerRequest(method, pathWithQuery, body = null, expectJson = true) {
	return await new Promise((resolve, reject) => {
		const req = http.request(
			{
				socketPath: "/var/run/docker.sock",
				path: `/v1.41${pathWithQuery}`,
				method,
				headers: body ? { "Content-Type": "application/json" } : undefined,
			},
			(res) => {
				let raw = "";
				res.setEncoding("utf8");
				res.on("data", (chunk) => {
					raw += chunk;
				});
				res.on("end", () => {
					if ((res.statusCode || 500) >= 400) {
						reject(new Error(`Docker API ${method} ${pathWithQuery} failed: ${res.statusCode} ${raw}`));
						return;
					}
					if (!expectJson) {
						resolve(raw);
						return;
					}
					if (!raw) {
						resolve({});
						return;
					}
					try {
						resolve(JSON.parse(raw));
					} catch {
						resolve({ raw });
					}
				});
			},
		);
		req.on("error", reject);
		if (body) req.write(JSON.stringify(body));
		req.end();
	});
}

async function dockerRequestStream(method, pathWithQuery, onLine) {
	return await new Promise((resolve, reject) => {
		const req = http.request(
			{
				socketPath: "/var/run/docker.sock",
				path: `/v1.41${pathWithQuery}`,
				method,
			},
			(res) => {
				if ((res.statusCode || 500) >= 400) {
					let errRaw = "";
					res.on("data", (d) => {
						errRaw += d.toString();
					});
					res.on("end", () => {
						reject(
							new Error(`Docker stream ${method} ${pathWithQuery} failed: ${res.statusCode} ${errRaw}`),
						);
					});
					return;
				}

				let buffer = "";
				res.setEncoding("utf8");
				res.on("data", (chunk) => {
					buffer += chunk;
					let idx = buffer.indexOf("\n");
					while (idx >= 0) {
						const line = buffer.slice(0, idx).trim();
						buffer = buffer.slice(idx + 1);
						if (line) {
							let event;
							try { event = JSON.parse(line); } catch { event = { raw: line }; }
							if (event.error || event.errorDetail) {
								reject(new Error(String(event.error || event.errorDetail?.message)));
								req.destroy();
								return;
							}
							onLine(event);
						}
						idx = buffer.indexOf("\n");
					}
				});
				res.on("end", resolve);
			},
		);
		req.on("error", reject);
		req.end();
	});
}

async function assertDockerSocketAccess() {
	try {
		await dockerRequest("GET", "/_ping", null, false);
	} catch (error) {
		if (error?.code === "EACCES") {
			const socket = await fs.stat("/var/run/docker.sock");
			throw new Error(`Docker socket access denied for backend uid ${process.getuid?.()} gid ${process.getgid?.()}; socket gid ${socket.gid}. Set PGID and DOCKER_SOCK_GID to the host socket gid, then recreate only the application container. Do not chmod the socket.`);
		}
		throw error;
	}
}

async function getDbTableNames(knex) {
	const client = String(knex.client.config.client || "").toLowerCase();

	if (client.includes("mysql")) {
		const raw = await knex.raw("SHOW TABLES");
		const rows = Array.isArray(raw) ? raw[0] : raw;
		if (!Array.isArray(rows)) return [];
		return rows
			.map((row) => {
				const key = Object.keys(row || {})[0];
				return key ? row[key] : null;
			})
			.filter((name) => typeof name === "string" && name.length > 0);
	}

	if (client.includes("sqlite")) {
		const rows = await knex("sqlite_master")
			.select("name")
			.where({ type: "table" })
			.whereNotLike("name", "sqlite_%");
		return rows.map((row) => row.name).filter(Boolean);
	}

	const rows = await knex("information_schema.tables").select("table_name").where({ table_schema: "public" });
	return rows.map((row) => row.table_name).filter(Boolean);
}

async function createConfigBackup(version, note = "auto-update") {
	await ensureDirs();
	const knex = db();
	const allTables = await getDbTableNames(knex);
	const tableNames = allTables.filter((name) => !BACKUP_EXCLUDE_TABLES.has(name));
	const tables = {};
	for (const t of tableNames) {
		// eslint-disable-next-line no-await-in-loop
		tables[t] = await knex(t).select("*");
	}
	const payload = {
		version,
		note,
		exportedAt: nowIso(),
		tables,
	};
	const stamp = nowIso().replace(/[:.]/g, "-");
	const filename = `auto-update-backup-${version}-${stamp}.json`;
	const out = path.join(BACKUP_DIR, filename);
	await fs.writeFile(out, JSON.stringify(payload), "utf8");
	return { filename, path: out };
}

async function waitContainerHealthy(containerId, timeoutMs = 90000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const inspect = await dockerRequest("GET", `/containers/${containerId}/json`);
		if (!inspect?.State) {
			await new Promise((r) => setTimeout(r, 2000));
			continue;
		}
		if (!inspect.State.Running) {
			throw new Error("New container is not running");
		}
		const health = inspect.State.Health?.Status;
		if (!health || health === "healthy") return true;
		if (health === "unhealthy") throw new Error("New container became unhealthy");
		await new Promise((r) => setTimeout(r, 2000));
	}
	throw new Error("Timed out waiting for new container health");
}

const updateManager = {
	_timer: null,
	_jobs: new Map(),
	_runningJobId: null,

	async getState() {
		const defaults = {
			currentVersion: getRuntimeVersion(),
			latestVersion: null,
			updateAvailable: false,
			lastCheckAt: null,
			lastCheckError: null,
			restartPending: false,
			pendingVersion: null,
			lastSuccessfulUpdate: null,
			updateHistory: [],
			whatsNewSeenByUser: {},
		};
		const state = await readJson(STATE_FILE, defaults);
		return {
			...defaults,
			...state,
			currentVersion: getRuntimeVersion(),
		};
	},

	async saveState(state) {
		await writeJson(STATE_FILE, state);
	},

	_addJobLog(job, msg) {
		job.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
		if (job.logs.length > 800) job.logs = job.logs.slice(-800);
	},

	_getJob(jobId) {
		return this._jobs.get(jobId) || null;
	},

	_cleanupJobs() {
		const now = Date.now();
		for (const [id, job] of this._jobs.entries()) {
			if (now - (job.updatedAtMs || now) > JOB_RETENTION_MS) {
				this._jobs.delete(id);
			}
		}
	},

	async checkForUpdates(force = false) {
		const state = await this.getState();
		if (!force && state.lastCheckAt && Date.now() - new Date(state.lastCheckAt).getTime() < 10 * 60 * 1000) {
			return state;
		}

		try {
			let page = 1;
			const tags = [];
			while (page <= 4) {
				// Keep bounded; we only need recent tags.
				// eslint-disable-next-line no-await-in-loop
				const data = await fetchJson(
					`https://registry.hub.docker.com/v2/repositories/${UPDATE_NAMESPACE}/${UPDATE_NAME}/tags?page_size=100&page=${page}`,
				);
				const items = Array.isArray(data?.results) ? data.results : [];
				for (const it of items) {
					if (isStrictSemver(it?.name)) tags.push(String(it.name));
				}
				if (!data?.next) break;
				page += 1;
			}

			const sorted = [...new Set(tags)].sort(compareSemverDesc);
			const latestPublished = sorted[0] ? sanitizeVersion(sorted[0]) : null;
			const current = getRuntimeVersion();
			state.currentVersion = current;
			state.latestVersion = latestPublished;
			state.updateAvailable = !!latestPublished && semverGt(latestPublished, current);
			state.lastCheckAt = nowIso();
			state.lastCheckError = null;
			await this.saveState(state);
			return state;
		} catch (e) {
			state.lastCheckAt = nowIso();
			state.lastCheckError = e instanceof Error ? e.message : String(e);
			await this.saveState(state);
			logger.warn(`Update check failed: ${state.lastCheckError}`);
			return state;
		}
	},

	async initTimer() {
		await ensureDirs();
		await this.checkForUpdates(true);
		setTimeout(() => {
			this.checkForUpdates(true).catch(() => undefined);
		}, CHECK_SOON_MS);
		if (this._timer) clearInterval(this._timer);
		this._timer = setInterval(() => {
			this.checkForUpdates(true).catch(() => undefined);
			this._cleanupJobs();
		}, CHECK_INTERVAL_MS);
	},

	async getStatusForUser(user) {
		const state = await this.getState();
		const userId = String(user?.id || user?.user_id || "");
		const isAdmin = Array.isArray(user?.roles) && user.roles.includes("admin");
		const current = getRuntimeVersion();
		const showWhatsNew = !!(
			userId &&
			state.lastSuccessfulUpdate?.to &&
			sanitizeVersion(state.lastSuccessfulUpdate.to) === current &&
			state.whatsNewSeenByUser?.[userId] !== current
		);
		const latestPublished = state.latestVersion ? sanitizeVersion(state.latestVersion) : null;
		const latestUpdateTarget = latestPublished && semverGt(latestPublished, current) ? latestPublished : null;

		return {
			current,
			latest: latestUpdateTarget,
			latestPublished,
			updateAvailable: !!latestUpdateTarget,
			restartPending: !!state.restartPending,
			pendingVersion: state.pendingVersion,
			lastCheckAt: state.lastCheckAt,
			lastCheckError: state.lastCheckError,
			lastSuccessfulUpdate: state.lastSuccessfulUpdate,
			showWhatsNew,
			isAdmin,
			runningJobId: this._runningJobId,
		};
	},

	async getChangelog() {
		const state = await this.getState();
		let markdown = "";
		const candidates = [
			"/app/CHANGELOG_PUBLIC.md",
			"/data/CHANGELOG_PUBLIC.md",
			"/app/CHANGELOG.md",
			path.resolve(process.cwd(), "CHANGELOG_PUBLIC.md"),
			path.resolve(process.cwd(), "CHANGELOG.md"),
		];
		for (const file of candidates) {
			try {
				// eslint-disable-next-line no-await-in-loop
				markdown = await fs.readFile(file, "utf8");
				if (markdown.trim()) break;
			} catch {
				// keep trying next candidate
			}
		}
		if (!markdown.trim()) markdown = "No changelog file available.";
		return {
			current: getRuntimeVersion(),
			lastSuccessfulUpdate: state.lastSuccessfulUpdate,
			updateHistory: Array.isArray(state.updateHistory) ? state.updateHistory : [],
			markdown,
		};
	},

	async clearChangelogHistory() {
		const state = await this.getState();
		const historyCount = Array.isArray(state.updateHistory) ? state.updateHistory.length : 0;
		const hadLastSuccessful = state.lastSuccessfulUpdate ? 1 : 0;
		state.updateHistory = [];
		state.lastSuccessfulUpdate = null;
		await this.saveState(state);
		return {
			removed: historyCount + hadLastSuccessful,
			removedHistory: historyCount,
			removedLastSuccessful: hadLastSuccessful === 1,
		};
	},

	async ackWhatsNewForUser(user) {
		const userId = String(user?.id || user?.user_id || "");
		if (!userId) return { ok: true };
		const state = await this.getState();
		const current = getRuntimeVersion();
		state.whatsNewSeenByUser = state.whatsNewSeenByUser || {};
		state.whatsNewSeenByUser[userId] = current;
		await this.saveState(state);
		return { ok: true };
	},

	async _prepareJob(targetVersion, user, opts) {
		if (this._runningJobId) {
			throw new Error("Another update job is already running.");
		}
		const id = `upd-${Date.now()}`;
		const job = {
			id,
			status: "running",
			phase: "starting",
			targetVersion,
			createdAt: nowIso(),
			updatedAtMs: Date.now(),
			logs: [],
			requestedBy: user?.email || user?.name || "admin",
			manualBackupDownloaded: !!opts?.manualBackupDownloaded,
			proceedWithoutManualBackup: !!opts?.proceedWithoutManualBackup,
			result: null,
		};
		this._jobs.set(id, job);
		this._runningJobId = id;
		return job;
	},

	_updateJob(job, patch = {}) {
		Object.assign(job, patch, { updatedAtMs: Date.now() });
		this._jobs.set(job.id, job);
	},

	_finishJob(job, status, result = null) {
		this._updateJob(job, { status, phase: status, result });
		if (this._runningJobId === job.id) this._runningJobId = null;
	},

	async getJob(jobId) {
		return this._getJob(jobId);
	},

	async startDownloadJob({ user, targetVersion, manualBackupDownloaded, proceedWithoutManualBackup }) {
		await assertDockerSocketAccess();
		const state = await this.checkForUpdates(true);
		const current = getRuntimeVersion();
		const target = sanitizeVersion(targetVersion || state.latestVersion);
		if (!target || !isStrictSemver(target)) {
			throw new Error("Invalid target version.");
		}
		if (!semverGt(target, current)) {
			throw new Error(`No newer version available. Current: ${current}, target: ${target}`);
		}
		if (!manualBackupDownloaded && !proceedWithoutManualBackup) {
			throw new Error("Manual backup confirmation is required before update.");
		}

		const job = await this._prepareJob(target, user, { manualBackupDownloaded, proceedWithoutManualBackup });
		this._addJobLog(job, `Starting update preparation for v${target}`);

		(async () => {
			try {
				this._updateJob(job, { phase: "backup" });
				this._addJobLog(job, "Creating automatic configuration export (not a MariaDB or volume recovery set)...");
				const backup = await createConfigBackup(current, "pre-update-auto-backup");
				this._addJobLog(job, `Backup created: ${backup.filename}`);

				this._updateJob(job, { phase: "download" });
				const imageTag = getImageTag(target);
				this._addJobLog(job, `Pulling image ${UPDATE_REPO}:${imageTag} ...`);
				await dockerRequestStream(
					"POST",
					`/images/create?fromImage=${encodeURIComponent(UPDATE_REPO)}&tag=${encodeURIComponent(imageTag)}`,
					(line) => {
						const msg = line.status || line.stream || line.error || line.raw || JSON.stringify(line);
						if (msg) this._addJobLog(job, String(msg).trim());
					},
				);
				this._addJobLog(job, "Image pull completed.");

				const nextState = await this.getState();
				nextState.pendingVersion = target;
				nextState.restartPending = true;
				nextState.updateAvailable = semverGt(target, current);
				nextState.latestVersion = target;
				nextState.lastCheckAt = nowIso();
				await this.saveState(nextState);

				this._finishJob(job, "success", { backupFilename: backup.filename, pendingVersion: target });
			} catch (e) {
				this._addJobLog(job, `Update preparation failed: ${e instanceof Error ? e.message : String(e)}`);
				this._finishJob(job, "failed", { error: e instanceof Error ? e.message : String(e) });
			}
		})();

		return { jobId: job.id };
	},

	async applyPendingUpdate({ user }) {
		await assertDockerSocketAccess();
		const state = await this.getState();
		const target = sanitizeVersion(state.pendingVersion);
		if (!state.restartPending || !target) throw new Error("No pending update to apply.");
		if (Number(target.split(".")[0]) > Number(getRuntimeVersion().split(".")[0])) {
			throw new Error("Major-version updates require the host-side upgrade runbook and a verified full database and volume restore. An in-app configuration export is not a database recovery set.");
		}
		const job = await this._prepareJob(target, user, {
			manualBackupDownloaded: true,
			proceedWithoutManualBackup: true,
		});
		this._addJobLog(job, `Applying pending update v${target} ...`);

		(async () => {
			let oldManagerId;
			let oldManagerName;
			let oldManagerRollback;
			let oldVpnId;
			let oldVpnName;
			let oldVpnRollback;
			let newManagerId;
			let newVpnId;
			try {
				this._updateJob(job, { phase: "apply" });
				const selfId = process.env.HOSTNAME;
				if (!selfId) throw new Error("Unable to detect current container id.");
				const manager = await dockerRequest("GET", `/containers/${selfId}/json`);
				const vpn = await dockerRequest("GET", "/containers/nyxguard-vpn-agent/json");
				oldManagerId = manager.Id;
				oldManagerName = String(manager.Name || "").replace(/^\//, "") || "nyxguard-manager";
				oldManagerRollback = `${oldManagerName}-rollback-${Date.now()}`;
				oldVpnId = vpn.Id;
				oldVpnName = String(vpn.Name || "").replace(/^\//, "") || "nyxguard-vpn-agent";
				oldVpnRollback = `${oldVpnName}-rollback-${Date.now()}`;

				this._addJobLog(job, `Refreshing manager image v${target} ...`);
				await dockerRequestStream(
					"POST",
					`/images/create?fromImage=${encodeURIComponent(UPDATE_REPO)}&tag=${encodeURIComponent(getImageTag(target))}`,
					(line) => {
						const msg = line.status || line.stream || line.error || line.raw;
						if (msg) this._addJobLog(job, String(msg).trim());
					},
				);
				this._addJobLog(job, `Pulling paired VPN agent v${target} ...`);
				await dockerRequestStream(
					"POST",
					`/images/create?fromImage=${encodeURIComponent("nyxmael/nyxguardmanager-vpn-agent")}&tag=${encodeURIComponent(getImageTag(target))}`,
					(line) => {
						const msg = line.status || line.stream || line.error || line.raw;
						if (msg) this._addJobLog(job, String(msg).trim());
					},
				);

				await dockerRequest("POST", `/containers/${oldManagerId}/rename?name=${encodeURIComponent(oldManagerRollback)}`, null, false);
				await dockerRequest("POST", `/containers/${oldVpnId}/rename?name=${encodeURIComponent(oldVpnRollback)}`, null, false);

				const preserveLabels = (labels = {}) => Object.fromEntries(
					Object.entries(labels).filter(([key]) => ![
						"org.opencontainers.image.version", "org.opencontainers.image.revision",
						"org.opencontainers.image.created",
					].includes(key)),
				);
				const managerEnv = (manager.Config?.Env || []).filter(
					(value) => !/^NPM_BUILD_(VERSION|COMMIT|DATE)=/.test(value),
				);
				const managerBody = {
					Image: `${UPDATE_REPO}:${getImageTag(target)}`, Env: managerEnv,
					Cmd: manager.Config?.Cmd, Entrypoint: manager.Config?.Entrypoint,
					WorkingDir: manager.Config?.WorkingDir, ExposedPorts: manager.Config?.ExposedPorts,
					Healthcheck: manager.Config?.Healthcheck,
					Labels: preserveLabels(manager.Config?.Labels),
					HostConfig: { Binds: manager.HostConfig?.Binds, PortBindings: manager.HostConfig?.PortBindings,
						RestartPolicy: manager.HostConfig?.RestartPolicy, NetworkMode: manager.HostConfig?.NetworkMode,
						GroupAdd: manager.HostConfig?.GroupAdd,
						ExtraHosts: manager.HostConfig?.ExtraHosts, LogConfig: manager.HostConfig?.LogConfig,
						CapAdd: manager.HostConfig?.CapAdd, Devices: manager.HostConfig?.Devices },
				};
				const createdManager = await dockerRequest("POST", `/containers/create?name=${encodeURIComponent(oldManagerName)}`, managerBody);
				newManagerId = createdManager.Id;

				const vpnBody = {
					Image: `nyxmael/nyxguardmanager-vpn-agent:${getImageTag(target)}`, Env: vpn.Config?.Env,
					Cmd: vpn.Config?.Cmd, Entrypoint: vpn.Config?.Entrypoint,
					WorkingDir: vpn.Config?.WorkingDir, ExposedPorts: vpn.Config?.ExposedPorts,
					Healthcheck: vpn.Config?.Healthcheck,
					Labels: preserveLabels(vpn.Config?.Labels),
					HostConfig: { Binds: vpn.HostConfig?.Binds, RestartPolicy: vpn.HostConfig?.RestartPolicy,
						NetworkMode: `container:${newManagerId}`, ExtraHosts: vpn.HostConfig?.ExtraHosts,
						GroupAdd: vpn.HostConfig?.GroupAdd,
						LogConfig: vpn.HostConfig?.LogConfig, CapAdd: vpn.HostConfig?.CapAdd, Devices: vpn.HostConfig?.Devices },
				};
				const createdVpn = await dockerRequest("POST", `/containers/create?name=${encodeURIComponent(oldVpnName)}`, vpnBody);
				newVpnId = createdVpn.Id;

				const dataMount = (manager.Mounts || []).find((mount) => mount.Destination === "/data");
				if (!dataMount) throw new Error("Unable to locate persistent /data mount.");
				const dataSource = dataMount.Type === "volume" ? dataMount.Name : dataMount.Source;
				const helperName = `nyxguard-update-handover-${Date.now()}`;
				const helper = await dockerRequest("POST", `/containers/create?name=${helperName}`, {
					Image: `${UPDATE_REPO}:${getImageTag(target)}`,
					Entrypoint: ["node", "/app/internal/update-handover.js"], Cmd: [],
					Env: [
						`OLD_MANAGER_ID=${oldManagerId}`, `OLD_MANAGER_NAME=${oldManagerName}`,
						`NEW_MANAGER_ID=${newManagerId}`, `OLD_VPN_ID=${oldVpnId}`,
						`OLD_VPN_NAME=${oldVpnName}`, `NEW_VPN_ID=${newVpnId}`,
						`CURRENT_VERSION=${getRuntimeVersion()}`, `TARGET_VERSION=${target}`,
					],
					HostConfig: { Binds: ["/var/run/docker.sock:/var/run/docker.sock", `${dataSource}:/handover-data`], NetworkMode: "none" },
				});
				this._addJobLog(job, "Starting safe handover helper; the UI will reconnect after restart.");
				await dockerRequest("POST", `/containers/${helper.Id}/start`, null, false);
			} catch (error) {
				this._addJobLog(job, `Handover setup failed: ${error instanceof Error ? error.message : String(error)}`);
				if (newVpnId) await dockerRequest("DELETE", `/containers/${newVpnId}?force=1`, null, false).catch(() => undefined);
				if (newManagerId) await dockerRequest("DELETE", `/containers/${newManagerId}?force=1`, null, false).catch(() => undefined);
				if (oldManagerId && oldManagerName) await dockerRequest("POST", `/containers/${oldManagerId}/rename?name=${encodeURIComponent(oldManagerName)}`, null, false).catch(() => undefined);
				if (oldVpnId && oldVpnName) await dockerRequest("POST", `/containers/${oldVpnId}/rename?name=${encodeURIComponent(oldVpnName)}`, null, false).catch(() => undefined);
				this._finishJob(job, "failed", { error: error instanceof Error ? error.message : String(error), rollbackApplied: true });
			}
		})();
		return { jobId: job.id };
	}
};

export default updateManager;
