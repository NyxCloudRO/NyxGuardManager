import { global as logger } from "../logger.js";
import errs from "../lib/error.js";

const VALID_TYPES = ["webhook", "slack", "email"];
const VALID_EVENTS = ["attack_ban", "cert_expiring", "cert_renewed", "failed_login"];
const EVENT_LABELS = {
 test: "Manual Test Notification",
	attack_ban: "IP Auto-Ban",
	cert_expiring: "Certificate Expiring",
	cert_renewed: "Certificate Renewed",
	failed_login: "Failed Login",
};
const FIELD_LABELS = {
 channel:"Channel",message:"Message",
	banUntil: "Banned Until",
	domains: "Domains",
	expiresOn: "Expires On",
	host: "Host",
	id: "ID",
	identity: "Identity",
	ip: "IP",
	niceName: "Name",
	note: "Note",
	previousExpiresOn: "Previous Expiry",
	provider: "Provider",
	reason: "Reason",
	userAgent: "User Agent",
	type: "Type",
};
const DATE_FIELDS = new Set(["banUntil", "expiresOn", "previousExpiresOn"]);
let deliveryTableReady;

// ── Validation helpers ────────────────────────────────────────────────────────

function normalizeEvents(raw){
 if(!Array.isArray(raw)||raw.some(event=>!VALID_EVENTS.includes(event)))throw new errs.ValidationError('Invalid notification events');
 return [...new Set(raw)];
}
function parseEvents(raw){
 try{const events=typeof raw==='string'?JSON.parse(raw):raw;return Array.isArray(events)?[...new Set(events.filter(event=>VALID_EVENTS.includes(event)))]:[];}catch{return [];}
}
const manualTests=new Map();
function safeDeliveryError(error){return /^(?:Webhook|Slack webhook) HTTP \d{3}$/.test(error?.message||'')?error.message:'Notification delivery could not be confirmed';}

function parseConfig(raw) {
	try {
		const config=typeof raw === "string" ? JSON.parse(raw) : raw || {};if(config.webhook_url!==undefined&&config.webhookUrl===undefined){const {webhook_url,...rest}=config;return {...rest,webhookUrl:webhook_url};}return config;
	} catch {
		return {};
	}
}

function normalizeKeyPart(value) {
	if (Array.isArray(value)) return value.map(normalizeKeyPart).sort().join(",");
	return String(value ?? "")
		.trim()
		.toLowerCase();
}

