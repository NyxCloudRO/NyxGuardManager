import internalDeadHost from "./dead-host.js";
import internalProxyHost from "./proxy-host.js";
import internalRedirectionHost from "./redirection-host.js";
import internalStream from "./stream.js";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);

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

		const [proxy, redirection, stream, dead, cpuUsagePercent, disk, container] = await Promise.all([
			internalProxyHost.getCount(userId, accessData.permission_visibility),
			internalRedirectionHost.getCount(userId, accessData.permission_visibility),
			internalStream.getCount(userId, accessData.permission_visibility),
			internalDeadHost.getCount(userId, accessData.permission_visibility),
			getCpuUsagePercent(),
			getDiskMetrics(),
			getContainerMetrics(),
		]);

		const ramTotalBytes = os.totalmem();
		const ramFreeBytes = os.freemem();
		const ramUsedBytes = Math.max(0, ramTotalBytes - ramFreeBytes);
		const ramUsedPercent = ramTotalBytes > 0 ? Number(((ramUsedBytes / ramTotalBytes) * 100).toFixed(1)) : 0;

		return {
			proxy,
			redirection,
			stream,
			dead,
			system: {
				cpuUsagePercent,
				ramTotalBytes,
				ramUsedBytes,
				ramFreeBytes,
				ramUsedPercent,
				disk,
				container,
			},
		};
	},
};

export default internalReport;
