#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const app = process.argv[2];
if (!app) throw new Error("Usage: node patch-current-version.mjs APP_ROOT");
const version = process.argv[3] || "5.0.1-dev";
if (!["5.0.1-dev", "5.0.1"].includes(version)) throw new Error("Unsupported 5.0.1 build version");

function replace(file, from, to, count) {
  const original = fs.readFileSync(file, "utf8");
  const found = original.split(from).length - 1;
  if (found !== count) throw new Error(`${file}: expected ${count} matches for ${from}, found ${found}`);
  fs.writeFileSync(file, original.replaceAll(from, to));
}

const assets = path.join(app, "frontend", "assets");
const main = path.join(assets, "index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js");
replace(path.join(app, "package.json"), '"version": "5.0.0"', `"version": "${version}"`, 1);
replace(main, 'VC="app_theme_ver",$C="5.0.0"', `VC="app_theme_ver",$C="${version}"`, 1);
replace(main, 'Coe="5.0.0"', `Coe="${version}"`, 1);
replace(path.join(assets, "index-DTnhxNQ_.js"), 'K="5.0.0",Bt=', `K="${version}",Bt=`, 1);
replace(path.join(assets, "notification-visibility-4010.js"), 'desiredVersion = "5.0.0"', `desiredVersion = "${version}"`, 1);
replace(main, 'T.data?.restartPending', 'T.data?.downloadedVersion', 2);
replace(main, 'T.data?.pendingVersion', 'T.data?.downloadedVersion', 1);
replace(main, 'T.data.pendingVersion', 'T.data.downloadedVersion', 1);
// Keep the updater truthful when a DEV build is newer than the published channel
// or the release check fails. The action remains disabled without a newer target.
replace(main,
  'g.jsx("div",{children:g.jsx(K,{id:"site-header.latest-version",data:{version:T.data?.latest||"N/A"}})})',
  'g.jsx("div",{children:g.jsx(K,{id:"site-header.latest-version",data:{version:T.data?.latest||T.data?.latestPublished||"N/A"}})})', 1);
replace(main,
  'g.jsx("p",{children:g.jsx(K,{id:"site-header.step-2-desc",data:{version:T.data?.latest||"N/A"}})})',
  'g.jsx("p",{children:T.isPending?"Checking for updates…":T.isError||T.data?.lastCheckError?"Update check unavailable. Use Check now to retry.":T.data?.updateAvailable?g.jsx(K,{id:"site-header.step-2-desc",data:{version:T.data.latest}}):"No newer update is available."})', 1);

const translations = [
  // Dashboard reports the age of the oldest monitored Manager/database
  // container; it does not measure the Docker daemon's uptime.
  ["Docker Uptime", "Oldest monitored container uptime"],
  ["Docker-Laufzeit", "Laufzeit des ältesten überwachten Containers"],
  ["Tiempo de actividad de Docker", "Tiempo activo del contenedor supervisado más antiguo"],
  ["Temps de fonctionnement Docker", "Durée du conteneur surveillé le plus ancien"],
  ["Uptime Docker", "Uptime del container monitorato più vecchio"],
  ["Timp funcționare Docker", "Timp activ al celui mai vechi container monitorizat"],
  ["Restart now", "Activate update"],
  ["Restart required to activate update {version}.", "Update {version} is downloaded. Activate it when ready."],
  ["Update image is ready. Restart is required to activate the new version.", "Update image is downloaded. Activate it when ready."],
  ["Jetzt neu starten", "Update aktivieren"],
  ["Neustart erforderlich, um das Update {version} zu aktivieren.", "Update {version} ist heruntergeladen und kann aktiviert werden."],
  ["Update-Image ist bereit. Neustart erforderlich, um die neue Version zu aktivieren.", "Update-Image ist heruntergeladen und kann aktiviert werden."],
  ["Reiniciar ahora", "Activar actualización"],
  ["Se requiere reinicio para activar la actualización {version}.", "La actualización {version} está descargada y lista para activar."],
  ["La imagen de actualización está lista. Se requiere reinicio para activar la nueva versión.", "La imagen de actualización está descargada y lista para activar."],
  ["Redémarrer maintenant", "Activer la mise à jour"],
  ["Redémarrage requis pour activer la mise à jour {version}.", "La mise à jour {version} est téléchargée et prête à être activée."],
  ["L'image de mise à jour est prête. Un redémarrage est nécessaire pour activer la nouvelle version.", "L'image de mise à jour est téléchargée et prête à être activée."],
  ["Riavvia ora", "Attiva aggiornamento"],
  ["Riavvio richiesto per attivare l'aggiornamento {version}.", "L'aggiornamento {version} è scaricato e pronto per l'attivazione."],
  ["L'immagine di aggiornamento è pronta. È necessario riavviare per attivare la nuova versione.", "L'immagine di aggiornamento è scaricata e pronta per l'attivazione."],
  ["Reporniți acum", "Activați actualizarea"],
  ["Repornire necesară pentru a activa actualizarea {version}.", "Actualizarea {version} este descărcată și gata de activare."],
  ["Imaginea de actualizare este pregătită. Este necesară repornirea pentru a activa noua versiune.", "Imaginea de actualizare este descărcată și gata de activare."],
];
for (const [from, to] of translations) replace(main, `:"${from}"`, `:"${to}"`, 1);
