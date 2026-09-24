// Bundle data is selected by schema first. This pass is a second, fail-closed boundary.
const BLOCKED_KEY = /(?:pass(?:word|phrase)?|secret|token|cookie|session|authorization|api[_-]?key|private[_-]?key|credential|database[_-]?url|dsn|webhook|recovery|s3|access[_-]?key|encryption[_-]?key|signing[_-]?key|dns[_-]?provider|acme)/i;
const SECRET_VALUE = /-----BEGIN [^-]*PRIVATE KEY-----|\bBearer\s+\S+|\b(?:password|token|secret|api[_-]?key|authorization)\s*[:=]\s*\S+|(?:mysql|postgres(?:ql)?|mongodb|redis):\/\/[^\s/@:]+:[^\s/@]+@|https?:\/\/[^\s/@:]+:[^\s/@]+@/i;
const MAX_STRING = 240;
const MAX_ARRAY = 100;
const MAX_DEPTH = 8;

export function redact(value, depth = 0) {
	if (depth > MAX_DEPTH) throw new TypeError("Diagnostic nesting exceeds limit");
	if (value === null || typeof value === "boolean") return value;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new TypeError("Non-finite diagnostic number");
		return value;
	}
	if (typeof value === "string") {
		if (value.length > MAX_STRING || SECRET_VALUE.test(value) || /[\u0000-\u001f]/.test(value)) return "[REDACTED]";
		return value;
	}
	if (Array.isArray(value)) {
		if (value.length > MAX_ARRAY) throw new TypeError("Diagnostic array exceeds limit");
		return value.map((item) => redact(item, depth + 1));
	}
	if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
		const out = Object.create(null);
		for (const [key, item] of Object.entries(value)) {
			if (BLOCKED_KEY.test(key)) continue;
			if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)) throw new TypeError("Unsafe diagnostic field");
			out[key] = redact(item, depth + 1);
		}
		return out;
	}
	throw new TypeError("Unsupported diagnostic value");
}
