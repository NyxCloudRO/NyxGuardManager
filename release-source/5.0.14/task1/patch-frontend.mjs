import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.argv[2],inputs=process.argv[3];
const assets=root+'/frontend/assets';
function replace(s,old,value,count=1){if(s.split(old).length!==count+1)throw new Error('Frontend prerequisite differs: '+old.slice(0,80));return s.replaceAll(old,value);}
const mainName=fs.readdirSync(assets).find(name=>name.startsWith('index-CTHAIRmi-409dev-4012certfix4-'));
let main=fs.readFileSync(path.join(assets,mainName),'utf8');
main=replace(main,'function _oe({children:e}){return','function _oe({children:e}){const {data:nyxUser,isPending:nyxPending}=ql("me",{staleTime:0,refetchInterval:5000});window.NyxGuardCapabilities.identity=nyxUser;e=nyxPending?g.jsx(wi,{noLogo:true}):!window.NyxGuardCapabilities.canViewRoute(nyxUser,location.pathname,location.hash)?g.jsx(vn,{variant:"danger",children:g.jsx(K,{id:"no-permission-error"})}):e;return');
main=replace(main,'ue.isAdmin&&(ue.roles=["admin"])','(ue.roles=ue.isAdmin?["admin"]:he?["nyxagent"]:[])');
main=replace(main,'isAdmin:a?.roles?.includes("admin")','isAdmin:sV(a?.roles)');
main=replace(main,'isNyxAgent:!a?.roles?.includes("admin")&&F(a?.permissions)','isNyxAgent:a?.roles?.includes("nyxagent")||!a?.roles?.includes("admin")&&F(a?.permissions)');
// Honor effective monitoring precedence even for an invalid historic combination.
main=replace(main,'sV=e=>e?.includes("admin")||!1','sV=e=>!e?.includes("nyxagent")&&(e?.includes("admin")||!1)');
main=replace(main,'Coe="5.0.13"','Coe="5.0.14"');
main=replace(main,'throw new Error(a)}return n?vx.camelizeKeys(n):null}', 'throw new Error(a?.startsWith?.("nyxagent.")?st.formatMessage({id:a}):a)}return n?vx.camelizeKeys(n):null}');

main=replace(main,'id:t?"role.admin":"role.standard-user"','id:e?.monitoringOnly?"user.nyx-agent":t?"role.admin":"role.standard-user"');
main=replace(main,'icon:_V,label:"proxy-hosts",permissionSection:"nyxguard"','icon:_V,label:"proxy-hosts",permissionSection:"proxyHosts"');
main=replace(main,'to:"/",icon:BV,label:"dashboard"','to:"/",icon:BV,label:"dashboard",permissionSection:"nyxguard",permission:hc');
const translations={
 en:['VPN Client','Licensing','Diagnostics & Support','Update Manager','Search','Details','Previous','Next','Close'],
 de:['VPN-Client','Lizenzierung','Diagnose und Support','Update-Verwaltung','Suchen','Details','Zurück','Weiter','Schließen'],
 es:['Cliente VPN','Licencias','Diagnóstico y soporte','Gestor de actualizaciones','Buscar','Detalles','Anterior','Siguiente','Cerrar'],
 fr:['Client VPN','Licences','Diagnostic et assistance','Gestion des mises à jour','Rechercher','Détails','Précédent','Suivant','Fermer'],
 it:['Client VPN','Licenze','Diagnostica e supporto','Gestione aggiornamenti','Cerca','Dettagli','Precedente','Successivo','Chiudi'],
 ro:['Client VPN','Licențiere','Diagnosticare și asistență','Manager de actualizări','Căutare','Detalii','Anterior','Următor','Închide']};
