import http from "node:http";
import net from "node:net";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { chmod, chown, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const HOST = "127.0.0.1";
const PORT = 3198;
const STATE_DIR = process.env.NYXGUARD_VPN_STATE_DIR || "/var/lib/nyxguard-vpn";
const PROFILES_DIR = path.join(STATE_DIR, "profiles");
const LEGACY_CONFIG_PATH = path.join(STATE_DIR, "nyxvpn.conf");
const LEGACY_METADATA_PATH = path.join(STATE_DIR, "metadata.json");
const LEGACY_ENABLED_PATH = path.join(STATE_DIR, "enabled");
const AUTH_DIR = process.env.NYXGUARD_VPN_AUTH_DIR || "/run/nyxguard-vpn-auth";
const AUTH_PATH = path.join(AUTH_DIR, "token");
const BACKEND_UID = Number(process.env.NYXGUARD_BACKEND_UID || 1000);
const MAX_BODY_BYTES = 96 * 1024;
const MAX_PROFILES = 32;
const HANDSHAKE_FRESHNESS_SECONDS = 180;
let agentToken = "";

const INTERFACE_KEYS = new Map([
	["privatekey", "PrivateKey"],
	["address", "Address"],
	["mtu", "MTU"],
	["table", "Table"],
]);
const PEER_KEYS = new Map([
	["publickey", "PublicKey"],
	["presharedkey", "PresharedKey"],
	["allowedips", "AllowedIPs"],
	["endpoint", "Endpoint"],
	["persistentkeepalive", "PersistentKeepalive"],
]);
const FORBIDDEN_KEYS = new Set(["preup", "postup", "predown", "postdown", "saveconfig"]);

function publicError(message, status = 400) {
	const error = new Error(message);
	error.status = status;
	return error;
}

function tokenMatches(candidate) {
	const expected = Buffer.from(agentToken);
	const actual = Buffer.from(String(candidate || ""));
	return expected.length > 0 && expected.length === actual.length && timingSafeEqual(expected, actual);
}

function splitList(value) {
	return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function validateCidr(value, label) {
	const [address, prefixRaw, ...extra] = value.split("/");
	if (extra.length || prefixRaw === undefined || !/^\d+$/.test(prefixRaw)) {
		throw publicError(`${label} must use CIDR notation: ${value}`);
	}
	const family = net.isIP(address);
	const prefix = Number(prefixRaw);
	if (!family || prefix < 0 || prefix > (family === 4 ? 32 : 128)) {
		throw publicError(`Invalid ${label}: ${value}`);
	}
	return { address, prefix, family };
}

function ipToBigInt(address, family) {
	if (family === 4) return address.split(".").reduce((value, part) => (value << 8n) + BigInt(Number(part)), 0n);
	let normalized = address.toLowerCase();
	const ipv4Match = normalized.match(/(\d+\.\d+\.\d+\.\d+)$/);
	if (ipv4Match) {
		const ipv4 = ipv4Match[1].split(".").map(Number);
		const replacement = `${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
		normalized = normalized.slice(0, -ipv4Match[1].length) + replacement;
	}
	const halves = normalized.split("::");
	const left = halves[0] ? halves[0].split(":").filter(Boolean) : [];
	const right = halves[1] ? halves[1].split(":").filter(Boolean) : [];
	const fill = halves.length === 2 ? new Array(8 - left.length - right.length).fill("0") : [];
	const groups = [...left, ...fill, ...right];
	if (groups.length !== 8) throw publicError(`Invalid IP address: ${address}`);
	return groups.reduce((value, group) => (value << 16n) + BigInt(parseInt(group || "0", 16)), 0n);
}

function cidrsOverlap(first, second) {
	const a = validateCidr(first, "Remote route");
	const b = validateCidr(second, "Remote route");
	if (a.family !== b.family) return false;
	const bits = a.family === 4 ? 32 : 128;
	const commonPrefix = Math.min(a.prefix, b.prefix);
	const shift = BigInt(bits - commonPrefix);
	return (ipToBigInt(a.address, a.family) >> shift) === (ipToBigInt(b.address, b.family) >> shift);
}

function addressRangesOverlap(first, second) {
	return cidrsOverlap(first, second);
}

function validateKey(value, label) {
	if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) throw publicError(`${label} is not a valid WireGuard base64 key.`);
}

function validateEndpoint(value) {
	let host = "";
	let port = "";
	if (value.startsWith("[")) {
		const match = value.match(/^\[([^\]]+)]:(\d{1,5})$/);
		if (match) [, host, port] = match;
	} else {
		const separator = value.lastIndexOf(":");
		if (separator > 0) {
			host = value.slice(0, separator);
			port = value.slice(separator + 1);
		}
	}
	if (!host || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
		throw publicError("Endpoint must be a hostname or IP followed by a valid UDP port.");
	}
	const plainHost = host.replace(/^\[|]$/g, "");
	if (!net.isIP(plainHost) && !/^(?=.{1,253}$)(?!-)[A-Za-z0-9.-]+(?<!-)$/.test(plainHost)) {
		throw publicError("Endpoint contains an invalid hostname or IP address.");
	}
}

function normalizeSiteName(value, filename) {
	const fallback = path.basename(String(filename || "VPN site"), path.extname(String(filename || "")))
		.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
	const name = String(value || fallback || "VPN site").replace(/\s+/g, " ").trim();
	if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) throw publicError("Site name must contain between 1 and 60 printable characters.");
	return name;
}

function validateAndNormalizeConfig(raw, filename, routeOverrideRaw, identity) {
	if (typeof raw !== "string" || !raw.trim()) throw publicError("The uploaded configuration is empty.");
	if (Buffer.byteLength(raw, "utf8") > 64 * 1024) throw publicError("Configuration exceeds 64 KiB.");
	if (raw.includes("\0")) throw publicError("Configuration contains invalid binary data.");

	const lines = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
	const output = [];
	const routeOverrides = splitList(String(routeOverrideRaw || "").replace(/\s+/g, ","));
	const parsedRouteOverrides = routeOverrides.map((cidr) => {
		const parsed = validateCidr(cidr, "Remote network override");
		if (parsed.prefix === 0) throw publicError("Remote network overrides cannot contain default routes.");
		return { cidr, family: parsed.family };
	});
	const metadata = {
		id: identity.id,
		name: normalizeSiteName(identity.name, filename),
		filename: path.basename(String(filename || "client.conf")).replace(/[^A-Za-z0-9._-]/g, "_"),
		uploadedAt: new Date().toISOString(),
		interface: identity.interface,
		addresses: [],
		allowedIps: [],
		endpoints: [],
		peerCount: 0,
		warnings: [],
	};
	let section = "";
	let interfaceCount = 0;
	let currentPeer = null;
	let hasPrivateKey = false;
	function requireCompletePeer() {
		if (currentPeer && (!currentPeer.publicKey || !currentPeer.allowedIps || !currentPeer.endpoint)) {
			throw publicError("Each client [Peer] requires PublicKey, AllowedIPs, and Endpoint.");
		}
	}

	for (const originalLine of lines) {
		const line = originalLine.trim();
		if (!line || line.startsWith("#") || line.startsWith(";")) continue;
		const sectionMatch = line.match(/^\[([^\]]+)]$/);
		if (sectionMatch) {
			requireCompletePeer();
			section = sectionMatch[1].toLowerCase();
			if (section === "interface") {
				interfaceCount += 1;
				if (interfaceCount > 1 || metadata.peerCount > 0) throw publicError("Configuration must contain one [Interface] section before all [Peer] sections.");
				output.push("[Interface]");
				currentPeer = null;
			} else if (section === "peer") {
				if (interfaceCount !== 1) throw publicError("[Interface] must appear before [Peer].");
				metadata.peerCount += 1;
				currentPeer = { publicKey: false, allowedIps: false, endpoint: false };
				output.push("", "[Peer]");
			} else throw publicError(`Unsupported WireGuard section: [${sectionMatch[1]}]`);
			continue;
		}

		if (!section) throw publicError("Every setting must be inside [Interface] or [Peer].");
		const equals = line.indexOf("=");
		if (equals < 1) throw publicError(`Invalid configuration line: ${line.slice(0, 80)}`);
		const rawKey = line.slice(0, equals).trim();
		const key = rawKey.toLowerCase();
		const value = line.slice(equals + 1).trim();
		if (!value) throw publicError(`${rawKey} cannot be empty.`);
		if (FORBIDDEN_KEYS.has(key)) throw publicError(`${rawKey} is not allowed because uploaded configurations cannot execute host commands.`);

		const allowedKeys = section === "interface" ? INTERFACE_KEYS : PEER_KEYS;
		const canonicalKey = allowedKeys.get(key);
		if (!canonicalKey) {
			if (key === "dns") {
				if (section !== "interface") throw publicError("DNS is only valid inside the [Interface] section.");
				const warning = "DNS from the profile was ignored; NyxGuard keeps its existing DNS settings.";
				if (!metadata.warnings.includes(warning)) metadata.warnings.push(warning);
				continue;
			}
			throw publicError(`Unsupported ${section} setting: ${rawKey}`);
		}

		if (key === "privatekey") {
			validateKey(value, "PrivateKey");
			hasPrivateKey = true;
		} else if (key === "publickey" || key === "presharedkey") {
			validateKey(value, canonicalKey);
			if (key === "publickey") currentPeer.publicKey = true;
		} else if (key === "address") {
			for (const cidr of splitList(value)) validateCidr(cidr, "Address");
			metadata.addresses.push(...splitList(value));
		} else if (key === "allowedips") {
			const configuredRoutes = splitList(value);
			const parsedRoutes = configuredRoutes.map((cidr) => ({ cidr, ...validateCidr(cidr, "AllowedIPs entry") }));
			const hasDefaultRoute = parsedRoutes.some((route) => route.prefix === 0);
			if (hasDefaultRoute && parsedRouteOverrides.length === 0) {
				throw publicError("This profile uses a default route. Enter the required remote network(s) in Remote networks and upload again.");
			}
			const normalizedRoutes = [];
			for (const route of parsedRoutes) {
				if (route.prefix === 0) normalizedRoutes.push(...parsedRouteOverrides.filter((item) => item.family === route.family).map((item) => item.cidr));
				else normalizedRoutes.push(route.cidr);
			}
			const uniqueRoutes = [...new Set(normalizedRoutes)];
			if (uniqueRoutes.length === 0) throw publicError("Remote networks must include at least one subnet matching the profile's IP family.");
			if (hasDefaultRoute) {
				const warning = `Default routes were safely replaced with: ${uniqueRoutes.join(", ")}.`;
				if (!metadata.warnings.includes(warning)) metadata.warnings.push(warning);
			}
			metadata.allowedIps.push(...uniqueRoutes);
			currentPeer.allowedIps = true;
			output.push(`${canonicalKey} = ${uniqueRoutes.join(", ")}`);
			continue;
		} else if (key === "endpoint") {
			validateEndpoint(value);
			metadata.endpoints.push(value);
			currentPeer.endpoint = true;
		} else if (key === "persistentkeepalive") {
			if (!/^\d+$/.test(value) || Number(value) < 0 || Number(value) > 65535) throw publicError("PersistentKeepalive must be between 0 and 65535 seconds.");
		} else if (key === "mtu") {
			if (!/^\d+$/.test(value) || Number(value) < 576 || Number(value) > 9000) throw publicError("MTU must be between 576 and 9000.");
		} else if (key === "table") {
			if (!/^(auto|off|[1-9]\d*)$/i.test(value)) throw publicError("Table must be auto, off, or a positive routing-table number.");
			if (value.toLowerCase() === "off") metadata.warnings.push("Table=off disables automatic routes; the remote site may not be reachable without manual routing.");
		}
		output.push(`${canonicalKey} = ${value}`);
	}

	if (interfaceCount !== 1 || !hasPrivateKey || metadata.addresses.length === 0) throw publicError("Configuration requires one [Interface] with PrivateKey and Address.");
	if (metadata.peerCount < 1) throw publicError("Configuration requires at least one [Peer].");
	requireCompletePeer();
	metadata.allowedIps = [...new Set(metadata.allowedIps)];
	return { config: `${output.join("\n").trim()}\n`, metadata };
}

async function command(file, args, timeout = 12_000) {
	try {
		return await execFile(file, args, { timeout, maxBuffer: 64 * 1024, encoding: "utf8" });
	} catch (error) {
		const detail = String(error.stderr || error.stdout || error.message || "Command failed").trim().slice(0, 2000);
		throw publicError(detail || "Command failed.", 500);
	}
}

async function fileExists(file) {
	try {
		await stat(file);
		return true;
	} catch {
		return false;
	}
}

function profilePaths(metadata) {
	const directory = path.join(PROFILES_DIR, metadata.id);
	return {
		directory,
		metadata: path.join(directory, "metadata.json"),
		config: path.join(directory, `${metadata.interface}.conf`),
		temporary: path.join(directory, `.${metadata.interface}.upload`),
		enabled: path.join(directory, "enabled"),
	};
}

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch {
		return null;
	}
}

async function migrateLegacyProfile() {
	const legacyMetadata = await readJson(LEGACY_METADATA_PATH);
	if (!legacyMetadata || !(await fileExists(LEGACY_CONFIG_PATH))) return;
	const id = `site-${randomBytes(4).toString("hex")}`;
	const metadata = {
		...legacyMetadata,
		id,
		name: normalizeSiteName(legacyMetadata.name, legacyMetadata.filename),
		interface: legacyMetadata.interface || "nyxvpn",
		migratedAt: new Date().toISOString(),
	};
	const paths = profilePaths(metadata);
	await mkdir(paths.directory, { recursive: true, mode: 0o700 });
	await rename(LEGACY_CONFIG_PATH, paths.config);
	await writeFile(paths.metadata, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
	if (await fileExists(LEGACY_ENABLED_PATH)) await rename(LEGACY_ENABLED_PATH, paths.enabled);
	await rm(LEGACY_METADATA_PATH, { force: true });
	console.log(`[vpn-agent] migrated legacy profile as ${metadata.name} (${metadata.id})`);
}

async function loadProfiles() {
	let entries = [];
	try {
		entries = await readdir(PROFILES_DIR, { withFileTypes: true });
	} catch {
		return [];
	}
	const profiles = [];
	for (const entry of entries) {
		if (!entry.isDirectory() || !/^site-[a-f0-9]{8}$/.test(entry.name)) continue;
		const metadata = await readJson(path.join(PROFILES_DIR, entry.name, "metadata.json"));
		if (metadata?.id === entry.name && /^nyxvpn[a-f0-9]{0,8}$/.test(metadata.interface || "")) profiles.push(metadata);
	}
	return profiles.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function requireProfile(id) {
	if (!/^site-[a-f0-9]{8}$/.test(String(id || ""))) throw publicError("VPN site not found.", 404);
	const metadata = await readJson(path.join(PROFILES_DIR, id, "metadata.json"));
	if (!metadata || metadata.id !== id) throw publicError("VPN site not found.", 404);
	return metadata;
}

async function interfaceIsUp(interfaceName) {
	try {
		await execFile("ip", ["link", "show", "dev", interfaceName], { timeout: 3000 });
		return true;
	} catch {
		return false;
	}
}

function formatStatus(metadata, interfaceUp, dump, autoConnect, nowSeconds = Date.now() / 1000) {
	const peers = [];
	let latestHandshake = 0;
	let transferRx = 0;
	let transferTx = 0;
	if (dump) {
		for (const line of dump.trim().split("\n").slice(1)) {
			const fields = line.split("\t");
			if (fields.length < 8) continue;
			const handshake = Number(fields[4]) || 0;
			latestHandshake = Math.max(latestHandshake, handshake);
			transferRx += Number(fields[5]) || 0;
			transferTx += Number(fields[6]) || 0;
			peers.push({ endpoint: fields[2] || null, allowedIps: fields[3]?.split(",") || [], latestHandshake: handshake });
		}
	}
	return {
		...metadata,
		interfaceUp,
		state: !interfaceUp
			? "disconnected"
			: latestHandshake > 0 && nowSeconds - latestHandshake <= HANDSHAKE_FRESHNESS_SECONDS
				? "connected"
				: "interface-up",
		latestHandshake: latestHandshake ? new Date(latestHandshake * 1000).toISOString() : null,
		transferRx,
		transferTx,
		peers,
		autoConnect,
	};
}

async function getSiteStatus(metadata) {
	const paths = profilePaths(metadata);
	const interfaceUp = await interfaceIsUp(metadata.interface);
	let dump = "";
	if (interfaceUp) {
		try {
			dump = (await execFile("wg", ["show", metadata.interface, "dump"], { timeout: 3000, encoding: "utf8" })).stdout;
		} catch {
			// The interface and persisted metadata still provide a useful state.
		}
	}
	return formatStatus(metadata, interfaceUp, dump, await fileExists(paths.enabled));
}

async function getSitesStatus() {
	const sites = await Promise.all((await loadProfiles()).map(getSiteStatus));
	return {
		agentAvailable: true,
		sites,
		summary: {
			total: sites.length,
			connected: sites.filter((site) => site.state === "connected").length,
			active: sites.filter((site) => site.interfaceUp).length,
		},
	};
}

function assertNoProfileConflicts(candidate, profiles) {
	for (const profile of profiles) {
		if (profile.id === candidate.id) continue;
		for (const route of candidate.allowedIps || []) {
			for (const existing of profile.allowedIps || []) {
				if (cidrsOverlap(route, existing)) throw publicError(`Remote route ${route} overlaps ${existing} from VPN site “${profile.name}”. Use non-overlapping site networks.`);
			}
		}
		for (const address of candidate.addresses || []) {
			for (const existing of profile.addresses || []) {
				if (addressRangesOverlap(address, existing)) throw publicError(`Tunnel address ${address} overlaps ${existing} from VPN site “${profile.name}”. Each site needs a unique client tunnel address.`);
			}
		}
	}
}

async function assertNoNyxGuardNetworkConflicts(candidate) {
	let routes = [];
	try {
		const result = await execFile("ip", ["-j", "route", "show", "table", "main"], { timeout: 5000, maxBuffer: 128 * 1024, encoding: "utf8" });
		routes = JSON.parse(result.stdout || "[]");
	} catch (error) {
		throw publicError(`Unable to validate NyxGuard's existing network routes: ${String(error.message || error).slice(0, 300)}`, 500);
	}
	for (const route of routes) {
		const destination = String(route?.dst || "").trim();
		const device = String(route?.dev || "").trim();
		if (!destination || destination === "default" || device === candidate.interface || device.startsWith("nyxvpn")) continue;
		if (!destination.includes("/")) continue;
		for (const remote of candidate.allowedIps || []) {
			if (cidrsOverlap(remote, destination)) {
				throw publicError(`Remote network ${remote} overlaps NyxGuard's existing ${destination} network on ${device || "a local interface"}. Use a non-overlapping remote range or translate that site before connecting.`, 409);
			}
		}
	}
}

async function createSite(body) {
	const profiles = await loadProfiles();
	if (profiles.length >= MAX_PROFILES) throw publicError(`A maximum of ${MAX_PROFILES} VPN sites is supported.`, 409);
	let id;
	do id = `site-${randomBytes(4).toString("hex")}`;
	while (profiles.some((profile) => profile.id === id));
	const identity = { id, name: body.name, interface: `nyxvpn${id.slice(-8)}` };
	const { config, metadata } = validateAndNormalizeConfig(body.content, body.filename, body.routeOverride, identity);
	assertNoProfileConflicts(metadata, profiles);
	await assertNoNyxGuardNetworkConflicts(metadata);
	const paths = profilePaths(metadata);
	await mkdir(paths.directory, { recursive: true, mode: 0o700 });
	try {
		await writeFile(paths.temporary, config, { mode: 0o600 });
		await rename(paths.temporary, paths.config);
		await writeFile(paths.metadata, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
		return getSiteStatus(metadata);
	} catch (error) {
		await rm(paths.directory, { recursive: true, force: true });
		throw error;
	}
}

async function connectSite(metadata) {
	const paths = profilePaths(metadata);
	if (!(await fileExists(paths.config))) throw publicError("The stored WireGuard configuration is missing.", 409);
	const activeProfiles = [];
	for (const profile of await loadProfiles()) {
		if (profile.id !== metadata.id && await interfaceIsUp(profile.interface)) activeProfiles.push(profile);
	}
	assertNoProfileConflicts(metadata, activeProfiles);
	await assertNoNyxGuardNetworkConflicts(metadata);
	if (!(await interfaceIsUp(metadata.interface))) {
		try {
			await command("wg-quick", ["up", paths.config], 20_000);
		} catch (error) {
			await execFile("wg-quick", ["down", paths.config], { timeout: 8000 }).catch(() => {});
			throw error;
		}
	}
	await writeFile(paths.enabled, `${new Date().toISOString()}\n`, { mode: 0o600 });
	return getSiteStatus(metadata);
}

async function disconnectSite(metadata) {
	const paths = profilePaths(metadata);
	await rm(paths.enabled, { force: true });
	if (await interfaceIsUp(metadata.interface)) await command("wg-quick", ["down", paths.config], 20_000);
	return getSiteStatus(metadata);
}

async function deleteSite(metadata) {
	if (await interfaceIsUp(metadata.interface)) throw publicError("Disconnect this VPN site before deleting it.", 409);
	await rm(profilePaths(metadata).directory, { recursive: true, force: true });
	return getSitesStatus();
}

async function renameSite(metadata, requestedName) {
	if (!String(requestedName || "").trim()) throw publicError("Enter a site name.");
	const updated = { ...metadata, name: normalizeSiteName(requestedName, metadata.filename), updatedAt: new Date().toISOString() };
	const paths = profilePaths(updated);
	const temporary = path.join(paths.directory, ".metadata.rename");
	await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 });
	await rename(temporary, paths.metadata);
	return getSiteStatus(updated);
}

async function testSite(metadata, target) {
	if (!(await interfaceIsUp(metadata.interface))) throw publicError("Connect this VPN site before running a connectivity test.", 409);
	const normalizedTarget = String(target || "").trim();
	if (!normalizedTarget || normalizedTarget.length > 253 || normalizedTarget.startsWith("-") || (!net.isIP(normalizedTarget) && !/^(?!-)[A-Za-z0-9.-]+(?<!-)$/.test(normalizedTarget))) {
		throw publicError("Enter a valid IP address or hostname.");
	}
	if (net.isIP(normalizedTarget)) {
		const hostCidr = `${normalizedTarget}/${net.isIP(normalizedTarget) === 4 ? 32 : 128}`;
		if (!(metadata.allowedIps || []).some((route) => cidrsOverlap(route, hostCidr))) throw publicError(`Target ${normalizedTarget} is outside this site's remote networks.`);
	}
	try {
		const result = await command("ping", ["-I", metadata.interface, "-c", "3", "-W", "2", "--", normalizedTarget], 12_000);
		return { ok: true, target: normalizedTarget, output: result.stdout.trim().slice(0, 6000) };
	} catch (error) {
		return { ok: false, target: normalizedTarget, output: error.message };
	}
}

async function readJsonBody(req) {
	const chunks = [];
	let length = 0;
	for await (const chunk of req) {
		length += chunk.length;
		if (length > MAX_BODY_BYTES) throw publicError("Request body is too large.", 413);
		chunks.push(chunk);
	}
	if (!chunks.length) return {};
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw publicError("Request body must be valid JSON.");
	}
}

