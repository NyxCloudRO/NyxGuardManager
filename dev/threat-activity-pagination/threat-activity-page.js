const SORT_COLUMNS = Object.freeze({
	ip: "ip",
	type: "type",
	count: "count",
	lastSeen: "lastSeen",
});

function normalizeCount(value) {
	return Number.parseInt(String(value ?? "0"), 10) || 0;
}

function buildAggregateSql({ since, type, search, minCount, activeBans, tableName = "nyxguard_attack_event" }) {
	if (!/^[a-z0-9_]+$/i.test(tableName)) throw new Error("Invalid Threat Activity table name");
	const bindings = [since];
	let eventWhere = "`created_on` >= ?";
	if (type) {
		eventWhere += " AND `attack_type` = ?";
		bindings.push(type);
	}

	const unionParts = [
		`SELECT \`ip\`, \`attack_type\` AS \`type\`, COUNT(*) AS \`count\`, MAX(\`created_on\`) AS \`lastSeen\`, 0 AS \`banOnly\`
		 FROM \`${tableName}\`
		 WHERE ${eventWhere}
		 GROUP BY \`ip\`, \`attack_type\``,
	];

	for (const ban of activeBans) {
		if (type && ban.type !== type) continue;
		unionParts.push("SELECT ? AS `ip`, ? AS `type`, 1 AS `count`, ? AS `lastSeen`, 1 AS `banOnly`");
		bindings.push(ban.ip, ban.type, ban.lastSeen);
	}

	let outerWhere = "";
	if (search) {
		outerWhere = " WHERE LOCATE(?, `ip`) > 0";
		bindings.push(search);
	}

	const groupedSql = `SELECT \`ip\`, \`type\`, MAX(\`count\`) AS \`count\`, MAX(\`lastSeen\`) AS \`lastSeen\`, MIN(\`banOnly\`) AS \`banOnly\`
		FROM (${unionParts.join(" UNION ALL ")}) AS \`threat_sources\`${outerWhere}
		GROUP BY \`ip\`, \`type\`
		HAVING MAX(\`count\`) >= ?`;
	bindings.push(minCount);
	return { groupedSql, bindings };
}

/**
 * Returns one bounded page of Threat Activity identities. One identity is an
 * IP + attack type aggregate in the selected event window, unioned with active
 * attack-derived ban identities retained by the existing operator-view model.
 */
export async function buildThreatActivityPage(knex, options) {
	const {
		since,
		limit,
		offset,
		type,
		search = "",
		minCount = 0,
		sort = "lastSeen",
		order = "desc",
		activeBans = [],
		tableName = "nyxguard_attack_event",
	} = options;
	const sortColumn = SORT_COLUMNS[sort] ?? SORT_COLUMNS.lastSeen;
	const sortOrder = order === "asc" ? "ASC" : "DESC";
	const { groupedSql, bindings } = buildAggregateSql({ since, type, search, minCount, activeBans, tableName });

	const countResult = await knex.raw(`SELECT COUNT(*) AS \`total\` FROM (${groupedSql}) AS \`filtered_threats\``, bindings);
	const total = normalizeCount(countResult?.[0]?.[0]?.total);

	const pageBindings = [...bindings, limit, offset];
	const pageResult = await knex.raw(
		`SELECT \`ip\`, \`type\`, \`count\`, \`lastSeen\`, \`banOnly\`
		 FROM (${groupedSql}) AS \`filtered_threats\`
		 ORDER BY \`${sortColumn}\` ${sortOrder}, \`ip\` ASC, \`type\` ASC
		 LIMIT ? OFFSET ?`,
		pageBindings,
	);

	return {
		total,
		items: (pageResult?.[0] ?? []).map((row) => ({
			ip: row.ip,
			type: row.type,
			count: normalizeCount(row.count),
			lastSeen: row.lastSeen,
			banOnly: Boolean(row.banOnly),
		})),
	};
}

export { buildAggregateSql };
