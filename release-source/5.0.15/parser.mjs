function monthToIndex(mon) {
	const m = mon.toLowerCase();
	const map = {
		jan: 0,
		feb: 1,
		mar: 2,
		apr: 3,
		may: 4,
		jun: 5,
		jul: 6,
		aug: 7,
		sep: 8,
		oct: 9,
		nov: 10,
		dec: 11,
	};
	return typeof map[m] === "number" ? map[m] : null;
}

// time_local example: "08/Feb/2026:20:12:09 +1000"
function parseTimeLocal(timeLocal) {
	try {
		const [dt, off] = timeLocal.split(" ");
		const [dmy, hms] =
			dt.split(":").length > 1 ? [dt.split(":").slice(0, 1)[0], dt.split(":").slice(1).join(":")] : [null, null];
		if (!dmy || !hms || !off) return null;

		const [dd, mon, yyyy] = dmy.split("/");
		const [hh, mm, ss] = hms.split(":");
		const month = monthToIndex(mon);
		if (month === null) return null;

		const year = Number.parseInt(yyyy, 10);
		const day = Number.parseInt(dd, 10);
		const hour = Number.parseInt(hh, 10);
		const minute = Number.parseInt(mm, 10);
		const second = Number.parseInt(ss, 10);
		if ([year, day, hour, minute, second].some((v) => Number.isNaN(v))) return null;

		const sign = off.startsWith("-") ? -1 : 1;
		const offH = Number.parseInt(off.slice(1, 3), 10);
		const offM = Number.parseInt(off.slice(3, 5), 10);
		if ([offH, offM].some((v) => Number.isNaN(v))) return null;
		const offMinutes = sign * (offH * 60 + offM);

		const utcMs = Date.UTC(year, month, day, hour, minute, second) - offMinutes * 60 * 1000;
		return utcMs;
	} catch {
		return null;
	}
}

const lineRe =
	/^\[(?<time>[^\]]+)\]\s+(?<cache>\S+)\s+(?<upstream_status>\S+)\s+(?<status>\d{3}|-)\s+-\s+(?<method>\S+)\s+(?<scheme>\S+)\s+(?<host>\S+)\s+"(?<uri>[^"]*)"\s+\[Client\s+(?<ip>[^\]]+)\](?:\s+\[Country\s+(?<country>[^\]]+)\])?(?:\s+\[Rx\s+(?<rx>[^\]]+)\])?(?:\s+\[Tx\s+(?<tx>[^\]]+)\])?/;

function parseByteCount(value) {
	const v = String(value ?? "").trim();
	if (!v || v === "-") return null;
	const n = /^\d+$/.test(v) ? Number(v) : NaN;
	return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

function parseAccessLine(line) {
	const m = lineRe.exec(line);
	if (!m?.groups) return null;
	const ts = parseTimeLocal(m.groups.time);
	if (!ts) return null;
	const statusRaw = m.groups.status;
	const status = statusRaw === "-" ? null : Number.parseInt(statusRaw, 10);
	return {
		ts,
		status,
		method: m.groups.method,
		scheme: m.groups.scheme,
		host: m.groups.host,
		uri: m.groups.uri,
		ip: m.groups.ip,
		country: m.groups.country && m.groups.country !== "-" ? m.groups.country : null,
		rxBytes: parseByteCount(m.groups.rx),
		txBytes: parseByteCount(m.groups.tx),
	};
}


export {parseAccessLine};
