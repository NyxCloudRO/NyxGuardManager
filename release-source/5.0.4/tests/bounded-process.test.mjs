import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execBounded} from '../internal/bounded-process.mjs';
test('subprocess success returns stdout',async()=>assert.equal(await execBounded('printf done',{timeoutMs:1000}),'done'));
test('a stalled shell child is killed with its process group',async()=>{
  const start=Date.now();await assert.rejects(execBounded('sleep 30 & wait',{timeoutMs:100}),/deadline/);
  assert.ok(Date.now()-start<3000);
});
test('nonzero subprocess fails without leaking stderr',async()=>{
  await assert.rejects(execBounded('printf private-test-data >&2; exit 1'),error=>error.message==='Subprocess exited 1');
});
