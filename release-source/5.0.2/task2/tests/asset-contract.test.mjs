import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const assets='/app/frontend/assets/';
async function wrapper(name){const source=(await fs.readFile(assets+name,'utf8')).replace(/^import[^;]+;/,'const r=(request,options)=>({request,options});');return import('data:text/javascript,'+encodeURIComponent(source));}
test('real traffic wrappers deliver the exact requested window and AbortSignal to HTTP options',async()=>{
 const signal=new AbortController().signal;const summary=await wrapper('getNyxGuardAttacksSummary-C48hTUOS.js');const ips=await wrapper('getNyxGuardGeoip-BFi2NwFK.js');
 for(const result of [await summary.g(259200,1000,6000,signal),await summary.a(259200,signal),await ips.a(259200,10000,signal)])assert.equal(result.options.signal,signal);
 assert.deepEqual((await summary.g(259200,1000,6000,signal)).request.params,{minutes:259200,limit:1000,offset:6000});assert.deepEqual((await ips.a(259200,10000,signal)).request.params,{minutes:259200,limit:10000});
});
test('WAF styling is scoped separately from auth bypass and Dashboard uptime readers stay intact',async()=>{
 const dashboard=await fs.readFile(assets+'index-CP-DF6LG.js','utf8'),gate=await fs.readFile(assets+'index-BiykMfhJ.js','utf8');
 assert.match(dashboard,/y.protectedCount>=y.totalApps\?s.pillOn:`\$\{s.pillPartial\} nyx-waf-partial`/);
 assert.match(dashboard,/className:s.pillPartial/);assert.match(gate,/nyx-waf-partial`,canToggle:!0/);
 assert.match(dashboard,/oe\(o\?\.systemUptimeSeconds\)/);assert.match(dashboard,/oe\(o\?\.dockerContainerUptimeSeconds\)/);assert.doesNotMatch(dashboard,/managerProcessDuration/);
});
test('WAF PARTIAL text contrast exceeds 4.5:1 with its shared background',()=>{
 const luminance=hex=>{const channels=hex.match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
 assert.ok((luminance('ffd580')+.05)/(luminance('3b2d16')+.05)>=4.5);
});
