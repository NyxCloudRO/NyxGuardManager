import http from "node:http";
import os from "node:os";

const MAX_BYTES = 128 * 1024;
const TIMEOUT_MS = 750;

// Only inspect this container, using the container hostname assigned by Docker.
// The inspect response may contain environment values, so return numeric fields
// only and never retain, log, or send the raw response.
export async function ownDockerIndicators({ socketPath = "/var/run/docker.sock", containerId = os.hostname() } = {}) {
	if (!/^[a-f0-9]{12,64}$/.test(containerId)) return {};
	return await new Promise((resolve) => {
		let done = false;
		const finish = (value) => { if (!done) { done = true; resolve(value); } };
		const request = http.get({ socketPath, path: `/containers/${containerId}/json`, timeout: TIMEOUT_MS }, (response) => {
			if (response.statusCode !== 200 || Number(response.headers["content-length"]) > MAX_BYTES) {
				response.destroy(); finish({}); return;
			}
			const chunks = [];
			let size = 0;
			response.on("data", (chunk) => {
				size += chunk.length;
				if (size > MAX_BYTES) { response.destroy(); finish({}); }
				else chunks.push(chunk);
			});
			response.on("end", () => {
				try {
					const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
					finish(Number.isSafeInteger(value.RestartCount) && value.RestartCount >= 0 && value.RestartCount <= 1_000_000
						? { restartCount: value.RestartCount } : {});
				} catch { finish({}); }
			});
			response.on("error", () => finish({}));
		});
		request.on("timeout", () => { request.destroy(); finish({}); });
		request.on("error", () => finish({}));
	});
}
