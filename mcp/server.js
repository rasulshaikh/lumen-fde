const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const MAX_BODY = 128 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const rateBuckets = new Map();
const auditEvents = [];
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const text = (value) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const tools = [
  { name: "get_plan", description: "Read Rasul's current Senior FDE plan rows and progress fields.", inputSchema: { type: "object", properties: { query: { type: "string" }, month: { type: "number" }, track: { type: "string" } } } },
  { name: "get_learning_context", description: "Read the indexed books, repository references, and Shell Mastery lesson context.", inputSchema: { type: "object", properties: {} } },
  { name: "ask_lumen", description: "Ask Lumen for a fifth-grade-language technical explanation using the full indexed Senior FDE context.", inputSchema: { type: "object", required: ["prompt"], properties: { prompt: { type: "string" }, context: { type: "string" } } } },
  { name: "list_ask_reports", description: "List Markdown Ask Lumen reports saved in GitHub.", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "read_ask_report", description: "Read one saved Ask Lumen report from GitHub by path.", inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } } } },
  { name: "save_study_note", description: "Write a durable study note to reports/notes in GitHub. Use only when the user explicitly asks to save it.", inputSchema: { type: "object", required: ["title", "body"], properties: { title: { type: "string" }, body: { type: "string" } } } },
  { name: "record_progress", description: "Record a durable study-progress event in GitHub when the user explicitly says they completed or updated a topic.", inputSchema: { type: "object", required: ["topic", "status"], properties: { topic: { type: "string" }, status: { type: "string", enum: ["not_started", "in_progress", "done", "skipped"] }, notes: { type: "string" } } } },
  { name: "get_progress_history", description: "List durable study-progress events saved in GitHub.", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "get_progress_analytics", description: "Summarize completion, hours, status counts, and recent progress from GitHub history.", inputSchema: { type: "object", properties: {} } },
  { name: "score_assessment", description: "Score the 4-question quick check or a rubric-based weekly, monthly, or quarterly assessment and explain the result.", inputSchema: { type: "object", required: ["assessment", "answers"], properties: { assessment: { type: "string", enum: ["quick_check", "weekly", "monthly", "quarterly"] }, answers: { type: "array", items: {} } } } },
  { name: "semantic_search", description: "Search with SurfSense Google Search or Web Crawl when configured, or search the Lumen GitHub repository as a safe fallback.", inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" }, provider: { type: "string", enum: ["surfsense", "github"] }, limit: { type: "number" }, country_code: { type: "string" } } } },
  { name: "get_audit_log", description: "View recent MCP actions and their success or failure without exposing secrets.", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "get_connection_map", description: "Return the precise Lumen, GitHub, Vercel, Render, SurfSense, and MCP connection map.", inputSchema: { type: "object", properties: {} } }
];

