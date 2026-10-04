(function(global){
 'use strict';
 var themes=['obsidian-guard','premium-nyx','void-black','nyx-aurora','nyx-ember','forest','midnight','oceanic','crimson-noir','frost-glyph','velvet-singularity','cobalt-eclipse'];
 var fallback='premium-nyx',prefix='app_theme:user:';
 function user(){try{var auth=JSON.parse(global.localStorage.getItem('authentications')||'[]').at(-1);if(!auth?.token)return null;var encoded=auth.token.split('.')[1];var data=JSON.parse(global.atob(encoded.replace(/-/g,'+').replace(/_/g,'/')));var id=data.attrs?.id;return Number.isSafeInteger(id)&&id>0&&data.exp*1000>Date.now()?id:null;}catch{return null;}}
 function valid(theme){return themes.includes(theme)?theme:fallback;}
 function read(){try{var id=user();return id?valid(global.localStorage.getItem(prefix+id)):fallback;}catch{return fallback;}}
 function write(theme){try{var id=user();if(id)global.localStorage.setItem(prefix+id,valid(theme));}catch{/* Storage unavailable: current React selection still works. */}}
 function changed(){global.dispatchEvent(new Event('nyxguard:session-change'));}
 global.NyxThemePreferences={read:read,write:write,valid:valid,user:user,changed:changed};
 // The existing theme provider applies color tokens before paint. Restore its ID
 // in the HTML head as well; never reset preferences merely for a build version.
 global.document.documentElement.setAttribute('data-app-theme',read());
 global.document.documentElement.setAttribute('data-bs-theme','dark');
})(window);
