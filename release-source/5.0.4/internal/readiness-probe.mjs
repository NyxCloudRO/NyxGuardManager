import {policy} from './readiness-policy.mjs';
try {
  const response=await fetch('http://127.0.0.1:3000/_nyxguard/ready',{signal:AbortSignal.timeout(policy.probeDeadlineMs)});
  const body=await response.json();
  if(!response.ok||body.ready!==true||body.version!==process.env.NPM_BUILD_VERSION||body.schema!==45||body.integrity!==true)
    throw new Error('Application readiness rejected');
} catch { process.exitCode=1; }
