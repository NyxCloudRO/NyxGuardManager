import test from 'node:test';
import assert from 'node:assert/strict';
import {recordAccessDecision} from '/app/internal/access-audit.mjs';
function fixture(){const rows=[];function db(){return{insert:async row=>rows.push(row)}};db.fn={now:()=> 'fixture-time'};return{db,rows};}
const request=(cookie='')=>({headers:{host:'protected.example.test',cookie,'user-agent':'Synthetic browser'},socket:{remoteAddress:'198.18.0.2'},query:{}});
test('routine session absence does not write administrative audit rows',async()=>{const{db,rows}=fixture();for(let n=0;n<500;n++)assert.equal((await recordAccessDecision(db,request(),'token_unverified',{listId:1})).recorded,false);assert.equal(rows.length,0);});
test('invalid supplied credentials retain individual denied access records',async()=>{const{db,rows}=fixture();await recordAccessDecision(db,request('nyxguard_access=synthetic'),'token_unverified',{listId:1});assert.equal(rows.length,1);assert.equal(JSON.parse(rows[0].meta).reason_code,'token_unverified');assert.equal(rows[0].result,'denied');assert.equal(rows[0].noise_key,null);});
test('revocation and access configuration failures stay auditable',async()=>{for(const reason of ['user_revoked','list_changed','exception']){const{db,rows}=fixture();await recordAccessDecision(db,request(),reason,{listId:1});assert.equal(rows.length,1);assert.equal(JSON.parse(rows[0].meta).reason_code,reason);}});
