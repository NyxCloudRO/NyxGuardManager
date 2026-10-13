import test from 'node:test';
import assert from 'node:assert/strict';
import {insertOrderedClients} from './access-list-order.mjs';
test('ordered writes survive differing database completion times',async()=>{
 const inserted=[],active=[];let inFlight=0;
 const rows=[{directive:'allow',address:'198.51.100.2/32',delay:8},{directive:'deny',address:'198.51.100.0/24',delay:1},{directive:'allow',address:'203.0.113.2/32',delay:2}];
 await insertOrderedClients(async row=>{active.push(++inFlight);await new Promise(resolve=>setTimeout(resolve,row.delay));inserted.push(row);inFlight--},rows);
 assert.deepEqual(inserted,rows);assert.deepEqual(active,[1,1,1]);
});
test('an omitted optional client list performs no database writes',async()=>{
 const written=[];await insertOrderedClients(async row=>written.push(row));assert.deepEqual(written,[]);
});
test('rejects failed writes before inserting subsequent policy rows',async()=>{
 const written=[];await assert.rejects(insertOrderedClients(async row=>{written.push(row.address);if(row.address==='fail')throw Error('database unavailable')},[{address:'first'},{address:'fail'},{address:'last'}]),/unavailable/);assert.deepEqual(written,['first','fail']);
});
