import{j as a}from './index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js';
const shellClass=bounded=>'app-page-shell nyx-scroll-theme'+(bounded?' app-page-shell-bounded':'');
const containerClass=framed=>'container-xl app-page-container'+(framed?' app-page-container-framed':'');
function AppPage({children,framed,bounded=false}) {
 return a.jsx('div',{className:shellClass(bounded),children:a.jsx('div',{className:containerClass(framed),children})});
}
// Imperative product pages use the same shell definition as React routes.
export function mountAppPage(parent,{framed=false,bounded=false}={}) {
 const shell=document.createElement('div');shell.className=shellClass(bounded);
 const content=document.createElement('div');content.className=containerClass(framed);
 shell.append(content);parent.append(shell);return {shell,content};
}
export {AppPage as A};
