import assert from "node:assert/strict";
import fs from "node:fs";

const approvedCopy = [
	"A note from the developer",
	"Built independently. Security that stays in your hands.",
	"NyxGuard Manager started from a simple idea: self-hosted infrastructure deserves security tooling that feels like a serious operator platform — without giving up control of your infrastructure, your configuration, or your data.",
	"I’m building NyxGuard independently around that idea. What began as a better way to manage and protect reverse-proxied applications has grown into a broader security and operations platform, bringing reverse proxy management, certificate automation, application protection, threat visibility, traffic intelligence and secure connectivity together in one place.",
	"From WAF, SQL Shield, Bot Defence and DDoS protection to IP & Geo intelligence, access controls, real-time traffic visibility, event tracking and multi-site connectivity, each capability is designed with the same philosophy: give operators useful security controls and clear visibility without making their infrastructure unnecessarily complicated.",
	"NyxGuard is also built local-first. Your configuration, certificates and operational history remain on infrastructure you control. I want the platform to stay predictable to operate, transparent about what is happening, and practical when something actually needs your attention.",
	"Developing and maintaining all of this independently takes a significant amount of time — researching security problems, building new capabilities, testing releases, fixing issues and continuously improving the experience.",
	"NyxGuard Manager is free to use for both personal and enterprise deployments, and I intend to keep it that way.",
	"If NyxGuard helps you protect infrastructure you care about and you would like to support its continued development, you can do so below. Your support helps me dedicate more time to improving the platform and building what comes next.",
	"Support is completely optional.",
	"— Nyxmael",
	"NyxGuard Manager remains fully usable whether you support the project or not.",
];

if (process.argv.includes("--verify-image")) {
	const route = fs.readFileSync("/app/routes/developer-message.js", "utf8");
	const main = fs.readFileSync("/app/routes/main.js", "utf8");
	const migration = fs.readFileSync("/app/migrations/20260830120000_developer_message_acknowledgement.js", "utf8");
	const script = fs.readFileSync("/app/frontend/assets/developer-message.js", "utf8");
	const css = fs.readFileSync("/app/frontend/assets/developer-message.css", "utf8");
	const index = fs.readFileSync("/app/frontend/index.html", "utf8");
	const packageJson = JSON.parse(fs.readFileSync("/app/package.json", "utf8"));

	assert.match(main, /router\.use\("\/developer-message", developerMessageRoutes\)/);
	assert.match(main, /commit: process\.env\.NPM_BUILD_COMMIT/);
	assert.ok(process.env.NPM_BUILD_COMMIT, "DEV source revision is required");
	assert.doesNotMatch(process.env.NPM_BUILD_COMMIT, /^release-4\.0\.18$/);
	assert.match(route, /\.all\(jwtdecode\(\)\)/);
	assert.match(route, /currentUserId\(res\)/);
	assert.match(route, /access\.can\("users:get", userId\)/);
	assert.doesNotMatch(route, /req\.body|req\.params|req\.query/);
	assert.match(migration, /developer_message_acknowledged_on/);
	assert.match(migration, /nullable\(\)\.defaultTo\(null\)/);
	assert.match(script, /sessionStorage/);
	assert.match(script, /a\.support-nyxguard/);
	assert.match(script, /rel = "noopener noreferrer"/);
	assert.match(script, /aria-modal/);
	assert.match(script, /enforceFocus/);
	assert.match(script, /event\.key === "Escape"/);
	assert.match(script, /modal\.closest\("\.nyx-developer-message-overlay"\)/);
	assert.match(css, /max-height:calc\(100dvh/);
	assert.match(css, /@media \(max-width:600px\)/);
	assert.match(index, /developer-message\.js/);
	assert.equal(packageJson.version, "4.0.18");
	for (const text of approvedCopy) assert.ok(script.includes(text), `missing approved copy: ${text}`);

	const activeBundle = fs.readFileSync("/app/frontend/assets/index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js", "utf8");
	assert.match(activeBundle, /support-nyxguard/);
	assert.match(activeBundle, /https:\/\/buymeacoffee\.com\/nyxmael/);
}

if (process.argv.includes("--integration")) {
	const unauthenticatedGet = await fetch("http://127.0.0.1:3000/api/developer-message");
	const unauthenticatedPost = await fetch("http://127.0.0.1:3000/api/developer-message", { method: "POST" });
	assert.ok([401, 403].includes(unauthenticatedGet.status), `unexpected GET status ${unauthenticatedGet.status}`);
	assert.ok([401, 403].includes(unauthenticatedPost.status), `unexpected POST status ${unauthenticatedPost.status}`);
}

console.log("Developer Message regression tests passed");