function normalizeDate(value) {
	const ms = Date.parse(String(value ?? ""));
	return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function mysqlDate(value) {
	const ms = Date.parse(String(value ?? ""));
	// Conservative TIMESTAMP compatibility: far-future event keys use an unbounded marker.
	if (!Number.isFinite(ms)||ms>Date.UTC(2038,0,19,3,14,7)) return null;
	return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

function stableJson(value) {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value ?? null);
}

function buildEventKey(eventType, eventData) {
	const data = eventData || {};
	if (eventType === "attack_ban") {
		return [
			"attack_ban",
			normalizeKeyPart(data.ip),
			normalizeKeyPart(data.type),
			normalizeKeyPart(data.host),
		].join("|");
	}
	if (eventType === "cert_expiring") {
		return [
			"cert_expiring",
			normalizeKeyPart(data.id || data.niceName || data.domains),
			normalizeDate(data.expiresOn) || normalizeKeyPart(data.expiresOn),
		].join("|");
	}
	if (eventType === "cert_renewed") {
		return [
			"cert_renewed",
			normalizeKeyPart(data.id || data.niceName || data.domains),
			normalizeDate(data.previousExpiresOn) || normalizeKeyPart(data.previousExpiresOn),
			normalizeDate(data.expiresOn) || normalizeKeyPart(data.expiresOn),
		].join("|");
	}
	if (eventType === "failed_login") {
		return [
			"failed_login",
			normalizeKeyPart(data.identity),
			normalizeKeyPart(data.ip),
			normalizeKeyPart(data.reason),
		].join("|");
	}
	return `${eventType}|${stableJson(data)}`;
}

function dedupeUntilForEvent(eventType, eventData) {
	if (eventType === "attack_ban") return mysqlDate(eventData?.banUntil);
	if (eventType === "cert_expiring") return mysqlDate(eventData?.expiresOn);
	if (eventType === "failed_login") return mysqlDate(new Date(Date.now() + 15 * 60 * 1000));
	return null;
}

async function ensureDeliveryTable(knex) {
	if (!deliveryTableReady) {
		deliveryTableReady = (async () => {
			const exists = await knex.schema.hasTable("notification_delivery");
			if (exists) return;
			await knex.schema.createTable("notification_delivery", (table) => {
				table.increments("id").primary();
				table.integer("channel_id").notNullable();
				table.string("event", 64).notNullable();
				table.string("event_key", 191).notNullable();
				table.timestamp("dedupe_until").nullable();
				table.timestamp("created_on").notNullable();
				table.timestamp("modified_on").notNullable();
				table.unique(["channel_id", "event", "event_key"], "notification_delivery_unique");
			});
		})().catch((err) => {
			deliveryTableReady = undefined;
			throw err;
		});
	}
	await deliveryTableReady;
}

async function shouldDispatchNotification(knex, channel, eventType, eventData) {
	try {
		await ensureDeliveryTable(knex);
		const eventKey = buildEventKey(eventType, eventData);
		const dedupeUntil = dedupeUntilForEvent(eventType, eventData);
		const query=knex("notification_delivery").where({channel_id:channel.id,event:eventType,event_key:eventKey});
        if(/mysql/.test(knex.client.config.client))query.select('*',knex.raw("DATE_FORMAT(dedupe_until,'%Y-%m-%d %H:%i:%s') AS nyx_until"));
        const row=await query.first();
        // A delivery record means the transport acknowledged success. Failed attempts
        // must remain retryable; local in-flight coalescing prevents parallel sends.
        if(!row)return {shouldSend:true,eventKey,dedupeUntil};

		const nowMs = Date.now();
		const rowUntilMs = row.nyx_until ? Date.parse(row.nyx_until.replace(" ","T")+"Z") : row.dedupe_until ? Date.parse(String(row.dedupe_until)) : Number.POSITIVE_INFINITY;
		const nextUntilMs = dedupeUntil ? Date.parse(dedupeUntil) : Number.NaN;
		if (Number.isFinite(nextUntilMs) && (!Number.isFinite(rowUntilMs) || nextUntilMs > rowUntilMs)) {
			await knex("notification_delivery")
				.where({ id: row.id })
				.update({ dedupe_until: dedupeUntil, modified_on: knex.fn.now() });
		}
		if (!Number.isFinite(rowUntilMs) || rowUntilMs > nowMs) {
			return { shouldSend: false, eventKey, dedupeUntil };
		}
		return { shouldSend: true, eventKey, dedupeUntil };
	} catch (err) {
		logger.warn(`Notification dedupe unavailable for event "${eventType}": ${err?.message ?? err}`);
		return { shouldSend: true, eventKey: null, dedupeUntil: null };
	}
}

async function markNotificationDelivered(knex, channel, eventType, eventKey, dedupeUntil) {
	if (!eventKey) return;
	const payload = {
		channel_id: channel.id,
		event: eventType,
		event_key: eventKey,
		dedupe_until: dedupeUntil,
		modified_on: knex.fn.now(),
	};
	try {
		const existing = await knex("notification_delivery")
			.where({ channel_id: channel.id, event: eventType, event_key: eventKey })
			.first();
		if (existing) {
			await knex("notification_delivery").where({ id: existing.id }).update(payload);
			return;
		}
		await knex("notification_delivery").insert({ ...payload, created_on: knex.fn.now() });
	} catch (err) {
		if (err?.code !== "ER_DUP_ENTRY" && err?.code !== "SQLITE_CONSTRAINT") throw err;
		await knex("notification_delivery")
			.where({ channel_id: channel.id, event: eventType, event_key: eventKey })
			.update(payload);
	}
}

function validHttpUrl(value){try{return ["http:","https:"].includes(new URL(String(value)).protocol)}catch{return false;}}
function validateChannel(data) {
	if (!VALID_TYPES.includes(data.type)) {
		throw new errs.ValidationError(`Invalid channel type: ${data.type}`);
	}
	if (!data.name || !String(data.name).trim()) {
		throw new errs.ValidationError("Channel name is required");
	}
	const config = parseConfig(data.config_json ?? data.config);
	if (data.type === "webhook") {
		if (!validHttpUrl(config.url)) {
			throw new errs.ValidationError("Webhook URL is required and must start with http");
		}
	}
	if (data.type === "slack") {
		if (!validHttpUrl(config.webhookUrl)) {
			throw new errs.ValidationError("Slack webhook URL is required and must start with http");
		}
	}
	if (data.type === "email") {
		if (!config.host) throw new errs.ValidationError("SMTP host is required");
		if (!config.to) throw new errs.ValidationError("Email 'to' address is required");
		if (!config.from) throw new errs.ValidationError("Email 'from' address is required");
	}
}

// ── Channel dispatchers ───────────────────────────────────────────────────────

function isDiscordWebhook(url) {
	try {
		const parsed = new URL(url);
		return parsed.hostname === "discord.com" || parsed.hostname === "discordapp.com";
	} catch {
		return false;
	}
}

function readableValue(key,value){
 if(DATE_FIELDS.has(key)){const ms=Date.parse(String(value));if(Number.isFinite(ms))return new Date(ms).toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC');}
 if(key==='type'){const names={sqli:'SQL injection (sqli)',ddos:'DDoS (ddos)',bot:'Bot (bot)',authfail:'Failed authentication (authfail)'};if(names[value])return names[value];}
 if(Array.isArray(value))return value.map(v=>String(v)).join(', ');
 if(typeof value==='boolean')return value?'Yes':'No';
 return value&&typeof value==='object'?JSON.stringify(value):String(value??'');
}
const slackEscape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function formatDiscordValue(key, value) {
	if (DATE_FIELDS.has(key)) {
		const ms = Date.parse(String(value));
		if (Number.isFinite(ms)) {
			const seconds = Math.floor(ms / 1000);
			return `<t:${seconds}:F>\n<t:${seconds}:R>`;
		}
	}
	const text = readableValue(key,value);
	return text.length > 1000 ? `${text.slice(0, 997)}...` : text;
}

function formatEventFields(eventData) {
	return Object.entries(eventData || {})
		.filter(([, val]) => val !== undefined && val !== null && String(val) !== "")
		.map(([key, val]) => ({
			name: FIELD_LABELS[key] || key,
			value: formatDiscordValue(key, val),
			inline: !["domains", "note", "reason", "userAgent"].includes(key),
		}));
}

function buildDiscordPayload(eventType, eventData) {
	const title = EVENT_LABELS[eventType] ?? eventType;
	const colors = {
		attack_ban: 0xff4d4f,
		cert_expiring: 0xf5a623,
		cert_renewed: 0x36c275,
		failed_login: 0xff3860,
	};
	return {
		username: "NyxGuard Manager",
		allowed_mentions: { parse: [] },
		embeds: [
			{
				author: { name: "NyxGuard Manager" },
				title: eventType === "test" ? "NyxGuard Manager — Test Notification" : `Alert: ${title}`,
				description: ({test:"Manual connectivity test. This is not an operational alert.",attack_ban:"An IP address was automatically banned.",cert_expiring:"A certificate is approaching its expiration date.",cert_renewed:"A certificate was renewed.",failed_login:"A sign-in attempt failed."})[eventType] || "Notification details are attached below.",
				color: colors[eventType] ?? 0x4da3ff,
				timestamp: new Date().toISOString(),
				fields: formatEventFields(eventData),
				footer: { text: "NyxGuard Manager" },
			},
		],
	};
}

async function dispatchWebhook(config, eventType, eventData) {
	const payload = isDiscordWebhook(config.url)
		? buildDiscordPayload(eventType, eventData)
		: {
				event: eventType,
				timestamp: new Date().toISOString(),
				data: eventData,
				source: "NyxGuard Manager",
			};
	const body = JSON.stringify(payload);

	// Parse optional custom headers: "Header-Name: value" per line
	const extraHeaders = {};
	if (config.headers) {
		for (const line of String(config.headers).split("\n")) {
			const sep = line.indexOf(":");
			if (sep > 0) {
				const k = line.slice(0, sep).trim();
				const v = line.slice(sep + 1).trim();
				if (k) extraHeaders[k] = v;
			}
		}
	}

	const response = await fetch(config.url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"User-Agent": "NyxGuardManager/4.0",
			...extraHeaders,
		},
		body,
		signal: AbortSignal.timeout(10_000),
	});

	if (!response.ok) {
		throw new Error(`Webhook HTTP ${response.status}`);
	}
}

