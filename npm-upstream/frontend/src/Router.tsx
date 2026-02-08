import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import {
	ErrorNotFound,
	LoadingPage,
	Page,
	SiteContainer,
	SiteFooter,
	SiteHeader,
	Unhealthy,
} from "src/components";
import { useAuthState } from "src/context";
import { useHealth } from "src/hooks";

const Setup = lazy(() => import("src/pages/Setup"));
const Login = lazy(() => import("src/pages/Login"));
const Dashboard = lazy(() => import("src/pages/Dashboard"));
const Settings = lazy(() => import("src/pages/Settings"));
const Certificates = lazy(() => import("src/pages/Certificates"));
const Access = lazy(() => import("src/pages/Access"));
const AuditLog = lazy(() => import("src/pages/AuditLog"));
const Users = lazy(() => import("src/pages/Users"));
const ProxyHosts = lazy(() => import("src/pages/Nginx/ProxyHosts"));
const RedirectionHosts = lazy(() => import("src/pages/Nginx/RedirectionHosts"));
const DeadHosts = lazy(() => import("src/pages/Nginx/DeadHosts"));
const Streams = lazy(() => import("src/pages/Nginx/Streams"));
const NyxGuard = lazy(() => import("src/pages/NyxGuard"));
const NyxGuardTraffic = lazy(() => import("src/pages/NyxGuardTraffic"));
const NyxGuardIPs = lazy(() => import("src/pages/NyxGuardIPs"));
const NyxGuardRules = lazy(() => import("src/pages/NyxGuardRules"));
const NyxGuardDdos = lazy(() => import("src/pages/NyxGuardDdos"));
const NyxGuardBot = lazy(() => import("src/pages/NyxGuardBot"));
const NyxGuardApps = lazy(() => import("src/pages/NyxGuardApps"));

function Router() {
	const health = useHealth();
	const { authenticated } = useAuthState();

	if (health.isLoading) {
		return <LoadingPage />;
	}

	if (health.isError || health.data?.status !== "OK") {
		return <Unhealthy />;
	}

	if (!health.data?.setup) {
		return <Setup />;
	}

	if (!authenticated) {
		return (
			<Suspense fallback={<LoadingPage />}>
				<Login />
			</Suspense>
		);
	}

	return (
		<BrowserRouter>
			<Page>
				<div>
					<SiteHeader />
				</div>
				<SiteContainer>
					<Suspense fallback={<LoadingPage noLogo />}>
						<Routes>
							<Route path="*" element={<ErrorNotFound />} />
							<Route path="/nyxguard" element={<NyxGuard />} />
							<Route path="/nyxguard/traffic" element={<NyxGuardTraffic />} />
							<Route path="/nyxguard/ips" element={<NyxGuardIPs />} />
							<Route path="/nyxguard/rules" element={<NyxGuardRules />} />
							<Route path="/nyxguard/ddos" element={<NyxGuardDdos />} />
							<Route path="/nyxguard/bot" element={<NyxGuardBot />} />
							<Route path="/nyxguard/apps" element={<NyxGuardApps />} />
							<Route path="/certificates" element={<Certificates />} />
							<Route path="/access" element={<Access />} />
							<Route path="/audit-log" element={<AuditLog />} />
							<Route path="/settings" element={<Settings />} />
							<Route path="/users" element={<Users />} />
							<Route path="/nyxguard/proxy" element={<ProxyHosts />} />
							<Route path="/nyxguard/redirection" element={<RedirectionHosts />} />
							<Route path="/nyxguard/404" element={<DeadHosts />} />
							<Route path="/nyxguard/stream" element={<Streams />} />
							<Route path="/nginx/proxy" element={<Navigate to="/nyxguard/proxy" replace />} />
							<Route path="/nginx/redirection" element={<Navigate to="/nyxguard/redirection" replace />} />
							<Route path="/nginx/404" element={<Navigate to="/nyxguard/404" replace />} />
							<Route path="/nginx/stream" element={<Navigate to="/nyxguard/stream" replace />} />
							<Route path="/" element={<Dashboard />} />
						</Routes>
					</Suspense>
				</SiteContainer>
				<SiteFooter />
			</Page>
		</BrowserRouter>
	);
}

export default Router;
