import { IconArrowsCross, IconBolt, IconBoltOff, IconChartLine, IconDisc, IconShieldCheck } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getNyxGuardAppsSummary, getNyxGuardSummary } from "src/api/backend";
import { HasPermission } from "src/components";
import { useHostReport } from "src/hooks";
import { T } from "src/locale";
import { DEAD_HOSTS, PROXY_HOSTS, REDIRECTION_HOSTS, STREAMS, VIEW } from "src/modules/Permissions";
import styles from "./index.module.css";

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
													{appsSummary.data?.protectedCount?.toLocaleString?.() ?? "--"} Protected Apps
												</div>
												<div className="text-muted">
													Total apps: {appsSummary.data?.totalApps?.toLocaleString?.() ?? "--"}
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
													Requests (1d): {traffic1d.data?.requests?.toLocaleString?.() ?? "--"}
												</div>
												<div className="text-muted">
													Blocked (1d): {traffic1d.data?.blocked?.toLocaleString?.() ?? "--"}
												</div>
											</div>
										</div>
									</div>
								</a>
							</div>
						</HasPermission>
						<HasPermission section={REDIRECTION_HOSTS} permission={VIEW} hideError>
							<div className="col-sm-6 col-lg-4">
								<a
									href="/nyxguard/redirection"
									className="card card-sm card-link card-link-pop"
									onClick={(e) => {
										e.preventDefault();
										navigate("/nyxguard/redirection");
									}}
								>
									<div className="card-body">
										<div className="row align-items-center">
											<div className="col-auto">
												<span className="bg-yellow text-white avatar">
													<IconArrowsCross />
												</span>
											</div>
											<div className="col">
												<T
													id="redirection-hosts.count"
													data={{ count: hostReport?.redirection }}
												/>
											</div>
										</div>
									</div>
								</a>
							</div>
						</HasPermission>
						<HasPermission section={STREAMS} permission={VIEW} hideError>
							<div className="col-sm-6 col-lg-4">
								<a
									href="/nyxguard/stream"
									className="card card-sm card-link card-link-pop"
									onClick={(e) => {
										e.preventDefault();
										navigate("/nyxguard/stream");
									}}
								>
									<div className="card-body">
										<div className="row align-items-center">
											<div className="col-auto">
												<span className="bg-blue text-white avatar">
													<IconDisc />
												</span>
											</div>
											<div className="col">
												<T id="streams.count" data={{ count: hostReport?.stream }} />
											</div>
										</div>
									</div>
								</a>
							</div>
						</HasPermission>
						<HasPermission section={DEAD_HOSTS} permission={VIEW} hideError>
							<div className="col-sm-6 col-lg-4">
								<a
									href="/nyxguard/404"
									className="card card-sm card-link card-link-pop"
									onClick={(e) => {
										e.preventDefault();
										navigate("/nyxguard/404");
									}}
								>
									<div className="card-body">
										<div className="row align-items-center">
											<div className="col-auto">
												<span className="bg-red text-white avatar">
													<IconBoltOff />
												</span>
											</div>
											<div className="col">
												<T id="dead-hosts.count" data={{ count: hostReport?.dead }} />
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
