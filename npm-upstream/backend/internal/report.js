import internalDeadHost from "./dead-host.js";
import internalProxyHost from "./proxy-host.js";
import internalRedirectionHost from "./redirection-host.js";
import internalStream from "./stream.js";
import os from "node:os";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { getTrustedSelfIps } from "./trusted-ips.js";

const execFileAsync = promisify(execFile);
const DOCKER_SOCK = "/var/run/docker.sock";
const DEFAULT_DOCKER_USAGE_CONTAINERS = ["nyxguard-manager", "nyxguard-db"];
const HOSTS_REPORT_CACHE_TTL_MS = Number.parseInt(process.env.NYXGUARD_HOSTS_REPORT_CACHE_TTL_MS ?? "", 10) || 2000;
const hostsReportCache = new Map(); // key -> { expiresAt: number, value: object }
const hostsReportInflight = new Map(); // key -> Promise<object>

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getCpuSnapshot = () => {
	const cpus = os.cpus();
	return cpus.reduce(
		(acc, cpu) => {
			const t = cpu.times;
			acc.idle += t.idle;
			acc.total += t.user + t.nice + t.sys + t.idle + t.irq;
			return acc;
		},
		{ idle: 0, total: 0 },
	);
};

const getCpuUsagePercent = async () => {
	try {
		const start = getCpuSnapshot();
		await sleep(250);
		const end = getCpuSnapshot();
		const totalDiff = end.total - start.total;
		const idleDiff = end.idle - start.idle;
		if (totalDiff <= 0) return null;
		const used = ((totalDiff - idleDiff) / totalDiff) * 100;
		return Number(used.toFixed(1));
	} catch {
		return null;
	}
};

const parseDfLine = (line) => {
	const parts = line.trim().split(/\s+/);
	if (parts.length < 6) return null;
	const totalK = Number(parts[1]);
	const usedK = Number(parts[2]);
	const freeK = Number(parts[3]);
	const usedPercent = Number(String(parts[4]).replace("%", ""));
	const path = parts.slice(5).join(" ");
	if (!Number.isFinite(totalK) || !Number.isFinite(usedK) || !Number.isFinite(freeK)) return null;
	return {
		path,
		totalBytes: totalK * 1024,
		usedBytes: usedK * 1024,
		freeBytes: freeK * 1024,
		usedPercent: Number.isFinite(usedPercent) ? usedPercent : Math.round((usedK / totalK) * 100),
	};
};

const getDiskMetrics = async () => {
	const candidates = [process.env.NYXGUARD_DISK_PATH, "/data", "/"].filter(Boolean);
	for (const candidate of candidates) {
		try {
			const { stdout } = await execFileAsync("df", ["-kP", candidate]);
			const lines = stdout.trim().split("\n");
			if (lines.length < 2) continue;
			const parsed = parseDfLine(lines[lines.length - 1]);
			if (parsed) return parsed;
		} catch {
			// Try next candidate path.
		}
	}
	return null;
};

const readNumberFile = async (filePath) => {
	try {
		const raw = (await readFile(filePath, "utf8")).trim();
		if (!raw || raw === "max") return null;
		const n = Number(raw);
		return Number.isFinite(n) ? n : null;
	} catch {
		return null;
	}
};

const readMemoryStatValue = async (key) => {
	try {
		const raw = await readFile("/sys/fs/cgroup/memory.stat", "utf8");
		for (const line of raw.split("\n")) {
			const [k, v] = line.trim().split(/\s+/);
			if (k === key) {
				const n = Number(v);
				return Number.isFinite(n) ? n : null;
			}
		}
		return null;
	} catch {
		return null;
	}
};

const getContainerNetIo = async () => {
	try {
		const content = await readFile("/proc/net/dev", "utf8");
		let rxBytes = 0;
		let txBytes = 0;
		for (const line of content.split("\n")) {
			if (!line.includes(":")) continue;
			const [rawIface, rawStats] = line.trim().split(":");
			const iface = rawIface.trim();
			if (!iface || iface === "lo") continue;
			const parts = rawStats.trim().split(/\s+/);
			if (parts.length < 16) continue;
			const rx = Number(parts[0]);
			const tx = Number(parts[8]);
			if (Number.isFinite(rx)) rxBytes += rx;
			if (Number.isFinite(tx)) txBytes += tx;
		}
		return { rxBytes, txBytes };
	} catch {
		return { rxBytes: 0, txBytes: 0 };
	}
};

