import dns from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";
import { configuredTarget } from "../nyxcloud-support/diagnostics.mjs";

const TIMEOUT_MS = 2000;
const MAX_HEADER_BYTES = 4096;

// A probe is possible only for an already authorized database row. There is no
// user-supplied URL, path, redirect following, proxy agent or DNS re-resolution.
export async function probeConfiguredHost(host) {
	const target = configuredTarget(host);
	const observations = {};
	let address;
	try {
		address = net.isIP(target.host) ? target.host : (await Promise.race([
			dns.lookup(target.host, { verbatim: true }).then((answer) => answer.address),
			new Promise((_, reject) => setTimeout(() => reject(new Error("dns_timeout")), TIMEOUT_MS)),
		]));
		observations.dnsResolved = Boolean(net.isIP(address));
	} catch { observations.dnsResolved = false; return observations; }
	if (!observations.dnsResolved) return observations;
	return await new Promise((resolve) => {
		let done = false;
		let data = Buffer.alloc(0);
		const finish = (additional = {}) => {
			if (done) return;
			done = true;
			Object.assign(observations, additional);
			socket.destroy();
			resolve(observations);
		};
		const options = { host: address, port: target.port, timeout: TIMEOUT_MS };
		const socket = target.scheme === "https"
			? tls.connect({ ...options, servername: net.isIP(target.host) ? undefined : target.host,
				rejectUnauthorized: true })
			: net.connect(options);
		socket.setTimeout(TIMEOUT_MS, () => finish({ tcpReachable: false }));
		socket.on("error", () => finish({ tcpReachable: false, ...(target.scheme === "https" ? { tlsValid: false } : {}) }));
		socket.on(target.scheme === "https" ? "secureConnect" : "connect", () => {
			observations.tcpReachable = true;
			if (target.scheme === "https") observations.tlsValid = true;
			socket.write(`HEAD / HTTP/1.1\r\nHost: ${target.host}\r\nConnection: close\r\nUser-Agent: NyxGuard-Diagnostics/5\r\n\r\n`);
		});
		socket.on("data", (chunk) => {
			data = Buffer.concat([data, chunk]);
			if (data.length > MAX_HEADER_BYTES) { finish(); return; }
			const firstLine = data.toString("latin1").split("\r\n", 1)[0];
			const match = /^HTTP\/1\.[01] ([1-5]\d\d)\b/.exec(firstLine);
			if (match) {
				const status = Number(match[1]);
				finish({ httpStatus: status, redirectSafe: status < 300 || status >= 400 });
			}
		});
		socket.on("close", () => finish());
	});
}
