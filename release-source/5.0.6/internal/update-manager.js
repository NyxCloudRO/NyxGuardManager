import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import db from "../db.js";
import { updateManager as logger } from "../logger.js";
import pjson from "../package.json" with { type: "json" };
import {fetchText} from "./bounded-https.mjs";
import {docker as negotiatedDocker, dockerApiVersion} from "./recovery-docker.mjs";
import {assertUpdateTarget} from './update-contract.mjs';
import { STAGES, normalizeState, markDownloaded, markActivating, markFailure, classifyInterruption } from "./update-state.mjs";

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
	return String(process.env.NPM_BUILD_VERSION || pjson.version).trim().replace(/^v/i, "");
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
	const numeric = compareSemverDesc(a, b);
	if (numeric !== 0) return numeric < 0;
	return !String(a).includes("-") && String(b).includes("-");
}

async function ensureDirs() {
	await fs.mkdir(STATE_DIR, { recursive: true });
	await fs.mkdir(BACKUP_DIR, { recursive: true });
}

async function readJson(file, fallback) {
	try {
		const raw = await fs.readFile(file, "utf8");
		return JSON.parse(raw);
	} catch (error) {
		if (error.code === "ENOENT") return fallback;
		throw new Error(`Update state cannot be read safely: ${error.message}`);
	}
}

async function writeJson(file, data) {
	await ensureDirs();
	const temporary = `${file}.${process.pid}.tmp`;
	await fs.writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
	await fs.rename(temporary, file);
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url,{agent:new https.Agent(),policy:{connectMs:3000,totalMs:10000,maxBytes:4*1024*1024}}));
}

async function dockerRequest(method, pathWithQuery, body = null, expectJson = true) {
  const result=await negotiatedDocker(method,pathWithQuery,body);
  return expectJson ? result : (typeof result==='string'?result:JSON.stringify(result));
}

