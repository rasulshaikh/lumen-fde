import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function freshness(label, value, now, maxHours = 26) {
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp) || stamp > now + 300_000 || now - stamp > maxHours * 3_600_000) throw new Error(`${label} is missing or older than ${maxHours} hours.`);
}
export async function monitor({ root = '.', base = 'https://lumenfde.com', now = Date.now(), startedAt = process.env.MONITORING_STARTED_AT } = {}) {
  const request = async (path) => fetch(new URL(path, base), { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  const health = await request('/healthz');
  if (!health.ok || !(await health.json()).ok) throw new Error('Lumen health check failed.');
  const gate = await request('/api/progress');
  if (gate.status !== 401) throw new Error(`Private API anonymous gate returned ${gate.status}, expected 401.`);
  const load = async (path) => JSON.parse(await readFile(`${root}/${path}`, 'utf8'));
  freshness('Market index', (await load('reports/market/index.json')).updatedAt, now);
  const benchmark = await load('reports/market/benchmark.json');
  freshness('Market benchmark', benchmark.day, now, 50); // date-only file, allow UTC date boundary
  try {
    freshness('Daily digest acceptance', (await load('reports/operations/daily-digest.json')).acceptedAt, now);
  } catch (error) {
    if (error.code !== 'ENOENT' || !startedAt) throw error;
    freshness('First daily digest grace period', startedAt, now);
    console.log('First digest acceptance is due within the initial 26-hour grace period.');
  }
  console.log('Production health, private gate, market freshness and digest acceptance passed.');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) monitor().catch((error) => { console.error(error.message); process.exitCode = 1; });
