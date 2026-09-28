import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const base = process.env.NYX_UI_BASE_DIR;
assert.ok(base, "Set NYX_UI_BASE_DIR to a read-only copy of the exact 4.0.18 base frontend");
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "nyxguard-native-ui-test-"));
const assets = path.join(folder, "assets");
const names = ["local-dev-fixes-409dev.js", "index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js", "index-DTnhxNQ_.js", "notification-visibility-4010.js"];
const script = new URL("./patch-frontend.mjs", import.meta.url).pathname;
const supportUi = fs.readFileSync(new URL("./frontend/professional-support.js", import.meta.url), "utf8");
const invoke = () => spawnSync(process.execPath, [script, folder], { encoding: "utf8" });

try {
  fs.mkdirSync(assets);
  fs.copyFileSync(path.join(base, "index.html"), path.join(folder, "index.html"));
  for (const name of names) fs.copyFileSync(path.join(base, "assets", name), path.join(assets, name));
  const original = names.map((name) => fs.readFileSync(path.join(assets, name), "utf8"));
  const first = invoke();
  assert.equal(first.status, 0, first.stderr);

  const fixes = fs.readFileSync(path.join(assets, names[0]), "utf8");
  const main = fs.readFileSync(path.join(assets, names[1]), "utf8");
  const settings = fs.readFileSync(path.join(assets, names[2]), "utf8");
  const notifications = fs.readFileSync(path.join(assets, names[3]), "utf8");
  const labels = ["License", "Diagnostics &amp; Support", "Support NyxGuard", "Community"];
  let previous = -1;
  for (const label of labels) {
    const position = fixes.indexOf(label);
    assert.ok(position > previous, "lower-navigation order changed: " + label);
    previous = position;
  }
  assert.match(fixes, /prefs-action-support" href="https:\/\/buymeacoffee\.com\/nyxmael"/);
  assert.match(fixes, /prefs-action-community" href="https:\/\/community\.nyxcloud\.ro\//);
  assert.match(main, /Coe="5\.0\.0";function Roe\(\)/);
  assert.match(main, /\$C="5\.0\.0",m8=/);
  assert.match(settings, /K="5\.0\.0",Bt=\["attack_ban"/);
  assert.match(notifications, /var desiredVersion = "5\.0\.0";/);
  assert.equal(main.replace('Coe="5.0.0";function Roe()', 'Coe="4.0.18";function Roe()').replace('$C="5.0.0",m8=', '$C="4.0.18",m8='), original[1], "main/sidebar changed beyond approved version constants");
  assert.equal(settings.replace('K="5.0.0",Bt=["attack_ban"', 'K="4.0.18",Bt=["attack_ban"'), original[2], "Settings changed beyond version");
  assert.equal(notifications.replace('var desiredVersion = "5.0.0";', 'var desiredVersion = "4.0.18";'), original[3], "notification overlay changed beyond version");
  assert.equal(fixes.includes("#nyxguard-professional-support"), false, "old modal link remains");
  assert.match(supportUi, /mainNode\.append\(page\)/, "native content mounting removed");
  assert.match(supportUi, /routeWrapper\.classList\.add\("nyx-support-route-hidden"\)/);
  for (const tab of ["Overview", "Diagnostics", "Troubleshooting", "Support Bundle"]) assert.ok(supportUi.includes(`"${tab}"`));
  assert.doesNotMatch(supportUi, /aria-modal|nyx-support-backdrop|document\.body\.append\(root\)/, "modal UI returned");
  const patched = [fs.readFileSync(path.join(folder, "index.html"), "utf8"), ...names.map((name) => fs.readFileSync(path.join(assets, name), "utf8"))];

  const second = invoke();
  assert.notEqual(second.status, 0, "duplicate patch unexpectedly succeeded");
  assert.deepEqual([fs.readFileSync(path.join(folder, "index.html"), "utf8"), ...names.map((name) => fs.readFileSync(path.join(assets, name), "utf8"))], patched, "failed second patch modified assets");

  fs.writeFileSync(path.join(assets, names[0]), original[0].replace("prefs-action-support", "drifted-support"));
  fs.writeFileSync(path.join(assets, names[1]), original[1]);
  fs.writeFileSync(path.join(assets, names[2]), original[2]);
  fs.writeFileSync(path.join(assets, names[3]), original[3]);
  fs.writeFileSync(path.join(folder, "index.html"), fs.readFileSync(path.join(base, "index.html")));
  assert.notEqual(invoke().status, 0, "drifted selector unexpectedly succeeded");
  assert.equal(fs.readFileSync(path.join(assets, names[1]), "utf8"), original[1], "drift failure modified main bundle");
  console.log("Native Support UI patch assertions passed");
} finally {
  fs.rmSync(folder, { recursive: true, force: true });
}
