import express from "express";
import errs from "../lib/error.js";
import pjson from "../package.json" with { type: "json" };
import { isSetup } from "../setup.js";
import auditLogRoutes from "./audit-log.js";
import accessListsRoutes from "./nginx/access_lists.js";
import certificatesHostsRoutes from "./nginx/certificates.js";
import deadHostsRoutes from "./nginx/dead_hosts.js";
import proxyHostsRoutes from "./nginx/proxy_hosts.js";
import redirectionHostsRoutes from "./nginx/redirection_hosts.js";
import streamsRoutes from "./nginx/streams.js";
import reportsRoutes from "./reports.js";
import schemaRoutes from "./schema.js";
import settingsRoutes from "./settings.js";
import tokensRoutes from "./tokens.js";
import usersRoutes from "./users.js";
import versionRoutes from "./version.js";
import nyxguardRoutes from "./nyxguard.js";
import fs from "node:fs/promises";
import path from "node:path";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

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
	const version = pjson.version.split("-").shift().split(".");
	const setup = await isSetup();

	res.status(200).send({
		status: "OK",
		setup,
		version: {
			major: Number.parseInt(version.shift(), 10),
			minor: Number.parseInt(version.shift(), 10),
			revision: Number.parseInt(version.shift(), 10),
		},
	});
});

router.use("/schema", schemaRoutes);
router.use("/tokens", tokensRoutes);
router.use("/users", usersRoutes);
router.use("/audit-log", auditLogRoutes);
router.use("/reports", reportsRoutes);
router.use("/settings", settingsRoutes);
router.use("/version", versionRoutes);
router.use("/nyxguard", nyxguardRoutes);
router.use("/nginx/proxy-hosts", proxyHostsRoutes);
router.use("/nginx/redirection-hosts", redirectionHostsRoutes);
router.use("/nginx/dead-hosts", deadHostsRoutes);
router.use("/nginx/streams", streamsRoutes);
router.use("/nginx/access-lists", accessListsRoutes);
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
