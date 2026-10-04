import {test} from 'node:test';import assert from 'node:assert/strict';
import {pendingNyxguardUpdates as count} from '../internal/pending-updates.mjs';
const verified=(current,latest,available)=>({current,latestPublished:latest,latest:available?latest:null,updateAvailable:available,lastCheckAt:'2026-10-04T00:00:00Z',lastCheckError:null,stage:available?'update_available':'idle'});
test('reconciled Manager discovery counts current, available, activated and prerelease states',()=>{
 assert.equal(count(verified('5.0.2','5.0.2',false)),0);assert.equal(count(verified('5.0.2','5.0.3',true)),1);assert.equal(count(verified('5.0.3','5.0.3',false)),0);
 assert.equal(count(verified('5.0.3-dev','5.0.2',false)),0);assert.equal(count(verified('5.0.3-dev','5.0.3',true)),1);
});
test('failed, ambiguous, incomplete or malformed discovery stays unknown',()=>{
 const good=verified('5.0.2','5.0.3',true);
 for(const status of [undefined,{}, {...good,lastCheckAt:null},{...good,lastCheckError:'Registry unavailable'}, {...good,stage:'checking'}, {...good,recoveryRequired:true}, {...good,current:'unknown'}, {...good,latestPublished:'latest'}, {...good,latest:null},{...good,updateAvailable:undefined}])assert.equal(count(status),null);
});
test('stale Compose, cached OS package counts and previous stored versions cannot override updater state',()=>{
 assert.equal(count({...verified('5.0.3','5.0.3',false),composeVersion:'5.0.2',imageTag:'5.0.2',currentVersion:'5.0.2',pendingUpdatesCount:99}),0);
 assert.equal(count({...verified('5.0.2','5.0.3',true),composeVersion:'5.0.3',imageTag:'latest',pendingUpdatesCount:0}),1);
});
