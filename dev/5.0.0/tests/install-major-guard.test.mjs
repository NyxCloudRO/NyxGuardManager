import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("installer refuses to replace an existing 4.x Compose stack with 5.0.0", { skip: process.getuid?.() !== 0 }, () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nyx-install-major-"));
	try {
		const bin = path.join(directory, "bin");
		const install = path.join(directory, "install");
		fs.mkdirSync(bin);
		fs.mkdirSync(install);
		const compose = "services:\n  nyxguard-manager:\n    image: nyxmael/nyxguardmanager:4.0.18\n";
		fs.writeFileSync(path.join(install, "docker-compose.yml"), compose);
		fs.writeFileSync(path.join(install, ".env"), "PUID=1000\nPGID=1000\n");
		const marker = path.join(directory, "unexpected-docker-command");
		for (const command of ["apt-get", "systemctl"]) fs.writeFileSync(path.join(bin, command), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
		fs.writeFileSync(path.join(bin, "dpkg"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
		fs.writeFileSync(path.join(bin, "docker"), `#!/bin/sh\nif [ "$1 $2" = "compose version" ]; then exit 0; fi\nprintf '%s\\n' "$*" > '${marker}'\nexit 97\n`, { mode: 0o755 });
		const result = spawnSync("bash", [path.resolve("install.sh")], {
			encoding: "utf8",
			env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, INSTALL_DIR: install, APP_TAG: "5.0.0" },
		});
		assert.equal(result.status, 1, result.stderr);
		assert.match(result.stderr, /verified in-app major upgrade or release runbook/);
		assert.equal(fs.existsSync(marker), false);
		assert.equal(fs.readFileSync(path.join(install, "docker-compose.yml"), "utf8"), compose);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
