import test from'node:test';import assert from'node:assert/strict';import{removeLegacyHelp}from'../remove-help.mjs';
test('retired controls and their now-unused imports are removed, shared Help remains',()=>{
 const source='import {help as open,save} from "./shared.js";import {Icon as HelpIcon} from "./icon.js";function page(){return jsx("div",{children:[jsx(Button,{onClick:()=>open("AccessLists","cyan"),children:jsx(HelpIcon,{})}),jsx(Button,{onClick:()=>save(),children:"Save"})]})}function elsewhere(){return open("Streams","blue")}';
 const result=removeLegacyHelp(source);assert.equal(result.removed.length,1);assert(!result.source.includes('HelpIcon'));assert(result.source.includes('open("Streams"'));assert(result.source.includes('save()'));assert(!result.source.includes('AccessLists'));assert(result.source.includes('help as open'));
});
test('removing an exclusive Help handler leaves valid nonempty imports and guidance',()=>{
 const result=removeLegacyHelp('import {help as open,save} from "./shared.js";const view=jsx(Button,{onClick:()=>open("Certificates","cyan"),children:"Help"});const guidance="Certificate validation is required";save();');assert.deepEqual(result.unusedImports,['open']);assert(result.source.includes('Certificate validation is required'));assert(result.source.includes('import {save}'));
});
