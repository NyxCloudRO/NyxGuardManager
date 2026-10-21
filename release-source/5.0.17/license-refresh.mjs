// Refresh the existing entitlement only. Never claim, activate or recover a license.
const REFRESHABLE=new Set(['ACTIVE','REFRESH_REQUIRED','OFFLINE_GRACE','AUTHORITY_UNAVAILABLE','EXPIRED']);
const NORMAL=15*60*1000;
const RETRIES=[30000,60000,120000,300000,NORMAL];
export function startLicenseRefresh({getClient,onError=()=>{},now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}){
 let timer=null,inFlight=null,failures=0,stopped=false;
 function schedule(delay){if(stopped)return;timer=setTimer(run,delay);timer?.unref?.()}
 function run(){
  if(stopped)return Promise.resolve();
  if(inFlight)return inFlight;
  if(timer!==null){clearTimer(timer);timer=null}
  inFlight=(async()=>{
   let delay=NORMAL;
   try{
    const client=await getClient();
    if(client){
     const status=await client.status(),authority=status.authority;
     const checked=Date.parse(authority?.last_checked_at||'');
     if(authority?.configured&&REFRESHABLE.has(status.state)&&
       (status.state!=='ACTIVE'||authority.state!=='REACHABLE'||!Number.isFinite(checked)||now()-checked>=NORMAL))await client.refresh();
    }
    failures=0;
   }catch(error){delay=RETRIES[Math.min(failures++,RETRIES.length-1)];try{await onError(error)}catch{}}
   finally{inFlight=null;schedule(delay)}
  })();
  return inFlight;
 }
 schedule(2000);
 return {run,stop(){stopped=true;if(timer!==null)clearTimer(timer)}};
}
