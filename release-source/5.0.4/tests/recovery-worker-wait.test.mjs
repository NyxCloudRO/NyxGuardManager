import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryWorkerWait} from '../internal/recovery-worker-wait.mjs';
import {sanitizedFailure} from '../internal/handover-transaction.mjs';

function fixture({exitAt=Infinity,exitCode=0,deadlineMs=3000}={}) {
  let clock=0, polls=0;
  const inspect=async()=>{polls++;return {State:{Running:clock<exitAt,ExitCode:exitCode}};};
  const wait=recoveryWorkerWait(inspect,{deadlineMs,now:()=>clock,sleep:async ms=>{clock+=ms;}});
  return {wait,clock:()=>clock,polls:()=>polls};
}
for (const exitAt of [0,1000,2999,3000]) {
  test(`worker completion at ${exitAt} ms is recognized, including expiry boundary`,async()=>{
    const f=fixture({exitAt});
    assert.equal((await f.wait('worker')).State.Running,false);
    assert.ok(f.clock()<=3000);
  });
}
test('nonzero worker exit remains available to the existing caller failure gate',async()=>{
  const f=fixture({exitAt:1000,exitCode:17});
  assert.equal((await f.wait('worker')).State.ExitCode,17);
});
test('hung worker expires, and rollback cannot renew its budget',async()=>{
  const f=fixture();
  await assert.rejects(f.wait('worker'),{code:'WORKER_DEADLINE_EXCEEDED'});
  assert.equal(f.clock(),3000);
  const polls=f.polls();
  await assert.rejects(f.wait('worker'),{code:'WORKER_DEADLINE_EXCEEDED'});
  assert.equal(f.clock(),3000);
  assert.equal(f.polls(),polls+1); // Re-inspect; do not kill, delete or sleep again.
});
for (const state of [null,{}, {State:{Running:false}}, {State:{Running:'false',ExitCode:0}}]) {
  test(`missing or malformed final state blocks recovery: ${JSON.stringify(state)}`,async()=>{
    await assert.rejects(recoveryWorkerWait(async()=>state)('worker'),{code:'WORKER_STATE_UNCERTAIN'});
  });
}
test('transport loss is uncertain and retains the underlying cause privately',async()=>{
  const cause=Object.assign(new Error('secret URL https://user:password@example.invalid'),{code:'ECONNRESET'});
  try {await recoveryWorkerWait(async()=>{throw cause;})('worker');assert.fail('Expected refusal');}
  catch(error){assert.equal(error.code,'WORKER_STATE_UNCERTAIN');assert.equal(error.cause,cause);
    assert.ok(!JSON.stringify(sanitizedFailure(error,'BACKUP_STARTING')).includes('password'));}
});
test('diagnostic includes operation/status, without sensitive endpoint or arbitrary text',()=>{
  assert.deepEqual(sanitizedFailure(new Error('Docker POST /containers/private-name/stop?t=10 failed: 500'),'BACKUP_STARTING'),
    {category:'Error',message:'Docker POST request failed: 500',phase:'BACKUP_STARTING'});
  assert.equal(sanitizedFailure(new TypeError('password=secret token=secret https://private.invalid')).category,'TypeError');
  assert.equal(sanitizedFailure(new TypeError('password=secret')).message,'Failure details withheld');
});
