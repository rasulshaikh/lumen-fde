import assert from "node:assert/strict";
import { searchRecordedWork } from "./records.ts";
const before = globalThis.fetch, token = process.env.GITHUB_TOKEN;
process.env.GITHUB_TOKEN = "fixture-only";
try {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input)); assert.equal(url.hostname, "api.github.com");
    if (url.pathname.endsWith("/reports/asks")) return Response.json([]);
    if (url.pathname.endsWith("/reports/notes")) return Response.json(Array.from({ length: 5 }, (_, i) => ({ type: "file", name: `2026-11-0${i+1}-hybrid-${i}.md`, path: `reports/notes/2026-11-0${i+1}-hybrid-${i}.md` })));
    return Response.json({ content: Buffer.from("# Hybrid retrieval\n" + "A long saved record. ".repeat(1000)).toString("base64") });
  };
  const result = await searchRecordedWork("hybrid", AbortSignal.timeout(5000));
  assert.equal(result.passages.length, 3);
  assert.match(result.warning!, /3 files selected from 5/); assert.match(result.warning!, /not an exhaustive audit/); assert.match(result.warning!, /9,000/);
  globalThis.fetch = async () => Response.json({}, { status: 403 });
  assert.match((await searchRecordedWork("hybrid", AbortSignal.timeout(5000))).warning!, /unavailable or partial/);
  console.log("Recorded retrieval: bounded candidate scope, truncation and upstream failure are disclosed.");
} finally { globalThis.fetch = before; if (token === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = token; }
