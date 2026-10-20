// Keep the strict freshness contract; a healthy concurrent collector update
// must be compared with the clock after its state has been read.
export function securitySourceReady(state,validationNow){
 const health=typeof state?.health==='string'?JSON.parse(state.health):state?.health;
 const age=validationNow-health?.lastSuccess;
 return health?.status==='ready'&&!state?.pending&&Number.isFinite(validationNow)&&Number.isFinite(health.lastSuccess)&&age>=0&&age<=15000;
}
