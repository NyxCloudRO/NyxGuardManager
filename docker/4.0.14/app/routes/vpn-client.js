/**
 * WireGuard VPN client routes.
 *
 * The privileged operations are deliberately delegated to a loopback-only
 * sidecar that shares NyxGuard's network namespace. The web backend remains
 * unprivileged and never stores or returns WireGuard private keys.
 */
import { Router } from "express";
import { readFile } from "node:fs/promises";
import errs from "../lib/error.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { debug, express as logger } from "../logger.js";

const router = Router({ caseSensitive: true, strict: true, mergeParams: true });
const AGENT_URL = process.env.NYXGUARD_VPN_AGENT_URL || "http://127.0.0.1:3198";
const AGENT_TOKEN_PATH = process.env.NYXGUARD_VPN_AGENT_TOKEN_PATH || "/run/nyxguard-vpn-auth/token";
const MAX_CONFIG_BYTES = 64 * 1024;

async function agentRequest(path, options = {}) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 25_000);

	try {
		const agentToken = (await readFile(AGENT_TOKEN_PATH, "utf8")).trim();
		if (!agentToken) throw new Error("VPN agent token is empty");
		const response = await fetch(`${AGENT_URL}${path}`, {
			...options,
			headers: {
				Accept: "application/json",
				"X-NyxGuard-VPN-Token": agentToken,
				...(options.body ? { "Content-Type": "application/json" } : {}),
				...(options.headers || {}),
			},
			signal: controller.signal,
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new errs.ConfigurationError(payload?.error || `VPN agent returned HTTP ${response.status}`);
		}
		return payload;
	} catch (error) {
		if (error instanceof errs.ConfigurationError) throw error;
		throw new errs.ConfigurationError(
			"VPN agent is unavailable. Check that the nyxguard-vpn-agent container is running.",
			error,
		);
	} finally {
		clearTimeout(timeout);
	}
}

async function requireReadAccess(res) {
	await res.locals.access.can("settings:list");
}

async function requireWriteAccess(res) {
	await res.locals.access.can("settings:update", "default-site");
}

function validateUpload(req) {
	const uploaded = req.files?.config;
	if (!uploaded || Array.isArray(uploaded)) throw new errs.ValidationError("Select one WireGuard .conf file to upload.");
	if (!uploaded.data || uploaded.size < 1 || uploaded.size > MAX_CONFIG_BYTES) {
		throw new errs.ValidationError("WireGuard configuration must be between 1 byte and 64 KiB.");
	}
	if (!String(uploaded.name || "").toLowerCase().endsWith(".conf")) {
		throw new errs.ValidationError("WireGuard configuration must use the .conf extension.");
	}
	const name = String(req.body?.name || "").trim();
	const routeOverride = String(req.body?.routeOverride || "").trim();
	if (name.length > 60) throw new errs.ValidationError("Site name cannot exceed 60 characters.");
	if (routeOverride.length > 1024) throw new errs.ValidationError("Remote networks cannot exceed 1024 characters.");
	return { uploaded, name, routeOverride, content: uploaded.data.toString("utf8") };
}

router
	.route("/sites")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (_req, res, next) => {
		try {
			await requireReadAccess(res);
			try {
				res.json(await agentRequest("/sites"));
			} catch (error) {
				debug(logger, error.message);
				res.json({ agentAvailable: false, sites: [], summary: { total: 0, connected: 0, active: 0 }, error: error.message });
			}
		} catch (error) {
			next(error);
		}
	})
	.post(async (req, res, next) => {
		try {
			await requireWriteAccess(res);
			const upload = validateUpload(req);
			const result = await agentRequest("/sites", {
				method: "POST",
				body: JSON.stringify({ filename: upload.uploaded.name, content: upload.content, name: upload.name, routeOverride: upload.routeOverride }),
			});
			res.status(201).json(result);
		} catch (error) {
			debug(logger, error.message);
			next(error);
		}
	});

