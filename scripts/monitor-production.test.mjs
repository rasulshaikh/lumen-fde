import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { monitor, freshness } from './monitor-production.mjs';
test('monitor detects stale work and an exposed private API independently', async () => {
  const now = Date.parse('2026-11-05T10:00:00Z');
  assert.throws(() => freshness('digest', '2026-11-01', now), /older/);
  assert.throws(() => freshness('digest', 'invalid', now), /missing/);
  const root = await mkdtemp(`${tmpdir()}/lumen-monitor-`);
  const original = globalThis.fetch;
  try {
    await mkdir(`${root}/reports/market`, { recursive: true });
    await mkdir(`${root}/reports/operations`);
    await writeFile(`${root}/reports/market/index.json`, JSON.stringify({ updatedAt: new Date(now).toISOString() }));
    await writeFile(`${root}/reports/market/benchmark.json`, JSON.stringify({ day: '2026-11-05' }));
    let exposed = false;
    globalThis.fetch = async (url) => String(url).endsWith('/healthz') ? Response.json({ ok: true }) : new Response(null, { status: exposed ? 200 : 401 });
    await monitor({ root, now, startedAt: new Date(now).toISOString() });
    await assert.rejects(monitor({ root, now, startedAt: '2026-11-01' }), /grace/);
    await writeFile(`${root}/reports/operations/daily-digest.json`, JSON.stringify({ acceptedAt: new Date(now).toISOString() }));
    await monitor({ root, now });
    exposed = true;
    await assert.rejects(monitor({ root, now }), /anonymous gate/);
  } finally { globalThis.fetch = original; await rm(root, { recursive: true }); }
});
