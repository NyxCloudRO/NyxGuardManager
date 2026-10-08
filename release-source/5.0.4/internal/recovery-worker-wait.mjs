import {performance} from 'node:perf_hooks';

// Existing recovery SQL operations allow a five-minute idle interval. A worker
// may dump and import sequentially, then verify/archive files. Retain the
// existing major-handover worker's fifteen-minute outer budget for these waits.
export const recoveryWorkerDeadlineMs = 900000;

export function recoveryWorkerWait(inspect, {
  deadlineMs = recoveryWorkerDeadlineMs,
  now = () => performance.now(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const deadlines = new Map();
  return async function wait(id) {
    if (!deadlines.has(id)) deadlines.set(id, now() + deadlineMs);
    const deadline = deadlines.get(id);
    while (true) {
      let worker;
      try { worker = await inspect(id); }
      catch (cause) {
        throw Object.assign(new Error('Recovery worker final state uncertain', {cause}), {code:'WORKER_STATE_UNCERTAIN'});
      }
      if (!worker || typeof worker.State?.Running !== 'boolean' ||
          (!worker.State.Running && (worker.State.Status!=='exited'||!Number.isSafeInteger(worker.State.ExitCode))))
        throw Object.assign(new Error('Recovery worker final state uncertain'), {code:'WORKER_STATE_UNCERTAIN'});
      if (!worker.State.Running) return worker;
      // The expiry inspection above accounts for a worker which completed at
      // the boundary. A live worker is retained; no restore/start/delete follows.
      if (now() >= deadline)
        throw Object.assign(new Error('Recovery worker deadline exceeded; worker still running'), {code:'WORKER_DEADLINE_EXCEEDED'});
      await sleep(Math.min(1000, deadline - now()));
    }
  };
}
