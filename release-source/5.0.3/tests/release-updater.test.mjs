import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {supportedTransition} from '../../../upgrade/same-major-bootstrap.mjs';

test('guarded release handover supports predecessor and rejects downgrades/unplanned versions',()=>{
 for(const [from,to] of [['5.0.1','5.0.2'],['5.0.1','5.0.3'],['5.0.2','5.0.3']])assert.equal(supportedTransition(from,to),true);
 for(const [from,to] of [['5.0.3','5.0.2'],['5.0.2','5.0.2'],['5.0.2','5.0.4'],['4.0.18','5.0.3']])assert.equal(supportedTransition(from,to),false);
});
test('installer and updater agree on compatible agent without synthesizing future tags',()=>{
 for(const filename of ['install.sh','update.sh']){
  const source=fs.readFileSync(filename,'utf8').replace(/^main "\$@"\s*$/m,'');
  for(const [tag,expected] of [['5.0.3','5.0.1'],['v5.0.3','5.0.1'],['5.0.2','5.0.1']]){
   const r=spawnSync('bash',['--noprofile','--norc','-c',source+'\nvpn_agent_tag_for_manager "$1"','test',tag],{encoding:'utf8',env:{...process.env,BASH_ENV:'/dev/null'}});
   assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),expected);
  }
 }
});
