import { useQuery } from "@tanstack/react-query";
import { getHostsReport, type HostsReport } from "src/api/backend";

const fetchHostReport = () => getHostsReport();

const useHostReport = (options = {}) => {
	return useQuery<HostsReport, Error>({
		queryKey: ["host-report"],
		queryFn: fetchHostReport,
		refetchOnMount: "always",
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
		refetchIntervalInBackground: true,
		retry: 5,
		refetchInterval: 5 * 1000, // 5 seconds
		staleTime: 4 * 1000, // 4 seconds
		...options,
	});
};

export { fetchHostReport, useHostReport };
