import { redact } from "./redaction.mjs";
import { STATES } from "./result.mjs";

export const MAX_BUNDLE_BYTES = 1024 * 1024;
const MAX_RESULTS = 100;
const checkName = /^[a-z][a-z0-9_]{1,63}$/;
const safeVersion = /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]{1,64})?$/;
const safeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVIDENCE_FIELDS = new Set(["free_percent", "seconds", "count", "host_id", "status_code", "days_remaining"]);

function selectEvidence(source) {
	if (!source || typeof source !== "object" || Array.isArray(source)) throw new TypeError("Invalid diagnostic evidence");
	const selected = {};
	for (const [key, value] of Object.entries(source)) {
		if (!EVIDENCE_FIELDS.has(key)) continue;
		if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e12) {
			throw new TypeError("Invalid diagnostic evidence value");
		}
		selected[key] = value;
	}
	return redact(selected);
}

function selectResults(items) {
	if (!Array.isArray(items) || items.length > MAX_RESULTS) throw new TypeError("Invalid diagnostic list");
	return items.map((item) => {
		if (!item || !checkName.test(item.check) || !STATES.includes(item.state)) {
			throw new TypeError("Invalid diagnostic result");
		}
		return { check: item.check, state: item.state, evidence: selectEvidence(item.evidence ?? {}) };
	});
}

export function buildSupportBundle({ version, installationId, system = [], routing = [], tls = [], troubleshooting = [], now = new Date() }) {
	if (!safeVersion.test(version) || !safeUuid.test(installationId)) throw new TypeError("Invalid bundle identity");
	const generatedAt = now instanceof Date && Number.isFinite(now.getTime()) ? now.toISOString() : null;
	if (!generatedAt || Math.abs(Date.now() - now.getTime()) > 5 * 60 * 1000) throw new TypeError("Bundle timestamp is not recent");
	const bundle = {
		format: "nyxguard-support-bundle-v1",
		generated_at: generatedAt,
		support_record: { format: "nyxguard-support-record-v1" },
		application: { version },
		installation: { id: installationId },
		diagnostics: {
			system: selectResults(system),
			routing: selectResults(routing),
			tls: selectResults(tls),
			troubleshooting: selectResults(troubleshooting),
		},
	};
	const bytes = Buffer.from(JSON.stringify(bundle), "utf8");
	if (bytes.length > MAX_BUNDLE_BYTES) throw new RangeError("Support bundle exceeds 1 MiB");
	return { bundle, bytes };
}
