// Disposable replacement entrypoint: modify rollback-critical state, record
// proof outside the restored volumes, and fail before health can pass.
import fs from "node:fs/promises";
import db from "/app/db.js";

const knex = db();
await knex.raw("UPDATE task1a_recovery_marker SET value = 'after' WHERE id = 1");
await fs.writeFile("/data/task1a-marker", "after\n");
await fs.writeFile("/etc/letsencrypt/task1a-marker", "after\n");
await fs.writeFile("/evidence/modified", "post-mutation failure reached\n");
await knex.destroy();
if (process.env.NYX_TASK1A_HANG === "1") await new Promise(() => setInterval(() => {}, 1000));
process.exitCode = 1;
