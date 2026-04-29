import https from "node:https";
import { ProxyAgent } from "proxy-agent";
import { debug, remoteVersion as logger } from "../logger.js";
import pjson from "../package.json" with { type: "json" };

const VERSION_URL = "https://api.github.com/repos/NyxCloudRO/nyxguard-manager/releases/latest";

const getCurrentVersion = () => {
	const raw = (pjson.version || process.env.NPM_BUILD_VERSION || "0.0.0").toString();
	const version = raw.replace(/^v/i, "").split("-").shift().split(".");
	return `v${version[0] || 0}.${version[1] || 0}.${version[2] || 0}`;
};

const internalRemoteVersion = {
	cache_timeout: 1000 * 60 * 15, // 15 minutes
	last_result: null,
	last_fetch_time: null,

	/**
	 * Fetch the latest version info, using a cached result if within the cache timeout period.
	 * Always returns the current local version, even when the remote update check is unavailable.
	 * @return {Promise<{current: string, latest: string|null, update_available: boolean}>} Version info
	 */
	get: async () => {
		const currentVersion = getCurrentVersion();

		if (
			!internalRemoteVersion.last_result ||
			!internalRemoteVersion.last_fetch_time ||
			Date.now() - internalRemoteVersion.last_fetch_time > internalRemoteVersion.cache_timeout
		) {
			try {
				const raw = await internalRemoteVersion.fetchUrl(VERSION_URL);
				const data = JSON.parse(raw);
				internalRemoteVersion.last_result = data;
				internalRemoteVersion.last_fetch_time = Date.now();
			} catch (error) {
				debug(logger, `Remote version check failed: ${error}`);
			}
		} else {
			debug(logger, "Using cached remote version result");
		}

		const latestVersion = internalRemoteVersion.last_result?.tag_name || null;
		return {
			current: currentVersion,
			latest: latestVersion,
			update_available: latestVersion ? internalRemoteVersion.compareVersions(currentVersion, latestVersion) : false,
		};
	},

	fetchUrl: (url) => {
		const agent = new ProxyAgent();
		const headers = {
			"User-Agent": `NyxCloudRO v${pjson.version}`,
		};

		return new Promise((resolve, reject) => {
			logger.info(`Fetching ${url}`);
			return https
				.get(url, { agent, headers }, (res) => {
					res.setEncoding("utf8");
					let raw_data = "";
					res.on("data", (chunk) => {
						raw_data += chunk;
					});
					res.on("end", () => {
						resolve(raw_data);
					});
				})
				.on("error", (err) => {
					reject(err);
				});
		});
	},

	compareVersions: (current, latest) => {
		if (!current || !latest) return false;

		const cleanCurrent = current.replace(/^v/, "");
		const cleanLatest = latest.replace(/^v/, "");

		const currentParts = cleanCurrent.split(".").map(Number);
		const latestParts = cleanLatest.split(".").map(Number);

		for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
			const curr = currentParts[i] || 0;
			const lat = latestParts[i] || 0;

			if (lat > curr) return true;
			if (lat < curr) return false;
		}
		return false;
	},
};

export default internalRemoteVersion;
