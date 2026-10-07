export function ruleState(row, now=Date.now()) {
  const expiry=row.expires_on ? new Date(row.expires_on).getTime() : null;
  const expired=expiry!==null&&(!Number.isFinite(expiry)||expiry<=now);
  return {enabled:Boolean(row.enabled)&&!expired,configuredEnabled:Boolean(row.enabled),expired,ruleOrigin:row.rule_origin||'manual'};
}
export function assertRuleUpdate(row,data,now=Date.now()) {
  const state=ruleState(row,now);
  if(!state.expired)return;
  if(state.ruleOrigin==='verified_crawler' && (data.enabled===true || ['expiresOn','expiresInDays','action','ipCidr'].some(k=>data[k]!==undefined)))
    throw new Error('Expired verified-crawler allowances require fresh verification. Remove this rule or create an explicit manual rule.');
  if(data.enabled===true) {
    const expiry=data.expiresOn ? Date.parse(data.expiresOn) : typeof data.expiresInDays==='number'&&data.expiresInDays>0 ? now+data.expiresInDays*86400000 : null;
    if(expiry===null||!Number.isFinite(expiry)||expiry<=now)throw new Error('Expired rules cannot be enabled. Edit the expiration or create a new rule first.');
  }
}
