import dns from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";
import { configuredTarget } from "../nyxcloud-support/diagnostics.mjs";

const TIMEOUT_MS = 2000;
const MAX_HEADER_BYTES = 4096;

function dnsFailure(error) {
	switch (error?.code) {
		case "ENOTFOUND": case "ENODATA": return "not_found";
		case "EAI_AGAIN": case "ETIMEOUT": return "timeout";
		case "ECONNREFUSED": case "EREFUSED": return "refused";
		default: return "error";
	}
}

function tcpFailure(error) {
	switch (error?.code) {
		case "ECONNREFUSED": return "refused";
		case "ETIMEDOUT": return "timeout";
		case "ENETUNREACH": case "EHOSTUNREACH": return "unreachable";
		default: return "error";
	}
}

function tlsFailure(error) {
	switch (error?.code) {
		case "CERT_HAS_EXPIRED": return "expired";
		case "ERR_TLS_CERT_ALTNAME_INVALID": return "hostname_mismatch";
		case "DEPTH_ZERO_SELF_SIGNED_CERT": case "SELF_SIGNED_CERT_IN_CHAIN":
		case "UNABLE_TO_VERIFY_LEAF_SIGNATURE": case "UNABLE_TO_GET_ISSUER_CERT_LOCALLY":
			return "untrusted";
		case "ETIMEDOUT": return "timeout";
		default: return "handshake";
	}
}

function httpOutcome(status) {
	if (status >= 500) return "server_error";
	if (status >= 400) return "client_error";
	if (status >= 300) return "redirect";
	if (status >= 200) return "success";
	return "informational";
}

// Caller loads this host by an authorized database ID. No caller-provided URL,
// path, redirect destination, proxy setting, or DNS re-resolution is accepted.
export async function probeConfiguredHost(host) {
	const target = configuredTarget(host);
	const observations = {};
	const deadline = Date.now() + TIMEOUT_MS;
	let address;
	if (net.isIP(target.host)) {
		address = target.host;
		observations.dnsResolved = true;
	} else {
		let timer;
		try {
			address = await Promise.race([
				dns.lookup(target.host, { verbatim: true }).then((answer) => answer.address),
				new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("dns_timeout"), { code: "ETIMEOUT" })), TIMEOUT_MS); }),
			]);
			observations.dnsResolved = Boolean(net.isIP(address));
			if (!observations.dnsResolved) observations.dnsFailure = "error";
		} catch (error) {
			observations.dnsResolved = false;
			observations.dnsFailure = dnsFailure(error);
		} finally { clearTimeout(timer); }
	}
	if (!observations.dnsResolved) return observations;
	const remaining = deadline - Date.now();
	if (remaining <= 0) return { ...observations, tcpReachable: false, tcpFailure: "timeout" };

	return await new Promise((resolve) => {
		let done = false;
		let data = Buffer.alloc(0);
		let connected = false;
		let tcpConnected = false;
		const options = { host: address, port: target.port, timeout: remaining };
		const socket = target.scheme === "https"
			? tls.connect({ ...options, servername: net.isIP(target.host) ? undefined : target.host,
				rejectUnauthorized: true })
			: net.connect(options);
		const finish = (additional = {}) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			Object.assign(observations, additional);
			socket.destroy();
			resolve(observations);
		};
		const timer = setTimeout(() => finish(connected
			? { httpFailure: "timeout" }
			: tcpConnected ? { tcpReachable: true, tlsValid: false, tlsFailure: "timeout" }
				: { tcpReachable: false, tcpFailure: "timeout" }), remaining);
		if (target.scheme === "https") socket.on("connect", () => { tcpConnected = true; });
		socket.on("error", (error) => {
			if (connected) return finish({ httpFailure: "error" });
			// Certificate failures happen after TCP connect, before secureConnect.
			if (target.scheme === "https" && tcpConnected) {
				return finish({ tcpReachable: true, tlsValid: false, tlsFailure: tlsFailure(error) });
			}
			finish({ tcpReachable: false, tcpFailure: tcpFailure(error) });
		});
		socket.on(target.scheme === "https" ? "secureConnect" : "connect", () => {
			connected = true;
			tcpConnected = true;
			observations.tcpReachable = true;
			if (target.scheme === "https") observations.tlsValid = true;
			socket.write(`HEAD / HTTP/1.1\r\nHost: ${target.host}\r\nConnection: close\r\nUser-Agent: NyxGuard-Diagnostics/5\r\n\r\n`);
		});
		socket.on("data", (chunk) => {
			data = Buffer.concat([data, chunk]);
			if (data.length > MAX_HEADER_BYTES) return finish({ httpFailure: "header_too_large" });
			const end = data.indexOf("\r\n\r\n");
			if (end < 0) return;
			const firstLine = data.subarray(0, end).toString("latin1");
			const match = /^HTTP\/1\.[01] ([1-5]\d\d)(?: |$)/.exec(firstLine);
			if (!match) return finish({ httpFailure: "protocol" });
			const status = Number(match[1]);
			finish({ httpStatus: status, httpOutcome: httpOutcome(status), redirectSafe: status < 300 || status >= 400 });
		});
		socket.on("close", () => finish(connected ? { httpFailure: "connection_closed" }
			: tcpConnected ? { tcpReachable: true, tlsValid: false, tlsFailure: "handshake" }
				: { tcpReachable: false, tcpFailure: "error" }));
	});
}
