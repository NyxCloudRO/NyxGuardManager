import {
	IconActivityHeartbeat,
	IconAlertTriangle,
	IconArrowsUpDown,
	IconBolt,
	IconChartLine,
	IconShieldCheck,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getNyxGuardAppsSummary, getNyxGuardAttacksSummary, getNyxGuardSummary } from "src/api/backend";
import { HasPermission } from "src/components";
import { useHostReport } from "src/hooks";
import { T } from "src/locale";
import { PROXY_HOSTS, VIEW } from "src/modules/Permissions";
import styles from "./index.module.css";

function formatBytes(bytes: number) {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let n = bytes;
	let u = 0;
	while (n >= 1024 && u < units.length - 1) {
		n /= 1024;
		u += 1;
	}
	const digits = u === 0 ? 0 : n >= 100 ? 0 : n >= 10 ? 1 : 2;
	return `${n.toFixed(digits)} ${units[u]}`;
}

const Dashboard = () => {
	const { data: hostReport } = useHostReport();
	const navigate = useNavigate();

	const appsSummary = useQuery({
		queryKey: ["nyxguard", "apps", "summary"],
		queryFn: () => getNyxGuardAppsSummary(),
		refetchInterval: 60000,
	});

	const traffic1d = useQuery({
		queryKey: ["nyxguard", "summary", "1d"],
		queryFn: () => getNyxGuardSummary(1440, 1),
		refetchInterval: 60000,
	});

	const attacks1d = useQuery({
		queryKey: ["nyxguard", "attacks", "summary", "1d"],
		queryFn: () => getNyxGuardAttacksSummary(1440),
		refetchInterval: 60000,
	});

	const blocked1d = traffic1d.data?.blocked ?? 0;
	const requests1d = traffic1d.data?.requests ?? 0;
	const blockedRate1d = requests1d > 0 ? (blocked1d / requests1d) * 100 : 0;

	return (
		<div className={styles.wrapper}>
			<div className={`row row-deck row-cards ${styles.cards}`}>
				<div className="col-12 mt-2 mb-0">
					<div className="row row-cards justify-content-center">
						<HasPermission section={PROXY_HOSTS} permission={VIEW} hideError>
							<div className="col-sm-6 col-lg-4">
								<a
									href="/nyxguard/proxy"
									className="card card-sm card-link card-link-pop"
									onClick={(e) => {
										e.preventDefault();
										navigate("/nyxguard/proxy");
									}}
								>
									<div className="card-body">
										<div className="row align-items-center">
											<div className="col-auto">
												<span className="bg-green text-white avatar">
													<IconBolt />
												</span>
											</div>
											<div className="col">
												<div className="font-weight-medium">
													<T id="proxy-hosts.count" data={{ count: hostReport?.proxy }} />
												</div>
											</div>
										</div>
									</div>
								</a>
							</div>
						</HasPermission>
						<HasPermission section={PROXY_HOSTS} permission={VIEW} hideError>
							<div className="col-sm-6 col-lg-4">
								<a
									href="/nyxguard/apps"
									className="card card-sm card-link card-link-pop"
									onClick={(e) => {
										e.preventDefault();
										navigate("/nyxguard/apps");
									}}
								>
									<div className="card-body">
										<div className="row align-items-center">
											<div className="col-auto">
												<span className="bg-teal text-white avatar">
													<IconShieldCheck />
												</span>
											</div>
											<div className="col">
												<div className="font-weight-medium">
													<T id="dashboard.protected-apps" data={{ count: appsSummary.data?.protectedCount?.toLocaleString?.() ?? "--" }} />
												</div>
												<div className="text-muted">
													<T id="dashboard.total-apps" data={{ count: appsSummary.data?.totalApps?.toLocaleString?.() ?? "--" }} />
												</div>
											</div>
										</div>
									</div>
								</a>
							</div>
						</HasPermission>
							<HasPermission section={PROXY_HOSTS} permission={VIEW} hideError>
								<div className="col-sm-6 col-lg-4">
									<a
										href="/nyxguard"
										className="card card-sm card-link card-link-pop"
										onClick={(e) => {
											e.preventDefault();
											navigate("/nyxguard");
										}}
									>
										<div className="card-body">
											<div className="row align-items-center">
												<div className="col-auto">
												<span className="bg-purple text-white avatar">
													<IconChartLine />
												</span>
											</div>
											<div className="col">
												<div className="font-weight-medium">
													<T id="dashboard.requests-1d" data={{ count: traffic1d.data?.requests?.toLocaleString?.() ?? "--" }} />
												</div>
												<div className="text-muted">
													<T id="dashboard.blocked-1d" data={{ count: traffic1d.data?.blocked?.toLocaleString?.() ?? "--" }} />
												</div>
											</div>
										</div>
									</div>
								</a>
							</div>
						</HasPermission>
						<HasPermission section={PROXY_HOSTS} permission={VIEW} hideError>
							<div className="col-sm-6 col-lg-4">
								<a
									href="/nyxguard"
									className="card card-sm card-link card-link-pop"
									onClick={(e) => {
										e.preventDefault();
										navigate("/nyxguard");
									}}
								>
									<div className="card-body">
										<div className="row align-items-center">
											<div className="col-auto">
												<span className="bg-indigo text-white avatar">
													<IconArrowsUpDown />
												</span>
											</div>
											<div className="col">
												<div className="font-weight-medium">
													<T
														id="dashboard.traffic-rx-1d"
														data={{ bytes: typeof traffic1d.data?.rxBytes === "number" ? formatBytes(traffic1d.data.rxBytes) : "--" }}
													/>
												</div>
												<div className="text-muted">
													<T
														id="dashboard.traffic-tx-1d"
														data={{ bytes: typeof traffic1d.data?.txBytes === "number" ? formatBytes(traffic1d.data.txBytes) : "--" }}
													/>
												</div>
											</div>
										</div>
									</div>
								</a>
							</div>
						</HasPermission>
						<HasPermission section={PROXY_HOSTS} permission={VIEW} hideError>
							<div className="col-sm-6 col-lg-4">
								<a
									href="/nyxguard/attacks"
									className="card card-sm card-link card-link-pop"
									onClick={(e) => {
										e.preventDefault();
										navigate("/nyxguard/attacks");
									}}
								>
									<div className="card-body">
										<div className="row align-items-center">
											<div className="col-auto">
												<span className="bg-orange text-white avatar">
													<IconAlertTriangle />
												</span>
												</div>
												<div className="col">
													<div className="font-weight-medium">
														<T
															id="dashboard.blocked-rate-1d"
															data={{ rate: Number.isFinite(blockedRate1d) ? `${blockedRate1d.toFixed(1)}%` : "--" }}
														/>
													</div>
													<div className="text-muted">
														<T
															id="dashboard.blocked-over-requests"
															data={{
																blocked: traffic1d.data?.blocked?.toLocaleString?.() ?? "--",
																requests: traffic1d.data?.requests?.toLocaleString?.() ?? "--",
															}}
														/>
													</div>
												</div>
											</div>
										</div>
								</a>
							</div>
						</HasPermission>
						<HasPermission section={PROXY_HOSTS} permission={VIEW} hideError>
							<div className="col-sm-6 col-lg-4">
								<a
									href="/nyxguard"
									className="card card-sm card-link card-link-pop"
									onClick={(e) => {
										e.preventDefault();
										navigate("/nyxguard");
									}}
								>
									<div className="card-body">
										<div className="row align-items-center">
											<div className="col-auto">
												<span className="bg-cyan text-white avatar">
													<IconActivityHeartbeat />
													</span>
												</div>
												<div className="col">
													<div className="font-weight-medium">
														<T id="dashboard.attacks-last-1d" />
													</div>
													<div className="text-muted">
														<T
															id="dashboard.attacks-breakdown"
															data={{
																total: attacks1d.data?.total?.toLocaleString?.() ?? "--",
																sqli: attacks1d.data?.byType?.sqli?.toLocaleString?.() ?? "--",
																ddos: attacks1d.data?.byType?.ddos?.toLocaleString?.() ?? "--",
																bot: attacks1d.data?.byType?.bot?.toLocaleString?.() ?? "--",
															}}
														/>
													</div>
												</div>
											</div>
										</div>
								</a>
							</div>
						</HasPermission>
					</div>
				</div>
			</div>
		</div>
	);
};

export default Dashboard;
