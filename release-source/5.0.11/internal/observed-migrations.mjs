// Preserve the pinned Knex filesystem source and migration contract while
// reporting execution, rather than module discovery, as completed work.
export function observedMigrations(source,telemetry) {
 return {
  getMigrations: (...args)=>source.getMigrations(...args),
  getMigrationName: (...args)=>source.getMigrationName(...args),
  async getMigration(info) {
   const migration=await source.getMigration(info);
   if(typeof migration.up!=='function')return migration;
   const name=source.getMigrationName(info);
   return {...migration,async up(...args){
    telemetry.start(name);
    try {const result=await migration.up(...args);telemetry.complete(name);return result;}
    catch(error){telemetry.failed(name,/^[A-Z0-9_]{1,64}$/.test(error?.code||'')?error.code:'DATABASE_MIGRATION_FAILED');throw error;}
   }};
  }
 };
}
