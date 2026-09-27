import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("host updater refuses a major image swap before pulling or changing Compose", { skip: process.getuid?.() !== 0 }, () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nyx-major-guard-"));
	try {
		const bin = path.join(dir, "bin");
		const install = path.join(dir, "install");
		fs.mkdirSync(bin);
		fs.mkdirSync(install);
		const compose = 'services:\n  nyxguard-manager:\n    image: nyxmael/nyxguardmanager:4.0.18\n';
		fs.writeFileSync(path.join(install, "docker-compose.yml"), compose);
		fs.writeFileSync(path.join(install, ".env"), "TZ=UTC\n");
		const marker = path.join(dir, "unexpected-docker-command");
		fs.writeFileSync(path.join(bin, "docker"), `#!/bin/sh\nif [ "$1 $2" = "compose version" ]; then exit 0; fi\nprintf '%s\\n' "$*" > '${marker}'\nexit 97\n`, { mode: 0o755 });
		for (const command of ["curl", "jq"]) fs.writeFileSync(path.join(bin, command), "#!/bin/sh\nexit 97\n", { mode: 0o755 });
		const script = path.resolve("update.sh");
		const result = spawnSync("bash", [script], {
			encoding: "utf8",
			env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, INSTALL_DIR: install, FORCE_TAG: "5.0.0", NYXGUARD_AUTO_YES: "1" },
		});
		assert.equal(result.status, 1);
		assert.match(result.stderr, /Major-version upgrades require a verified MariaDB and volume restore set/);
		assert.equal(fs.existsSync(marker), false, "Docker was called after the Compose version probe");
		assert.equal(fs.readFileSync(path.join(install, "docker-compose.yml"), "utf8"), compose);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});
