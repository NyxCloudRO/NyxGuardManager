// Authenticated metrics scrapes advance only last_used_at. Token, enabled flag,
// names, identity, creation/modification timestamps and every other column stay
// protected by the stable multiset fingerprint captured from the quiesced DB.
const timestamp=value=>{
 if(value===null)return null;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)throw new Error('Invalid integration usage timestamp');
 return Date.parse(value);
};
export function captureIntegrationUsage(row){
 if(!Number.isSafeInteger(row.id)||row.id<1)throw new Error('Invalid integration identity');
 return {id:row.id,lastUsedAt:timestamp(row.last_used_at)};
}
export function validateIntegrationUsage(actual,baseline){
 const a=actual.tables.integration,b=baseline.tables.integration;
 if(!a||!b||a.count!==b.count||!/^[a-f0-9]{64}$/.test(b.stableRows||'')||a.stableRows!==b.stableRows)throw new Error('Integration credentials or configuration changed');
 if(!Array.isArray(actual.integrationUsage)||!Array.isArray(baseline.integrationUsage)||actual.integrationUsage.length!==a.count||baseline.integrationUsage.length!==b.count)throw new Error('Integration usage proof unavailable');
 const current=new Map(actual.integrationUsage.map(x=>[x.id,x.lastUsedAt]));
 if(current.size!==a.count)throw new Error('Duplicate integration usage identity');
 for(const before of baseline.integrationUsage){
  if(!current.has(before.id))throw new Error('Integration usage identity changed');
  const after=current.get(before.id);
  if((after!==null&&!Number.isSafeInteger(after))||(before.lastUsedAt!==null&&!Number.isSafeInteger(before.lastUsedAt))||(before.lastUsedAt!==null&&(after===null||after<before.lastUsedAt)))throw new Error('Integration usage timestamp regressed');
 }
}
