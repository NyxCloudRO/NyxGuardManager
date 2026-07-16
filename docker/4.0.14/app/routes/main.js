import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import express from "express";
import errs from "../lib/error.js";
import { apiLimiter, authLimiter } from "../lib/rate-limit.js";
import pjson from "../package.json" with { type: "json" };
import { isSetup } from "../setup.js";
import auditLogRoutes from "./audit-log.js";
import eventCenterRoutes from "./event-center.js";
import accessListsRoutes from "./nginx/access_lists.js";
import accessPortalRoutes from "./nginx/access_portal.js";
import certificatesHostsRoutes from "./nginx/certificates.js";
import deadHostsRoutes from "./nginx/dead_hosts.js";
import proxyHostsRoutes from "./nginx/proxy_hosts.js";
import redirectionHostsRoutes from "./nginx/redirection_hosts.js";
import streamsRoutes from "./nginx/streams.js";
import integrationsRoutes from "./integrations.js";
import lanAccessRoutes from "./lan-access.js";
import vpnClientRoutes from "./vpn-client.js";
import notificationsRoutes from "./notifications.js";
import ssoRoutes from "./sso.js";
import nyxguardRoutes from "./nyxguard/index.js";
import reportsRoutes from "./reports.js";
import schemaRoutes from "./schema.js";
import settingsRoutes from "./settings.js";
import tokensRoutes from "./tokens.js";
import updateManagerRoutes from "./update-manager.js";
import usersRoutes from "./users.js";
import versionRoutes from "./version.js";
import webThreatRoutes from "./web-threat.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

// Apply rate limit to ALL routes including avatar and health check.
// This must be registered before any route handler so no endpoint is unthrottled.
router.use(apiLimiter);

const AVATAR_DIR = process.env.NYXGUARD_AVATAR_DIR || "/data/avatars";

router.get("/avatar/:user_id", async (req, res, next) => {
	try {
		const id = Number.parseInt(String(req.params.user_id), 10);
		if (Number.isNaN(id) || id <= 0) {
			next(new errs.ItemNotFoundError());
			return;
		}

		const exts = ["png", "jpg", "jpeg", "webp"];
		let fp = null;
		for (const ext of exts) {
			const candidate = path.join(AVATAR_DIR, `user-${id}.${ext}`);
			try {
				await fs.stat(candidate);
				fp = candidate;
				break;
			} catch {
				// ignore
			}
		}

		if (!fp) {
			next(new errs.ItemNotFoundError());
			return;
		}

		// This endpoint is intentionally public so profile pictures can be loaded by <img>/<span style=...>.
		res.set({
			"Cache-Control": "public, max-age=3600",
		});
		res.sendFile(fp);
	} catch (err) {
		next(err);
	}
});

/**
 * Health Check
 * GET /api
 */
router.get("/", async (_, res /*, next*/) => {
	// Prefer embedded build metadata (from Docker build args) when available.
	// Fallback to package.json version for local/dev runs.
	const buildVersionRaw = (pjson.version || process.env.NPM_BUILD_VERSION || "").toString();
	const buildVersion = buildVersionRaw.replace(/^v/i, "").split("-").shift();
	const versionParts = buildVersion.split(".");
	const setup = await isSetup();

	const major = Number.parseInt(versionParts[0] || "0", 10);
	const minor = Number.parseInt(versionParts[1] || "0", 10);
	const revision = Number.parseInt(versionParts[2] || "0", 10);

	res.status(200).send({
		status: "OK",
		setup,
		version: {
			major,
			minor,
			revision,
		},
		build: {
			version: buildVersion || null,
			commit: buildVersion ? "release-" + buildVersion : (process.env.NPM_BUILD_COMMIT || null),
			date: process.env.NPM_BUILD_DATE || null,
		},
	});
});

/**
 * GET /api/grafana/dashboard.json
 * Returns the NyxGuard Grafana dashboard JSON for download.
 * Public endpoint — no auth required.
 */
router.get("/grafana/dashboard.json", (_req, res, next) => {
	const dashPath = path.join(__dirname, "../grafana-dashboard.json");
	res.setHeader("Content-Type", "application/json");
	res.setHeader("Content-Disposition", "attachment; filename=\"nyxguard-grafana-dashboard.json\"");
	const stream = createReadStream(dashPath);
	stream.on("error", next);
	stream.pipe(res);
});

router.use("/schema", schemaRoutes);
router.use("/tokens", authLimiter, tokensRoutes);
router.use("/auth/sso", authLimiter, ssoRoutes);
router.use("/users", usersRoutes);
router.use("/audit-log", auditLogRoutes);
router.use("/reports", reportsRoutes);
router.use("/settings", settingsRoutes);
router.use("/version", versionRoutes);
router.use("/nyxguard", nyxguardRoutes);
router.use("/notifications", notificationsRoutes);
router.use("/integrations", integrationsRoutes);
router.use("/web-threat", webThreatRoutes);
router.use("/update-manager", updateManagerRoutes);
router.use("/event-center", eventCenterRoutes);
router.use("/lan-access", lanAccessRoutes);
router.use("/vpn-client", vpnClientRoutes);
router.use("/nginx/proxy-hosts", proxyHostsRoutes);
router.use("/nginx/redirection-hosts", redirectionHostsRoutes);
router.use("/nginx/dead-hosts", deadHostsRoutes);
router.use("/nginx/streams", streamsRoutes);
router.use("/nginx/access-lists", accessListsRoutes);
router.use("/nginx/access-portal", accessPortalRoutes);
router.use("/nginx/certificates", certificatesHostsRoutes);

/**
 * API 404 for all other routes
 *
 * ALL /api/*
 */
router.all(/(.+)/, (req, _, next) => {
	req.params.page = req.params["0"];
	next(new errs.ItemNotFoundError(req.params.page));
});

export default router;
