import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

async function exists(file) { try { await fs.lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
const safeName = name => name !== '.' && name !== '..' && !name.includes('/') && !name.includes('\0');
async function syncDirectories(...directories) {
  for (const directory of directories) {
    const handle = await fs.open(directory, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
  }
}
async function syncTree(root) {
  for (const name of await fs.readdir(root)) {
    const file = path.join(root, name), stat = await fs.lstat(file);
    if (stat.isDirectory()) await syncTree(file);
    else if (stat.isFile()) {
      const handle = await fs.open(file, 'r');
      try { await handle.sync(); } finally { await handle.close(); }
    }
  }
  await syncDirectories(root);
}

export async function durableJson(file, value) {
  const temporary = `${file}.tmp`;
  const handle = await fs.open(temporary, 'w', 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(temporary, file);
  const directory = await fs.open(path.dirname(file), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}

export async function treeFingerprint(root) {
  const records = [];
  async function walk(directory, relative = '') {
    for (const name of (await fs.readdir(directory)).sort()) {
      if (name.startsWith('.nyx-restore-') || name === '.nyx-handover') continue;
      const file = path.join(directory, name), item = path.join(relative, name);
      const stat = await fs.lstat(file);
      const metadata = [item, stat.mode, stat.uid, stat.gid];
      if (stat.isSymbolicLink()) records.push([...metadata, 'link', await fs.readlink(file)]);
      else if (stat.isDirectory()) { records.push([...metadata, 'directory']); await walk(file, item); }
      else if (stat.isFile()) {
        const hash = crypto.createHash('sha256');
        const handle = await fs.open(file, 'r');
        try { for await (const chunk of handle.createReadStream()) hash.update(chunk); }
        finally { await handle.close(); }
        records.push([...metadata, 'file', hash.digest('hex')]);
      } else throw new Error('Unsupported persistent filesystem object');
    }
  }
  await walk(root);
  return crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex');
}

export async function makeFilePlan(id, sources, journal = null) {
  if (!/^[A-Za-z0-9_-]{12,80}$/.test(id)) throw new Error('Invalid file-switch identity');
  const entries = [];
  for (const { source, only } of sources) {
    const stage = path.join(source, `.nyx-restore-${id}`);
    const oldNames = only || (await fs.readdir(source)).filter(name => !name.startsWith('.nyx-restore-') && name !== '.nyx-handover');
    if (oldNames.some(name => !safeName(name))) throw new Error('Unsafe persistent filename');
    entries.push({ source, stage, oldNames, newNames: [] });
  }
  const plan = { format: 'nyxguard-file-switch-v1', phase: 'preparing', entries };
  // Persist ownership and the original inventory before creating any staging
  // directory. A killed extraction can then be restarted without guessing.
  if (journal) await durableJson(journal, plan);
  await prepareFilePlan(plan);
  return plan;
}

export async function prepareFilePlan(plan) {
  if (plan.phase !== 'preparing') throw new Error('File preparation phase mismatch');
  for (const entry of plan.entries) {
    await fs.mkdir(path.join(entry.stage, 'old'), { recursive: true, mode: 0o700 });
    if ((await fs.readdir(path.join(entry.stage, 'old'))).length)
      throw new Error('Original files already moved during preparation');
    // Only this journal-owned extraction directory is replaceable. Neither
    // live files nor the preserved old directory are removed.
    await fs.rm(path.join(entry.stage, 'new'), { recursive: true, force: true });
    await fs.mkdir(path.join(entry.stage, 'new'), { mode: 0o700 });
  }
}

export async function sealFilePlan(plan, journal) {
  for (const entry of plan.entries) {
    await syncTree(path.join(entry.stage, 'new'));
    entry.newNames = (await fs.readdir(path.join(entry.stage, 'new'))).sort();
    if (entry.newNames.some(name => !safeName(name))) throw new Error('Unsafe restored filename');
  }
  plan.phase = 'prepared';
  await durableJson(journal, plan);
}

export async function switchFiles(plan, journal, fault = async () => {}) {
  plan.phase = 'moving'; await durableJson(journal, plan);
  for (const entry of plan.entries) {
    for (const name of entry.oldNames) {
      const old = path.join(entry.stage, 'old', name), live = path.join(entry.source, name);
      if (await exists(old)) continue;
      if (!await exists(live)) throw new Error('Previous persistent item is missing');
      await fs.rename(live, old); await syncDirectories(entry.source, path.dirname(old)); await fault('old-moved');
    }
    for (const name of entry.newNames) {
      const fresh = path.join(entry.stage, 'new', name), live = path.join(entry.source, name);
      if (!await exists(fresh)) {
        if (!await exists(live)) throw new Error('Restored persistent item is missing');
        continue;
      }
      if (await exists(live)) throw new Error('Unexpected persistent item during switch');
      await fs.rename(fresh, live); await syncDirectories(entry.source, path.dirname(fresh)); await fault('new-moved');
    }
  }
  plan.phase = 'switched'; await durableJson(journal, plan);
}

export async function undoFileSwitch(plan, journal) {
  for (const entry of [...plan.entries].reverse()) {
    for (const name of entry.newNames) {
      const live = path.join(entry.source, name), fresh = path.join(entry.stage, 'new', name);
      const captured = await exists(path.join(entry.stage, 'old', name));
      if ((captured || !entry.oldNames.includes(name)) && await exists(live)) {
        if (await exists(fresh)) throw new Error('Ambiguous restored persistent item');
        await fs.rename(live, fresh);
        await syncDirectories(entry.source, path.dirname(fresh));
      }
    }
    for (const name of entry.oldNames) {
      const old = path.join(entry.stage, 'old', name), live = path.join(entry.source, name);
      if (await exists(old)) {
        if (await exists(live)) throw new Error('Ambiguous previous persistent item');
        await fs.rename(old, live);
        await syncDirectories(entry.source, path.dirname(old));
      } else if (!await exists(live)) throw new Error('Previous persistent item is missing');
    }
  }
  plan.phase = 'prepared'; await durableJson(journal, plan);
}
