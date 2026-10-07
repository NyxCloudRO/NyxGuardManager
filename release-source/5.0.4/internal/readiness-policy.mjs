import policy from './readiness-policy.json' with {type:'json'};
export {policy};
export function dockerHealthcheck() {
  return { Test:policy.command, Interval:policy.intervalMs*1000000,Timeout:policy.timeoutMs*1000000,
    Retries:policy.retries,StartPeriod:policy.startPeriodMs*1000000 };
}
