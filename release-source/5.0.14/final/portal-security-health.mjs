// Per-process audit write health; never stores request data or credentials.
let healthy=true,failures=0;
export function portalAuditWriteResult(ok){healthy=Boolean(ok);if(!ok)failures++;}
export function portalAuditHealth(){return {healthy,failures};}
