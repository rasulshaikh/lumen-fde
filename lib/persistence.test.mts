import assert from "node:assert/strict";
process.env.GITHUB_TOKEN = "test-only";
const { POST } = await import("../app/api/artifacts/route.ts");
const { GET: progress } = await import("../app/api/progress/route.ts");
const { PUT: review } = await import("../app/api/review/route.ts");
const { recordDigestDelivery } = await import("./operations.ts");
const original = globalThis.fetch;
const files = new Map<string, string>();
let puts = 0;
try {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)), path = url.pathname;
    if (init?.method === "PUT") {
      puts++;
      const body = JSON.parse(String(init.body));
      if (files.has(path)) return Response.json({ message: "already exists" }, { status: 422 });
      files.set(path, body.content);
      return Response.json({ content: { sha: "a".repeat(40), html_url: "https://example.test/proof" } });
    }
    return files.has(path) ? Response.json({ content: files.get(path), sha: "a".repeat(40) }) : Response.json({}, { status: 404 });
  };
  const body = { row: 1, title: "Replay fixture", url: "https://example.test", date: "2026-11-05T12:00:00.000Z" };
  const key = "2026-11-05T12-00-00-000Z--12345678-1234-4123-8123-123456789abc";
  const request = (value = body) => new Request("https://lumen.test/api/artifacts", { method: "POST", headers: { "Idempotency-Key": key, "Content-Type": "application/json" }, body: JSON.stringify(value) });
  const first = await (await POST(request())).json();
  const replay = await (await POST(request())).json();
  assert.equal(first.saved, true); assert.equal(replay.saved, true); assert.equal(first.path, replay.path); assert.equal(files.size, 1);
  assert.equal((await POST(request({ ...body, title: "Different payload" }))).ok, false);
  assert.equal(files.size, 1, "same identity never overwrites another payload");
  assert.equal((await POST(new Request("https://lumen.test", { method: "POST", headers: { "Idempotency-Key": "../../escape" }, body: JSON.stringify(body) }))).status, 400);
  assert.ok(puts >= 2);
  globalThis.fetch = async (input, init) => {
    assert.ok(init?.signal);
    const url = String(input);
    assert.match(url, /ref=main/);
    if (new URL(url).pathname.endsWith('/reports/progress')) return Response.json(Array.from({ length: 125 }, (_, i) => ({ name: `${String(i).padStart(3, '0')}.md`, path: `reports/progress/${i}.md` })));
    return Response.json({ content: Buffer.from(`Topic: Topic ${url.match(/progress\/(\d+)/)?.[1]}\nStatus: done\nDate: 2026-11-05`).toString('base64') });
  };
  const history = await (await progress()).json();
  assert.equal(history.events.length, 125, "history retains older topics beyond 100 events");
  globalThis.fetch = async (_input, init) => init?.method === 'PUT' ? Response.json({ message: 'conflict' }, { status: 409 }) : Response.json({ content: 'different', sha: 'b'.repeat(40) });
  const conflict = await review(new Request('https://lumen.test', { method: 'PUT', body: JSON.stringify({ state: { k: { rung: 1, seen: 1, due: '2026-11-05' } }, sha: 'a'.repeat(40) }) }));
  assert.equal(conflict.status, 409); assert.equal((await conflict.json()).saved, false);
  let wrote = false;
  globalThis.fetch = async (_input, init) => { wrote ||= init?.method === 'PUT'; return Response.json({ message: 'unavailable' }, { status: 403 }); };
  assert.equal(await recordDigestDelivery(), false); assert.equal(wrote, false, "an unreadable heartbeat is never overwritten");
  console.log("Persistence: replayed proof, conflicting payload, path validation, 125 progress events, conditional review conflict and heartbeat failure passed.");
} finally { globalThis.fetch = original; }
