import fs from "node:fs";
import https from "node:https";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent } from "proxy-agent";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import { ipRanges as logger } from "../logger.js";
import internalNginx from "./nginx.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLOUDFRONT_URL = "https://ip-ranges.amazonaws.com/ip-ranges.json";
const CLOUDFARE_V4_URL = "https://www.cloudflare.com/ips-v4";
const CLOUDFARE_V6_URL = "https://www.cloudflare.com/ips-v6";

const regIpV4 = /^(\d+\.?){4}\/\d+/;
const regIpV6 = /^(([\da-fA-F]+)?:)+\/\d+/;

// Offline fallback (no Internet access in some deployments).
// Based on Cloudflare published ranges. Keep this list small but complete enough
// to ensure CF edges are trusted by realip module even when the fetch fails.
const CLOUDFLARE_FALLBACK_RANGES = [
	// IPv4
	"173.245.48.0/20",
	"103.21.244.0/22",
	"103.22.200.0/22",
	"103.31.4.0/22",
	"141.101.64.0/18",
	"108.162.192.0/18",
	"190.93.240.0/20",
	"188.114.96.0/20",
	"197.234.240.0/22",
	"198.41.128.0/17",
	"162.158.0.0/15",
	"104.16.0.0/13",
	"104.24.0.0/14",
	"172.64.0.0/13",
	"131.0.72.0/22",
	// IPv6
	"2400:cb00::/32",
	"2606:4700::/32",
	"2803:f800::/32",
	"2405:b500::/32",
	"2405:8100::/32",
	"2a06:98c0::/29",
	"2c0f:f248::/32",
];

const internalIpRanges = {
	interval_timeout: 1000 * 60 * 60 * 6, // 6 hours
	interval: null,
	interval_processing: false,
	iteration_count: 0,

	initTimer: () => {
		logger.info("IP Ranges Renewal Timer initialized");
		internalIpRanges.interval = setInterval(internalIpRanges.fetch, internalIpRanges.interval_timeout);
	},

	fetchUrl: (url) => {
		const agent = new ProxyAgent();
		return new Promise((resolve, reject) => {
			logger.info(`Fetching ${url}`);
			return https
				.get(url, { agent }, (res) => {
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

	/**
	 * Triggered at startup and then later by a timer, this will fetch the ip ranges from services and apply them to nginx.
	 */
	fetch: () => {
		if (!internalIpRanges.interval_processing) {
			internalIpRanges.interval_processing = true;
			logger.info("Fetching IP Ranges from online services...");

			let ip_ranges = [];

			return internalIpRanges
				.fetchUrl(CLOUDFRONT_URL)
				.then((cloudfront_data) => {
					const data = JSON.parse(cloudfront_data);

					if (data && typeof data.prefixes !== "undefined") {
						data.prefixes.map((item) => {
							if (item.service === "CLOUDFRONT") {
								ip_ranges.push(item.ip_prefix);
							}
							return true;
						});
					}

					if (data && typeof data.ipv6_prefixes !== "undefined") {
						data.ipv6_prefixes.map((item) => {
							if (item.service === "CLOUDFRONT") {
								ip_ranges.push(item.ipv6_prefix);
							}
							return true;
						});
					}
				})
				.then(() => {
					return internalIpRanges.fetchUrl(CLOUDFARE_V4_URL);
				})
				.then((cloudfare_data) => {
					const items = cloudfare_data.split("\n").filter((line) => regIpV4.test(line));
					ip_ranges = [...ip_ranges, ...items];
				})
				.then(() => {
					return internalIpRanges.fetchUrl(CLOUDFARE_V6_URL);
				})
				.then((cloudfare_data) => {
					const items = cloudfare_data.split("\n").filter((line) => regIpV6.test(line));
					ip_ranges = [...ip_ranges, ...items];
				})
				.then(() => {
					const clean_ip_ranges = [];
					ip_ranges.map((range) => {
						if (range) {
							clean_ip_ranges.push(range);
						}
						return true;
					});

					return internalIpRanges.generateConfig(clean_ip_ranges).then(() => {
						// Reload nginx so new trusted proxy ranges take effect immediately.
						// If nginx isn't ready yet, the reload will fail harmlessly and the
						// next reload will apply it.
						return internalNginx.reload().catch(() => {});
					});
				})
				.then(() => {
					internalIpRanges.interval_processing = false;
					internalIpRanges.iteration_count++;
				})
				.catch((err) => {
					logger.fatal(err.message);
					// No network? Fall back to a bundled Cloudflare list so real client IP
					// extraction still works behind Cloudflare.
					return internalIpRanges
						.generateConfig(CLOUDFLARE_FALLBACK_RANGES)
						.then(() => internalNginx.reload().catch(() => {}))
						.catch((fallbackErr) => {
							logger.fatal(`Fallback ip_ranges.conf generation failed: ${fallbackErr.message}`);
						})
						.finally(() => {
							internalIpRanges.interval_processing = false;
							internalIpRanges.iteration_count++;
						});
				});
		}
	},

	/**
	 * @param   {Array}  ip_ranges
	 * @returns {Promise}
	 */
	generateConfig: (ip_ranges) => {
		const renderEngine = utils.getRenderEngine();
		return new Promise((resolve, reject) => {
			let template = null;
			const filename = "/etc/nginx/conf.d/include/ip_ranges.conf";
			try {
				template = fs.readFileSync(`${__dirname}/../templates/ip_ranges.conf`, { encoding: "utf8" });
			} catch (err) {
				reject(new errs.ConfigurationError(err.message));
				return;
			}

			renderEngine
				.parseAndRender(template, { ip_ranges: ip_ranges })
				.then((config_text) => {
					fs.writeFileSync(filename, config_text, { encoding: "utf8" });
					resolve(true);
				})
				.catch((err) => {
					logger.warn(`Could not write ${filename}: ${err.message}`);
					reject(new errs.ConfigurationError(err.message));
				});
		});
	},
};

export default internalIpRanges;
