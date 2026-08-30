import assert from "node:assert/strict";
import fs from "node:fs";

const frontendDir = process.argv[2] || "/app/frontend";
const indexPath = `${frontendDir}/index.html`;
let index = fs.readFileSync(indexPath, "utf8");
const anchor = '\t\t<script defer src="/assets/update-manager-visibility-4010.js?v=20260718-update-r2"></script>';
assert.equal(index.split(anchor).length - 1, 1, "expected one frontend injection anchor");
index = index.replace(
	anchor,
	`${anchor}\n\t\t<link rel="stylesheet" href="/assets/developer-message.css?v=20260830-dev1">\n\t\t<script defer src="/assets/developer-message.js?v=20260830-dev1"></script>`,
);
fs.writeFileSync(indexPath, index);
console.log("Developer Message frontend mounted");