async function dockerRequestStream(method, pathWithQuery, onLine) {
 const apiVersion=await dockerApiVersion();
	return await new Promise((resolve, reject) => {
		const req = http.request(
			{
				socketPath: "/var/run/docker.sock",
				path: `/v${apiVersion}${pathWithQuery}`,
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
	_reconcileTimer: null,
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
		return normalizeState({
			...defaults,
			...state,
		}, getRuntimeVersion());
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
		if (/^\d+\.\d+\.\d+-dev$/.test(process.env.NYX_UPDATE_DEV_TARGET || "")
			&& /^nyxguardmanager:\d+\.\d+\.\d+-dev$/.test(process.env.NYX_UPDATE_DEV_IMAGE || "")) {
			state.latestVersion = process.env.NYX_UPDATE_DEV_TARGET;
			state.updateAvailable = semverGt(state.latestVersion, getRuntimeVersion());
			state.lastCheckAt = nowIso();
			state.lastCheckError = null;
			if (![STAGES.DOWNLOADED, STAGES.DOWNLOADING, STAGES.ACTIVATING,
				STAGES.RECOVERY_REQUIRED, STAGES.FAILED].includes(state.stage))
				state.stage = state.updateAvailable ? STAGES.UPDATE_AVAILABLE
					: state.stage === STAGES.SUCCESS ? STAGES.SUCCESS : STAGES.IDLE;
			await this.saveState(state);
			return state;
		}
		const checkMaySetStage = [STAGES.IDLE, STAGES.UPDATE_AVAILABLE, STAGES.SUCCESS, STAGES.CHECKING].includes(state.stage);
		const stageBeforeCheck = state.stage;
		if (checkMaySetStage) {
			state.stage = STAGES.CHECKING;
			await this.saveState(state);
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
			if (![STAGES.DOWNLOADED, STAGES.DOWNLOADING, STAGES.ACTIVATING,
				STAGES.RECOVERY_REQUIRED, STAGES.FAILED].includes(state.stage)) {
				state.stage = state.updateAvailable ? STAGES.UPDATE_AVAILABLE
					: stageBeforeCheck === STAGES.SUCCESS ? STAGES.SUCCESS : STAGES.IDLE;
			}
			state.lastCheckAt = nowIso();
			state.lastCheckError = null;
			await this.saveState(state);
			return state;
		} catch (e) {
			if (checkMaySetStage) state.stage = stageBeforeCheck === STAGES.CHECKING ? STAGES.IDLE : stageBeforeCheck;
			state.lastCheckAt = nowIso();
			state.lastCheckError = e instanceof Error ? e.message : String(e);
			await this.saveState(state);
			logger.warn(`Update check failed: ${state.lastCheckError}`);
			return state;
		}
	},

	async initTimer() {
		await ensureDirs();
		await this.reconcileStartup();
		await this.checkForUpdates(true);
		setTimeout(() => {
			this.checkForUpdates(true).catch(() => undefined);
		}, CHECK_SOON_MS);
		if (this._timer) clearInterval(this._timer);
		this._timer = setInterval(() => {
			this.checkForUpdates(true).catch(() => undefined);
			this._cleanupJobs();
		}, CHECK_INTERVAL_MS);
		if (this._reconcileTimer) clearInterval(this._reconcileTimer);
		this._reconcileTimer = setInterval(() => {
			this.reconcileStartup().catch((error) => logger.warn(`Update reconciliation failed: ${error.message}`));
		}, 15 * 1000);
	},

	async reconcileStartup() {
		const state = await this.getState();
		if (state.stage !== STAGES.ACTIVATING) return state;
		const a = state.activation;
		if (!a?.helperId || !a.oldManagerId || !a.newManagerId || !a.imageId) {
			const failed = markFailure(state, "Activation evidence is incomplete", true);
			await this.saveState(failed);
			return failed;
		}
		const inspect = async (id) => {
			try { return await dockerRequest("GET", `/containers/${encodeURIComponent(id)}/json`); }
			catch (error) { if (/(?:failed:|:) 404(?:\s|$)/.test(String(error.message))) return null; throw error; }
		};
		const [helper, oldManager, newManager, oldVpn, newVpn] = await Promise.all([
			inspect(a.helperId), inspect(a.oldManagerId), inspect(a.newManagerId),
			a.oldVpnId ? inspect(a.oldVpnId) : null, a.newVpnId ? inspect(a.newVpnId) : null,
		]);
		const replacementStarted = ["replacement_starting", "replacement_healthy"].includes(a.phase)
			|| !!newManager?.State?.StartedAt && newManager.State.StartedAt !== "0001-01-01T00:00:00Z";
		const oldHealthy = oldManager?.State?.Health?.Status === "healthy"
			&& (!a.oldVpnId || oldVpn?.State?.Health?.Status === "healthy");
		const newHealthy = newManager?.State?.Health?.Status === "healthy"
			&& newManager?.Image === a.imageId && (!a.newVpnId ||
				(newVpn?.State?.Health?.Status === "healthy"
					&& newVpn.HostConfig?.NetworkMode === `container:${a.newManagerId}`));
		// A stopped helper with a healthy replacement but no committed success
		// has an uncertain write boundary. Retain recovery material for review.
		const conclusion = classifyInterruption({ helperRunning: !!helper?.State?.Running,
			helperExitCode: helper?.State?.ExitCode, phase: a.phase,
			oldHealthy, newHealthy, newStarted: replacementStarted });
		if (conclusion === "wait") return state;
		if (conclusion === "failed") {
			const failed = markFailure(state, "Handover stopped before replacement startup");
			await this.saveState(failed);
			return failed;
		}
		const detail = `Interrupted handover: helper=${helper?.State?.ExitCode ?? "missing"}, `
			+ `phase=${a.phase || "unknown"}, oldHealthy=${!!oldHealthy}, newHealthy=${!!newHealthy}, `
			+ `recoveryId=${a.recoveryId || "unrecorded"}`;
		const failed = markFailure(state, detail, true);
		failed.interruptedActivation = a;
		await this.saveState(failed);
		return failed;
	},

	async getStatusForUser(user) {
		const state = await this.getState();
		const userId = String(user?.id || user?.user_id || "");
		const isAdmin = Array.isArray(user?.roles) && user.roles.includes("admin");
		const current = getRuntimeVersion();
		const showWhatsNew = !!(
			userId &&
			state.lastSuccessfulUpdate?.to &&
			state.lastSuccessfulUpdate.to === current &&
			state.whatsNewSeenByUser?.[userId] !== current
		);
		const latestPublished = state.latestVersion || null;
		const latestUpdateTarget = latestPublished && semverGt(latestPublished, current) ? latestPublished : null;

		return {
			current,
			latest: latestUpdateTarget,
			latestPublished,
			updateAvailable: !!latestUpdateTarget,
			stage: state.stage,
			downloadedVersion: state.downloadedVersion || null,
			activationStarted: state.stage === STAGES.ACTIVATING,
			recoveryRequired: state.stage === STAGES.RECOVERY_REQUIRED,
			recoveryCleanupPending: state.recoveryCleanupPending || null,
			restartPending: state.stage === STAGES.RESTART_PENDING,
			pendingVersion: state.stage === STAGES.RESTART_PENDING ? state.pendingVersion : null,
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
		const target = String(targetVersion || state.latestVersion || "").trim().replace(/^v/i, "");
		const devTarget = process.env.NYX_UPDATE_DEV_TARGET;
		const devImage = process.env.NYX_UPDATE_DEV_IMAGE;
		const isDevTarget = !!devTarget && target === devTarget && /^\d+\.\d+\.\d+-dev$/.test(target)
			&& /^nyxguardmanager:\d+\.\d+\.\d+-dev$/.test(devImage || "");
		const sameVersionDevRebuild = isDevTarget && target === current
			&& process.env.NYX_TASK1_DEV_REBUILD === "1"
			&& process.env.NYX_UPDATE_MANAGER_CONTAINER === "nyxguard-manager";
		if (!target || (!isStrictSemver(target) && !isDevTarget)) {
			throw new Error("Invalid target version.");
		}
		if (!isDevTarget && target !== state.latestVersion) throw new Error("Target is not the latest verified release.");
		if (!semverGt(target, current) && !sameVersionDevRebuild) {
			throw new Error(`No newer version available. Current: ${current}, target: ${target}`);
		}
		if (sameVersionDevRebuild) {
			const running = await dockerRequest("GET", "/containers/nyxguard-manager/json");
			const candidate = await dockerRequest("GET", `/images/${encodeURIComponent(devImage)}/json`);
			if (running.Image === candidate.Id) throw new Error("DEV rebuild image is already running.");
		}
		if (state.stage === STAGES.RECOVERY_REQUIRED || state.stage === STAGES.ACTIVATING)
			throw new Error("Resolve the active handover before downloading another target.");
		if (state.stage === STAGES.DOWNLOADED && state.downloadedVersion === target) {
			const image = await dockerRequest("GET", `/images/${encodeURIComponent(state.downloadedImageId)}/json`);
			if (image.Id === state.downloadedImageId) return { alreadyDownloaded: true, downloadedVersion: target };
		}
		if (!manualBackupDownloaded && !proceedWithoutManualBackup) {
			throw new Error("Manual backup confirmation is required before update.");
		}

		const job = await this._prepareJob(target, user, { manualBackupDownloaded, proceedWithoutManualBackup });
		await this.saveState({ ...state, stage: STAGES.DOWNLOADING, pendingVersion: null, restartPending: false });
		this._addJobLog(job, `Starting update preparation for v${target}`);

		(async () => {
			try {
				this._updateJob(job, { phase: "backup" });
				this._addJobLog(job, "Creating automatic configuration export (not a MariaDB or volume recovery set)...");
				const backup = await createConfigBackup(current, "pre-update-auto-backup");
				this._addJobLog(job, `Backup created: ${backup.filename}`);

				this._updateJob(job, { phase: "download" });
				const imageTag = getImageTag(target);
				const imageRef = isDevTarget ? devImage : `${UPDATE_REPO}:${imageTag}`;
				if (!isDevTarget) {
				this._addJobLog(job, `Pulling image ${imageRef} ...`);
				await dockerRequestStream(
					"POST",
					`/images/create?fromImage=${encodeURIComponent(UPDATE_REPO)}&tag=${encodeURIComponent(imageTag)}`,
					(line) => {
						const msg = line.status || line.stream || line.error || line.raw || JSON.stringify(line);
						if (msg) this._addJobLog(job, String(msg).trim());
					},
				);
				}
				const image = await dockerRequest("GET", `/images/${encodeURIComponent(imageRef)}/json`);
				if (!image.Id) throw new Error("Downloaded image has no identity");
				this._addJobLog(job, `Image ready: ${image.Id}`);

				const nextState = await this.getState();
				const downloaded = markDownloaded(nextState, target, image.Id);
				downloaded.updateAvailable = semverGt(target, current);
				downloaded.latestVersion = target;
				downloaded.lastCheckAt = nowIso();
				await this.saveState(downloaded);

				this._finishJob(job, "success", { backupFilename: backup.filename, downloadedVersion: target });
			} catch (e) {
				this._addJobLog(job, `Update preparation failed: ${e instanceof Error ? e.message : String(e)}`);
				await this.saveState(markFailure(await this.getState(), e)).catch(() => undefined);
				this._finishJob(job, "failed", { error: e instanceof Error ? e.message : String(e) });
			}
		})();

		return { jobId: job.id };
	},

	async applyPendingUpdate({ user }) {
		await assertDockerSocketAccess();
		const state = await this.getState();
		const target = state.downloadedVersion;
		if (state.stage !== STAGES.DOWNLOADED || !target || !state.downloadedImageId)
			throw new Error("No downloaded update to activate.");
		const downloadedImage = await dockerRequest("GET", `/images/${encodeURIComponent(state.downloadedImageId)}/json`);
		if (downloadedImage.Id !== state.downloadedImageId) throw new Error("Downloaded image identity changed.");
		assertUpdateTarget(downloadedImage,target,getRuntimeVersion());
		if (Number(target.split(".")[0]) > Number(getRuntimeVersion().split(".")[0])) {
			throw new Error("Major-version updates require the host-side upgrade runbook and a verified full database and volume restore. An in-app configuration export is not a database recovery set.");
		}
		const job = await this._prepareJob(target, user, {
			manualBackupDownloaded: true,
			proceedWithoutManualBackup: true,
		});
		this._addJobLog(job, `Activating downloaded update v${target} ...`);

    (async()=>{
      try {
        const manager=await dockerRequest('GET',`/containers/${process.env.HOSTNAME}/json`);
        const files=String(manager.Config.Labels?.['com.docker.compose.project.config_files']||'').split(',');
        if(!files[0]?.startsWith('/'))throw new Error('Installed Compose identity missing');
        const data=manager.Mounts.find(m=>m.Destination==='/data');
        const source=data?.Type==='volume'?data.Name:data?.Source;
        if(!source)throw new Error('Persistent Manager data missing');
        const helper=await dockerRequest('POST',`/containers/create?name=nyxguard-update-bootstrap-${Date.now()}`,{
          Image:downloadedImage.Id,Entrypoint:['flock','-n','/handover-data/.nyx-update.lock','node','/app/internal/update-bootstrap.mjs'],Cmd:[],Healthcheck:{Test:['NONE']},
          Env:[`CURRENT_VERSION=${getRuntimeVersion()}`,`TARGET_VERSION=${target}`,`TARGET_IMAGE_REF=${downloadedImage.Id}`,`HOST_INSTALL_DIR=${files[0].slice(0,files[0].lastIndexOf('/'))}`],
          HostConfig:{Binds:['/var/run/docker.sock:/var/run/docker.sock',source+':/handover-data'],NetworkMode:'none',RestartPolicy:{Name:'no'}},
        });
        this._addJobLog(job,'Starting the shared guarded updater; follow its durable transaction.');
        await dockerRequest('POST',`/containers/${helper.Id}/start`,null,false);
      }catch(error){
        await this.saveState(markFailure(await this.getState(),error)).catch(()=>undefined);
        this._finishJob(job,'failed',{error:String(error)});
      }
    })();
		return { jobId: job.id };
	}
};

export default updateManager;
