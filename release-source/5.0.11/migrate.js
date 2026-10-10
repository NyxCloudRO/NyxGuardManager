import {createRequire} from 'node:module';
import {advance,migrationStatus} from './internal/startup-progress.mjs';
import {observedMigrations} from './internal/observed-migrations.mjs';
import db from './db.js';
import {migrate as logger} from './logger.js';
const require=createRequire(import.meta.url);
const {FsMigrations}=require('knex/lib/migrations/migrate/sources/fs-migrations.js');
const migrateUp=async()=>{
 const version=await db().migrate.currentVersion();
 logger.info('Current database version:',version);
 advance('migration-schema');
 logger.info('Discovering pending migrations and acquiring the migration lock');
 const source=observedMigrations(new FsMigrations('migrations'),{
  start(name){migrationStatus(name,'running');advance('migration-start');logger.info('Starting migration:',name);},
  complete(name){migrationStatus(name,'complete');advance('migration-finished');logger.info('Completed migration:',name);},
  failed(name,code){migrationStatus(name,'failed');logger.error('Migration failed:',name,code);}
 });
 const result=await db().migrate.latest({tableName:'migrations',directory:'migrations',migrationSource:source});
 advance('migration-complete');
 logger.info('Database migrations complete');
 return result;
};
export {migrateUp};
