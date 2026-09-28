import http from "node:http";
import os from "node:os";
import { redact } from "./redaction.mjs";

const MAX_BYTES = 256 * 1024;
const MAX_LINES = 200;
const TIMEOUT_MS = 1000;
const WINDOWS = new Set([15, 60, 1440]);

function logText(raw) {
	if (raw.length < 8 || ![1, 2].includes(raw[0]) || raw[1] !== 0 || raw[2] !== 0 || raw[3] !== 0)
		return raw.toString("utf8");
	const parts = [];
	let offset = 0;
	while (offset < raw.length) {
		if (offset + 8 > raw.length || ![1, 2].includes(raw[offset]) || raw[offset + 1] !== 0 ||
			raw[offset + 2] !== 0 || raw[offset + 3] !== 0) return null;
		const length = raw.readUInt32BE(offset + 4);
		offset += 8;
		if (length > MAX_BYTES || offset + length > raw.length) return null;
		parts.push(raw.subarray(offset, offset + length).toString("utf8"));
		offset += length;
	}
	return parts.join("");
}

function category(line) {
	if (/(?:mariadb|mysql|database|ECONNREFUSED.*3306).*(?:connection|unavailable|refused|failed|error)/i.test(line))
		return ["database_connectivity_error", "FAIL"];
	if (/migration.{0,80}(?:failed|error)|(?:failed|error).{0,80}migration/i.test(line))
		return ["migration_error", "FAIL"];
	if (/(?:\b(?:uncaught|unhandled|fatal|exception)\b|\bError:|\[error\])/i.test(line))
		return ["backend_exception", "WARNING"];
	return null;
}

export function classifyBackendLog(raw, { now = Date.now(), windowMinutes = 60 } = {}) {
	if (!WINDOWS.has(windowMinutes) || !Buffer.isBuffer(raw) || raw.length > MAX_BYTES) return null;
	const decoded = logText(raw);
	if (decoded === null) return null;
	const groups = new Map();
	const cutoff = now - windowMinutes * 60000;
	for (const line of decoded.split(/\r?\n/).slice(-MAX_LINES)) {
		if (!line || line.length > 4096) continue;
		const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)\s+(.+)$/.exec(line);
		if (!match) continue;
		const stamp = Date.parse(match[1]);
		if (!Number.isFinite(stamp) || stamp < cutoff || stamp > now + 60000) continue;
		const safe = redact(match[2]);
		const identified = category(safe);
		if (!identified) continue;
		const [name, state] = identified;
		const current = groups.get(name) ?? { category: name, state, count: 0, host_id: null,
			first_seen: new Date(stamp).toISOString(), last_seen: new Date(stamp).toISOString() };
		current.count++;
		if (stamp < Date.parse(current.first_seen)) current.first_seen = new Date(stamp).toISOString();
		if (stamp > Date.parse(current.last_seen)) current.last_seen = new Date(stamp).toISOString();
		groups.set(name, current);
	}
	return [...groups.values()];
}

export async function recentBackendProblems({ socketPath = "/var/run/docker.sock", containerId = os.hostname(),
	windowMinutes = 60, now = Date.now() } = {}) {
	if (!/^[a-f0-9]{12,64}$/.test(containerId) || !WINDOWS.has(windowMinutes)) return { available: false, problems: [] };
	return await new Promise((resolve) => {
		let done = false;
		const finish = (value) => { if (!done) { done = true; resolve(value); } };
		const since = Math.floor((now - windowMinutes * 60000) / 1000);
		const path = `/containers/${containerId}/logs?stdout=1&stderr=1&timestamps=1&since=${since}&tail=${MAX_LINES}`;
		const request = http.get({ socketPath, path, timeout: TIMEOUT_MS }, (response) => {
			if (response.statusCode !== 200 || Number(response.headers["content-length"]) > MAX_BYTES) {
				response.destroy(); finish({ available: false, problems: [] }); return;
			}
			const chunks = [];
			let size = 0;
			response.on("data", (chunk) => {
				size += chunk.length;
				if (size > MAX_BYTES) { response.destroy(); finish({ available: false, problems: [] }); }
				else chunks.push(chunk);
			});
			response.on("end", () => {
				const problems = classifyBackendLog(Buffer.concat(chunks), { now, windowMinutes });
				finish(problems === null ? { available: false, problems: [] } : { available: true, problems });
			});
			response.on("error", () => finish({ available: false, problems: [] }));
		});
		request.on("timeout", () => { request.destroy(); finish({ available: false, problems: [] }); });
		request.on("error", () => finish({ available: false, problems: [] }));
	});
}
