import * as api from "./base";

export interface HostSystemDiskMetrics {
	path: string;
	totalBytes: number;
	usedBytes: number;
	freeBytes: number;
	usedPercent: number;
}

export interface HostSystemMetrics {
	cpuUsagePercent: number | null;
	systemUptimeSeconds?: number | null;
	dockerContainerUptimeSeconds?: number | null;
	loadAvg?: { one: number | null; five: number | null; fifteen: number | null };
	pendingUpdatesCount?: number | null;
	trustedSelfIps?: string[];
	ramTotalBytes: number;
	ramUsedBytes: number;
	ramFreeBytes: number;
	ramUsedPercent: number;
	disk: HostSystemDiskMetrics | null;
	container?: HostContainerMetrics;
	containersAggregate?: HostContainerMetrics & {
		containerIds?: string[];
		containerNames?: string[];
		missingContainerNames?: string[];
	};
}

export interface HostContainerMetrics {
	containerId: string | null;
	cpuUsagePercent: number | null;
	memoryUsageBytes: number;
	memoryLimitBytes: number | null;
	memoryUsagePercent: number | null;
	rssBytes: number;
	netIo: {
		rxBytes: number;
		txBytes: number;
	};
	blockIo: {
		readBytes: number;
		writeBytes: number;
	};
}

export interface HostsReport {
	proxy: number;
	redirection: number;
	stream: number;
	dead: number;
	system?: HostSystemMetrics;
}

export async function getHostsReport(): Promise<HostsReport> {
	return await api.get({
		url: "/reports/hosts",
	});
}
