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

// Messages are fixed and never include addresses, response text, or secrets.
const guidance = {
	application_version: ["A valid application version was observed.", "The application version was unavailable.", "Compare this version with the intended image.", "Collect the running application version."],
	backend_health: ["The backend health observation succeeded.", "The backend health observation failed.", "Continue monitoring backend health.", "Check backend readiness and recent errors."],
	database_reachability: ["The database query succeeded.", "The database query failed.", "Continue monitoring database connectivity.", "Check MariaDB health and connectivity."],
	migrations_current: ["The expected migration was found.", "The expected migration was not found.", "Keep schema and application versions aligned.", "Inspect migration status before changing versions."],
	openresty_health: ["The OpenResty configuration test succeeded.", "The OpenResty configuration test failed.", "Continue monitoring the listener.", "Inspect the OpenResty configuration and error log."],
	configuration_valid: ["The OpenResty configuration test succeeded.", "The OpenResty configuration test failed.", "Continue monitoring generated configuration.", "Inspect generated OpenResty configuration and syntax errors."],
	disk_capacity: ["Disk free space is within the monitored range.", "Disk free space is low.", "Continue monitoring disk capacity.", "Free space and check for failed writes."],
	memory_pressure: ["Free memory is within the monitored range.", "Free memory is low.", "Continue monitoring available memory.", "Inspect memory consumers and service stability."],
	cpu_usage: ["CPU usage is within the monitored range.", "CPU usage is high.", "Continue monitoring CPU usage.", "Inspect sustained CPU load and service responsiveness."],
	uptime: ["Application uptime was observed.", "Application uptime was not observed.", "Compare uptime with deployment history.", "Collect process uptime."],
	restart_indicator: ["The observed restart count is low.", "The observed restart count is elevated.", "Continue monitoring restarts.", "Inspect container exit reasons and recent logs."],
	error_indicator: ["No OpenResty errors were found in the observed interval.", "Recent OpenResty errors were observed.", "Continue monitoring OpenResty errors.", "Inspect recent OpenResty error log entries."],
	listener_match: ["A listener match was observed.", "No listener match was observed.", "Continue checking route behavior.", "Check listener bindings and host names."],
	route_match: ["A route match was observed.", "No route match was observed.", "Continue checking upstream behavior.", "Inspect routing rules and host priority."],
	dns_resolution: ["The configured upstream resolved.", "The configured upstream did not resolve.", "Continue checking the upstream connection.", "Check the upstream name and resolver."],
	upstream_tcp: ["The upstream connection was established.", "The upstream connection was not established.", "Continue checking the upstream response.", "Check upstream availability, port, and network policy."],
	upstream_tls: ["The upstream TLS handshake was verified.", "The upstream TLS handshake was not verified.", "Continue monitoring upstream certificates.", "Check the upstream certificate, name, and trust chain."],
	upstream_http: ["The upstream returned a non-error HTTP status.", "The upstream returned an error HTTP status.", "Continue monitoring upstream responses.", "Inspect upstream response handling and logs."],
	redirect_safe: ["The response did not require a redirect.", "The response redirects; the probe did not follow it.", "Continue checking route behavior.", "Review the redirect target through the configured application."],
	websocket_ready: ["WebSocket readiness was observed.", "WebSocket readiness check failed.", "Continue monitoring WebSocket traffic.", "Check upgrade headers and upstream WebSocket support."],
	route_conflict: ["No route conflict was observed.", "A route conflict was observed.", "Continue monitoring route changes.", "Review overlapping host and path rules."],
	certificate_presence: ["The assigned certificate record was found.", "The assigned certificate record was not found.", "Continue checking certificate validity.", "Restore or reassign the missing certificate."],
	certificate_expiry: ["The certificate is outside the renewal window.", "The certificate is near or past expiry.", "Continue monitoring expiry.", "Renew or replace the certificate."],
	san_match: ["The certificate name matched the host.", "The certificate name did not match the host.", "Continue checking the certificate chain.", "Issue a certificate covering this host name."],
	chain_valid: ["The certificate chain was verified.", "The certificate chain was invalid.", "Continue monitoring TLS validity.", "Check intermediates and certificate trust."],
	renewal_ready: ["Certificate renewal readiness was observed.", "Certificate renewal readiness check failed.", "Continue monitoring renewal.", "Check renewal configuration and provider access."],
	acme_ready: ["ACME readiness was observed.", "ACME readiness check failed.", "Continue monitoring ACME renewal.", "Check challenge routing and ACME account state."],
	dns_challenge_ready: ["DNS challenge readiness was observed.", "DNS challenge readiness check failed.", "Continue monitoring DNS renewal.", "Check DNS provider access and challenge records."],
};

