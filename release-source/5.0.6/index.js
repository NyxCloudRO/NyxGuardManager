#!/usr/bin/env node

import app from "./app.js";
import db from "./db.js";
import internalAttackMonitor from "./internal/attack-monitor.js";
import internalCertificate from "./internal/certificate.js";
import internalGeoIpUpdate from "./internal/geoip-update.js";
import internalIpRanges from "./internal/ip_ranges.js";
import internalNyxGuard from "./internal/nyxguard.js";
import internalTrafficMonitor from "./internal/traffic-monitor.js";
import updateManager from "./internal/update-manager.js";
import internalWebThreatMonitor from "./internal/web-threat-monitor.js";
import { global as logger } from "./logger.js";
import { migrateUp } from "./migrate.js";
import { getCompiledSchema } from "./schema/index.js";
import setup, {setupExternal} from "./setup.js";
import {markInitialized} from "./internal/readiness.mjs";
import {advance,complete,fail} from "./internal/startup-progress.mjs";

const IP_RANGES_FETCH_ENABLED = process.env.IP_RANGES_FETCH_ENABLED !== "false";

let _startAttempt = 0;

async function appStart() {
	return migrateUp()
		.then(()=>{advance('configuration');return setup();})
		.then(()=>{advance('schema');return getCompiledSchema();})
		.then(() => {
			// Apply NyxGuard-generated nginx config/log settings on startup.
			return internalNyxGuard.nginx.apply(db()).catch((err) => {
				logger.warn("NyxGuard nginx apply failed, continuing anyway:", err?.message ?? err);
			});
		})
		.then(() => {
			if (!IP_RANGES_FETCH_ENABLED) {
				logger.info("IP Ranges fetch is disabled by environment variable");
				return;
			}
			logger.info("IP Ranges fetch is enabled");
			return internalIpRanges.prepareOffline();
		})
		.then(() => {
			internalCertificate.initTimer();
			internalAttackMonitor.initTimer();
			internalTrafficMonitor.initTimer();
			internalGeoIpUpdate.initTimer();
			internalIpRanges.initTimer();
			internalWebThreatMonitor.initTimer();
			updateManager.initTimer().catch((err) => {
				logger.warn("Update manager init failed:", err?.message ?? err);
			});

			const server = app.listen(3000, () => {
				complete();markInitialized();
				void setupExternal().catch(err=>logger.warn("Optional certificate plugin initialization failed:",err.message));
				if (IP_RANGES_FETCH_ENABLED) {
					void internalIpRanges.fetch().catch(err => logger.warn("IP range refresh failed:", err.message));
				}
				logger.info(`Backend PID ${process.pid} listening on port 3000 ...`);

				process.on("SIGTERM", () => {
					logger.info(`PID ${process.pid} received SIGTERM`);
					server.close(() => {
						logger.info("Stopping.");
						process.exit(0);
					});
				});
			});
		})
		.catch((err) => {
      fail();logger.error('STARTUP_FAILED: migration or required initialization failed',err);
      process.exit(1);
		});
}

try {
	appStart();
} catch (err) {
	logger.fatal(err);
	process.exit(1);
}
