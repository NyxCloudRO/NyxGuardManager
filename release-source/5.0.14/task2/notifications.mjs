import{parse}from'acorn';import{walk,applyEdits}from'./catalogs.mjs';
export function patchNotifications(source,name){
 if(name.startsWith('index-DTnhxNQ_')){
  const opening='function Ft(){const nyxChannelSave=y.useRef(false);';
  if(!source.includes(opening))throw Error('Notification state prerequisite changed');
  source=source.replace(opening,opening+'const nyxDraftBaseline=y.useRef(null);');
  const draft='j=d.draft.config;return e.jsxs';if(!source.includes(draft))throw Error('Notification draft prerequisite changed');
  source=source.replace(draft,'j=d.draft.config;if(!d.open)nyxDraftBaseline.current=null;else if(nyxDraftBaseline.current===null)nyxDraftBaseline.current=JSON.stringify(d.draft);return e.jsxs');
  const edits=[
   ['Bt=["attack_ban","cert_expiring","cert_renewed"]','Bt=["attack_ban","cert_expiring","cert_renewed","failed_login"]'],
   ['className:t.notifHeader,','className:t.notifHeader,"data-nyx-notification-header":true,'],
   ['className:t.notifForm,','className:t.notifForm,"data-nyx-notification-form":true,"data-nyx-dirty":nyxDraftBaseline.current!==JSON.stringify(d.draft),'],
   ['className:t.notifEventsRow,','className:t.notifEventsRow,"data-nyx-notify-events":true,'],
   ['className:t.notifCard,','className:t.notifCard,"data-nyx-channel-id":n.id,'],
   ['className:t.notifEventList,','className:t.notifEventList,"data-nyx-notification-event-list":true,'],
   ['className:t.notifEventPill,','className:t.notifEventPill,"data-nyx-notification-event":w,'],
   ['className:t.notifEventItem,','className:t.notifEventItem,"data-nyx-notification-event":n,'],
   ['checked:d.draft.events.includes(n),','"data-nyx-failed-login-checkbox":n==="failed_login"?"1":undefined,checked:d.draft.events.includes(n),'],
  ];
  for(const[old,next]of edits){if(!source.includes(old))throw Error('Notification prerequisite changed: '+old);source=source.replace(old,next);}
 }
 if(name.startsWith('notification-visibility-')){
  const replacements={
   isNotificationPage:'function isNotificationPage(){return !!document.querySelector("[data-nyx-notification-header]");}',
   findSettingsPanel:'function findSettingsPanel(){return document.querySelector("[data-nyx-notification-header]")?.parentElement||null;}',
   findFormPanel:'function findFormPanel(){return findSettingsPanel()?.querySelector("[data-nyx-notification-form]")||null;}',
   findNotifyContainer:'function findNotifyContainer(panel){return panel.querySelector("[data-nyx-notify-events]");}',
   findCardForChannel:'function findCardForChannel(channel){return Array.from(findSettingsPanel()?.querySelectorAll("[data-nyx-channel-id]")||[]).find(card=>card.dataset.nyxChannelId===String(channel.id))||null;}',
   labelKnownEventPills:'function labelKnownEventPills(){/* Native event pills use the canonical localization component. */}',
   cardAlreadyShowsFailedLogin:'function cardAlreadyShowsFailedLogin(card){return !!card.querySelector("[data-nyx-notification-event=failed_login]");}',
   ensureFailedLoginCheckbox:'function ensureFailedLoginCheckbox(){/* Native controlled checkbox preserves draft state and capability guards. */}',
  },edits=[];
  walk(parse(source,{ecmaVersion:'latest'}),node=>{if(node.type==='FunctionDeclaration'&&replacements[node.id?.name]){edits.push({start:node.start,end:node.end,value:replacements[node.id.name]});delete replacements[node.id.name]}});
  if(Object.keys(replacements).length)throw Error('Missing notification helper prerequisites');source=applyEdits(source,edits);
  source=source.replace('pill.textContent = eventLabels.failed_login;','pill.textContent = window.NyxI18n.message("settings.notifications.event-failed-login");');
  const start=source.indexOf('var eventRow = Array.from(card.querySelectorAll("div"))');
  if(start<0)throw Error('Notification event row prerequisite changed');const end=source.indexOf('eventRow.appendChild(pill);',start);
  source=source.slice(0,start)+'var eventRow = card.querySelector("[data-nyx-notification-event-list]") || card;\n'+source.slice(end);
 }
 return source;
}
