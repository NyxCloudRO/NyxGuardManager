import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import db from '/app/db.js';const k=db();let server,base,token;
before(async()=>{assert.equal(k.client.config.connection.host,'nyxguard-task1-db');assert.equal(k.client.config.connection.database,'task1_fixture');await (await import('/app/schema/index.js')).getCompiledSchema();token=(await (await import('/app/models/token.js')).default().create({iss:'api',attrs:{id:1},scope:['user'],expiresIn:'1h'})).token;server=(await import('/app/app.js')).default.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/api`;});
after(async()=>{if(server)await new Promise(r=>server.close(r));await k.destroy();});
async function state(latest,error=null,stage='idle') {await fs.mkdir('/data/update-manager',{recursive:true});await fs.writeFile('/data/update-manager/state.json',JSON.stringify({currentVersion:'4.0.18',latestVersion:latest,lastCheckAt:new Date().toISOString(),lastCheckError:error,stage,updateAvailable:false}),{mode:0o600});}
async function api(route){const r=await fetch(base+route,{headers:{Authorization:'Bearer '+token}});assert.equal(r.status,200);return r.json();}
test('report cache follows fresh reconciled Update Manager state, not stale Compose/version or cached package values',async()=>{
 await state('5.0.2');let status=await api('/update-manager/status'),report=await api('/reports/hosts');assert.equal(status.current,'5.0.3');assert.equal(status.updateAvailable,false);assert.equal(report.system.pendingUpdatesCount,0);
 await state('5.0.4');status=await api('/update-manager/status');report=await api('/reports/hosts');assert.equal(status.updateAvailable,true);assert.equal(report.system.pendingUpdatesCount,1);
 await state('5.0.2');report=await api('/reports/hosts');assert.equal(report.system.pendingUpdatesCount,0);
});
test('failed/ambiguous discovery stays unknown through API, including warm report caches',async()=>{
 await state('5.0.4','Controlled discovery failure');assert.equal((await api('/reports/hosts')).system.pendingUpdatesCount,null);
 await state('5.0.4',null,'recovery_required');assert.equal((await api('/reports/hosts')).system.pendingUpdatesCount,null);
 await state(null);assert.equal((await api('/reports/hosts')).system.pendingUpdatesCount,null);
 await state('5.0.2');assert.equal((await api('/reports/hosts')).system.pendingUpdatesCount,0);
});
