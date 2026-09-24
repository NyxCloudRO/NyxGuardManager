import assert from "node:assert/strict";
import fs from "node:fs";

const app = process.env.NYX_APP_DIR || "/app";
const pkg = JSON.parse(fs.readFileSync(`${app}/package.json`, "utf8"));
const route = fs.readFileSync(`${app}/routes/settings.js`, "utf8");
const settings = fs.readFileSync(`${app}/frontend/assets/index-DTnhxNQ_.js`, "utf8");
const main = fs.readFileSync(`${app}/frontend/assets/index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js`, "utf8");
const notifications = fs.readFileSync(`${app}/frontend/assets/notification-visibility-4010.js`, "utf8");

assert.equal(pkg.version, "5.0.0", "runtime package version");
assert.match(main, /Coe="5\.0\.0";function Roe\(\)/, "footer version");
assert.match(main, /\$C="5\.0\.0",m8=/, "theme cache version");
assert.match(settings, /K="5\.0\.0",Bt=\["attack_ban"/, "Settings and backup label version");
assert.match(notifications, /var desiredVersion = "5\.0\.0";/, "notification version text");
for (const [name, source] of [["main", main], ["Settings", settings], ["notifications", notifications]]) {
  assert.equal(source.includes("4.0.18"), false, `${name} still exposes an old runtime version`);
}
assert.equal(settings.split("version:K").length - 1, 2, "both Settings labels use the same version");

// The backend derives export metadata, filename, import rejection and restore
// response from one package-backed constant. Assert the complete contract so a
// future frontend-only version bump cannot silently diverge from backup logic.
assert.match(route, /const BACKUP_FILE_VERSION\s*=\s*\(pjson\.version \|\| process\.env\.NPM_BUILD_VERSION \|\| ""\)/);
assert.match(route, /version: BACKUP_FILE_VERSION,/);
assert.match(route, /nyxguard-backup-v\$\{BACKUP_FILE_VERSION\}/);
assert.match(route, /payload\.version !== BACKUP_FILE_VERSION/);
assert.match(route, /only accepts backups from the same version/);
assert.equal(pkg.version, (pkg.version || process.env.NPM_BUILD_VERSION || "").toString().replace(/^v/i, "").split("-")[0]);
assert.notEqual("4.0.18", pkg.version, "old backups must fail exact-version validation");
console.log("5.0.0 runtime, labels, backup export and exact-version import contract passed");
