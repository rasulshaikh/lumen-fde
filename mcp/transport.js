const http = require("node:http");
const VERSIONS = ["2025-03-26", "2025-06-18", "2025-11-25"];
const PREFERRED = VERSIONS.at(-1);
const MAX_BODY = 128 * 1024;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function validValue(value, schema) {
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === "object") return object(value)
    && (schema.required || []).every((key) => Object.hasOwn(value, key))
    && Object.entries(value).every(([key, item]) => schema.properties?.[key] ? validValue(item, schema.properties[key]) : schema.additionalProperties !== false);
  if (schema.type === "array") return Array.isArray(value) && value.every((item) => validValue(item, schema.items || {}));
  if (schema.type === "integer" || schema.type === "number") return typeof value === "number" && Number.isFinite(value)
    && (schema.type !== "integer" || Number.isInteger(value))
    && (schema.minimum === undefined || value >= schema.minimum) && (schema.maximum === undefined || value <= schema.maximum);
  if (schema.type === "string") return typeof value === "string" && (schema.maxLength === undefined || value.length <= schema.maxLength);
  if (schema.type === "boolean") return typeof value === "boolean";
  return true;
}

/** Stateless JSON Streamable HTTP. Native clients need no Origin; browser origins are explicit. */
function createTransport({ tools, callTool, authError, rateLimited, audit, version, revision, askMode }) {
  const origins = new Set((process.env.MCP_ALLOWED_ORIGINS || "https://lumenfde.com,https://lumen-fde.vercel.app").split(",").map((item) => item.trim()).filter(Boolean));
  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...(origin && origins.has(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}) };
    let protocol = request.headers["mcp-protocol-version"] || VERSIONS[0];
    const reply = (status, body) => {
      if (response.writableEnded || response.destroyed) return;
      response.writeHead(status, { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }), "MCP-Protocol-Version": protocol });
      response.end(body === undefined ? undefined : JSON.stringify(body));
    };
    const error = (id, code, message) => ({ jsonrpc: "2.0", id: ["string", "number"].includes(typeof id) ? id : null, error: { code, message } });
    const result = (id, value) => ({ jsonrpc: "2.0", id, result: value });
    if (request.url === "/healthz" && request.method === "GET") return reply(200, { ok: true, service: "lumen-mcp", version, revision: revision || null, askMode: askMode() });
    if (request.url !== "/mcp") return reply(404, { error: "Not found" });
    if (origin && !origins.has(origin)) return reply(403, { error: "Origin is not allowed" });
    if (request.method === "OPTIONS") {
      response.writeHead(204, { ...headers, "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Expose-Headers": "MCP-Protocol-Version" });
      return response.end();
    }
    const denied = authError(request);
    if (denied) { audit("auth", false, denied.message); return reply(denied.status, { error: denied.message }); }
    if (request.method !== "POST") { response.setHeader("Allow", "POST, OPTIONS"); return reply(405, { error: "This endpoint uses JSON POST responses; standalone SSE is not offered." }); }
    if (!VERSIONS.includes(protocol)) return reply(400, { error: "Unsupported MCP-Protocol-Version", supported: VERSIONS });
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) return reply(415, { error: "Use application/json" });
    if (request.headers.accept && !/application\/json|\*\/\*/i.test(request.headers.accept)) return reply(406, { error: "Accept application/json responses" });
    if (rateLimited(request)) { audit("rate_limit", false, "request window exceeded"); response.setHeader("Retry-After", "60"); return reply(429, { error: "Rate limit exceeded" }); }
    const chunks = []; let bytes = 0, overflow = false;
    request.on("error", () => reply(400, { error: "Request could not be read" }));
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (overflow) return;
      if (bytes > MAX_BODY) { overflow = true; chunks.length = 0; return reply(413, { error: `Request exceeds ${MAX_BODY} bytes` }); }
      chunks.push(chunk);
    });
    const handle = async (body) => {
      if (!object(body) || body.jsonrpc !== "2.0" || (body.id !== undefined && body.id !== null && !["string", "number"].includes(typeof body.id))) return error(null, -32600, "Invalid JSON-RPC request");
      if (typeof body.method !== "string") return error(body.id, -32600, "A method is required");
      if (body.params !== undefined && !object(body.params)) return error(body.id, -32602, "params must be an object");
      if (body.id === undefined) return body.method.startsWith("notifications/") ? null : error(null, -32600, "Requests require an id");
      if (body.method === "initialize") {
        const requested = body.params?.protocolVersion;
        protocol = VERSIONS.includes(requested) ? requested : PREFERRED;
        return result(body.id, { protocolVersion: protocol, capabilities: { tools: {} }, serverInfo: { name: "lumen-mcp", version } });
      }
      if (body.method === "ping") return result(body.id, {});
      if (body.method === "tools/list") return result(body.id, { tools });
      if (body.method !== "tools/call") return error(body.id, -32601, `Unsupported method: ${body.method}`);
      const name = body.params?.name, tool = tools.find((item) => item.name === name), args = body.params?.arguments ?? {};
      if (!tool) return error(body.id, -32602, "Unknown tool");
      if (!validValue(args, tool.inputSchema)) return error(body.id, -32602, `Invalid arguments for ${name}`);
      try {
        const value = await callTool(name, args); audit(name, !value?.isError, "completed"); return result(body.id, value);
      } catch (reason) {
        const message = String(reason?.message || reason).slice(0, 300); audit(name, false, message);
        return result(body.id, { content: [{ type: "text", text: `Tool ${name} failed: ${message}` }], isError: true });
      }
    };
    request.on("end", async () => {
      if (overflow) return;
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { return reply(200, error(null, -32700, "Invalid JSON")); }
      try {
        if (Array.isArray(body)) {
          if (protocol !== VERSIONS[0] || !body.length || body.length > 4) return reply(400, error(null, -32600, "Invalid or unsupported batch"));
          // Bound concurrency and charge each message to the same request window.
          const values = (await Promise.all(body.map((item, index) => index > 0 && rateLimited(request)
            ? error(item?.id, -32000, "Rate limit exceeded") : handle(item)))).filter(Boolean);
          return values.length ? reply(200, values) : reply(202);
        }
        const value = await handle(body); return value ? reply(200, value) : reply(202);
      } catch { return reply(200, error(null, -32603, "Request processing failed")); }
    });
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000;
  return server;
}
module.exports = { createTransport, validValue, VERSIONS };
