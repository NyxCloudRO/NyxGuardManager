import crypto from "node:crypto";
import authModel from "/app/models/auth.js";
import userModel from "/app/models/user.js";
import userPermissionModel from "/app/models/user_permission.js";

const prefix = "codex-developer-message-acceptance-";

async function cleanup() {
	const users = await userModel.query().select("id").where("email", "like", `${prefix}%`);
	const ids = users.map((user) => user.id);
	if (ids.length) {
		await authModel.query().delete().whereIn("user_id", ids);
		await userPermissionModel.query().delete().whereIn("user_id", ids);
		await userModel.query().delete().whereIn("id", ids);
	}
}

async function createUser(label, password) {
	const nonce = crypto.randomBytes(6).toString("hex");
	const user = await userModel.query().insertAndFetch({
		email: `${prefix}${label}-${nonce}@invalid.local`,
		name: `Developer Message ${label}`,
		nickname: label,
		avatar: "",
		roles: [],
	});
	await authModel.query().insert({ user_id: user.id, type: "password", secret: password, meta: {} });
	await userPermissionModel.query().insert({
		user_id: user.id,
		visibility: "user",
		proxy_hosts: "view",
		redirection_hosts: "hidden",
		dead_hosts: "hidden",
		streams: "hidden",
		access_lists: "view",
		certificates: "view",
		nyxguard: "view",
		web_controls: "view",
		users: "view",
		auditlog: "view",
		settings: "view",
	});
	return { id: user.id, email: user.email, password };
}

try {
	if (process.argv.includes("--cleanup")) {
		await cleanup();
		console.log(JSON.stringify({ cleaned: true }));
	} else if (process.argv.includes("--create")) {
		await cleanup();
		const password = `Nyx-${crypto.randomBytes(18).toString("base64url")}!aA7`;
		const first = await createUser("A", password);
		const second = await createUser("B", password);
		console.log(JSON.stringify({ first, second }));
	} else {
		throw new Error("Use --create or --cleanup");
	}
} finally {
	await userModel.knex().destroy();
}
