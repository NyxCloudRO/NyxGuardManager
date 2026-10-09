import policy from './release-policy.json' with {type:'json'};
export default policy;
export const sourceSchemas=policy.sources;
export const supportedTransition=(from,to)=>to===policy.version&&Object.hasOwn(policy.sources,from);
export function persistentSource(mount) {
  if(!mount?.RW||!['volume','bind'].includes(mount.Type)) throw new Error('Persistent writable mount required');
  const source=mount.Type==='volume'?mount.Name:mount.Source;
  if(!source||!(mount.Type==='volume'?/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(source):source.startsWith('/')&&!source.includes(':')&&!source.split('/').includes('..'))) throw new Error('Unsafe persistent mount source');
  return source;
}
export function assertDatabasePair(manager,database) {
  const env=c=>Object.fromEntries((c.Config.Env||[]).map(value=>{const at=value.indexOf('=');return [value.slice(0,at),value.slice(at+1)];}));
  const app=env(manager),db=env(database);
  const shared=Object.keys(manager.NetworkSettings.Networks||{}).filter(name=>database.NetworkSettings.Networks?.[name]);
  const aliases=shared.flatMap(name=>database.NetworkSettings.Networks[name].Aliases||[]);
  aliases.push(String(database.Name||'').replace(/^\//,''));
  if(!aliases.includes(app.DB_MYSQL_HOST)||String(app.DB_MYSQL_PORT||3306)!=='3306'||
    app.DB_MYSQL_NAME!==db.MYSQL_DATABASE||app.DB_MYSQL_USER!==db.MYSQL_USER||app.DB_MYSQL_PASSWORD!==db.MYSQL_PASSWORD)
    throw new Error('Installed Compose database does not match Manager database configuration; protect that database before upgrading');
}
