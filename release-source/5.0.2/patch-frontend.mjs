import fs from 'node:fs';
import path from 'node:path';
const app = process.argv[2];
function patch(name, from, to, count=1) {
 const p=path.join(app,name),s=fs.readFileSync(p,'utf8');
 if(s.split(from).length-1!==count)throw new Error(`Frontend assertion failed ${name}: ${from}`);
 fs.writeFileSync(p,s.replaceAll(from,to));
}
patch('package.json','"version": "5.0.1"','"version": "5.0.2"');
const main='frontend/assets/index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js';
patch(main,'$C="5.0.1"','$C="5.0.2"');
patch(main,'Coe="5.0.1"','Coe="5.0.2"');
patch('frontend/assets/index-DTnhxNQ_.js','K="5.0.1",Bt=','K="5.0.2",Bt=');
patch('frontend/assets/notification-visibility-4010.js','desiredVersion = "5.0.1"','desiredVersion = "5.0.2"');
if (!fs.readFileSync(path.join(app,'frontend/assets/index-DGvEdm6P.css'),'utf8').includes('._card_1gz5u_1')) throw new Error('Settings layout prerequisite changed');
patch('frontend/index.html','</head>','<link rel="stylesheet" href="/assets/index-DGvEdm6P.css">\n<link rel="stylesheet" href="/assets/event-center.css?v=5.0.2">\n</head>');
// Replace the inherited Event Center module from authored source at build time.
const event=fs.readFileSync(path.join(app,'frontend/assets/event-center-source.js'),'utf8');
fs.writeFileSync(path.join(app,'frontend/assets/index-DJfFx4nu.js'),event);
const threat='frontend/assets/index-W-QFtloY.js';
patch(threat,'t.jsx("button",{type:"button",className:r===30?a.windowActive:a.window,onClick:()=>{u(30),w(0)},children:t.jsx(s,{id:"nyxguard.attacks.day-30"})})','t.jsx("button",{type:"button",className:r===30?a.windowActive:a.window,onClick:()=>{u(30),w(0)},children:t.jsx(s,{id:"nyxguard.attacks.day-30"})}),t.jsx("button",{type:"button",className:r===0?a.windowActive:a.window,onClick:()=>{u(0),w(0)},children:"All retained history"})');