const extraTranslations={"en": ["Record", "State", "Configuration", "Category", "Result", "Actor", "Time window", "All", "All categories", "Security administration", "Users / Authentication", "Application / Operations", "Access", "Configuration", "All results", "Success", "Failed", "Denied", "Unknown", "{hours} hours"], "de": ["Eintrag", "Status", "Konfiguration", "Kategorie", "Ergebnis", "Akteur", "Zeitraum", "Alle", "Alle Kategorien", "Sicherheitsverwaltung", "Benutzer / Authentifizierung", "Anwendung / Betrieb", "Zugriff", "Konfiguration", "Alle Ergebnisse", "Erfolgreich", "Fehlgeschlagen", "Abgelehnt", "Unbekannt", "{hours} Stunden"], "es": ["Registro", "Estado", "Configuración", "Categoría", "Resultado", "Actor", "Periodo", "Todos", "Todas las categorías", "Administración de seguridad", "Usuarios / Autenticación", "Aplicación / Operaciones", "Acceso", "Configuración", "Todos los resultados", "Correcto", "Fallido", "Denegado", "Desconocido", "{hours} horas"], "fr": ["Entrée", "État", "Configuration", "Catégorie", "Résultat", "Acteur", "Période", "Tous", "Toutes les catégories", "Administration de sécurité", "Utilisateurs / Authentification", "Application / Opérations", "Accès", "Configuration", "Tous les résultats", "Réussite", "Échec", "Refusé", "Inconnu", "{hours} heures"], "it": ["Voce", "Stato", "Configurazione", "Categoria", "Risultato", "Autore", "Periodo", "Tutti", "Tutte le categorie", "Amministrazione sicurezza", "Utenti / Autenticazione", "Applicazione / Operazioni", "Accesso", "Configurazione", "Tutti i risultati", "Riuscito", "Fallito", "Negato", "Sconosciuto", "{hours} ore"], "ro": ["Înregistrare", "Stare", "Configurație", "Categorie", "Rezultat", "Actor", "Interval", "Toate", "Toate categoriile", "Administrarea securității", "Utilizatori / Autentificare", "Aplicație / Operațiuni", "Acces", "Configurație", "Toate rezultatele", "Succes", "Eșuat", "Refuzat", "Necunoscut", "{hours} ore"]};
for (const language of Object.keys(translations)) translations[language].push(...extraTranslations[language]);
const roleMessages={"en": ["Administrator and NyxAgent roles are mutually exclusive.", "At least one enabled Administrator must remain."], "de": ["Administrator und NyxAgent schließen sich gegenseitig aus.", "Mindestens ein aktiver Administrator muss erhalten bleiben."], "es": ["Los roles Administrador y NyxAgent son mutuamente excluyentes.", "Debe quedar al menos un administrador habilitado."], "fr": ["Les rôles Administrateur et NyxAgent sont incompatibles.", "Au moins un administrateur actif doit être conservé."], "it": ["I ruoli Amministratore e NyxAgent si escludono a vicenda.", "Deve rimanere almeno un amministratore abilitato."], "ro": ["Rolurile Administrator și NyxAgent se exclud reciproc.", "Trebuie păstrat cel puțin un administrator activ."]};
for (const language of Object.keys(translations)) translations[language].push(...roleMessages[language]);
const languages=['de','en','es','fr','it','ro'];let catalogIndex=0;
main=main.replace(/"user.nyx-agent":"(?:[^"\\]|\\.)*"/g,match=>{
 const language=languages[catalogIndex++];if(!language)throw new Error('Unexpected catalog');
 const keys=['vpn','license','diagnostics','update','search','details','previous','next','close','record','state','configuration','category','result','actor','time','all','category.all','category.security','category.users','category.application','category.access','category.configuration','result.all','result.success','result.failed','result.denied','result.unknown','hours','roles-exclusive','last-administrator'];
 const additions=Object.fromEntries(keys.map((key,index)=>['nyxagent.'+key,translations[language][index]]));
 const observationLabels={"en": ["Refresh observations", "Passive observations only. No diagnostic commands were run."], "de": ["Beobachtungen aktualisieren", "Nur passive Beobachtungen. Es wurden keine Diagnosebefehle ausgeführt."], "es": ["Actualizar observaciones", "Solo observaciones pasivas. No se ejecutaron comandos de diagnóstico."], "fr": ["Actualiser les observations", "Observations passives uniquement. Aucune commande de diagnostic exécutée."], "it": ["Aggiorna osservazioni", "Solo osservazioni passive. Nessun comando diagnostico è stato eseguito."], "ro": ["Actualizează observațiile", "Doar observații pasive. Nu au fost executate comenzi de diagnosticare."]}; additions["nyxagent.refresh-observations"]=observationLabels[language][0]; additions["nyxagent.observations-only"]=observationLabels[language][1];
 const scopeLabels={"en": ["NyxGuard Security", "Dashboard, traffic, IPs & Geo, rules, applications, threats and Shieldwall.", "Notifications, integrations, SSO, Grafana, LAN, VPN, licensing, diagnostics and updates. Sensitive operations still require Administrator."], "de": ["NyxGuard-Sicherheit", "Dashboard, Datenverkehr, IPs und Geo, Regeln, Anwendungen, Bedrohungen und Shieldwall.", "Benachrichtigungen, Integrationen, SSO, Grafana, LAN, VPN, Lizenzen, Diagnose und Updates. Sensible Vorgänge erfordern weiterhin Administratorrechte."], "es": ["Seguridad NyxGuard", "Panel, tráfico, IP y geolocalización, reglas, aplicaciones, amenazas y Shieldwall.", "Notificaciones, integraciones, SSO, Grafana, LAN, VPN, licencias, diagnóstico y actualizaciones. Las operaciones sensibles siguen requiriendo un administrador."], "fr": ["Sécurité NyxGuard", "Tableau de bord, trafic, IP et géolocalisation, règles, applications, menaces et Shieldwall.", "Notifications, intégrations, SSO, Grafana, LAN, VPN, licences, diagnostic et mises à jour. Les opérations sensibles nécessitent toujours un administrateur."], "it": ["Sicurezza NyxGuard", "Dashboard, traffico, IP e geolocalizzazione, regole, applicazioni, minacce e Shieldwall.", "Notifiche, integrazioni, SSO, Grafana, LAN, VPN, licenze, diagnostica e aggiornamenti. Le operazioni sensibili richiedono comunque un amministratore."], "ro": ["Securitate NyxGuard", "Panou principal, trafic, IP și Geo, reguli, aplicații, amenințări și Shieldwall.", "Notificări, integrări, SSO, Grafana, LAN, VPN, licențiere, diagnosticare și actualizări. Operațiile sensibile necesită în continuare un Administrator."]};
 for(const [index,key]of ["permissions.group.security","permissions.scope.security","permissions.scope.settings"].entries())additions[key]=scopeLabels[language][index];
 additions["nyxagent.monitoring-permissions"]={"en": "NyxAgent requires View Only for every active module.", "de": "NyxAgent benötigt für jedes aktive Modul Nur-Lese-Zugriff.", "es": "NyxAgent requiere acceso de solo lectura a todos los módulos activos.", "fr": "NyxAgent nécessite un accès en lecture seule à chaque module actif.", "it": "NyxAgent richiede accesso in sola lettura a ogni modulo attivo.", "ro": "NyxAgent necesită acces Doar vizualizare pentru fiecare modul activ."}[language];
 return match+','+JSON.stringify(additions).slice(1,-1);
});
if(catalogIndex!==6)throw new Error('Expected six inherited catalogs');
main+='\n'+fs.readFileSync(inputs+'/read-only-capabilities.js','utf8');
fs.writeFileSync(path.join(assets,mainName),main);
for(const name of fs.readdirSync(assets)){
 if(name.startsWith('boot-hydration-')&&name.endsWith('.js')){
  let s=fs.readFileSync(path.join(assets,name),'utf8');
  s=replace(s,'var USER_CACHE_SCHEMA = "permissions-v2";','var USER_CACHE_SCHEMA = "permissions-v3-monitoring";');
  s=replace(s,'function readCached(url, token) {','function readCached(url, token) { return null;');fs.writeFileSync(path.join(assets,name),s);
 }
}
// Reviewed controls retain their native components and receive one shared capability guard.
const corrections=JSON.parse(fs.readFileSync(inputs+'/native-controls.json','utf8'));
for(const [prefix,changes] of Object.entries(corrections)){
 const matches=fs.readdirSync(assets).filter(name=>name.startsWith(prefix));
 if(matches.length!==1)throw new Error('Expected one native component '+prefix);
 const target=path.join(assets,matches[0]);let source=fs.readFileSync(target,'utf8');
 for(const change of changes)source=replace(source,change.old,change.next,change.count||1);
 fs.writeFileSync(target,source);
}
// Content-derived asset names invalidate inherited long-lived browser caches.
const names=fs.readdirSync(assets).filter(name=>/\.(?:js|css)$/.test(name));
const hash=createHash('sha256');for(const name of names.sort())hash.update(name).update(fs.readFileSync(path.join(assets,name)));
const suffix='-5014-task1-'+hash.digest('hex').slice(0,12);const renames=new Map(names.map(name=>[name,name.replace(/\.(js|css)$/,suffix+'.$1')]));
for(const name of names){let s=fs.readFileSync(path.join(assets,name),'utf8');for(const [old,next]of renames)s=s.replaceAll(old,next);fs.writeFileSync(path.join(assets,renames.get(name)),s);fs.unlinkSync(path.join(assets,name));}
let html=fs.readFileSync(root+'/frontend/index.html','utf8');
const pendingTag=html.match(/<script src="\/assets\/pending-updates-policy-[^"]+"><\/script>/g);
if(pendingTag?.length!==1)throw new Error('Pending update helper prerequisite differs');
html=html.replace(pendingTag[0],'');
html=replace(html,'<script type="module" crossorigin',pendingTag[0]+'\n\t\t<script type="module" crossorigin');
const presentationTag=html.match(/<script src="\/assets\/update-presentation-[^"]+"><\/script>/g);
if(presentationTag?.length!==1)throw new Error('Update helper prerequisite differs');
html=html.replace(presentationTag[0],'');
html=replace(html,'<script type="module" crossorigin',presentationTag[0]+'\n\t\t<script type="module" crossorigin');
for(const [old,next]of renames)html=html.replaceAll(old,next);fs.writeFileSync(root+'/frontend/index.html',html);
for(const name of renames.values())if(name.endsWith('.js'))execFileSync(process.execPath,['--check',path.join(assets,name)]);
const files=Object.fromEntries([...renames.values()].sort().map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(assets,name))).digest('hex')]));
fs.writeFileSync(root+'/frontend/nyxguard-build.json',JSON.stringify({version:'5.0.14',task:1,sourceRevision:process.env.NYXGUARD_SOURCE_REVISION||null,assets:files},null,2));
