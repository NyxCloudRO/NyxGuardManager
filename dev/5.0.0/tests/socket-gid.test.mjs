import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

test("a mode-0660 Docker-style socket requires its numeric group", { skip: process.getuid?.() !== 0 }, async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nyx-socket-gid-"));
	fs.chmodSync(dir, 0o755);
	const socket = path.join(dir, "docker.sock");
	const server = net.createServer((connection) => connection.end());
	try {
		server.listen(socket);
		await once(server, "listening");
		fs.chownSync(socket, 0, 991);
		fs.chmodSync(socket, 0o660);
		const attempt = (gid) => spawnSync(process.execPath, ["-e", `const net=require("node:net");const s=net.connect(${JSON.stringify(socket)});s.on("connect",()=>process.exit(0));s.on("error",e=>process.exit(e.code==="EACCES"?13:14));`],
			{ uid: 1000, gid, timeout: 3000 });
		assert.equal(attempt(1000).status, 13);
		assert.equal(attempt(991).status, 0);
	} finally {
		server.close();
		fs.rmSync(dir, { recursive: true, force: true });
	}
});
