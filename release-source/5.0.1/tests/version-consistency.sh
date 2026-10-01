#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
image="${NYX_VERSION_TEST_IMAGE:-nyxguardmanager:5.0.1}"
expected="${NYX_EXPECTED_VERSION:-5.0.1}"
docker run --rm --entrypoint node -e "NYX_EXPECTED_VERSION=$expected" "$image" --input-type=module -e '
import assert from "node:assert/strict";
import fs from "node:fs";
import remoteVersion from "/app/internal/remote-version.js";
const root = "/app";
const read = (name) => fs.readFileSync(`${root}/${name}`, "utf8");
const version = process.env.NYX_EXPECTED_VERSION;
assert.equal(JSON.parse(read("package.json")).version, version);
assert.equal(process.env.NPM_BUILD_VERSION, version);
const main = read("frontend/assets/index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js");
assert.ok(main.includes(`Coe="${version}"`));
assert.ok(main.includes(`$C="${version}"`));
assert.ok(!main.includes("T.data?.restartPending"));
assert.ok(main.includes("T.data?.downloadedVersion"));
assert.ok(main.includes("Activate update"));
assert.ok(read("frontend/assets/index-DTnhxNQ_.js").includes(`K="${version}"`));
assert.ok(read("frontend/assets/notification-visibility-4010.js").includes(`desiredVersion = "${version}"`));
assert.ok(read("routes/main.js").includes("const buildVersion = buildVersionRaw.replace(/^v/i, \"\");"));
assert.ok(read("routes/settings.js").includes(".toString().replace(/^v/i, \"\") || \"0.0.0\";"));
assert.ok(read("internal/remote-version.js").includes("return `v${raw.replace(/^v/i, \"\")}`;"));
assert.equal(remoteVersion.compareVersions("v5.0.1-dev", "v5.0.1"), true);
assert.equal(remoteVersion.compareVersions("v5.0.1-dev", "v5.0.0"), false);
assert.equal(remoteVersion.compareVersions("v5.0.1", "v5.0.1"), false);
console.log("PASS current package, runtime, frontend, and update action versions");'
git diff --exit-code -- release-source/5.0.0 >/dev/null
