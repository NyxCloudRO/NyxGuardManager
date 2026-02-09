import fs from "node:fs/promises";
import path from "node:path";
import https from "node:https";
import { createWriteStream } from "node:fs";

import utils from "../lib/utils.js";
import { global as logger } from "../logger.js";
import internalNginx from "./nginx.js";

const GEOIP_DIR = "/data/geoip";
const GEOIP_CONF = `${GEOIP_DIR}/GeoIP.conf`;

function parseGeoIpConf(txt) {
	const lines = String(txt ?? "")
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith("#"));

	let accountId = null;
	let licenseKey = null;
	let editionIds = [];

	for (const line of lines) {
		const m = /^(\S+)\s+(.+)$/.exec(line);
		if (!m) continue;
		const key = m[1];
		const value = m[2].trim();
		if (key === "AccountID") accountId = value;
		if (key === "LicenseKey") licenseKey = value;
		if (key === "EditionIDs") editionIds = value.split(/\s+/).filter(Boolean);
	}

	return { accountId, licenseKey, editionIds };
}

function downloadToFile(url, filePath, redirectsLeft = 3) {
	return new Promise((resolve, reject) => {
		const req = https.get(
			url,
			{
				headers: {
					"User-Agent": "NyxGuardManager/1.0",
				},
				timeout: 60_000,
			},
			(res) => {
				if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
					if (redirectsLeft <= 0) {
						reject(new Error("Too many redirects"));
						res.resume();
						return;
					}
					res.resume();
					resolve(downloadToFile(res.headers.location, filePath, redirectsLeft - 1));
					return;
				}

				if (res.statusCode !== 200) {
					reject(new Error(`Download failed (${res.statusCode})`));
					res.resume();
					return;
				}

				const out = createWriteStream(filePath);
				out.on("error", reject);
				out.on("finish", () => resolve(true));
				res.pipe(out);
			},
		);
		req.on("error", reject);
		req.on("timeout", () => {
			req.destroy(new Error("Download timed out"));
		});
	});
}

async function findFirstMmdb(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	for (const e of entries) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) {
			const res = await findFirstMmdb(p);
			if (res) return res;
		} else if (e.isFile() && e.name.toLowerCase().endsWith(".mmdb")) {
			return p;
		}
	}
	return null;
}

const internalGeoIpUpdate = {
	intervalTimeout: 1000 * 60 * 60 * 24, // 24 hours
	interval: null,
	intervalProcessing: false,

	initTimer: () => {
		logger.info("GeoIP Update Timer initialized");
		internalGeoIpUpdate.interval = setInterval(
			internalGeoIpUpdate.process,
			internalGeoIpUpdate.intervalTimeout,
		);
		// Best-effort run on startup, but avoid burning MaxMind download quota on frequent restarts.
		// We'll only download if the DB is missing or older than our interval.
		internalGeoIpUpdate.process({ startup: true });
	},

	process: async ({ startup = false } = {}) => {
		if (internalGeoIpUpdate.intervalProcessing) return;
		internalGeoIpUpdate.intervalProcessing = true;

		try {
			// Only run if the user has configured geoipupdate credentials.
			await fs.mkdir(GEOIP_DIR, { recursive: true });

			let confTxt = null;
			try {
				confTxt = await fs.readFile(GEOIP_CONF, "utf8");
			} catch {
				return;
			}

			const conf = parseGeoIpConf(confTxt);
			if (!conf.licenseKey) return;

			// Only download what we actually use today.
			const editionId = "GeoLite2-Country";
			const dest = path.join(GEOIP_DIR, `${editionId}.mmdb`);

			// Skip downloads if the current DB is still "fresh" (prevents exhausting daily quotas).
			try {
				const st = await fs.stat(dest);
				const ageMs = Date.now() - st.mtimeMs;
				if (ageMs >= 0 && ageMs < internalGeoIpUpdate.intervalTimeout) {
					// On startup this is the common case; don't spam logs.
					if (!startup) {
						logger.info("GeoIP DB is recent; skipping update");
					}
					return;
				}
			} catch {
				// No existing DB, proceed.
			}

			const url =
				`https://download.maxmind.com/app/geoip_download?edition_id=${encodeURIComponent(editionId)}` +
				`&license_key=${encodeURIComponent(conf.licenseKey)}` +
				`&suffix=tar.gz`;

			const tmpDir = `/tmp/nyxguard-geoip-${process.pid}`;
			await fs.mkdir(tmpDir, { recursive: true });
			const archivePath = path.join(tmpDir, `${editionId}.tar.gz`);
			const extractDir = path.join(tmpDir, "extract");
			await fs.mkdir(extractDir, { recursive: true });

			await downloadToFile(url, archivePath);
			await utils.execFile("tar", ["-xzf", archivePath, "-C", extractDir], { timeout: 60_000 });

			const mmdb = await findFirstMmdb(extractDir);
			if (!mmdb) {
				throw new Error("Downloaded archive did not contain a .mmdb file");
			}

			const tmpDest = path.join(GEOIP_DIR, `.${editionId}.${process.pid}.tmp`);
			await fs.copyFile(mmdb, tmpDest);
			await fs.rename(tmpDest, dest);

			// Cleanup best-effort
			try {
				await fs.rm(tmpDir, { recursive: true, force: true });
			} catch {
				// ignore
			}

			// Reload nginx so workers re-open the mmdb.
			await internalNginx.reload();
		} catch (err) {
			logger.warn("GeoIP update failed:", err?.message ?? err);
		} finally {
			internalGeoIpUpdate.intervalProcessing = false;
		}
	},
};

export default internalGeoIpUpdate;
