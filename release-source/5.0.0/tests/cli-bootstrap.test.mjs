import assert from "node:assert/strict";
import test from "node:test";
import { groupAddForSocket, selectTopology } from "../../../upgrade/cli-bootstrap.mjs";

test("CLI replacement Manager receives measured Docker socket group", () => {
	// Existing 4.0.18 installations can run as UID/GID 1000:1000 while the
	// host Docker socket is root:990 with no supplemental group.
	assert.deepEqual(groupAddForSocket(null, 990), ["990"]);
	assert.deepEqual(groupAddForSocket(["1000"], 990), ["1000", "990"]);
	assert.deepEqual(groupAddForSocket(["990", "1000"], 990), ["990", "1000"]);
	assert.throws(() => groupAddForSocket(null, -1), /Invalid Docker socket GID/);
});

const config = "/opt/nyxguardmanager/docker-compose.yml";
const project = "nyxguardmanager";
const service = (name, id, containerName, image) => ({
	Id: id, Names: [`/${containerName}`], Image: image,
	Labels: { "com.docker.compose.project": project, "com.docker.compose.service": name,
		"com.docker.compose.project.config_files": config },
});
const manager = service("nyxguard-manager", "manager-id", "nyxguard-manager", "nyxmael/nyxguardmanager:4.0.18");
const db = service("db", "db-id", "nyxguard-db", "jc21/mariadb-aria:latest");
const vpn = service("vpn-client-agent", "vpn-id", "nyxguard-vpn-agent", "nyxmael/nyxguardmanager-vpn-agent:4.0.18");

test("historical 4.0.18 Compose labels select the exact VPN agent", () => {
	const found = selectTopology([manager, db, vpn], "/opt/nyxguardmanager", false);
	assert.equal(found.manager.Id, manager.Id);
	assert.equal(found.vpn.Id, vpn.Id);
});

test("Compose-generated container names use service labels", () => {
	const generated = { ...vpn, Names: ["/nyxguardmanager-vpn-client-agent-1"] };
	assert.equal(selectTopology([manager, db, generated], "/opt/nyxguardmanager", false).vpn.Id, vpn.Id);
});

test("public installer Manager-only declaration identifies an absent VPN despite later TUN changes", () => {
	assert.equal(selectTopology([manager, db], "/opt/nyxguardmanager", true).vpn, null);
	assert.throws(() => selectTopology([manager, db], "/opt/nyxguardmanager", false), /installer-declared Manager-only/);
});

test("ambiguous or detached VPN agents fail closed", () => {
	assert.throws(() => selectTopology([manager, db, vpn, { ...vpn, Id: "other" }], "/opt/nyxguardmanager", false), /Ambiguous VPN/);
	const detached = { ...vpn, Labels: { ...vpn.Labels, "com.docker.compose.project": "other" } };
	assert.throws(() => selectTopology([manager, db, detached], "/opt/nyxguardmanager", true), /inconsistent Compose project/);
	assert.throws(() => selectTopology([manager, db, { ...vpn, Labels: {} }], "/opt/nyxguardmanager", true), /outside the installed Compose service/);
});
