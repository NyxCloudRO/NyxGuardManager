import test from'node:test';import assert from'node:assert/strict';import{workspaceHeight}from'../modal-sizing.js';
test('short measured wizard content keeps its natural size',()=>{assert.equal(workspaceHeight(271,736,225),271);assert.equal(workspaceHeight(271.4,1048,225),272);});
test('long content reserves only available space, including reduced height',()=>{assert.equal(workspaceHeight(1800,736,225),511);assert.equal(workspaceHeight(1800,568,225),343);assert.equal(workspaceHeight(271,200,225),0);});
