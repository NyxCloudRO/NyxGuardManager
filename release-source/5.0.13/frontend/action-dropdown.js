// Existing JSX actions remain owned by their original table. Only the overlay changes.
function NyxActionDropdown({children,className="dropdown"}) {
 const [open,setOpen]=I.useState(false),[position,setPosition]=I.useState(null);
 const trigger=I.useRef(null),menu=I.useRef(null),initialFocus=I.useRef("first");
 const id=I.useId(),parts=I.Children.toArray(children),button=parts[0],content=parts[1];
 const close=I.useCallback((restore=true)=>{setOpen(false);setPosition(null);if(restore&&trigger.current?.isConnected)trigger.current.focus()},[]);
 const items=()=>Array.from(menu.current?.querySelectorAll('.dropdown-item:not(.disabled):not([aria-disabled="true"]):not(:disabled)')||[]).filter(el=>el.getClientRects().length);
 const show=(last=false)=>{initialFocus.current=last?"last":"first";window.dispatchEvent(new CustomEvent("nyxguard:close-action-menus"));setOpen(true)};
 I.useLayoutEffect(()=>{
  if(!open||!menu.current||!trigger.current)return;
  let frame;
  const place=()=>{
   const t=trigger.current.getBoundingClientRect(),m=menu.current;
   if(t.bottom<=0||t.top>=innerHeight){close(false);return}
   const viewport=window.visualViewport,gutter=8,gap=5;
   const vx=viewport?.offsetLeft||0,vy=viewport?.offsetTop||0,vw=viewport?.width||innerWidth,vh=viewport?.height||innerHeight;
   m.style.maxWidth=Math.max(1,vw-gutter*2)+"px";
   const width=Math.min(m.offsetWidth,vw-gutter*2),full=m.scrollHeight;
   const below=vy+vh-gutter-t.bottom-gap,above=t.top-gap-vy-gutter;
   const up=full>below&&above>below,available=Math.max(24,up?above:below),height=Math.min(full,available);
   const end=content.props.className?.includes("dropdown-menu-end");
   const left=Math.max(vx+gutter,Math.min(end?t.right-width:t.left,vx+vw-gutter-width));
   const top=Math.max(vy+gutter,Math.min(up?t.top-gap-height:t.bottom+gap,vy+vh-gutter-height));
   setPosition(prev=>prev&&prev.left===left&&prev.top===top&&prev.maxHeight===available&&prev.direction===(up?"up":"down")?prev:{left,top,maxHeight:available,direction:up?"up":"down"});
  };
  for(const item of menu.current.querySelectorAll(".dropdown-item")){item.setAttribute("role","menuitem");item.tabIndex=-1}
  place();
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(place)};
  const outside=e=>{if(!menu.current?.contains(e.target)&&!trigger.current?.contains(e.target))close(false)};
  const keyboard=e=>{
   if(!menu.current?.contains(e.target)&&e.target!==trigger.current)return;
   if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close();return}
   if(e.key==="Tab"){close();return}
   if(!["ArrowDown","ArrowUp","Home","End"].includes(e.key))return;
   e.preventDefault();const all=items();if(!all.length)return;const at=all.indexOf(document.activeElement);
   const next=e.key==="Home"?0:e.key==="End"?all.length-1:e.key==="ArrowDown"?(at+1)%all.length:at<=0?all.length-1:at-1;
   all[next].focus();
  };
  const other=()=>close(false);
  document.addEventListener("pointerdown",outside,true);document.addEventListener("keydown",keyboard,true);
  window.addEventListener("scroll",schedule,true);window.addEventListener("resize",schedule);window.visualViewport?.addEventListener("resize",schedule);
  window.addEventListener("nyxguard:close-action-menus",other);
  const observer=new ResizeObserver(schedule);observer.observe(menu.current);
  return()=>{cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener("pointerdown",outside,true);document.removeEventListener("keydown",keyboard,true);window.removeEventListener("scroll",schedule,true);window.removeEventListener("resize",schedule);window.visualViewport?.removeEventListener("resize",schedule);window.removeEventListener("nyxguard:close-action-menus",other)};
 },[open,close]);
 I.useLayoutEffect(()=>{if(open&&position){const all=items();(initialFocus.current==="last"?all.at(-1):all[0])?.focus();initialFocus.current=null}},[open,!!position]);
 if(!I.isValidElement(button)||!I.isValidElement(content))throw Error("Action dropdown requires its existing trigger and menu");
 return g.jsxs("span",{className:className+" nyx-action-dropdown","data-nyx-managed-controls":true,children:[I.cloneElement(button,{ref:trigger,"data-bs-toggle":undefined,"data-bs-boundary":undefined,"aria-label":button.props['aria-label']||(button.props.className?.includes("btn-action")?"Row actions":undefined),"aria-haspopup":"menu","aria-expanded":open,"aria-controls":open?id:undefined,onClick:e=>{button.props.onClick?.(e);if(!e.defaultPrevented)(open?close():show())},onKeyDown:e=>{button.props.onKeyDown?.(e);if(!open&&["ArrowDown","ArrowUp"].includes(e.key)){e.preventDefault();show(e.key==="ArrowUp")}}}),open&&hf.createPortal(I.cloneElement(content,{ref:menu,id,role:"menu",className:content.props.className+" show nyx-action-menu","data-placement":position?.direction,"data-nyx-managed-controls":true,style:{...content.props.style,left:position?.left||0,top:position?.top||0,maxHeight:position?.maxHeight||"calc(100dvh - 16px)",visibility:position?"visible":"hidden"},onClickCapture:e=>{const item=e.target.closest('.dropdown-item');if(item&&(item.classList.contains('disabled')||item.getAttribute('aria-disabled')==='true'||item.disabled)){e.preventDefault();e.stopPropagation()}},onClick:e=>{content.props.onClick?.(e);if(e.target.closest('.dropdown-item'))close()}}),document.body)]});
}
export {NyxActionDropdown};
