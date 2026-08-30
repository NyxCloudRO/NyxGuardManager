import assert from "node:assert/strict";
import fs from "node:fs";
import db from "/app/db.js";
import { buildAggregateSql, buildThreatActivityPage } from "./threat-activity-page.js";

const generated = buildAggregateSql({
	since: new Date("2026-08-01T00:00:00Z"),
	type: "bot",
	search: "198.18.",
	minCount: 2,
	activeBans: [{ ip: "198.18.99.1", type: "bot", lastSeen: new Date("2026-08-02T00:00:00Z") }],
});
assert.match(generated.groupedSql, /COUNT\(\*\)/);
assert.match(generated.groupedSql, /UNION ALL/);
assert.match(generated.groupedSql, /LOCATE\(\?, `ip`\) > 0/);
assert.match(generated.groupedSql, /HAVING MAX\(`count`\) >= \?/);
assert.throws(
	() => buildAggregateSql({ since: new Date(), minCount: 0, activeBans: [], tableName: "bad;DROP TABLE x" }),
	/Invalid Threat Activity table name/,
);

if (process.argv.includes("--verify-image")) {
	const route = fs.readFileSync("/app/routes/nyxguard/attack-log.js", "utf8");
	const apiClient = fs.readFileSync("/app/frontend/assets/getNyxGuardAttacks-DWznpCF6.js", "utf8");
	const pages = ["index-W-QFtloY.js", "index-W-QFtloY-408dev.js", "index-W-QFtloY-409dev.js"].map((name) =>
		fs.readFileSync(`/app/frontend/assets/${name}`, "utf8"),
	);
	const index = fs.readFileSync("/app/frontend/index.html", "utf8");
	assert.match(route, /buildThreatActivityPage/);
	assert.match(route, /offset: \{ type: "integer"/);
	assert.match(route, /total: page\.total/);
	assert.match(apiClient, /min_count/);
	for (const page of pages) {
		assert.match(page, /g\.data\?\.total\?\?0/);
		assert.match(page, /children:"Next"/);
		assert.match(page, /g\.data&&t\.jsxs/);
	}
	assert.match(index, /index-CTHAIRmi-409dev-4012certfix4-threatpagination3\.js/);
}

if (process.argv.includes("--integration")) {
	const knex = db();
	const tableName = `threat_activity_test_${process.pid}`;
	await knex.raw(
		`CREATE TEMPORARY TABLE \`${tableName}\` (
			\`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			\`ip\` VARCHAR(64) NOT NULL,
			\`attack_type\` VARCHAR(16) NOT NULL,
			\`created_on\` DATETIME NOT NULL,
			PRIMARY KEY (\`id\`),
			INDEX \`created_ip_type\` (\`created_on\`, \`ip\`, \`attack_type\`)
		)`,
	);
	try {
		const now = new Date();
		const ago = (days, seconds = 0) => new Date(now.getTime() - days * 86400000 - seconds * 1000);
		const rows = [];
		for (let index = 0; index < 530; index += 1) {
			const ip = `198.18.${Math.floor(index / 250)}.${(index % 250) + 1}`;
			const attackType = index < 250 ? "bot" : index < 390 ? "ddos" : "sqli";
			const createdOn = index < 250 ? ago(0, index + 60) : index < 390 ? ago(3, index) : ago(10, index);
			rows.push({ ip, attack_type: attackType, created_on: createdOn });
			if (index < 10) {
				rows.push({ ip, attack_type: attackType, created_on: ago(0, index + 600) });
				rows.push({ ip, attack_type: attackType, created_on: ago(0, index + 1200) });
			}
		}
		await knex.batchInsert(tableName, rows, 100);

		const query = (overrides = {}) =>
			buildThreatActivityPage(knex, {
				since: ago(30),
				limit: 200,
				offset: 0,
				type: undefined,
				search: "",
				minCount: 0,
				sort: "lastSeen",
				order: "desc",
				activeBans: [],
				tableName,
				...overrides,
			});

		const first = await query();
		assert.equal(first.items.length, 200);
		assert.equal(first.total, 530);
		const second = await query({ offset: 200 });
		const third = await query({ offset: 400 });
		assert.equal(second.items.length, 200);
		assert.equal(second.total, 530);
		assert.equal(third.items.length, 130);
		assert.equal(new Set([...first.items, ...second.items, ...third.items].map((item) => `${item.ip}|${item.type}`)).size, 530);

		const botFirst = await query({ type: "bot" });
		const botSecond = await query({ type: "bot", offset: 200 });
		assert.equal(botFirst.items.length, 200);
		assert.equal(botFirst.total, 250);
		assert.equal(botSecond.items.length, 50);
		assert.equal(botSecond.total, 250);

		assert.equal((await query({ since: ago(1) })).total, 250);
		assert.equal((await query({ since: ago(7) })).total, 390);
		assert.equal((await query({ since: ago(30) })).total, 530);
		assert.equal((await query({ search: "198.18.0." })).total, 250);
		assert.equal((await query({ search: "no-match" })).total, 0);
		assert.equal((await query({ minCount: 3 })).total, 10);
		assert.equal((await query({ type: "ddos" })).total, 140);

		const deterministicA = await query({ limit: 7, sort: "count", order: "desc" });
		const deterministicB = await query({ limit: 7, sort: "count", order: "desc" });
		assert.deepEqual(deterministicA.items, deterministicB.items);
		assert.ok(deterministicA.items.every((item) => item.count === 3));
		assert.deepEqual(
			deterministicA.items.map((item) => item.ip),
			[...deterministicA.items.map((item) => item.ip)].sort((a, b) => a.localeCompare(b)),
		);

		const oneBan = await query({
			activeBans: [{ ip: "198.19.0.1", type: "bot", lastSeen: now }],
		});
		assert.equal(oneBan.total, 531);
		assert.equal(oneBan.items[0].ip, "198.19.0.1");
		assert.equal(oneBan.items[0].banOnly, true);
	} finally {
		await knex.raw(`DROP TEMPORARY TABLE IF EXISTS \`${tableName}\``);
		await knex.destroy();
	}
}

console.log("Threat Activity pagination regression tests passed");
