export const STATES = Object.freeze(["PASS", "WARNING", "FAIL", "SKIPPED"]);

export function result(check, state, evidence = {}) {
	if (!/^[a-z][a-z0-9_]{1,63}$/.test(check) || !STATES.includes(state)) {
		throw new TypeError("Invalid diagnostic result");
	}
	return { check, state, evidence };
}

export function finiteNumber(value, fallback = null) {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
