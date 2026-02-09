import { useHealth } from "src/hooks";

export function SiteFooter() {
	const health = useHealth();
	const v = health.data?.version;
	const build = health.data?.build;
	const versionText =
		v && Number.isFinite(v.major) && Number.isFinite(v.minor) && Number.isFinite(v.revision)
			? `${v.major}.${v.minor}.${v.revision}`
			: "";

	const buildTextParts: string[] = [];
	if (build?.version) {
		buildTextParts.push(`v${build.version}`);
	} else if (versionText) {
		buildTextParts.push(`v${versionText}`);
	}
	if (build?.date) {
		// Prefer just the date portion when timestamps are provided.
		buildTextParts.push(build.date.split(" ")[0]);
	}

	return (
		<footer className="footer d-print-none py-3">
			<div className="container-xl">
				<div className="text-center text-secondary">
					NyxGuard Manager · {buildTextParts.length ? buildTextParts.join(" · ") : "…"}
				</div>
			</div>
		</footer>
	);
}
