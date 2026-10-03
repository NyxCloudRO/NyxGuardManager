import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {selectTopology} from '../../../upgrade/same-major-bootstrap.mjs';

const script = fs.readFileSync(process.env.NYX_PUBLIC_UPDATER_TEST_FILE || 'update.sh', 'utf8');
const definitions = script.replace(/^main "\$@"\s*$/m, '');
const mapped = tag => spawnSync('/bin/bash', ['--noprofile', '--norc', '-c', definitions + '\nvpn_agent_tag_for_manager "$1"', 'test', tag], {encoding:'utf8',env:{...process.env,BASH_ENV:'/dev/null'}});

test('Manager 5.0.2 explicitly retains published VPN Agent 5.0.1', () => {
 const result = mapped('5.0.2');
 assert.equal(result.status, 0, result.stderr);
 assert.equal(result.stdout.trim(), '5.0.1');
 assert.match(script, /VPN_AGENT_REPO.*vpn_agent_tag_for_manager/);
});
test('future Manager tags never synthesize equally versioned Agent tags', () => {
 for(const tag of ['5.0.3','5.1.0','6.0.0']) {
  const result = mapped(tag);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.trim(), '');
 }
});
test('explicit previous release contracts are retained', () => {
 for(const [manager,agent] of [['5.0.1','5.0.1'],['5.0.0','5.0.0'],['v5.0.2','5.0.1']]) {
  const result = mapped(manager);assert.equal(result.status, 0);assert.equal(result.stdout.trim(),agent);
 }
});
test('same-major host helper has an exact public checksum pin', () => {
 const digest=createHash('sha256').update(fs.readFileSync('upgrade/same-major-bootstrap.mjs')).digest('hex');
 assert.match(script,new RegExp('SAME_MAJOR_SHA256="'+digest+'"'));
});
const labels=service=>({'com.docker.compose.service':service,'com.docker.compose.project':'installed','com.docker.compose.project.config_files':'/opt/nyxguardmanager/docker-compose.yml'});
const manager={Id:'manager',Labels:labels('nyxguard-manager')};
const db={Id:'db',Labels:labels('db')};
const vpn={Id:'vpn',Labels:labels('vpn-client-agent'),Names:['/nyxguard-vpn-agent']};
test('host topology preserves installed VPN and Manager-only installations',()=>{
 assert.equal(selectTopology([manager,db,vpn],'/opt/nyxguardmanager').vpn.Id,'vpn');
 assert.equal(selectTopology([manager,db],'/opt/nyxguardmanager').vpn,null);
});
test('ambiguous VPN or database topology is refused before replacement',()=>{
 assert.throws(()=>selectTopology([manager,db,db],'/opt/nyxguardmanager'),/database/);
 assert.throws(()=>selectTopology([manager,db,vpn,vpn],'/opt/nyxguardmanager'),/Ambiguous VPN/);
 assert.throws(()=>selectTopology([manager,db,{Id:'orphan',Names:['/nyxguard-vpn-agent']}],'/opt/nyxguardmanager'),/outside/);
});
