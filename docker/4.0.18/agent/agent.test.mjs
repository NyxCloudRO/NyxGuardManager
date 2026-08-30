import assert from "node:assert/strict";
import test from "node:test";

import { formatStatus, HANDSHAKE_FRESHNESS_SECONDS } from "./agent.js";

const NOW = 2_000_000_000;
const metadata = { id: "site-12345678", name: "Test site", interface: "nyxvpn12345678" };

function dumpWithHandshake(handshake) {
	return [
		"private-key\tpublic-key\t51820\toff",
		`peer-key\tpreshared-key\t198.51.100.10:51820\t10.0.0.0/24\t${handshake}\t92\t276\t21`,
	].join("\n");
}

test("reports a recent handshake as connected", () => {
	const status = formatStatus(metadata, true, dumpWithHandshake(NOW - HANDSHAKE_FRESHNESS_SECONDS), true, NOW);
	assert.equal(status.state, "connected");
	assert.equal(status.interfaceUp, true);
});

test("reports a stale handshake as waiting", () => {
	const status = formatStatus(metadata, true, dumpWithHandshake(NOW - HANDSHAKE_FRESHNESS_SECONDS - 1), true, NOW);
	assert.equal(status.state, "interface-up");
	assert.equal(status.latestHandshake, new Date((NOW - HANDSHAKE_FRESHNESS_SECONDS - 1) * 1000).toISOString());
});

test("reports an up interface without a handshake as waiting", () => {
	assert.equal(formatStatus(metadata, true, dumpWithHandshake(0), false, NOW).state, "interface-up");
});

test("reports a down interface as disconnected even with a previous handshake", () => {
	assert.equal(formatStatus(metadata, false, dumpWithHandshake(NOW), false, NOW).state, "disconnected");
});
