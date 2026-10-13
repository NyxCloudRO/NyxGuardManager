import {writeFile,rm} from 'node:fs/promises';
export const TABLE=51830,CONTROL_MARK='0x6e79';
export function defaultFamilies(metadata){if(metadata.routingMode==='manual')return [];return [...new Set((metadata.allowedIps||[]).filter(r=>r==='0.0.0.0/0'||r==='::/0').map(r=>r.includes(':')?6:4))]}
export function fullTunnelConflict(candidate,profiles){return profiles.some(p=>p.id!==candidate.id&&defaultFamilies(candidate).some(f=>defaultFamilies(p).includes(f)))}
const guardRules=`table inet nyxvpn_control {
 chain incoming { type filter hook prerouting priority -151; policy accept; iifname != "nyxvpn*" ct mark 0 ct mark set ${CONTROL_MARK}; }
 chain replies { type route hook output priority -151; policy accept; ct mark ${CONTROL_MARK} meta mark set ${CONTROL_MARK}; }
}\n`;
async function exists(run,args){try{await run(...args);return true}catch{return false}}
export async function installControlGuard(run,directory){
 if(!await exists(run,['nft',['list','table','inet','nyxvpn_control']])){
  const file=directory+'/control-routing.nft';try{await writeFile(file,guardRules,{mode:0o600});await run('nft',['-f',file])}finally{await rm(file,{force:true})}
 }
 for(const f of [4,6]){
  const out=await run('ip',['-'+f,'rule','show']);if(!out.stdout.includes('fwmark '+CONTROL_MARK+' lookup main'))await run('ip',['-'+f,'rule','add','priority','50','fwmark',CONTROL_MARK,'lookup','main']);
 }
}
export async function activateDefaultRoutes(run,metadata){
 const families=defaultFamilies(metadata);if(!families.length)return;
 await run('wg',['set',metadata.interface,'fwmark',String(TABLE)]);
 for(const f of families){
  await run('ip',['-'+f,'route','replace','default','dev',metadata.interface,'table',String(TABLE)]);
  const out=await run('ip',['-'+f,'rule','show']);
  if(out.stdout.includes('32000:')&&!out.stdout.includes('32000:\tfrom all lookup main suppress_prefixlength 0'))throw Error('Full-tunnel routing priority is already in use.');
  if(out.stdout.includes('32001:')&&!out.stdout.includes('fwmark 0xca76 lookup 51830'))throw Error('Full-tunnel routing priority is already in use.');
  if(!out.stdout.includes('32000:'))await run('ip',['-'+f,'rule','add','priority','32000','lookup','main','suppress_prefixlength','0']);
  if(!out.stdout.includes('32001:'))await run('ip',['-'+f,'rule','add','priority','32001','not','fwmark',String(TABLE),'lookup',String(TABLE)]);
 }
}
export async function removeDefaultRoutes(run,metadata){
 for(const f of defaultFamilies(metadata)){
  await run('ip',['-'+f,'rule','del','priority','32001','not','fwmark',String(TABLE),'lookup',String(TABLE)]).catch(()=>{});
  await run('ip',['-'+f,'rule','del','priority','32000','lookup','main','suppress_prefixlength','0']).catch(()=>{});
  await run('ip',['-'+f,'route','del','default','dev',metadata.interface,'table',String(TABLE)]).catch(()=>{});
 }
}
export async function removeControlGuard(run){
 for(const f of [4,6])await run('ip',['-'+f,'rule','del','priority','50','fwmark',CONTROL_MARK,'lookup','main']).catch(()=>{});
 await run('nft',['delete','table','inet','nyxvpn_control']).catch(()=>{});
}
