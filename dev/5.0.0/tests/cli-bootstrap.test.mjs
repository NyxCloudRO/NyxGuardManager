import assert from "node:assert/strict";
import test from "node:test";
import { groupAddForSocket } from "../../../upgrade/cli-bootstrap.mjs";

test("CLI replacement Manager receives measured Docker socket group", () => {
	// Existing 4.0.18 installations can run as UID/GID 1000:1000 while the
	// host Docker socket is root:990 with no supplemental group.
	assert.deepEqual(groupAddForSocket(null, 990), ["990"]);
	assert.deepEqual(groupAddForSocket(["1000"], 990), ["1000", "990"]);
	assert.deepEqual(groupAddForSocket(["990", "1000"], 990), ["990", "1000"]);
	assert.throws(() => groupAddForSocket(null, -1), /Invalid Docker socket GID/);
});