function diagnostic(name, state, evidence = {}, override = {}) {
	const [pass, bad, passAction, badAction] = guidance[name];
	const skipped = state === "SKIPPED";
	const reason = override.reason ?? (skipped ? `${name.replaceAll("_", " ")} was not observed.` : state === "PASS" ? pass : bad);
	const recommendation = override.recommendation ?? (skipped ? `Collect an observation for ${name.replaceAll("_", " ")}.` : state === "PASS" ? passAction : badAction);
	return { ...result(name, state, evidence), reason, recommendation, summary: reason };
}

function classifyBoolean(name, value, badState = "FAIL", evidence = {}) {
	return diagnostic(name, value === true ? "PASS" : value === false ? badState : "SKIPPED", evidence);
}

function percentage(name, value, highIsBad = false) {
	const number = finiteNumber(value);
	if (number === null || number < 0 || number > 100) return diagnostic(name, "SKIPPED");
	const fail = highIsBad ? number >= 95 : number < 5;
	const warn = highIsBad ? number >= 85 : number < 15;
	return diagnostic(name, fail ? "FAIL" : warn ? "WARNING" : "PASS", { [highIsBad ? "usage_percent" : "free_percent"]: number },
		fail ? { reason: highIsBad ? "CPU usage is at a critical level." : `${name === "disk_capacity" ? "Disk free space" : "Free memory"} is at a critical level.` } : {});
}

export function systemDiagnostics(snapshot = {}) {
	const checks = [
		diagnostic("application_version", typeof snapshot.version === "string" && /^\d+\.\d+\.\d+$/.test(snapshot.version) ? "PASS" : "SKIPPED"),
		classifyBoolean("backend_health", snapshot.backendHealthy),
		classifyBoolean("database_reachability", snapshot.databaseReachable),
		classifyBoolean("migrations_current", snapshot.migrationsCurrent, "WARNING"),
		classifyBoolean("openresty_health", snapshot.openrestyHealthy),
		classifyBoolean("configuration_valid", snapshot.configurationValid),
	];
	checks.push(percentage("disk_capacity", snapshot.diskFreePercent));
	checks.push(percentage("memory_pressure", snapshot.memoryFreePercent));
	const uptime = finiteNumber(snapshot.uptimeSeconds);
	checks.push(diagnostic("uptime", uptime === null || uptime < 0 ? "SKIPPED" : "PASS",
		uptime === null || uptime < 0 ? {} : { seconds: Math.floor(uptime) }));
	const restarts = finiteNumber(snapshot.restartCount);
	checks.push(diagnostic("restart_indicator", restarts === null || restarts < 0 ? "SKIPPED" : restarts > 2 ? "WARNING" : "PASS",
		restarts === null || restarts < 0 ? {} : { count: Math.floor(restarts) }));
	const errors = finiteNumber(snapshot.recentErrorCount);
	checks.push(diagnostic("error_indicator", errors === null || errors < 0 ? "SKIPPED" : errors > 0 ? "WARNING" : "PASS",
		errors === null || errors < 0 ? {} : { count: Math.floor(errors) }));
	if (Object.hasOwn(snapshot, "cpuUsagePercent")) checks.push(percentage("cpu_usage", snapshot.cpuUsagePercent, true));
	return checks;
}

