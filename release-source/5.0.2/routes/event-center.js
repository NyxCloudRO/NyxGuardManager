import express from 'express';
import db from '../db.js';
import jwtdecode from '../lib/express/jwt-decode.js';
import {listEvents, clearEvents, normalizeScope} from '../internal/event-store.mjs';
import errs from '../lib/error.js';
const router = express.Router({caseSensitive:true, strict:true, mergeParams:true});
router.use(jwtdecode());
router.use(async (_req,res,next)=>{try{await res.locals.access.can('settings:update','default-site');next();}catch(e){next(e);}});
router.get('/options',async(_req,res,next)=>{try{const k=db();const actors=await k('audit_log as a').leftJoin('user as u','u.id','a.user_id').select('a.user_id as id','u.name').where('a.user_id','>',0).groupBy('a.user_id','u.name');const actions=await k('audit_log').distinct('action').orderBy('action');res.send({actors,actions:actions.map(a=>a.action)});}catch(e){next(e);}});
router.get('/events',async(req,res,next)=>{try{try{normalizeScope(req.query);}catch{throw new errs.ValidationError('Invalid Event Center query');}res.send(await listEvents(db(),req.query));}catch(e){next(e);}});
router.post('/clear',async(req,res,next)=>{try{
  if (req.body?.confirm !== true) throw new errs.ValidationError('Clear confirmation required');
  res.send(await clearEvents(db(),req.body));
}catch(e){next(e);}});
export default router;
