// Operates only on the authorized, fully fetched inventory. Never requests secrets or writes configuration.
const text=value=>String(value??'').toLocaleLowerCase();
const array=value=>Array.isArray(value)?value:[];
export const assigned=row=>Number(row.accessListId??row.access_list_id??row.accessList?.id??0)>0;
export const secured=row=>Number(row.certificateId??row.certificate_id??row.certificate?.id??0)>0;
export function certificateState(row,now=Date.now()){
 const expiry=Date.parse(row.expiresOn??row.expires_on??'');
 return !Number.isFinite(expiry)?'unknown':expiry<=now?'expired':expiry<=now+30*86400000?'expiring':'valid';
}
export function matches(kind,row,filters={},now=Date.now()){
 const q=text(filters.q).trim().split(/\s+/).filter(Boolean);
 const fields=kind==='proxy'?[row.meta?.nyxguardAppName,row.meta?.nyxguard_app_name,row.name,...array(row.domainNames),row.forwardHost,row.forwardPort,row.forwardScheme,row.accessList?.name,row.certificate?.niceName,...array(row.locations).flatMap(l=>[l.path,l.forwardHost,l.forwardPort,l.forwardScheme])]:kind==='policy'?[row.name,...array(row.clients).map(c=>c.address)]:kind==='certificate'?[row.niceName,...array(row.domainNames),row.provider]:[row.name,row.nickname,row.email,...array(row.roles)];
 const haystack=fields.map(text).join(' ');
 if(!q.every(term=>haystack.includes(term)))return false;
 const f=filters;
 if(kind==='proxy'){
  if(f.scheme&&row.forwardScheme!==f.scheme)return false;
  if(f.ssl&&secured(row)!==(f.ssl==='assigned'))return false;
  if(f.policy&&(f.policy==='public'?assigned(row):String(row.accessListId??row.accessList?.id)!==f.policy))return false;
  if(f.status&&!!row.enabled!==(f.status==='enabled'))return false;
 }
 if(kind==='policy'){
  if(f.auth&&!!array(row.items).length!==(f.auth==='yes'))return false;
  if(f.rules&&!!array(row.clients).length!==(f.rules==='yes'))return false;
  if(f.satisfy&&!!row.satisfyAny!==(f.satisfy==='any'))return false;
  if(f.assignment&&(Number(row.proxyHostCount??0)>0)!==(f.assignment==='assigned'))return false;
 }
 if(kind==='certificate'){
  if(f.provider&&row.provider!==f.provider)return false;
  if(f.expiry&&certificateState(row,now)!==f.expiry)return false;
  const used=['proxyHosts','redirectionHosts','deadHosts','streams'].some(k=>array(row[k]).length>0);
  if(f.assignment&&used!==(f.assignment==='assigned'))return false;
 }
 if(kind==='user'){
  if(f.status&&!!row.isDisabled!==(f.status==='disabled'))return false;
  const roles=array(row.roles),role=row.monitoringOnly||roles.includes('nyxagent')?'nyxagent':roles.includes('admin')?'admin':'standard';
  if(f.role&&role!==f.role)return false;
 }
 return true;
}
export function filterInventory(kind,rows,filters,now){return (rows??[]).filter(row=>matches(kind,row,filters,now));}
