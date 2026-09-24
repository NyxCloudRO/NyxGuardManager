import { finiteNumber, result } from "./result.mjs";

const safeId = (id) => Number.isSafeInteger(id) && id > 0;
const validPort = (port) => Number.isSafeInteger(port) && port >= 1 && port <= 65535;
const validScheme = (scheme) => scheme === "http" || scheme === "https";
const validHostname = (name) => typeof name === "string" && name.length <= 253 &&
	/^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$/.test(name);
const validAddress = (name) => typeof name === "string" && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(name) &&
	name.split(".").every((part) => Number(part) <= 255);
const validTarget = (name) => typeof name === "string" &&
	(/^[0-9.]+$/.test(name) ? validAddress(name) : validHostname(name));

// Caller loads these rows by authorized ID from NyxGuard's database. The module
// never accepts a URL or fetches an address. External probes must use this
// validated target and pin the resolved address; redirects must be disabled.
export function configuredTarget(host) {
	if (!host || !safeId(host.id) || !validScheme(host.forward_scheme) ||
		!validTarget(host.forward_host) || !validPort(host.forward_port)) {
		throw new TypeError("Invalid configured proxy target");
	}
	return Object.freeze({ host_id: host.id, scheme: host.forward_scheme,
		host: host.forward_host, port: host.forward_port });
}

const classifyBoolean = (name, value, badState = "FAIL") => result(name,
	value === true ? "PASS" : value === false ? badState : "SKIPPED");

export function systemDiagnostics(snapshot = {}) {
	const checks = [
		result("application_version", /^\d+\.\d+\.\d+$/.test(snapshot.version ?? "") ? "PASS" : "SKIPPED"),
		classifyBoolean("backend_health", snapshot.backendHealthy),
		classifyBoolean("database_reachability", snapshot.databaseReachable),
		classifyBoolean("migrations_current", snapshot.migrationsCurrent, "WARNING"),
		classifyBoolean("openresty_health", snapshot.openrestyHealthy),
		classifyBoolean("configuration_valid", snapshot.configurationValid),
	];
	const disk = finiteNumber(snapshot.diskFreePercent);
	checks.push(result("disk_capacity", disk === null ? "SKIPPED" : disk < 5 ? "FAIL" : disk < 15 ? "WARNING" : "PASS",
		disk === null ? {} : { free_percent: Math.max(0, Math.min(100, disk)) }));
	const memory = finiteNumber(snapshot.memoryFreePercent);
	checks.push(result("memory_pressure", memory === null ? "SKIPPED" : memory < 5 ? "FAIL" : memory < 15 ? "WARNING" : "PASS",
		memory === null ? {} : { free_percent: Math.max(0, Math.min(100, memory)) }));
	const uptime = finiteNumber(snapshot.uptimeSeconds);
	checks.push(result("uptime", uptime === null || uptime < 0 ? "SKIPPED" : "PASS",
		uptime === null || uptime < 0 ? {} : { seconds: Math.floor(uptime) }));
	const restarts = finiteNumber(snapshot.restartCount);
	checks.push(result("restart_indicator", restarts === null || restarts < 0 ? "SKIPPED" : restarts > 2 ? "WARNING" : "PASS",
		restarts === null || restarts < 0 ? {} : { count: Math.floor(restarts) }));
	const errors = finiteNumber(snapshot.recentErrorCount);
	checks.push(result("error_indicator", errors === null || errors < 0 ? "SKIPPED" : errors > 0 ? "WARNING" : "PASS",
		errors === null || errors < 0 ? {} : { count: Math.floor(errors) }));
	return checks;
}

export function routingDiagnostics(host, observations = {}) {
	const target = configuredTarget(host);
	const base = { host_id: target.host_id };
	return [
		result("listener_match", host.enabled === false ? "WARNING" : host.listenerMatched === true ? "PASS" : host.listenerMatched === false ? "FAIL" : "SKIPPED", base),
		result("route_match", host.routeMatched === true ? "PASS" : host.routeMatched === false ? "FAIL" : "SKIPPED", base),
		classifyBoolean("dns_resolution", observations.dnsResolved),
		classifyBoolean("upstream_tcp", observations.tcpReachable),
		result("upstream_tls", target.scheme === "http" ? "SKIPPED" : observations.tlsValid === true ? "PASS" : observations.tlsValid === false ? "FAIL" : "SKIPPED"),
		result("upstream_http", Number.isInteger(observations.httpStatus) && observations.httpStatus >= 100 && observations.httpStatus <= 599
			? observations.httpStatus >= 500 ? "FAIL" : observations.httpStatus >= 400 ? "WARNING" : "PASS" : "SKIPPED",
			Number.isInteger(observations.httpStatus) && observations.httpStatus >= 100 && observations.httpStatus <= 599
				? { status_code: observations.httpStatus } : {}),
		classifyBoolean("redirect_safe", observations.redirectSafe, "WARNING"),
		classifyBoolean("websocket_ready", observations.websocketReady, "WARNING"),
		classifyBoolean("route_conflict", observations.routeConflict === undefined ? undefined : !observations.routeConflict),
	];
}

export function tlsDiagnostics(host, certificate = null, observations = {}) {
	if (!host || !safeId(host.id)) throw new TypeError("Invalid configured host");
	const assigned = safeId(host.certificate_id);
	if (certificate && (!safeId(certificate.id) || certificate.id !== host.certificate_id)) {
		throw new TypeError("Certificate is not assigned to host");
	}
	const expiry = certificate?.expires_on ? Date.parse(certificate.expires_on) : NaN;
	const remaining = Number.isFinite(expiry) ? Math.floor((expiry - Date.now()) / 86400000) : null;
	return [
		result("certificate_presence", assigned && certificate ? "PASS" : assigned ? "FAIL" : "SKIPPED", { host_id: host.id }),
		result("certificate_expiry", remaining === null ? "SKIPPED" : remaining < 0 ? "FAIL" : remaining < 30 ? "WARNING" : "PASS",
			remaining === null ? {} : { days_remaining: remaining }),
		classifyBoolean("san_match", observations.sanMatches),
		classifyBoolean("chain_valid", observations.chainValid),
		classifyBoolean("renewal_ready", observations.renewalReady, "WARNING"),
		classifyBoolean("acme_ready", observations.acmeReady, "WARNING"),
		classifyBoolean("dns_challenge_ready", observations.dnsChallengeReady, "WARNING"),
	];
}

const TROUBLESHOOT_STEPS = ["dns_resolution", "listener_match", "route_match", "upstream_tcp", "upstream_tls", "upstream_http"];
export function troubleshoot502(host, observations = {}) {
	const route = routingDiagnostics(host, observations);
	return TROUBLESHOOT_STEPS.map((check) => route.find((item) => item.check === check));
}
