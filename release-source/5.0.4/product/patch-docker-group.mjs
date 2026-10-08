import fs from 'node:fs';
import crypto from 'node:crypto';

const file = process.argv[2];
if (!file) throw new Error('Backend service run file required');
const source = fs.readFileSync(file, 'utf8');
if (crypto.createHash('sha256').update(source).digest('hex') !== '8b9071a3dd68e5c79a4715851e72fd1bf4bc32aaf2c3f18742648da33f4afa31')
  throw new Error('Unexpected backend service prerequisite');
const before = 'if [ -S /var/run/docker.sock ] && [ -n "${NYXGUARD_DOCKER_USAGE_CONTAINERS:-}" ]; then';
if (source.split(before).length !== 2) throw new Error('Unexpected Docker socket group guard');
// Metrics use default container names when the optional override is unset.
// Preserve the existing socket GID through the existing non-root setpriv path.
fs.writeFileSync(file, source.replace(before, 'if [ -S /var/run/docker.sock ]; then'));