const getContainerBlockIo = async () => {
	// cgroup v2: /sys/fs/cgroup/io.stat lines like:
	// "8:0 rbytes=123 wbytes=456 rios=.. wios=.."
	try {
		const raw = await readFile("/sys/fs/cgroup/io.stat", "utf8");
		let readBytes = 0;
		let writeBytes = 0;
		for (const line of raw.split("\n")) {
			if (!line.trim()) continue;
			const rMatch = line.match(/rbytes=(\d+)/);
			const wMatch = line.match(/wbytes=(\d+)/);
			if (rMatch) readBytes += Number(rMatch[1]);
			if (wMatch) writeBytes += Number(wMatch[1]);
		}
		if (readBytes > 0 || writeBytes > 0) {
			return { readBytes, writeBytes };
		}
	} catch {
		// try cgroup v1 fallback below
	}

	// cgroup v1 fallback: /sys/fs/cgroup/blkio/blkio.throttle.io_service_bytes
	try {
		const raw = await readFile("/sys/fs/cgroup/blkio/blkio.throttle.io_service_bytes", "utf8");
		let readBytes = 0;
		let writeBytes = 0;
		for (const line of raw.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			const parts = trimmed.split(/\s+/);
			if (parts.length < 3) continue;
			const op = parts[1].toUpperCase();
			const val = Number(parts[2]);
			if (!Number.isFinite(val)) continue;
			if (op === "READ") readBytes += val;
			if (op === "WRITE") writeBytes += val;
		}
		return { readBytes, writeBytes };
	} catch {
		return { readBytes: 0, writeBytes: 0 };
	}
};

const getContainerCpuUsagePercent = async () => {
	const cpuCount = Math.max(1, os.cpus().length);

	// cgroup v2
	const readCpuUsec = async () => {
		try {
			const raw = await readFile("/sys/fs/cgroup/cpu.stat", "utf8");
			for (const line of raw.split("\n")) {
				const [k, v] = line.trim().split(/\s+/);
				if (k === "usage_usec") {
					const n = Number(v);
					return Number.isFinite(n) ? n : null;
				}
			}
			return null;
		} catch {
			return null;
		}
	};

	const startUsecV2 = await readCpuUsec();
	if (startUsecV2 !== null) {
		const startTs = Date.now();
		await sleep(250);
		const endUsecV2 = await readCpuUsec();
		const endTs = Date.now();
		if (endUsecV2 !== null) {
			const deltaUsec = endUsecV2 - startUsecV2;
			const intervalUsec = Math.max(1, (endTs - startTs) * 1000);
			const pct = (deltaUsec / (intervalUsec * cpuCount)) * 100;
			return Number(Math.max(0, pct).toFixed(2));
		}
	}

	// cgroup v1 fallback
	const startNsec = await readNumberFile("/sys/fs/cgroup/cpuacct/cpuacct.usage");
	if (startNsec !== null) {
		const startTs = Date.now();
		await sleep(250);
		const endNsec = await readNumberFile("/sys/fs/cgroup/cpuacct/cpuacct.usage");
		const endTs = Date.now();
		if (endNsec !== null) {
			const deltaNsec = endNsec - startNsec;
			const intervalNsec = Math.max(1, (endTs - startTs) * 1_000_000);
			const pct = (deltaNsec / (intervalNsec * cpuCount)) * 100;
			return Number(Math.max(0, pct).toFixed(2));
		}
	}

	return null;
};

const getContainerMetrics = async () => {
	// cgroup v2 preferred
	const currentV2 = await readNumberFile("/sys/fs/cgroup/memory.current");
	const limitV2 = await readNumberFile("/sys/fs/cgroup/memory.max");
	const currentV1 = currentV2 ?? (await readNumberFile("/sys/fs/cgroup/memory/memory.usage_in_bytes"));
	const limitV1 = limitV2 ?? (await readNumberFile("/sys/fs/cgroup/memory/memory.limit_in_bytes"));
	const rssV1 = await readMemoryStatValue("rss");
	const anonV2 = await readMemoryStatValue("anon");
	const fileV2 = await readMemoryStatValue("file");
	const [cpuUsagePercent, netIo, blockIo] = await Promise.all([
		getContainerCpuUsagePercent(),
		getContainerNetIo(),
		getContainerBlockIo(),
	]);

	const usageBytes = currentV1 ?? 0;
	const limitBytes = limitV1 && limitV1 > 0 && limitV1 < Number.MAX_SAFE_INTEGER ? limitV1 : null;
	const usagePercent = limitBytes ? Number(((usageBytes / limitBytes) * 100).toFixed(2)) : null;
	const rssBytes = rssV1 ?? (anonV2 ?? 0) + (fileV2 ?? 0);

	const containerId = process.env.HOSTNAME || null;
	return {
		containerId,
		cpuUsagePercent,
		memoryUsageBytes: usageBytes,
		memoryLimitBytes: limitBytes,
		memoryUsagePercent: usagePercent,
		rssBytes,
		netIo,
		blockIo,
	};
};

