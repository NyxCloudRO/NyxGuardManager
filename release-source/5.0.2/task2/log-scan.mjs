import {createReadStream} from 'node:fs';
import readline from 'node:readline';
import zlib from 'node:zlib';
// A corrupt/unreadable log must reject rather than masquerade as an empty scan.
export function scanLogFile({fp,size,sinceMs,maxBytes,onEvent},parseAccessLine) {
 const compressed=fp.endsWith('.gz');
 const start=!compressed&&typeof maxBytes==='number'&&size>maxBytes?size-maxBytes:0;
 return new Promise((resolve,reject)=>{
  const source=createReadStream(fp,compressed?undefined:{start});
  const input=compressed?source.pipe(zlib.createGunzip()):source;
  const lines=readline.createInterface({input,crlfDelay:Infinity});
  let bytesRead=0,settled=false;
  const fail=error=>{if(settled)return;settled=true;reject(error);lines.close();input.destroy();source.destroy();};
  source.on('error',fail);input.on('error',fail);lines.on('error',fail);
  source.on('data',chunk=>{bytesRead+=chunk.length;});
  lines.on('line',line=>{try{const event=parseAccessLine(line);if(event&&event.ts>=sinceMs)onEvent(event);}catch(error){fail(error);}});
  lines.on('close',()=>{if(!settled){settled=true;resolve({bytesRead});}});
 });
}
