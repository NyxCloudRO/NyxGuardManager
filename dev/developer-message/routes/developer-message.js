import express from "express";
import jwtdecode from "../lib/express/jwt-decode.js";
import userModel from "../models/user.js";
import now from "../models/now_helper.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

const currentUserId = (res) => res.locals.access.token.getUserId(0);

const authorizeCurrentUser = async (res) => {
	const userId = currentUserId(res);
	await res.locals.access.can("users:get", userId);
	return userId;
};

router
	.route("/")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const userId = await authorizeCurrentUser(res);
			const user = await userModel
				.query()
				.select("developer_message_acknowledged_on")
				.where("id", userId)
				.where("is_deleted", 0)
				.first();
			res.status(200).send({ acknowledged: Boolean(user?.developer_message_acknowledged_on) });
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})
	.post(async (req, res, next) => {
		try {
			const userId = await authorizeCurrentUser(res);
			const acknowledgedOn = now();
			const updated = await userModel
				.query()
				.where("id", userId)
				.where("is_deleted", 0)
				.patch({ developer_message_acknowledged_on: acknowledgedOn });
			if (updated !== 1) {
				res.sendStatus(404);
				return;
			}
			res.status(200).send({ acknowledged: true, acknowledged_on: acknowledgedOn });
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
