import { execFileSync } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const [bundleArg, restoreArg] = process.argv.slice(2);
if (!bundleArg || !restoreArg) throw new Error('Usage: node scripts/backup-rehearsal.mjs /absolute/backup.bundle /absolute/new-restore-directory');
const bundle = resolve(bundleArg), restore = resolve(restoreArg);
for (const target of [bundle, restore, `${bundle}.json`]) {
  try { await access(target); throw new Error(`Refusing to overwrite ${target}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const git = (args, cwd = process.cwd()) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const status = git(['status', '--porcelain']);
if (status) throw new Error('Commit or stash changes before backing up; bundles contain committed files only.');
const started = performance.now();
const head = git(['rev-parse', 'HEAD']);
git(['bundle', 'create', bundle, '--all']);
git(['bundle', 'verify', bundle]);
git(['clone', '--no-hardlinks', bundle, restore]);
if (git(['rev-parse', 'HEAD'], restore) !== head) throw new Error('Restored HEAD differs.');
git(['fsck', '--full'], restore);
const reportFiles = git(['ls-tree', '-r', '--name-only', 'HEAD', '--', 'reports'], restore).split('\n').filter(Boolean);
let jsonFiles = 0;
for (const file of reportFiles.filter((file) => file.endsWith('.json'))) { JSON.parse(await readFile(`${restore}/${file}`, 'utf8')); jsonFiles++; }
const result = { head, reportFiles: reportFiles.length, validJsonFiles: jsonFiles, elapsedSeconds: Number(((performance.now() - started) / 1000).toFixed(2)), sha256: createHash('sha256').update(await readFile(bundle)).digest('hex'), scope: 'Committed repository and Git history only. Provider configuration and secrets require separate owner recovery.' };
await writeFile(`${bundle}.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