function repoConfig() { return { repo: process.env.GITHUB_REPO || "rasulshaikh/lumen-fde", branch: process.env.GITHUB_BRANCH || "main", token: process.env.GITHUB_TOKEN }; }
async function github(pathname, options = {}) {
  const { token } = repoConfig();
  if (!token) throw new Error("GITHUB_TOKEN is not configured");
  const response = await fetch(`https://api.github.com/repos/${repoConfig().repo}/contents/${pathname}`, { ...options, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "lumen-mcp", ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `GitHub request failed with ${response.status}`);
  return data;
}
function slug(value, fallback) { return String(value).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || fallback; }
function audit(action, ok, detail = "") { auditEvents.unshift({ action, ok, detail: String(detail).slice(0, 180), at: new Date().toISOString() }); if (auditEvents.length > 500) auditEvents.pop(); }
async function durableAudit(action, detail) { try { const stamp = new Date().toISOString().replace(/[:.]/g, "-"); const file = `reports/audit/${stamp}-${slug(action, "event")}.json`; await github(file, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: `audit: ${action}`, content: Buffer.from(JSON.stringify({ action, detail, at: new Date().toISOString() }, null, 2)).toString("base64"), branch: repoConfig().branch }) }); } catch (error) { audit("durable_audit", false, error.message); } }
function cleanAnswer(value) { return String(value || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/\*/g, "").replace(/[—–]/g, " - ").replace(/\n{3,}/g, "\n\n").trim(); }
async function askLumen(prompt, context = "") {
  if (process.env.LUMEN_ASK_URL && process.env.LUMEN_INTERNAL_API_KEY) {
    const response = await fetch(process.env.LUMEN_ASK_URL, { method: "POST", headers: { "Content-Type": "application/json", "x-lumen-internal-key": process.env.LUMEN_INTERNAL_API_KEY }, body: JSON.stringify({ prompt, context }), signal: AbortSignal.timeout(30_000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.answer) throw new Error(data.error || `Lumen Ask request failed with ${response.status}`);
    return data.answer;
  }
  if (!process.env.MINIMAX_API_KEY) throw new Error("MINIMAX_API_KEY is not configured on Render");
  const learning = { books: readJson("data/library-context.json"), repositories: readJson("data/repository-context.json"), lesson: readJson("data/lesson-context.json"), plan: readJson("data/workbook.json").Plan.slice(0, 30) };
  const response = await fetch("https://api.minimax.io/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "MiniMax-M3", thinking: { type: "disabled" }, temperature: 0.4, max_completion_tokens: 1600, stream: false, messages: [{ role: "system", content: `You are Lumen, a Senior FDE learning guide. Explain in fifth-grade reading language while keeping technical meaning exact. Use short sentences, define jargon immediately, give one technical example, connect it to production and FDE interviews, and finish with one practical next step. Never emit hidden reasoning, <think> tags, asterisks, or em dashes. Indexed context:\n${JSON.stringify(learning)}` }, { role: "user", content: `Active plan context:\n${context || "No active topic filter."}\n\nQuestion:\n${prompt}` }] }), signal: AbortSignal.timeout(25_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.base_resp?.status_msg || `MiniMax request failed with ${response.status}`);
  const answer = cleanAnswer(data.choices?.[0]?.message?.content);
  if (!answer) throw new Error("MiniMax returned an empty answer");
  return answer;
}
async function surfSenseSearch(query, limit, countryCode) {
  if (!process.env.SURFSENSE_API_KEY || !process.env.SURFSENSE_WORKSPACE_ID) throw new Error("SurfSense is not configured. Add SURFSENSE_API_KEY and SURFSENSE_WORKSPACE_ID on Render.");
  const base = (process.env.SURFSENSE_API_URL || "https://api.surfsense.com").replace(/\/$/, "");
  const response = await fetch(`${base}/workspaces/${encodeURIComponent(process.env.SURFSENSE_WORKSPACE_ID)}/scrapers/google_search/scrape`, { method: "POST", headers: { Authorization: `Bearer ${process.env.SURFSENSE_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ queries: [String(query)], country_code: countryCode || "us", language_code: "en", max_pages_per_query: Math.min(Math.max(Number(limit) || 1, 1), 3) }), signal: AbortSignal.timeout(25_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `SurfSense request failed with ${response.status}`);
  return data;
}
async function githubSearch(query, limit) { const result = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(`${query} repo:${repoConfig().repo}`)}&per_page=${Math.min(Number(limit) || 5, 10)}`, { headers: { Authorization: `Bearer ${repoConfig().token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "lumen-mcp" } }); return result.json(); }
async function assessmentScore(assessment, answers) {
  if (assessment === "quick_check") {
    const key = [1, 2, 1, 2]; const result = key.map((answer, index) => ({ question: index + 1, correct: Number(answers[index]) === answer, expected: answer, received: answers[index] })); const score = result.filter((item) => item.correct).length; return { assessment, score, total: key.length, percent: Math.round(score / key.length * 100), explanation: "Review every missed item, explain why the correct choice is safe, then repeat the check tomorrow.", results: result };
  }
  const weights = assessment === "monthly" ? [40, 25, 20, 15] : assessment === "quarterly" ? [20, 25, 25, 15, 15] : [40, 25, 20, 15]; const values = weights.map((_, index) => Math.min(4, Math.max(0, Number(answers[index]) || 0))); const weighted = values.reduce((total, value, index) => total + value / 4 * weights[index], 0); return { assessment, score: Math.round(weighted), scale: 100, rubric: values.map((value, index) => ({ criterion: index + 1, rating: value, weight: weights[index] })), explanation: weighted >= 80 ? "Strong evidence. Explain your tradeoffs aloud and keep the artifact." : weighted >= 60 ? "Good foundation. Rework the weakest rubric area before advancing." : "Pause and rebuild the weakest area with a smaller hands-on exercise." };
}
async function callTool(name, args = {}) {
  if (name === "get_plan") { const rows = readJson("data/workbook.json").Plan.slice(1); return text(rows.filter((row) => (!args.query || String(row[2]).toLowerCase().includes(String(args.query).toLowerCase())) && (!args.month || Number(row[1]) === Number(args.month)) && (!args.track || String(row[0]).toLowerCase().includes(String(args.track).toLowerCase()))).map((row) => ({ track: row[0], month: row[1], topic: row[2], depth: row[3], hours: row[13], status: row[15] })));
  }
  if (name === "get_learning_context") return text({ books: readJson("data/library-context.json"), repositories: readJson("data/repository-context.json"), lesson: readJson("data/lesson-context.json") });
  if (name === "ask_lumen") { const answer = await askLumen(args.prompt, args.context); audit("ask_lumen", true); return text({ answer, model: "MiniMax-M3" }); }
  if (name === "list_ask_reports") { const result = await github("reports/asks"); return text(result.slice(0, Math.min(Number(args.limit) || 20, 50)).map((item) => ({ name: item.name, path: item.path, url: item.html_url }))); }
  if (name === "read_ask_report") { if (!String(args.path).startsWith("reports/asks/")) throw new Error("Only reports/asks paths can be read"); const result = await github(String(args.path)); return text(Buffer.from(result.content, "base64").toString("utf8")); }
  if (name === "save_study_note") { const title = slug(args.title, "study-note"); const stamp = new Date().toISOString().replace(/[:.]/g, "-"); const notePath = `reports/notes/${stamp}-${title}.md`; const markdown = `# ${args.title}\n\nDate: ${new Date().toISOString()}\n\n${args.body}\n`; const result = await github(notePath, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: `docs: save study note ${title}`, content: Buffer.from(markdown).toString("base64"), branch: repoConfig().branch }) }); audit("save_study_note", true); await durableAudit("save_study_note", { path: notePath }); return text({ saved: true, path: notePath, url: result.content.html_url }); }
  if (name === "record_progress") { const topic = String(args.topic).trim(); if (!topic) throw new Error("topic is required"); const stampIso = new Date().toISOString(); const stamp = stampIso.replace(/[:.]/g, "-"); const progressPath = `reports/progress/${stamp}-${slug(topic, "topic")}-${slug(args.status, "status")}.md`; const markdown = `# Progress update\n\nTopic: ${topic}\nStatus: ${args.status}\nDate: ${stampIso}\n\n${args.notes ? `Notes:\n${args.notes}\n` : ""}`; const result = await github(progressPath, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: `study: record ${args.status} progress`, content: Buffer.from(markdown).toString("base64"), branch: repoConfig().branch }) }); audit("record_progress", true); await durableAudit("record_progress", { topic, status: args.status }); return text({ saved: true, path: progressPath, url: result.content.html_url }); }
  if (name === "get_progress_history") { let result; try { result = await github("reports/progress"); } catch (error) { if (error.message.includes("Not Found")) return text([]); throw error; } return text(result.slice(0, Math.min(Number(args.limit) || 30, 100)).map((item) => ({ name: item.name, path: item.path, url: item.html_url }))); }
  if (name === "get_progress_analytics") { let items = []; try { items = await github("reports/progress"); } catch (error) { if (!error.message.includes("Not Found")) throw error; } const counts = { not_started: 0, in_progress: 0, done: 0, skipped: 0 }; const events = items.slice(0, 100).map((item) => ({ name: item.name, path: item.path, url: item.html_url })); for (const item of events) { const match = item.name.match(/(not-started|in-progress|done|skipped)/); if (match) counts[match[1].replaceAll("-", "_")] += 1; } return text({ events: events.length, counts, recent: events.slice(0, 10), note: "History is append-only; dashboard topic status remains the source for the current plan view." }); }
  if (name === "score_assessment") { const result = await assessmentScore(args.assessment, args.answers); audit("score_assessment", true); return text(result); }
  if (name === "semantic_search") { const requested = args.provider; let provider = requested || (process.env.SURFSENSE_API_KEY ? "surfsense" : "github"); let result; if (provider === "surfsense") { try { result = await surfSenseSearch(args.query, args.limit, args.country_code); } catch (error) { if (requested === "surfsense") throw error; audit("semantic_search", false, `surfsense unavailable, fell back to github: ${error.message}`); provider = "github"; } } if (provider === "github") result = await githubSearch(args.query, args.limit); audit("semantic_search", true, provider); return text({ provider, result }); }
  if (name === "get_audit_log") return text(auditEvents.slice(0, Math.min(Number(args.limit) || 50, 100)));
  if (name === "get_connection_map") return text({ dashboard: "https://lumen-fde.vercel.app", github: "https://github.com/rasulshaikh/lumen-fde", mcp: process.env.PUBLIC_MCP_URL || "https://lumen-fde.onrender.com/mcp", durableSource: "GitHub reports/asks, reports/notes, reports/progress, and reports/audit", semanticSearch: process.env.SURFSENSE_API_KEY ? "SurfSense Google Search enabled" : "GitHub repository fallback enabled; add SURFSENSE_API_KEY and SURFSENSE_WORKSPACE_ID for live search", uptime: "Render free tier may sleep after inactivity" });
  throw new Error(`Unknown tool: ${name}`);
}
function allowed(request) { const key = request.headers.authorization || "anonymous"; if (process.env.MCP_API_KEY && key !== `Bearer ${process.env.MCP_API_KEY}`) return false; return true; }
function rateLimited(request) { const key = request.headers.authorization || request.socket.remoteAddress || "anonymous"; const now = Date.now(); const values = (rateBuckets.get(key) || []).filter((time) => now - time < RATE_WINDOW_MS); values.push(now); rateBuckets.set(key, values); return values.length > RATE_LIMIT; }
function send(response, id, result, error) { response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store", "Mcp-Protocol-Version": "2025-03-26", "Access-Control-Allow-Origin": "*" }); response.end(JSON.stringify({ jsonrpc: "2.0", id, ...(error ? { error: { code: -32000, message: error } } : { result }) })); }
const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/healthz") { response.writeHead(200, { "Content-Type": "application/json" }); return response.end(JSON.stringify({ ok: true, service: "lumen-mcp" })); }
  if (request.method === "OPTIONS" && request.url === "/mcp") { response.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version", "Access-Control-Allow-Methods": "POST, OPTIONS" }); return response.end(); }
  if (request.method !== "POST" || request.url !== "/mcp") { response.writeHead(404); return response.end("Not found"); }
  if (!allowed(request)) { audit("auth", false, "invalid bearer token"); response.writeHead(401); return response.end("Unauthorized"); }
  if (rateLimited(request)) { audit("rate_limit", false, "request window exceeded"); response.writeHead(429, { "Retry-After": "60" }); return response.end("Rate limit exceeded"); }
  let raw = ""; request.on("data", (chunk) => { raw += chunk; if (raw.length > MAX_BODY) request.destroy(); }); request.on("end", async () => { let body; try { body = JSON.parse(raw); } catch { return send(response, null, null, "Invalid JSON"); } if (body.method === "notifications/initialized") { response.writeHead(202); return response.end(); } if (body.method === "initialize") return send(response, body.id, { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "lumen-mcp", version: "1.1.0" } }); if (body.method === "tools/list") return send(response, body.id, { tools }); if (body.method === "tools/call") { try { const result = await callTool(body.params?.name, body.params?.arguments); return send(response, body.id, result); } catch (error) { audit(body.params?.name || "unknown", false, error.message); return send(response, body.id, null, String(error.message || error)); } } return send(response, body.id, null, `Unsupported method: ${body.method}`); });
});
server.listen(Number(process.env.PORT) || 10000, "0.0.0.0", () => console.log("lumen-mcp listening"));
