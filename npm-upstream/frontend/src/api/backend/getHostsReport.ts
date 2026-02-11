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
	ramTotalBytes: number;
	ramUsedBytes: number;
	ramFreeBytes: number;
	ramUsedPercent: number;
	disk: HostSystemDiskMetrics | null;
	container?: {
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