async function dispatchSlack(config, eventType, eventData) {
	const fields = Object.entries(eventData || {}).map(([key, val]) => ({
		type: "mrkdwn",
		text: `*${FIELD_LABELS[key]||key}:* ${slackEscape(readableValue(key,val))}`,
	}));

	const payload = {
		blocks: [
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: `*NyxGuard Manager — ${EVENT_LABELS[eventType] ?? eventType}*\n${fields.map((f) => f.text).join("\n")}`,
				},
			},
			{
				type: "context",
				elements: [
					{
						type: "mrkdwn",
						text: `NyxGuard Manager • ${new Date().toISOString()}`,
					},
				],
			},
		],
	};

	const response = await fetch(config.webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(10_000),
	});

	if (!response.ok) {
		throw new Error(`Slack webhook HTTP ${response.status}`);
	}
}

async function dispatchEmail(config, eventType, eventData) {
	// Lazy-import nodemailer so it doesn't break startup if the package is missing.
	let nodemailer;
	try {
		nodemailer = (await import("nodemailer")).default;
	} catch {
		throw new Error("nodemailer package is not installed");
	}

	const port = Number(config.port) || 587;
	const wantsTls = config.tls === true || config.tls === "true" || config.tls === 1 || config.tls === "1";
	const transporter = nodemailer.createTransport({
		host: config.host,
		port,
		secure: wantsTls && port === 465,
		requireTLS: wantsTls && port !== 465,
		connectionTimeout: 10_000,
		greetingTimeout: 10_000,
		socketTimeout: 15_000,
		auth: config.user
			? {
					user: config.user,
					pass: config.pass || "",
				}
			: undefined,
	});

	const subject = `[NyxGuard] ${EVENT_LABELS[eventType] ?? eventType}`;
	const textLines = ["NyxGuard Manager", `Event: ${EVENT_LABELS[eventType]??eventType}`, `Time: ${new Date().toISOString().replace("T"," ").replace(/\.\d{3}Z$/," UTC")}`, ""];
	for (const [key, val] of Object.entries(eventData || {})) {
		textLines.push(`${FIELD_LABELS[key]||key}: ${readableValue(key,val)}`);
	}
	textLines.push("", "— NyxGuard Manager");

	await transporter.sendMail({
		from: config.from,
		to: config.to,
		subject,
		text: textLines.join("\n"),
	});
}

