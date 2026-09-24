import assert from "node:assert/strict";
import fs from "node:fs";

const app = process.argv[2] || "/app";
const mainPath = `${app}/routes/main.js`;
const packagePath = `${app}/package.json`;
let main = fs.readFileSync(mainPath, "utf8");
const importAnchor = 'import developerMessageRoutes from "./developer-message.js";';
const routeAnchor = 'router.use("/developer-message", developerMessageRoutes);';
for (const anchor of [importAnchor, routeAnchor]) assert.equal(main.split(anchor).length - 1, 1, `expected one ${anchor}`);
assert.equal(main.includes("professionalSupportRoutes"), false, "5.0.0 backend already mounted");
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
assert.equal(pkg.version, "4.0.18", "unexpected authoritative base version");
main = main.replace(importAnchor, `${importAnchor}\nimport professionalSupportRoutes from "./professional-support.js";`);
main = main.replace(routeAnchor, `${routeAnchor}\nrouter.use("/professional-support", professionalSupportRoutes);`);
pkg.version = "5.0.0";
fs.writeFileSync(mainPath, main);
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log("NyxGuard 5.0.0 backend route and version mounted");
