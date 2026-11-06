const test = require("node:test");
const assert = require("node:assert/strict");
const { createTransport } = require("./transport");

test("MCP rejects malformed traffic without losing the process", async () => {
  let calls = 0;
  const server = createTransport({ tools: [{ name: "echo", inputSchema: { type: "object", required: ["value"], properties: { value: { type: "string", maxLength: 10 } } } }], callTool: async (_name, args) => { calls++; return { content: [{ type: "text", text: args.value }] }; }, authError: (req) => req.headers.authorization === "Bearer fixture" ? null : { status: 401, message: "Unauthorized" }, rateLimited: () => false, audit() {}, version: "test", askMode: () => "unavailable" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const rpc = (body, headers = {}) => fetch(base + "/mcp", { method: "POST", headers: { authorization: "Bearer fixture", "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
  try {
    assert.equal((await fetch(base + "/mcp", { method: "POST", body: "{}" })).status, 401);
    for (const body of ["null", "1", '"text"', '{}', '{"jsonrpc":"2.0","method":"tools/list","params":[]}']) {
      const response = await rpc(body); assert.equal(response.status, 200); assert.ok((await response.json()).error);
    }
    assert.equal((await (await rpc("{")).json()).error.code, -32700);
    const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "future-unsupported" } });
    assert.equal((await init.json()).result.protocolVersion, "2025-11-25"); assert.equal(init.headers.get("mcp-protocol-version"), "2025-11-25");
    assert.equal((await rpc({ jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
    assert.equal((await rpc({}, { origin: "https://evil.test" })).status, 403);
    assert.equal((await rpc({}, { "content-type": "text/plain" })).status, 415);
    assert.equal((await rpc({}, { "mcp-protocol-version": "unknown" })).status, 400);
    assert.equal((await fetch(base + "/mcp", { headers: { authorization: "Bearer fixture" } })).status, 405);
    assert.equal((await rpc(JSON.stringify({ value: "é".repeat(70000) }))).status, 413, "body cap counts UTF-8 bytes, not characters");
    assert.equal((await (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "echo", arguments: { value: 5 } } })).json()).error.code, -32602);
    assert.equal((await rpc({}, { accept: "text/plain" })).status, 406);
    assert.equal(calls, 0);
    const echo = await (await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "echo", arguments: { value: "café" } } })).json();
    assert.equal(echo.result.content[0].text, "café"); assert.equal(calls, 1);
    const batch = await (await rpc([{ jsonrpc: "2.0", id: 5, method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }])).json();
    assert.equal(batch.length, 1); assert.equal(batch[0].id, 5);
    assert.equal((await fetch(base + "/healthz")).status, 200, "server remains healthy after all malformed requests");
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("real MCP tools and Ask proxy preserve sources and scope warnings", async () => {
  process.env.MCP_API_KEY = "fixture";
  process.env.LUMEN_INTERNAL_API_KEY = "internal-fixture";
  const http = require("node:http");
  const upstream = http.createServer((req, res) => {
    assert.equal(req.headers["x-lumen-internal-key"], "internal-fixture");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ answer: "Use the syllabus [S1].", sources: [{ label: "S1", title: "Shell", url: "/plan?row=1" }], retrieval: { limited: true, warnings: ["Only two notes were inspected."] } }));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  process.env.LUMEN_ASK_URL = `http://127.0.0.1:${upstream.address().port}/api/ask`;
  const { server } = require("./server");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const rpc = async (method, params) => (await fetch(base + "/mcp", { method: "POST", headers: { authorization: "Bearer fixture", "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
  try {
    const listed = await rpc("tools/list"); assert.ok(listed.result.tools.length >= 18);
    const plan = await rpc("tools/call", { name: "get_plan", arguments: { row: 1 } });
    assert.equal(JSON.parse(plan.result.content[0].text).rows[0].topic, "Shell mastery and scripting");
    const syllabus = await rpc("tools/call", { name: "get_syllabus", arguments: { row: 54 } });
    assert.equal(JSON.parse(syllabus.result.content[0].text).row, 54);
    const invalid = await rpc("tools/call", { name: "record_progress", arguments: { topic: "Shell", status: "made-up" } });
    assert.equal(invalid.error.code, -32602);
    const misspelled = await rpc("tools/call", { name: "record_progress", arguments: { topic: "A topic outside the plan", status: "done" } });
    assert.equal(misspelled.result.isError, true); assert.match(misspelled.result.content[0].text, /matches no plan row/);
    const ask = await rpc("tools/call", { name: "ask_lumen", arguments: { prompt: "Explain shell cleanup" } });
    const answer = JSON.parse(ask.result.content[0].text).answer;
    assert.match(answer, /Only two notes were inspected/); assert.match(answer, /search limit reached/); assert.match(answer, /http:\/\/127.0.0.1:\d+\/plan\?row=1/); assert.ok(!answer.includes("internal-fixture"));
    delete process.env.LUMEN_INTERNAL_API_KEY;
    const unpaired = await rpc("tools/call", { name: "ask_lumen", arguments: { prompt: "Explain shell" } });
    assert.equal(unpaired.result.isError, true); assert.match(unpaired.result.content[0].text, /Configure both/);
  } finally { await Promise.all([new Promise((resolve) => server.close(resolve)), new Promise((resolve) => upstream.close(resolve))]); }
});
