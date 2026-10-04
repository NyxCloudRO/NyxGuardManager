import fileUpload from 'express-fileupload';
import {AVATAR_MAX_BYTES,AVATAR_TOO_LARGE} from './avatar-policy.mjs';

export default function avatarAwareUploads() {
  // Busboy marks a file at its parsing threshold as truncated. One guard byte
  // lets an exactly 5 MiB image reach the route; the route still enforces 5 MiB.
  const avatar=fileUpload({limits:{fileSize:AVATAR_MAX_BYTES+1},abortOnLimit:true,
    limitHandler:(_req,res)=>res.status(413).json({error:{code:413,message:AVATAR_TOO_LARGE}})});
  const ordinary=fileUpload();
  return (req,res,next)=>(req.method==='POST'&&/^\/(?:api\/)?users\/(?:me|[1-9]\d*)\/avatar\/?$/.test(req.path)?avatar:ordinary)(req,res,next);
}
