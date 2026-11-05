import assert from "node:assert/strict";
import { validWorkspaceValue, validWorkspaceSnapshot, mockStorageKey, type WorkspaceSnapshot } from "./workspace-state.ts";
const { PUT, GET } = await import("../app/api/workspace/route.ts");
const original = globalThis.fetch;
process.env.GITHUB_TOKEN = "test-only";
let entries: WorkspaceSnapshot = {}, sha = "a".repeat(40), writes = 0, unavailable = false, racing = false;
const mock = mockStorageKey("Recruiter-screen narrative recordings");
const revision = "11111111-1111-4111-8111-111111111111";
const nextRevision = "22222222-2222-4222-8222-222222222222";
globalThis.fetch = async (_input, init) => {
  if (unavailable) return Response.json({ message: "unavailable" }, { status: 403 });
  if (init?.method === "PUT") {
    const body = JSON.parse(String(init.body));
    if (racing) { racing = false; entries["settings.theme"] = { value: "dark", revision: nextRevision, updatedAt: new Date().toISOString() }; sha = "b".repeat(40); return Response.json({ message: "conflict" }, { status: 409 }); }
    if (body.sha !== sha && Object.keys(entries).length) return Response.json({ message: "conflict" }, { status: 409 });
    entries = JSON.parse(Buffer.from(body.content, "base64").toString("utf8")); writes++; sha = "c".repeat(40);
    return Response.json({ content: { sha } });
  }
  return Object.keys(entries).length ? Response.json({ content: Buffer.from(JSON.stringify(entries, null, 1)).toString("base64"), sha }) : Response.json({}, { status: 404 });
};
const update = (key: string, value: unknown, expected: string | null = null, mutationId = revision) => PUT(new Request("https://lumen.test/api/workspace", { method: "PUT", body: JSON.stringify({ key, value, expected, mutationId }) }));
try {
  assert.equal(validWorkspaceValue("settings.weeklyHours", 0), false);
  assert.equal(validWorkspaceValue("settings.weeklyHours", 16), true);
  assert.equal(validWorkspaceValue("settings.aim", "unexpected"), false);
  assert.equal(validWorkspaceValue(mock, 100), false);
  assert.equal(validWorkspaceValue("../../.env", "secret"), false);
  assert.equal(validWorkspaceSnapshot({ bad: { value: true } }), false);
  assert.deepEqual((await (await GET()).json()).entries, {});
  assert.equal((await update("settings.weeklyHours", 20)).status, 200); assert.equal(writes, 1);
  assert.equal((await update("settings.weeklyHours", 20)).status, 200); assert.equal(writes, 1, "same-value retry is idempotent");
  assert.equal((await update("settings.weeklyHours", 25, null, nextRevision)).status, 409, "stale key revision never overwrites");
  assert.equal((await update("settings.weeklyHours", 20, null, nextRevision)).status, 409, "a different stale mutation cannot masquerade as a replay");
  racing = true;
  assert.equal((await update(mock, 1)).status, 200);
  assert.equal(entries["settings.theme"].value, "dark", "another key's concurrent change survives");
  assert.equal(entries[mock].value, 1);
  const before = writes;
  assert.equal((await update(mock, -1)).status, 400); assert.equal(writes, before);
  const module = { status: "In progress", draft: "My contract", checks: [true, false, true, false] };
  assert.equal((await update("gtm.hubspot-data-contract", module)).status, 200);
  unavailable = true;
  assert.equal((await update("settings.display", "large")).status, 503);
  console.log("Workspace sync: validation, idempotent replay, stale-key conflict, independent-key race, mock counts, GTM contract and outage handling passed.");
} finally { globalThis.fetch = original; }
