import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2] || "/app/frontend";
const indexPath = path.join(root, "index.html");
const fixesPath = path.join(root, "assets/local-dev-fixes-409dev.js");
const mainPath = path.join(root, "assets/index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js");
const settingsPath = path.join(root, "assets/index-DTnhxNQ_.js");
const notificationsPath = path.join(root, "assets/notification-visibility-4010.js");
const index = fs.readFileSync(indexPath, "utf8");
const fixes = fs.readFileSync(fixesPath, "utf8");
const main = fs.readFileSync(mainPath, "utf8");
const settings = fs.readFileSync(settingsPath, "utf8");
const notifications = fs.readFileSync(notificationsPath, "utf8");
const sha = (text) => createHash("sha256").update(text).digest("hex");
const count = (text, needle) => text.split(needle).length - 1;

// These exact base digests protect the main menu, lower user card, Preferences,
// Community, route wrapper and backup-version rendering from silent drift.
assert.equal(sha(fixes), "a01b939b5005cf3104cbd586e573b0265b6a7034b3d69c57c28f2134e2082964", "lower-navigation base changed");
assert.equal(sha(main), "7fe64397c0f6c29b5540c26d62b9db4dc2eb5dc58082f8540bd6fe3cda1092c7", "main-sidebar base changed");
assert.equal(sha(settings), "d680a553508cf201811713bdafc382c4d73f73e3957d6e8c10718e18c7d76671", "Settings base changed");
assert.equal(sha(notifications), "ec929dfe0d9716f8df625e12b4db40147a73b6e42e91cb39205ee4ce523df204", "notification version base changed");

const supportAnchor = '\'<a class="prefs-action-link prefs-action-support" href="https://buymeacoffee.com/nyxmael"';
const communityAnchor = '\'<a class="prefs-action-link prefs-action-community" href="https://community.nyxcloud.ro/"';
const scriptAnchor = '\t\t<script defer src="/assets/developer-message.js?v=20260830-dev1"></script>';
const footerVersion = 'Coe="4.0.18";function Roe()';
const themeVersion = '$C="4.0.18",m8=';
const settingsVersion = 'K="4.0.18",Bt=["attack_ban"';
const notificationVersion = 'var desiredVersion = "4.0.18";';
assert.equal(count(fixes, supportAnchor), 1, "expected one commercial Support NyxGuard link");
assert.equal(count(fixes, communityAnchor), 1, "expected one Community link");
assert.equal(count(fixes, "prefs-action-links"), 4, "lower-nav injection shape changed");
assert.equal(count(index, scriptAnchor), 1, "frontend script insertion point changed");
assert.equal(count(index, "professional-support.js"), 0, "support overlay already mounted");
assert.equal(count(main, footerVersion), 1, "visible footer version target ambiguous");
assert.equal(count(main, themeVersion), 1, "theme cache version target ambiguous");
assert.equal(count(main, '_main_f6sqx_21'), 1, "content-area main target ambiguous");
assert.equal(count(main, 'w-100 py-0 min-w-0 h-100 d-flex flex-column'), 1, "content-area route wrapper ambiguous");
assert.equal(count(main, '"aria-label":"Main navigation"'), 1, "main-navigation anchor changed");
assert.equal(count(settings, settingsVersion), 1, "Settings version target ambiguous");
assert.equal(count(notifications, notificationVersion), 1, "notification version target ambiguous");
assert.equal(count(settings, "version:K"), 2, "Settings backup version displays changed");
assert.equal(count(settings, "settings.backup.current-version"), 1);
assert.equal(count(settings, "settings.backup.version-lock-description"), 1);

const newLowerLinks = [
  "\t\t\t\t\t'<a class=\"prefs-action-link nyx-support-license-nav\" href=\"/#nyxguard-license\">' +",
  "\t\t\t\t\ticon(",
  "\t\t\t\t\t\t'M12 2l7 4v6c0 5-3 8-7 10-4-2-7-5-7-10V6l7-4z M9 12l2 2 4-4',",
  "\t\t\t\t\t\t'#6cdcff',",
  "\t\t\t\t\t) +",
  "\t\t\t\t\t'<span>License</span></a>' +",
  "\t\t\t\t\t'<a class=\"prefs-action-link nyx-support-diagnostics-nav\" href=\"/#nyxguard-diagnostics-support\">' +",
  "\t\t\t\t\ticon(",
  "\t\t\t\t\t\t'M6 3v5a6 6 0 0 0 12 0V3 M4 3h4 M16 3h4 M12 14v2a4 4 0 0 0 8 0v-1 M20 11a2 2 0 1 0 0 4a2 2 0 0 0 0-4',",
  "\t\t\t\t\t\t'#6cdcff',",
  "\t\t\t\t\t) +",
  "\t\t\t\t\t'<span>Diagnostics &amp; Support</span></a>' +",
  "\t\t\t\t\t'<span class=\"nyx-support-nav-divider\" aria-hidden=\"true\"></span>' +",
].join("\n") + "\n\t\t\t\t\t";

const revisedFixes = fixes.replace(supportAnchor, newLowerLinks + supportAnchor);
const revisedMain = main.replace(footerVersion, 'Coe="5.0.0";function Roe()').replace(themeVersion, '$C="5.0.0",m8=');
const revisedSettings = settings.replace(settingsVersion, 'K="5.0.0",Bt=["attack_ban"');
const revisedNotifications = notifications.replace(notificationVersion, 'var desiredVersion = "5.0.0";');
const addition = '\n\t\t<link rel="stylesheet" href="/assets/professional-support.css?v=20260924-5">' +
  '\n\t\t<script defer src="/assets/professional-support.js?v=20260924-4"></script>';
const revisedIndex = index.replace(scriptAnchor, scriptAnchor + addition);

// Prove the main bundle and Settings chunk changed only at the two approved
// version constants; the main sidebar markup, icons, order and count remain exact.
assert.equal(revisedMain.replace('Coe="5.0.0";function Roe()', footerVersion).replace('$C="5.0.0",m8=', themeVersion), main);
assert.equal(revisedSettings.replace('K="5.0.0",Bt=["attack_ban"', settingsVersion), settings);
assert.equal(revisedNotifications.replace('var desiredVersion = "5.0.0";', notificationVersion), notifications);
assert.equal(count(revisedFixes, "nyx-support-license-nav"), 1);
assert.equal(count(revisedFixes, "nyx-support-diagnostics-nav"), 1);
assert.equal(count(revisedFixes, supportAnchor), 1);
assert.equal(count(revisedFixes, communityAnchor), 1);

// All validation occurs before writing any file. A changed base fails closed.
fs.writeFileSync(fixesPath, revisedFixes);
fs.writeFileSync(mainPath, revisedMain);
fs.writeFileSync(settingsPath, revisedSettings);
fs.writeFileSync(notificationsPath, revisedNotifications);
fs.writeFileSync(indexPath, revisedIndex);
console.log("Native Support navigation and targeted 5.0.0 labels patched");