export function routingDiagnostics(host, observations = {}) {
	const target = configuredTarget(host);
	const base = { host_id: target.host_id };
	const requested = ["dnsResolved", "tcpReachable", "tlsValid", "httpStatus", "redirectSafe"].some((key) => Object.hasOwn(observations, key));
	return [
		fromHost("listener_match", host.enabled === false ? "WARNING" : host.listenerMatched === true ? "PASS" : host.listenerMatched === false ? "FAIL" : "SKIPPED", base, host.enabled === false),
		fromHost("route_match", host.routeMatched === true ? "PASS" : host.routeMatched === false ? "FAIL" : "SKIPPED", base),
		classifyBoolean("dns_resolution", observations.dnsResolved),
		classifyBoolean("upstream_tcp", observations.tcpReachable),
		diagnostic("upstream_tls", target.scheme === "http" ? "SKIPPED" : observations.tlsValid === true ? "PASS" : observations.tlsValid === false ? "FAIL" : "SKIPPED", {},
			target.scheme === "http" ? { reason: "The configured upstream uses HTTP.", recommendation: "Use HTTPS if upstream encryption is required." } : {}),
		diagnostic("upstream_http", Number.isInteger(observations.httpStatus) && observations.httpStatus >= 100 && observations.httpStatus <= 599
			? observations.httpStatus >= 500 ? "FAIL" : observations.httpStatus >= 400 ? "WARNING" : "PASS" : "SKIPPED",
			Number.isInteger(observations.httpStatus) && observations.httpStatus >= 100 && observations.httpStatus <= 599
				? { status_code: observations.httpStatus } : {},
			Number.isInteger(observations.httpStatus) && observations.httpStatus >= 500 && observations.httpStatus <= 599
				? { reason: "The upstream returned a server error." }
				: Number.isInteger(observations.httpStatus) && observations.httpStatus >= 400 && observations.httpStatus <= 499
					? { reason: "The upstream returned a client error." } : {}),
		classifyBoolean("redirect_safe", observations.redirectSafe, "WARNING"),
		classifyBoolean("websocket_ready", observations.websocketReady, "WARNING"),
		classifyBoolean("route_conflict", observations.routeConflict === undefined ? undefined : !observations.routeConflict),
	].map((item) => {
		const probeCheck = ["dns_resolution", "upstream_tcp", "upstream_tls", "upstream_http", "redirect_safe", "websocket_ready"].includes(item.check);
		const noProbe = probeCheck && item.state === "SKIPPED" && !requested && !(item.check === "upstream_tls" && target.scheme === "http");
		const reason = noProbe ? host.enabled === false ? "The upstream probe was not run for this disabled host." : "The upstream probe was not requested." : item.reason;
		const recommendation = noProbe ? host.enabled === false ? "Enable the host before checking upstream traffic." : "Run the bounded configured-host probe when troubleshooting this route." : item.recommendation;
		return { ...item, evidence: { host_id: target.host_id, ...item.evidence }, reason, recommendation, summary: reason };
	});
}

function fromHost(name, state, evidence, disabled = false) {
	return diagnostic(name, state, evidence, disabled ? {
		reason: "This proxy host is disabled.", recommendation: "Enable the host if it should receive traffic."
	} : {});
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
		diagnostic("certificate_presence", assigned && certificate ? "PASS" : assigned ? "FAIL" : "SKIPPED", { host_id: host.id },
			!assigned ? { reason: "No certificate is assigned to this host.", recommendation: "Assign a certificate if this host serves HTTPS." } : {}),
		diagnostic("certificate_expiry", remaining === null ? "SKIPPED" : remaining < 0 ? "FAIL" : remaining < 30 ? "WARNING" : "PASS",
			remaining === null ? {} : { days_remaining: remaining },
			remaining === null ? {} : remaining < 0 ? { reason: "The certificate has expired.", recommendation: "Renew or replace the certificate immediately." }
				: remaining < 30 ? { reason: "The certificate expires within 30 days.", recommendation: "Check renewal before expiry." } : {}),
		classifyBoolean("san_match", observations.sanMatches),
		classifyBoolean("chain_valid", observations.chainValid),
		classifyBoolean("renewal_ready", observations.renewalReady, "WARNING"),
		classifyBoolean("acme_ready", observations.acmeReady, "WARNING"),
		classifyBoolean("dns_challenge_ready", observations.dnsChallengeReady, "WARNING"),
	].map((item) => {
		const noProbe = item.state === "SKIPPED" && ["san_match", "chain_valid", "renewal_ready", "acme_ready", "dns_challenge_ready"].includes(item.check) && Object.keys(observations).length === 0;
		const reason = noProbe ? "A certificate validation probe was not requested." : item.reason;
		const recommendation = noProbe ? "Run certificate validation when investigating TLS for this host." : item.recommendation;
		return { ...item, evidence: { host_id: host.id, ...item.evidence }, reason, recommendation, summary: reason };
	});
}

const TROUBLESHOOT_STEPS = ["dns_resolution", "listener_match", "route_match", "upstream_tcp", "upstream_tls", "upstream_http"];
export function troubleshoot502(host, observations = {}) {
	const route = routingDiagnostics(host, observations);
	return TROUBLESHOOT_STEPS.map((check) => route.find((item) => item.check === check));
}