const parseDockerStats = (stats) => {
	const cpuTotal = Number(stats?.cpu_stats?.cpu_usage?.total_usage ?? 0);
	const cpuTotalPrev = Number(stats?.precpu_stats?.cpu_usage?.total_usage ?? 0);
	const systemTotal = Number(stats?.cpu_stats?.system_cpu_usage ?? 0);
	const systemTotalPrev = Number(stats?.precpu_stats?.system_cpu_usage ?? 0);
	const cpuDelta = cpuTotal - cpuTotalPrev;
	const systemDelta = systemTotal - systemTotalPrev;
	const onlineCpus =
		Number(stats?.cpu_stats?.online_cpus ?? 0) ||
		Number(stats?.cpu_stats?.cpu_usage?.percpu_usage?.length ?? 0) ||
		1;
	const cpuUsagePercent =
		cpuDelta > 0 && systemDelta > 0 ? Number(((cpuDelta / systemDelta) * onlineCpus * 100).toFixed(2)) : null;

	const memoryUsageRaw = Number(stats?.memory_stats?.usage ?? 0);
	const inactiveFile =
		Number(stats?.memory_stats?.stats?.inactive_file ?? 0) || Number(stats?.memory_stats?.stats?.total_inactive_file ?? 0);
	// Match `docker stats` memory column semantics: working set = usage - inactive_file(cache).
	const memoryUsageBytes = Math.max(0, memoryUsageRaw - (Number.isFinite(inactiveFile) ? inactiveFile : 0));
	const memoryLimitRaw = Number(stats?.memory_stats?.limit ?? 0);
	const memoryLimitBytes = Number.isFinite(memoryLimitRaw) && memoryLimitRaw > 0 ? memoryLimitRaw : null;
	const memoryUsagePercent =
		memoryLimitBytes && memoryLimitBytes > 0
			? Number(((Math.max(0, memoryUsageBytes) / memoryLimitBytes) * 100).toFixed(2))
			: null;

	let rxBytes = 0;
	let txBytes = 0;
	for (const net of Object.values(stats?.networks ?? {})) {
		const rx = Number(net?.rx_bytes ?? 0);
		const tx = Number(net?.tx_bytes ?? 0);
		if (Number.isFinite(rx)) rxBytes += rx;
		if (Number.isFinite(tx)) txBytes += tx;
	}

	let readBytes = 0;
	let writeBytes = 0;
	for (const item of stats?.blkio_stats?.io_service_bytes_recursive ?? []) {
		const op = String(item?.op ?? "").toUpperCase();
		const value = Number(item?.value ?? 0);
		if (!Number.isFinite(value)) continue;
		if (op === "READ") readBytes += value;
		if (op === "WRITE") writeBytes += value;
	}

	const rssRaw = Number(stats?.memory_stats?.stats?.rss ?? 0) || Number(stats?.memory_stats?.stats?.total_rss ?? 0);
	// On cgroup v2 `rss` can be absent; `anon` is the closest equivalent to resident anonymous memory.
	const rssFallback = Number(stats?.memory_stats?.stats?.anon ?? 0);
	const rssBytes = Number.isFinite(rssRaw) && rssRaw > 0 ? rssRaw : Number.isFinite(rssFallback) && rssFallback > 0 ? rssFallback : 0;
	const containerId = typeof stats?.id === "string" && stats.id ? stats.id.slice(0, 12) : null;

	return {
		containerId,
		cpuUsagePercent,
		memoryUsageBytes: Number.isFinite(memoryUsageBytes) && memoryUsageBytes > 0 ? memoryUsageBytes : 0,
		memoryLimitBytes,
		memoryUsagePercent,
		rssBytes,
		netIo: { rxBytes, txBytes },
		blockIo: { readBytes, writeBytes },
	};
};

