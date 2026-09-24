import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2] || "/app/frontend";
const indexPath = path.join(root, "index.html");
const fixesPath = path.join(root, "assets/local-dev-fixes-409dev.js");
const index = fs.readFileSync(indexPath, "utf8");
const fixes = fs.readFileSync(fixesPath, "utf8");

const oldHref = 'class="prefs-action-link prefs-action-support" href="https://buymeacoffee.com/nyxmael"';
const newHref = 'class="prefs-action-link prefs-action-support" href="#nyxguard-professional-support"';
const anchor = '\t\t<script defer src="/assets/developer-message.js?v=20260830-dev1"></script>';
const addition = '\n\t\t<link rel="stylesheet" href="/assets/professional-support.css?v=20260924-1">' +
  '\n\t\t<script defer src="/assets/professional-support.js?v=20260924-1"></script>';

assert.equal(fixes.split(oldHref).length - 1, 1, "expected one visible Support NyxGuard link");
assert.equal(index.split(anchor).length - 1, 1, "expected one 4.0.18 overlay insertion anchor");
assert.equal(index.includes("professional-support.js"), false, "support overlay already mounted");
assert.match(fixes, /prefs-action-community/);
assert.match(index, /index-CTHAIRmi-409dev-4012certfix4-threatpagination3\.js/);

fs.writeFileSync(fixesPath, fixes.replace(oldHref, newHref));
fs.writeFileSync(indexPath, index.replace(anchor, anchor + addition));
console.log("Professional Support UI mounted without sidebar structure changes");
