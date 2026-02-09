import { useHealth } from "src/hooks";

export function SiteFooter() {
	const health = useHealth();
	const v = health.data?.version;
	const versionText =
		v && Number.isFinite(v.major) && Number.isFinite(v.minor) && Number.isFinite(v.revision)
			? `${v.major}.${v.minor}.${v.revision}`
			: "";

	return (
		<footer className="footer d-print-none py-3">
			<div className="container-xl">
				<div className="text-center text-secondary">
					NyxGuard Manager · Version {versionText || "…"}
				</div>
			</div>
		</footer>
	);
}
