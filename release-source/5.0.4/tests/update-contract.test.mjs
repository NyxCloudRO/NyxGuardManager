import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertUpdateTarget} from '../internal/update-contract.mjs';
const image={Config:{Labels:{'org.opencontainers.image.version':'5.0.4'},Env:['NPM_BUILD_VERSION=5.0.4']}};
test('direct public source paths accept the intended artifact',()=>{
  for(const source of ['5.0.1','5.0.2','5.0.3'])assert.doesNotThrow(()=>assertUpdateTarget(image,'5.0.4',source));
});
test('stale downloaded state cannot downgrade or repeat current runtime',()=>{
  for(const current of ['5.0.4','5.0.5','6.0.0'])assert.throws(()=>assertUpdateTarget(image,'5.0.4',current),/repeat or downgrade/);
});
test('image label and runtime environment must agree with the intended target',()=>{
  assert.throws(()=>assertUpdateTarget(image,'5.0.5','5.0.3'),/artifact version/);
  assert.throws(()=>assertUpdateTarget({...image,Config:{...image.Config,Env:['NPM_BUILD_VERSION=5.0.3']}},'5.0.4','5.0.3'),/artifact version/);
});
