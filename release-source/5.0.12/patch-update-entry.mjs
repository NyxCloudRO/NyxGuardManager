import fs from 'node:fs';
const root=process.argv[2]||'/app';
const file=root+'/frontend/assets/index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js';
let source=fs.readFileSync(file,'utf8');
// Keep manual checks and recovery information accessible without a pending update.
const old='i?g.jsxs("button",{type:"button",className:We.sideUpdateBadge,onClick:()=>window.dispatchEvent(new CustomEvent("nyxguard:open-update")),children:[g.jsx(iL,{size:13}),g.jsxs("span",{children:[g.jsx(K,{id:"site-header.update-available"}),a.data?.latest?` v${a.data.latest}`:""]})]}):null';
const next='g.jsxs("button",{type:"button",className:We.sideUpdateBadge,onClick:()=>window.dispatchEvent(new CustomEvent("nyxguard:open-update")),children:[g.jsx(iL,{size:13}),g.jsxs("span",{children:i?[g.jsx(K,{id:"site-header.update-available"}),a.data?.latest?` v${a.data.latest}`:""]:[g.jsx(K,{id:"site-header.update-manager"})]})]})';
if(source.split(old).length!==2)throw Error('Update Manager entry prerequisite differs');
fs.writeFileSync(file,source.replace(old,next));
