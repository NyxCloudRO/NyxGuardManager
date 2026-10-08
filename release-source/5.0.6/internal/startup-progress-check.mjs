import policy from './release-policy.mjs';
export function progressLimit(s){return Math.min(policy.readiness.maximumBudgetMs,policy.readiness.fixedBudgetMs+s.total*policy.readiness.workUnitBudgetMs);}
export function assertProgress(s,now=Date.now()){
  if(s?.format!==1||typeof s.attempt!=='string'||!Number.isSafeInteger(s.units)||!Number.isSafeInteger(s.total)||s.units<0||s.total<0||!Number.isSafeInteger(s.startedAt)||!Number.isSafeInteger(s.progressAt)||s.progressAt<s.startedAt||s.progressAt>now+2000||s.failed)throw new Error('STARTUP_FAILED: inspect Manager startup logs');
  const idle=s.phase.startsWith('migration')?policy.readiness.migrationIdleMs:policy.readiness.startupIdleMs;
  if(now-s.progressAt>idle||now-s.startedAt>progressLimit(s))throw new Error('STARTUP_STALLED: completed migration work stopped or bounded work budget expired');
}
