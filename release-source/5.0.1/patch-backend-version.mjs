#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const app = process.argv[2];
if (!app) throw new Error("Usage: node patch-backend-version.mjs APP_ROOT");
function replace(relative, from, to, expected = 1) {
  const file = path.join(app, relative);
  const original = fs.readFileSync(file, "utf8");
  const count = original.split(from).length - 1;
  if (count !== expected) throw new Error(`${relative}: expected ${expected} matches, found ${count}`);
  fs.writeFileSync(file, original.replaceAll(from, to));
}

replace("routes/main.js",
  'const buildVersion = buildVersionRaw.replace(/^v/i, "").split("-").shift();',
  'const buildVersion = buildVersionRaw.replace(/^v/i, "");');
replace("routes/settings.js",
  '.toString().replace(/^v/i, "").split("-")[0] || "0.0.0";',
  '.toString().replace(/^v/i, "") || "0.0.0";');
replace("internal/remote-version.js",
  'const version = raw.replace(/^v/i, "").split("-").shift().split(".");\n\treturn `v${version[0] || 0}.${version[1] || 0}.${version[2] || 0}`;',
  'return `v${raw.replace(/^v/i, "")}`;');
replace("internal/remote-version.js",
  'const currentParts = cleanCurrent.split(".").map(Number);\n\t\tconst latestParts = cleanLatest.split(".").map(Number);',
  'const currentParts = cleanCurrent.split("-")[0].split(".").map(Number);\n\t\tconst latestParts = cleanLatest.split("-")[0].split(".").map(Number);');
replace("internal/remote-version.js",
  '\t\treturn false;\n\t},\n};\n\nexport default internalRemoteVersion;',
  '\t\treturn !cleanLatest.includes("-") && cleanCurrent.includes("-");\n\t},\n};\n\nexport default internalRemoteVersion;');