// ── Core dispatch ─────────────────────────────────────────────────────────────

const deliveryFlights=new WeakMap();
async function sendOne(knex,ch,eventType,eventData){
 let active=deliveryFlights.get(knex);if(!active){active=new Map();deliveryFlights.set(knex,active);}
 const key=ch.id+':'+eventType+':'+buildEventKey(eventType,eventData);if(active.has(key))return active.get(key);
 const operation=(async()=>{
 try {
 const config=parseConfig(ch.config_json);
 	const delivery = await shouldDispatchNotification(knex, ch, eventType, eventData);
 	if (!delivery.shouldSend) return;

 	if (ch.type === "webhook") {
 		await dispatchWebhook(config, eventType, eventData);
 	} else if (ch.type === "slack") {
 		await dispatchSlack(config, eventType, eventData);
 	} else if (ch.type === "email") {
 		await dispatchEmail(config, eventType, eventData);
 	}
 	await markNotificationDelivered(knex, ch, eventType, delivery.eventKey, delivery.dedupeUntil);
 	logger.info(`Notification sent [${ch.type}] channel "${ch.name}" for event "${eventType}"`);
 } catch (err) {
 	logger.warn(
 		`Notification failed [${ch.type}] channel "${ch.name}" for event "${eventType}": ${safeDeliveryError(err)}`,
 	);
 }
 })();active.set(key,operation);try{return await operation;}finally{if(active.get(key)===operation)active.delete(key);}
}
async function send(knex,eventType,eventData){
 let channels;try{channels=await knex('notification_channel').where({enabled:1});}catch{return;}
 for(const ch of channels){if(!parseEvents(ch.events).includes(eventType))continue;await sendOne(knex,ch,eventType,eventData);}
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

function maskConfig(type, config) {
	// Mask sensitive credential fields in API responses so passwords are never
	// returned in plaintext over the wire. The frontend must treat the masked
	// sentinel value as "unchanged" and not write it back to the database.
	if (type === "email" && config.pass) {
		return { ...config, pass: "••••••••" };
	}
	return config;
}

function rowToApi(row) {
	const config = parseConfig(row.config_json);
	const {config_json,...publicRow}=row;
	return {
		...publicRow,
		config: maskConfig(row.type, config),
		events: parseEvents(row.events),
	};
}

const internalNotifications = {
	async list(knex) {
		const rows = await knex("notification_channel").orderBy("id", "asc");
		return rows.map(rowToApi);
	},

	async get(knex, id) {
		const row = await knex("notification_channel").where({ id }).first();
		if (!row) throw new errs.ItemNotFoundError();
		return rowToApi(row);
	},

	async create(knex, data) {
		const config = parseConfig(data.config || {});
		const events = normalizeEvents(data.events===undefined?[]:data.events);
		const payload = {
			name: String(data.name || "").trim(),
			type: String(data.type || "webhook"),
			config_json: JSON.stringify(config),
			events: JSON.stringify(events),
			enabled: data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
		};
		validateChannel({ ...payload, config_json: payload.config_json });
		const [id] = await knex("notification_channel").insert({
			...payload,
			created_on: knex.fn.now(),
			modified_on: knex.fn.now(),
		});
		return internalNotifications.get(knex, id);
	},

	async update(knex, id, data) {
		const existing = await internalNotifications.get(knex, id);
		let config = parseConfig(data.config !== undefined ? data.config : existing.config);
const rawConfig= parseConfig((await knex("notification_channel").where({id}).first())?.config_json);
const preserve=(next,previous)=>next==="[REDACTED]"?previous:Array.isArray(next)?next.map((value,index)=>preserve(value,previous?.[index])):next&&typeof next==="object"?Object.fromEntries(Object.entries(next).map(([key,value])=>[key,preserve(value,previous?.[key])])):next;
config=preserve(config,rawConfig);

		// If the incoming email password is our masked sentinel (sent back by the UI
		// unchanged), preserve the real password from the raw DB row instead of
		// overwriting it with the sentinel value.
		if (config && config.pass === "••••••••") {
			const rawRow = await knex("notification_channel").where({ id }).first();
			const rawConfig = parseConfig(rawRow?.config_json);
			config = { ...config, pass: rawConfig.pass ?? "" };
		}

		const events = data.events !== undefined
			? normalizeEvents(data.events)
			: existing.events;
		const payload = {
			name: data.name !== undefined ? String(data.name).trim() : existing.name,
			type: data.type !== undefined ? String(data.type) : existing.type,
			config_json: JSON.stringify(config),
			events: JSON.stringify(events),
			enabled: data.enabled !== undefined ? (data.enabled ? 1 : 0) : existing.enabled,
		};
		validateChannel({ ...payload, config_json: payload.config_json });
		await knex("notification_channel").where({ id }).update({
			...payload,
			modified_on: knex.fn.now(),
		});
		return internalNotifications.get(knex, id);
	},

	async remove(knex, id) {
		await internalNotifications.get(knex, id); // throws if not found
		await knex("notification_channel").where({ id }).delete();
	},

	async test(knex, id) {
        if(manualTests.has(id))return manualTests.get(id);
        const delivery=(async()=>{
		const ch = await internalNotifications.get(knex, id);
		let config = ch.config;
		if (ch.type === "email") {
			const rawRow = await knex("notification_channel").where({ id }).first();
			config = parseConfig(rawRow?.config_json);
		}
		const testEvent = "test";
		const testData = {channel:ch.name,message:"Manual connectivity test. This is not an operational alert."};
        validateChannel({name:ch.name,type:ch.type,config});

		if (ch.type === "webhook") {
			await dispatchWebhook(config, testEvent, testData);
		} else if (ch.type === "slack") {
			await dispatchSlack(config, testEvent, testData);
		} else if (ch.type === "email") {
			await dispatchEmail(config, testEvent, testData);
		}
        })();manualTests.set(id,delivery);
        try{return await delivery;}finally{if(manualTests.get(id)===delivery)manualTests.delete(id);}
	},

	send,
};

export default internalNotifications;
