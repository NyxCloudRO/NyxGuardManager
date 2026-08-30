import assert from "node:assert/strict";
import fs from "node:fs";

const appDir = process.argv[2] || "/app";
const mainPath = `${appDir}/routes/main.js`;
let source = fs.readFileSync(mainPath, "utf8");

const importAnchor = 'import deadHostsRoutes from "./nginx/dead_hosts.js";';
const routeAnchor = 'router.use("/users", usersRoutes);';
assert.equal((source.match(new RegExp(importAnchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 1);
assert.equal((source.match(new RegExp(routeAnchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 1);

source = source.replace(importAnchor, `${importAnchor}\nimport developerMessageRoutes from "./developer-message.js";`);
source = source.replace(routeAnchor, `${routeAnchor}\nrouter.use("/developer-message", developerMessageRoutes);`);

const versionSource = 'const buildVersionRaw = (pjson.version || process.env.NPM_BUILD_VERSION || "").toString();';
const commitSource = 'commit: buildVersion ? "release-" + buildVersion : (process.env.NPM_BUILD_COMMIT || null),';
assert.equal(source.split(versionSource).length - 1, 1);
assert.equal(source.split(commitSource).length - 1, 1);
source = source.replace(
	versionSource,
	'const buildVersionRaw = (process.env.NPM_BUILD_VERSION || pjson.version || "").toString();',
);
source = source.replace(
	commitSource,
	'commit: process.env.NPM_BUILD_COMMIT || (buildVersion ? "release-" + buildVersion : null),',
);
fs.writeFileSync(mainPath, source);

const packagePath = `${appDir}/package.json`;
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
packageJson.version = "4.0.18";
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

console.log("Developer Message backend and DEV candidate metadata patched");