function send(res, status, body) {
	res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
	res.end(JSON.stringify(body));
}

async function singleSiteForLegacy() {
	const profiles = await loadProfiles();
	if (profiles.length !== 1) throw publicError("Use the site-specific multi-VPN endpoint when more than one VPN site is configured.", 409);
	return profiles[0];
}

async function handle(req, res) {
	if (!tokenMatches(req.headers["x-nyxguard-vpn-token"])) throw publicError("Unauthorized.", 401);
	const url = new URL(req.url, `http://${HOST}:${PORT}`);
	const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

	if (req.method === "GET" && url.pathname === "/sites") return send(res, 200, await getSitesStatus());
	if (req.method === "POST" && url.pathname === "/sites") return send(res, 201, await createSite(await readJsonBody(req)));
	if (segments[0] === "sites" && segments[1]) {
		const metadata = await requireProfile(segments[1]);
		if (req.method === "GET" && segments.length === 2) return send(res, 200, await getSiteStatus(metadata));
		if (req.method === "PATCH" && segments.length === 2) return send(res, 200, await renameSite(metadata, (await readJsonBody(req)).name));
		if (req.method === "DELETE" && segments.length === 2) return send(res, 200, await deleteSite(metadata));
		if (req.method === "POST" && segments[2] === "connect") return send(res, 200, await connectSite(metadata));
		if (req.method === "POST" && segments[2] === "disconnect") return send(res, 200, await disconnectSite(metadata));
		if (req.method === "POST" && segments[2] === "test") return send(res, 200, await testSite(metadata, (await readJsonBody(req)).target));
	}

	// Backward-compatible single-profile endpoints retained for existing 4.0.14 clients.
	if (req.method === "GET" && url.pathname === "/status") {
		const profiles = await loadProfiles();
		if (!profiles.length) return send(res, 200, { agentAvailable: true, configured: false, interfaceUp: false, state: "not-configured", profile: null, autoConnect: false, transferRx: 0, transferTx: 0 });
		const site = await getSiteStatus(profiles[0]);
		return send(res, 200, { ...site, configured: true, profile: site });
	}
	if (req.method === "POST" && url.pathname === "/connect") return send(res, 200, await connectSite(await singleSiteForLegacy()));
	if (req.method === "POST" && url.pathname === "/disconnect") return send(res, 200, await disconnectSite(await singleSiteForLegacy()));
	if (req.method === "POST" && url.pathname === "/test") return send(res, 200, await testSite(await singleSiteForLegacy(), (await readJsonBody(req)).target));
	throw publicError("Not found.", 404);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await mkdir(STATE_DIR, { recursive: true, mode: 0o700 });
	await mkdir(PROFILES_DIR, { recursive: true, mode: 0o700 });
	await mkdir(AUTH_DIR, { recursive: true, mode: 0o750 });
	await migrateLegacyProfile();
	try {
		agentToken = (await readFile(AUTH_PATH, "utf8")).trim();
	} catch {
		agentToken = randomBytes(32).toString("hex");
		await writeFile(AUTH_PATH, `${agentToken}\n`, { mode: 0o440 });
	}
	if (!agentToken) throw new Error("VPN agent authentication token is empty");
	await chown(AUTH_PATH, BACKEND_UID, BACKEND_UID);
	await chmod(AUTH_PATH, 0o440);

	const server = http.createServer((req, res) => {
		handle(req, res).catch((error) => {
			console.error(`[vpn-agent] ${error.message}`);
			send(res, error.status || 500, { error: error.message || "Internal error" });
		});
	});

	server.listen(PORT, HOST, () => {
		console.log(`[vpn-agent] listening on http://${HOST}:${PORT}`);
		loadProfiles().then(async (profiles) => {
			for (const profile of profiles) {
				if (await fileExists(profilePaths(profile).enabled)) {
					await connectSite(profile).catch((error) => console.error(`[vpn-agent] auto-connect failed for ${profile.name}: ${error.message}`));
				}
			}
		}).catch((error) => console.error(`[vpn-agent] auto-connect scan failed: ${error.message}`));
	});

	async function shutdown() {
		server.close();
		process.exit(0);
	}
	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);
}

export { formatStatus, HANDSHAKE_FRESHNESS_SECONDS };
