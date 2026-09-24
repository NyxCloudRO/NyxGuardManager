import assert from "node:assert/strict";
import net from "node:net";
import { once } from "node:events";
import test from "node:test";
import { probeConfiguredHost } from "../licensing/probes.mjs";

const host = (port) => ({ id: 1, forward_scheme: "http", forward_host: "127.0.0.1", forward_port: port });

async function withServer(reply, run) {
	const sockets = new Set();
	const server = net.createServer((socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		socket.once("data", (request) => {
			assert.match(request.toString("latin1"), /^HEAD \/ HTTP\/1\.1\r\nHost: 127\.0\.0\.1\r\n/);
			if (reply !== null) socket.end(reply);
		});
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	try { await run(server.address().port); }
	finally { for (const socket of sockets) socket.destroy(); server.close(); await once(server, "close"); }
}

test("reports bounded HTTP outcomes without following redirects", async () => {
	for (const [response, status, outcome] of [
		["HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n", 200, "success"],
		["HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n", 502, "server_error"],
		["HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/private\r\n\r\n", 302, "redirect"],
	]) {
		await withServer(response, async (port) => {
			const result = await probeConfiguredHost(host(port));
			assert.equal(result.tcpReachable, true);
			assert.equal(result.httpStatus, status);
			assert.equal(result.httpOutcome, outcome);
			assert.equal(result.redirectSafe, status !== 302);
			assert.equal(JSON.stringify(result).includes("private"), false);
		});
	}
});

test("classifies refused TCP connections", async () => {
	const server = net.createServer();
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const port = server.address().port;
	server.close();
	await once(server, "close");
	const result = await probeConfiguredHost(host(port));
	assert.equal(result.tcpReachable, false);
	assert.equal(result.tcpFailure, "refused");
});

test("classifies a TLS handshake failure after TCP connects", async () => {
	const sockets = new Set();
	const server = net.createServer((socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		socket.end("not TLS");
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	try {
		const result = await probeConfiguredHost({ ...host(server.address().port), forward_scheme: "https" });
		assert.equal(result.tcpReachable, true);
		assert.equal(result.tlsValid, false);
		assert.equal(result.tlsFailure, "handshake");
	} finally {
		for (const socket of sockets) socket.destroy();
		await new Promise((resolve) => server.close(resolve));
	}
});

test("rejects oversized headers and malformed responses", async () => {
	await withServer(`HTTP/1.1 200 OK\r\nX-Large: ${"x".repeat(4096)}\r\n\r\n`, async (port) => {
		const result = await probeConfiguredHost(host(port));
		assert.equal(result.httpFailure, "header_too_large");
		assert.equal(result.httpStatus, undefined);
	});
	await withServer("INVALID\r\n\r\n", async (port) => {
		const result = await probeConfiguredHost(host(port));
		assert.equal(result.httpFailure, "protocol");
	});
});

test("refuses unconfigured targets before making a connection", async () => {
	await assert.rejects(() => probeConfiguredHost({ ...host(80), forward_host: "127.0.0.1/private" }), TypeError);
	await assert.rejects(() => probeConfiguredHost({ ...host(80), forward_scheme: "file" }), TypeError);
});
