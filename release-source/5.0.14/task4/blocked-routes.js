import express from 'express';
import jwtdecode from '../../lib/express/jwt-decode.js';
import {query,clear} from '../../internal/blocked-store.mjs';
const router=express.Router({caseSensitive:true,strict:true,mergeParams:true});
router.route('/blocked-requests').options((_,res)=>res.sendStatus(204)).all(jwtdecode())
.get(async(req,res,next)=>{try{await res.locals.access.can('nyxguard:list');res.set('Cache-Control','no-store').send(await query(req.query));}catch(e){next(e);}})
.delete(async(req,res,next)=>{try{await res.locals.access.can('nyxguard:update');res.set('Cache-Control','no-store').send(await clear(res.locals.access));}catch(e){next(e);}});
export default router;