const readDockerApiJson = (path) =>
	new Promise((resolve, reject) => {
		const apiVersion = (process.env.NYXGUARD_DOCKER_API_VERSION || "").trim().replace(/^\/+/, "");
		const apiPrefix = apiVersion ? `/${apiVersion}` : "";
		const req = http.request(
			{
				socketPath: DOCKER_SOCK,
				path: `${apiPrefix}${path}`,
				method: "GET",
			},
			(res) => {
				const chunks = [];
				res.on("data", (chunk) => chunks.push(chunk));
				res.on("end", () => {
					const raw = Buffer.concat(chunks).toString("utf8");
					if (res.statusCode && res.statusCode >= 400) {
						const err = new Error(`docker api ${path} failed with status ${res.statusCode}`);
						err.statusCode = res.statusCode;
						reject(err);
						return;
					}
					if (!raw) {
						resolve(null);
						return;
					}
					try {
						resolve(JSON.parse(raw));
					} catch {
						reject(new Error(`docker api ${path} returned invalid json`));
					}
				});
			},
		);
		req.on("error", reject);
		req.end();
	});

const getNamedDockerContainerMetrics = async (containerName) => {
	try {
		const encoded = encodeURIComponent(containerName);
		const stats = await readDockerApiJson(`/containers/${encoded}/stats?stream=false`);
		if (!stats || typeof stats !== "object") return null;
		return {
			name: containerName,
			...parseDockerStats(stats),
		};
	} catch {
		return null;
	}
};

const getCombinedDockerContainerMetrics = async () => {
	const containerNames = (process.env.NYXGUARD_DOCKER_USAGE_CONTAINERS || DEFAULT_DOCKER_USAGE_CONTAINERS.join(","))
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (!containerNames.length) return null;

	const items = await Promise.all(containerNames.map((name) => getNamedDockerContainerMetrics(name)));
	const present = items.filter(Boolean);
	if (!present.length) return null;

	const cpuUsagePercentRaw = present.reduce((sum, item) => sum + (Number(item.cpuUsagePercent) || 0), 0);
	const memoryUsageBytes = present.reduce((sum, item) => sum + (Number(item.memoryUsageBytes) || 0), 0);
	const memoryLimitBytesRaw = present.reduce(
		(sum, item) => sum + (item.memoryLimitBytes && item.memoryLimitBytes > 0 ? item.memoryLimitBytes : 0),
		0,
	);
	const rssBytes = present.reduce((sum, item) => sum + (Number(item.rssBytes) || 0), 0);
	const netRxBytes = present.reduce((sum, item) => sum + (Number(item.netIo?.rxBytes) || 0), 0);
	const netTxBytes = present.reduce((sum, item) => sum + (Number(item.netIo?.txBytes) || 0), 0);
	const blockReadBytes = present.reduce((sum, item) => sum + (Number(item.blockIo?.readBytes) || 0), 0);
	const blockWriteBytes = present.reduce((sum, item) => sum + (Number(item.blockIo?.writeBytes) || 0), 0);

	const memoryLimitBytes = memoryLimitBytesRaw > 0 ? memoryLimitBytesRaw : null;
	const memoryUsagePercent =
		memoryLimitBytes && memoryLimitBytes > 0 ? Number(((memoryUsageBytes / memoryLimitBytes) * 100).toFixed(2)) : null;
	const cpuUsagePercent = Number(cpuUsagePercentRaw.toFixed(2));

	return {
		containerId: present.map((item) => item.containerId).filter(Boolean).join(",") || null,
		containerIds: present.map((item) => item.containerId).filter(Boolean),
		containerNames,
		missingContainerNames: containerNames.filter((name) => !present.find((item) => item.name === name)),
		cpuUsagePercent,
		memoryUsageBytes,
		memoryLimitBytes,
		memoryUsagePercent,
		rssBytes,
		netIo: { rxBytes: netRxBytes, txBytes: netTxBytes },
		blockIo: { readBytes: blockReadBytes, writeBytes: blockWriteBytes },
	};
};

function parseProcUptimeSeconds(raw) {
	const s = String(raw ?? "").trim();
	if (!s) return null;
	const first = s.split(/\s+/)[0];
	const n = Number.parseFloat(first);
	return Number.isFinite(n) && n >= 0 ? n : null;
}

const getSystemUptimeSeconds = async () => {
	// Prefer /proc/uptime so it also works without systemd privileges.
	try {
		const raw = await readFile("/proc/uptime", "utf8");
		const secs = parseProcUptimeSeconds(raw);
		if (secs !== null) return secs;
	} catch {
		// ignore
	}
	try {
		return typeof os.uptime === "function" ? os.uptime() : null;
	} catch {
		return null;
	}
};

const getHostLoadAverages = async () => {
	try {
		const [a1, a5, a15] = os.loadavg();
		return {
			one: Number.isFinite(a1) ? Number(a1.toFixed(2)) : null,
			five: Number.isFinite(a5) ? Number(a5.toFixed(2)) : null,
			fifteen: Number.isFinite(a15) ? Number(a15.toFixed(2)) : null,
		};
	} catch {
		return { one: null, five: null, fifteen: null };
	}
};

