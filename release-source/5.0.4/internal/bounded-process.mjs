import { spawn } from 'node:child_process';

export function execBounded(command, { timeoutMs = 120000, env = process.env, maxBytes = 1024*1024 } = {}) {
  return new Promise((resolve,reject) => {
    const child=spawn('/bin/sh',['-c',command],{env,detached:true,stdio:['ignore','pipe','pipe']});
    let output='',bytes=0,failure,killTimer;
    const stop=error=>{
      if(failure) return; failure=error;
      try { process.kill(-child.pid,'SIGTERM'); } catch {}
      killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},1000);
    };
    const timer=setTimeout(()=>stop(new Error('Subprocess total deadline exceeded')),timeoutMs);
    child.stdout.on('data',chunk=>{
      bytes+=chunk.length;
      if(bytes>maxBytes) stop(new Error('Subprocess output limit exceeded'));
      else output+=chunk.toString('utf8');
    });
    child.stderr.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes)stop(new Error('Subprocess output limit exceeded'));});
    child.on('error',error=>{clearTimeout(timer);clearTimeout(killTimer);reject(error);});
    child.on('close',code=>{
      clearTimeout(timer);clearTimeout(killTimer);
      if(failure)reject(failure);else if(code!==0)reject(new Error(`Subprocess exited ${code}`));else resolve(output);
    });
  });
}
