import express from "express";
import db from "../db.js";
import internalNotifications from "../internal/notifications.js";
import errs from "../lib/error.js";
import audit from "../internal/audit-log.js";
import jwtdecode from "../lib/express/jwt-decode.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

// GET /api/notifications — list all channels
// POST /api/notifications — create channel
router
	.route("/")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (_req, res, next) => {
		try {
			await res.locals.access.can("settings:list");
			const knex = db();
			const channels = await internalNotifications.list(knex);
			res.json(channels);
		} catch (err) {
			next(err);
		}
	})
	.post(async (req, res, next) => {
		try {
			await res.locals.access.can("settings:manage");
			const knex = db();
			const channel = await internalNotifications.create(knex, req.body);
			await audit.add(res.locals.access,{action:"created",object_type:"notification-channel",object_id:channel.id,meta:{name:channel.name,resource:"/settings/notifications",count:channel.events.length}});
			res.status(201).json(channel);
		} catch (err) {
			next(err);
		}
	});

// PUT /api/notifications/:id — update channel
// DELETE /api/notifications/:id — delete channel
router
	.route("/:id")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.put(async (req, res, next) => {
		try {
			await res.locals.access.can("settings:manage");
			const knex = db();
			const id = Number.parseInt(String(req.params.id), 10);
			if (!Number.isFinite(id) || id <= 0) {
				next(new errs.ItemNotFoundError());
				return;
			}
			const channel = await internalNotifications.update(knex, id, req.body);
			await audit.add(res.locals.access,{action:"updated",object_type:"notification-channel",object_id:channel.id,meta:{name:channel.name,resource:"/settings/notifications",count:channel.events.length}});
			res.json(channel);
		} catch (err) {
			next(err);
		}
	})
	.delete(async (req, res, next) => {
		try {
			await res.locals.access.can("settings:manage");
			const knex = db();
			const id = Number.parseInt(String(req.params.id), 10);
			if (!Number.isFinite(id) || id <= 0) {
				next(new errs.ItemNotFoundError());
				return;
			}
			const original=await internalNotifications.get(knex,id);
			await internalNotifications.remove(knex, id);
			await audit.add(res.locals.access,{action:"deleted",object_type:"notification-channel",object_id:id,meta:{name:original.name,resource:"/settings/notifications"}});
			res.json({ ok: true });
		} catch (err) {
			next(err);
		}
	});

// POST /api/notifications/:id/test — explicit, subscription-independent connectivity test.
router.route('/:id/test').options((_,res)=>res.sendStatus(204)).all(jwtdecode()).post(async(req,res,next)=>{
 try{
  await res.locals.access.can('settings:manage');
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw new errs.ItemNotFoundError();
  await internalNotifications.get(db(),id);
  try{await internalNotifications.test(db(),id);res.json({ok:true});}
  catch(error){if(error?.status===400)return next(error);res.json({ok:false,code:'NOTIFICATION_TEST_FAILED'});}
 }catch(error){next(error);}
});
export default router;