const getPendingUpdatesCount = async () => {
	// Best-effort: works on Debian/Ubuntu images with apt.
	// If apt isn't available, return null.
	try {
		const { stdout } = await execFileAsync("bash", [
			"-lc",
			"command -v apt-get >/dev/null 2>&1 || exit 0; apt-get -s upgrade 2>/dev/null | awk '/^Inst /{c++} END{print c+0}'",
		]);
		const n = Number.parseInt(String(stdout ?? "").trim(), 10);
		return Number.isFinite(n) && n >= 0 ? n : null;
	} catch {
		return null;
	}
};

const getDockerContainerStartedAt = async (containerName) => {
	try {
		const encoded = encodeURIComponent(containerName);
		const info = await readDockerApiJson(`/containers/${encoded}/json`);
		const startedAt = info?.State?.StartedAt;
		return typeof startedAt === "string" && startedAt ? startedAt : null;
	} catch {
		return null;
	}
};

const getDockerContainerUptimeSeconds = async () => {
	const containerNames = (process.env.NYXGUARD_DOCKER_USAGE_CONTAINERS || DEFAULT_DOCKER_USAGE_CONTAINERS.join(","))
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (!containerNames.length) return null;

	const startedAts = await Promise.all(containerNames.map((name) => getDockerContainerStartedAt(name)));
	const nowMs = Date.now();
	let maxSec = null;
	for (const startedAt of startedAts) {
		if (!startedAt) continue;
		const ms = Date.parse(startedAt);
		if (!Number.isFinite(ms)) continue;
		const sec = Math.max(0, (nowMs - ms) / 1000);
		if (maxSec === null || sec > maxSec) maxSec = sec;
	}
	return maxSec;
};

const internalReport = {
	/**
	 * @param  {Access}   access
	 * @return {Promise}
	 */
	getHostsReport: async (access) => {
		let accessData;
		try {
			accessData = await access.can("reports:hosts", 1);
		} catch {
			// Some installs may not have the explicit reports:hosts permission seeded.
			// Fallback to read-only metrics with global visibility.
			accessData = { permission_visibility: "all" };
		}
		const userId = access.token.getUserId(1);
		const visibility = accessData.permission_visibility ?? "all";
		const cacheKey = `${userId}:${visibility}`;
		const now = Date.now();
		const cached = hostsReportCache.get(cacheKey);
		if (cached && cached.expiresAt > now) return cached.value;
		const inflight = hostsReportInflight.get(cacheKey);
		if (inflight) return inflight;

		const compute = (async () => {
			try {
				const [proxy, redirection, stream, dead, cpuUsagePercent, disk, container, containersAggregate] = await Promise.all([
					internalProxyHost.getCount(userId, visibility),
					internalRedirectionHost.getCount(userId, visibility),
					internalStream.getCount(userId, visibility),
					internalDeadHost.getCount(userId, visibility),
					getCpuUsagePercent(),
					getDiskMetrics(),
					getContainerMetrics(),
					getCombinedDockerContainerMetrics(),
				]);
				const [systemUptimeSeconds, dockerContainerUptimeSeconds, loadAvg, pendingUpdatesCount, trustedSelfIps] = await Promise.all([
					getSystemUptimeSeconds(),
					getDockerContainerUptimeSeconds(),
					getHostLoadAverages(),
					getPendingUpdatesCount(),
					getTrustedSelfIps(),
				]);

				const ramTotalBytes = os.totalmem();
				const ramFreeBytes = os.freemem();
				const ramUsedBytes = Math.max(0, ramTotalBytes - ramFreeBytes);
				const ramUsedPercent = ramTotalBytes > 0 ? Number(((ramUsedBytes / ramTotalBytes) * 100).toFixed(1)) : 0;

				const value = {
					proxy,
					redirection,
					stream,
					dead,
					system: {
						cpuUsagePercent,
						systemUptimeSeconds,
						dockerContainerUptimeSeconds,
						loadAvg,
						pendingUpdatesCount,
						trustedSelfIps,
						ramTotalBytes,
						ramUsedBytes,
						ramFreeBytes,
						ramUsedPercent,
						disk,
						container,
						containersAggregate,
					},
				};
				hostsReportCache.set(cacheKey, { expiresAt: Date.now() + HOSTS_REPORT_CACHE_TTL_MS, value });
				return value;
			} finally {
				hostsReportInflight.delete(cacheKey);
			}
		})();
		hostsReportInflight.set(cacheKey, compute);
		return compute;
	},
};

export default internalReport;