router
	.route("/sites/:id")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			await requireReadAccess(res);
			res.json(await agentRequest(`/sites/${encodeURIComponent(req.params.id)}`));
		} catch (error) {
			next(error);
		}
	})
	.patch(async (req, res, next) => {
		try {
			await requireWriteAccess(res);
			const name = String(req.body?.name || "").replace(/\s+/g, " ").trim();
			if (!name || name.length > 60) throw new errs.ValidationError("Site name must contain between 1 and 60 characters.");
			res.json(await agentRequest(`/sites/${encodeURIComponent(req.params.id)}`, { method: "PATCH", body: JSON.stringify({ name }) }));
		} catch (error) {
			debug(logger, error.message);
			next(error);
		}
	})
	.delete(async (req, res, next) => {
		try {
			await requireWriteAccess(res);
			res.json(await agentRequest(`/sites/${encodeURIComponent(req.params.id)}`, { method: "DELETE" }));
		} catch (error) {
			debug(logger, error.message);
			next(error);
		}
	});

for (const action of ["connect", "disconnect"]) {
	router
		.route(`/sites/:id/${action}`)
		.options((_, res) => res.sendStatus(204))
		.all(jwtdecode())
		.post(async (req, res, next) => {
			try {
				await requireWriteAccess(res);
				res.json(await agentRequest(`/sites/${encodeURIComponent(req.params.id)}/${action}`, { method: "POST" }));
			} catch (error) {
				debug(logger, error.message);
				next(error);
			}
		});
}

router
	.route("/sites/:id/test")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			await requireReadAccess(res);
			const target = String(req.body?.target || "").trim();
			if (!target || target.length > 253) throw new errs.ValidationError("Enter a valid IP address or hostname to test.");
			res.json(await agentRequest(`/sites/${encodeURIComponent(req.params.id)}/test`, { method: "POST", body: JSON.stringify({ target }) }));
		} catch (error) {
			debug(logger, error.message);
			next(error);
		}
	});

router
	.route("/status")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (_req, res, next) => {
		try {
			await requireReadAccess(res);
			try {
				res.json(await agentRequest("/status"));
			} catch (error) {
				debug(logger, error.message);
				res.json({
					agentAvailable: false,
					configured: false,
					interfaceUp: false,
					state: "unavailable",
					error: error.message,
				});
			}
		} catch (error) {
			next(error);
		}
	});

router
	.route("/config")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			await requireWriteAccess(res);
			const uploaded = req.files?.config;
			if (!uploaded || Array.isArray(uploaded)) {
				throw new errs.ValidationError("Select one WireGuard .conf file to upload.");
			}
			if (!uploaded.data || uploaded.size < 1 || uploaded.size > MAX_CONFIG_BYTES) {
				throw new errs.ValidationError("WireGuard configuration must be between 1 byte and 64 KiB.");
			}
			if (!String(uploaded.name || "").toLowerCase().endsWith(".conf")) {
				throw new errs.ValidationError("WireGuard configuration must use the .conf extension.");
			}

			const content = uploaded.data.toString("utf8");
			const routeOverride = String(req.body?.routeOverride || "").trim();
			if (routeOverride.length > 1024) {
				throw new errs.ValidationError("Remote networks cannot exceed 1024 characters.");
			}
			const result = await agentRequest("/config", {
				method: "POST",
				body: JSON.stringify({ filename: uploaded.name, content, routeOverride }),
			});
			res.status(201).json(result);
		} catch (error) {
			debug(logger, error.message);
			next(error);
		}
	})
	.delete(async (_req, res, next) => {
		try {
			await requireWriteAccess(res);
			res.json(await agentRequest("/config", { method: "DELETE" }));
		} catch (error) {
			debug(logger, error.message);
			next(error);
		}
	});

for (const action of ["connect", "disconnect"]) {
	router
		.route(`/${action}`)
		.options((_, res) => res.sendStatus(204))
		.all(jwtdecode())
		.post(async (_req, res, next) => {
			try {
				await requireWriteAccess(res);
				res.json(await agentRequest(`/${action}`, { method: "POST" }));
			} catch (error) {
				debug(logger, error.message);
				next(error);
			}
		});
}

router
	.route("/test")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			await requireReadAccess(res);
			const target = String(req.body?.target || "").trim();
			if (!target || target.length > 253) {
				throw new errs.ValidationError("Enter a valid IP address or hostname to test.");
			}
			res.json(await agentRequest("/test", {
				method: "POST",
				body: JSON.stringify({ target }),
			}));
		} catch (error) {
			debug(logger, error.message);
			next(error);
		}
	});

export default router;
