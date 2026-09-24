import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "nyxguard-support-ui-"));
const assets = path.join(folder, "assets");
fs.mkdirSync(assets);
const indexPath = path.join(folder, "index.html");
const fixesPath = path.join(assets, "local-dev-fixes-409dev.js");
const script = new URL("./patch-frontend.mjs", import.meta.url).pathname;
const marker = '<script type="module" crossorigin src="/assets/index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js"></script>';
const anchor = '\t\t<script defer src="/assets/developer-message.js?v=20260830-dev1"></script>';
const visible = '<a class="prefs-action-link prefs-action-support" href="https://buymeacoffee.com/nyxmael" target="_blank" rel="noopener noreferrer"><span>Support NyxGuard</span></a>';
const community = '<a class="prefs-action-link prefs-action-community" href="https://community.nyxcloud.ro/">Community</a>';
const hidden = '<a class="nav-link support-nyxguard" href="https://buymeacoffee.com/nyxmael">Hidden donor link</a>';

function invoke() { return spawnSync(process.execPath, [script, folder], { encoding: "utf8" }); }

try {
  fs.writeFileSync(indexPath, marker + "\n" + anchor + "\n" + hidden);
  fs.writeFileSync(fixesPath, visible + "\n" + community);
  const first = invoke();
  assert.equal(first.status, 0, first.stderr);
  const actual = fs.readFileSync(fixesPath, "utf8");
  assert.equal(actual, visible.replace("https://buymeacoffee.com/nyxmael", "#nyxguard-professional-support") + "\n" + community);
  const index = fs.readFileSync(indexPath, "utf8");
  assert.ok(index.includes(hidden), "hidden donation anchor changed");
  assert.equal(index.split("professional-support.js").length - 1, 1);
  assert.equal(index.split("professional-support.css").length - 1, 1);
  const second = invoke();
  assert.notEqual(second.status, 0, "duplicate patch unexpectedly succeeded");
  assert.equal(fs.readFileSync(indexPath, "utf8"), index, "failed second patch modified index");
  assert.equal(fs.readFileSync(fixesPath, "utf8"), actual, "failed second patch modified sidebar asset");
  fs.writeFileSync(fixesPath, visible.replace("prefs-action-support", "renamed-support") + "\n" + community);
  assert.notEqual(invoke().status, 0, "drifted support selector unexpectedly succeeded");
  console.log("Professional Support UI patch assertions passed");
} finally {
  fs.rmSync(folder, { recursive: true, force: true });
}
