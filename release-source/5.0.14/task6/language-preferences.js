// Extend the existing localStorage locale path with the same user scope as themes.
// The legacy locale key remains the active compatibility mirror for accepted code.
(function(global){
 'use strict';
 var codes=NYX_LANGUAGE_CODES;
 function valid(value){var code=typeof value==='string'?value.slice(0,2):'';return codes.includes(code)?code:'en';}
 function read(){
  try{
   var legacy=valid(global.localStorage.getItem('locale')||global.document.documentElement.lang);
   var id=global.NyxThemePreferences.user();
   if(!id)return legacy;
   var key='locale:user:'+id,saved=global.localStorage.getItem(key);
   // Seed from the user's current value; never reset on deployment/build versions.
   if(saved===null){global.localStorage.setItem(key,legacy);return legacy;}
   return valid(saved);
  }catch{return valid(global.document.documentElement.lang);}
 }
 function write(value){
  var code=valid(value);
  try{var id=global.NyxThemePreferences.user();if(id)global.localStorage.setItem('locale:user:'+id,code);global.localStorage.setItem('locale',code);}catch{/* Same storage-unavailable behavior as the accepted preference path. */}
 }
 global.NyxLanguagePreferences={read:read,write:write};
 var current=read();write(current);global.document.documentElement.lang=current;
 // Native login/logout and token refresh already publish this session event.
 // Reload only when an account's saved language differs, as native language
 // selection already does; token refreshes and unchanged locales do not reload.
 global.addEventListener('nyxguard:session-change',function(){
  var next=read(),previous=valid(global.document.documentElement.lang);write(next);
  if(next!==previous)global.location.reload();
 });
})(window);
