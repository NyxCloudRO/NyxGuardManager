import test from 'node:test';import assert from 'node:assert/strict';import {compatibleDockerPlatform as compatible,verifiedCachedPlatform as verified} from '../internal/update-platform.mjs';
const tag={images:[{architecture:'amd64',os:'linux',status:'active'}]};
test('confirmed current execution platform',()=>assert.equal(compatible(tag,{arch:'x64',platform:'linux'}),true));
test('different architecture cannot notify',()=>assert.equal(compatible(tag,{arch:'arm64',platform:'linux'}),false));
test('missing image metadata cannot notify',()=>assert.equal(compatible({},{arch:'x64',platform:'linux'}),false));
test('inactive image cannot notify',()=>assert.equal(compatible({images:[{architecture:'amd64',os:'linux',status:'inactive'}]},{arch:'x64',platform:'linux'}),false));
test('unknown image status cannot notify',()=>assert.equal(compatible({images:[{architecture:'amd64',os:'linux'}]},{arch:'x64',platform:'linux'}),false));
test('different operating system cannot notify',()=>assert.equal(compatible({images:[{architecture:'amd64',os:'windows',status:'active'}]},{arch:'x64',platform:'linux'}),false));
test('verified arm64 metadata matches arm64 runtime',()=>assert.equal(compatible({images:[{architecture:'arm64',os:'linux',status:'active'}]},{arch:'arm64',platform:'linux'}),true));
test('non-Linux runtime is not a compatible Manager target',()=>assert.equal(compatible(tag,{arch:'x64',platform:'win32'}),false));

const checked='2026-10-12T08:00:00Z';const state={latestVersion:'5.0.14',lastCheckAt:checked,latestPlatform:{version:'5.0.14',checkedAt:checked,compatible:true}};
test('matching metadata supports the existing cache',()=>assert.equal(verified(state),true));
test('legacy unverified cache must be checked',()=>assert.equal(verified({latestVersion:'5.0.14',lastCheckAt:checked}),false));
test('cached other version must be checked',()=>assert.equal(verified({...state,latestVersion:'5.0.15'}),false));
test('cache after unsuccessful check must be checked',()=>assert.equal(verified({...state,lastCheckAt:'2026-10-12T08:01:00Z'}),false));
test('incompatible but verified cache remains cacheable',()=>assert.equal(verified({...state,latestPlatform:{...state.latestPlatform,compatible:false}}),true));
test('invalid cache timestamps cannot verify metadata',()=>assert.equal(verified({...state,lastCheckAt:'invalid',latestPlatform:{...state.latestPlatform,checkedAt:'invalid'}}),false));
test('malformed image entries do not invent compatibility',()=>assert.equal(compatible({images:[null,{}]},{arch:'x64',platform:'linux'}),false));
