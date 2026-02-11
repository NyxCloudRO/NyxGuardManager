import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// Keep explicit per-page refetch intervals working, but avoid extra retries/refetch churn.
			staleTime: 30 * 1000,
			gcTime: 5 * 60 * 1000,
			retry: 1,
			refetchOnWindowFocus: false,
			refetchOnReconnect: true,
		},
	},
});
