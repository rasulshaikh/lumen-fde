import { NextResponse } from "next/server";
import library from "@/data/library-context.json";
import sourceCatalog from "@/data/library-sources.json";
import repositories from "@/data/repository-context.json";
import lesson from "@/data/lesson-context.json";
import curriculum from "@/data/curriculum.json";
import workbook from "@/data/workbook.json";

export const maxDuration = 60;

type Syllabus = { topic: string; why: string; prerequisites: string[]; subtopics: { name: string; learn: string }[]; outcomes: string[]; failureModes: string[] };
// A compact rendering of one topic's deep syllabus, so answers are grounded in what the plan
// actually asks the learner to know. Capped so it cannot crowd out the question.
function syllabusContext(index: number | undefined) {
  if (index === undefined || index === null) return "";
  const s = (curriculum as { topics: Record<string, Syllabus> }).topics[String(index)];
  if (!s) return "";
  const parts = s.subtopics.map((x, i) => `${i + 1}. ${x.name}: ${x.learn}`).join("\n");
  const text = `Deep syllabus for "${s.topic}":\nWhy: ${s.why}\nPrerequisites: ${s.prerequisites.join("; ")}\nParts:\n${parts}\nOutcomes: ${s.outcomes.join(" | ")}\nProduction failure modes: ${s.failureModes.join(" | ")}`;
  return text.length > 7000 ? `${text.slice(0, 7000)}…` : text;
}


/**
 * The whole plan, compactly, built HERE rather than trusted from the client.
 *
 * This is the fix for a real failure: the client sent `filtered.slice(0, 8)`, so Lumen only
 * ever saw 8 of 119 topics — unfiltered, that is tracks A and B. Asked about a machine
 * learning book it correctly answered "there is no ML topic in the visible plan", because
 * tracks M, N and O (192h of maths, ML systems and deep learning) were never in the prompt.
 * The model reasoned correctly from a plan we had truncated to 6%.
 *
 * One line per topic keeps all 119 well inside the context window, and grounding is built
 * server-side so no caller can silently narrow it again.
 */
type PlanRow = (string | number | null)[];
function planMap() {
  const rows = (workbook.Plan as PlanRow[]).slice(1);
  const active = rows.filter((r) => String(r[15]).trim().toLowerCase() !== "skipped");
  const byTrack = new Map<string, { n: number; h: number }>();
  for (const r of active) {
    const t = String(r[0]);
    const cur = byTrack.get(t) ?? { n: 0, h: 0 };
    byTrack.set(t, { n: cur.n + 1, h: cur.h + Number(r[13] || 0) });
  }
  const tracks = [...byTrack.entries()].map(([t, v]) => `${t} — ${v.n} topics, ${v.h}h`).join("\n");
  const lines = active.map((r, i) => `${i}. [M${r[1]}] ${r[0]} :: ${r[2]} (${r[13]}h) — ${r[15]}`).join("\n");
  return `THE FULL PLAN — ${active.length} active topics, ${active.reduce((n, r) => n + Number(r[13] || 0), 0)}h across ${byTrack.size} tracks.\nThis is the complete plan; nothing is hidden from you.\n\nTracks:\n${tracks}\n\nEvery topic:\n${lines}`;
}

function cleanAnswer(value: string) {
  return value.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/\*/g, "").replace(/[—–]/g, " - ").replace(/\n{3,}/g, "\n\n").trim();
}

async function saveAskReport(prompt: string, context: string, answer: string) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || "rasulshaikh/lumen-fde";
  if (!token) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "ask";
  const path = `reports/asks/${stamp}-${slug}.md`;
  const markdown = `# Lumen Ask\n\nDate: ${new Date().toISOString()}\n\n## Question\n\n${prompt}\n\n## Plan context\n\n${context || "No topic filter was active."}\n\n## Answer\n\n${answer}\n`;
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", "User-Agent": "lumen-fde" }, body: JSON.stringify({ message: `docs: save Lumen ask ${stamp}`, content: Buffer.from(markdown, "utf8").toString("base64"), branch: process.env.GITHUB_BRANCH || "main" }) });
  if (!response.ok) { const error = await response.json().catch(() => ({})) as { message?: string }; console.error("[api/ask] GitHub report save failed", { status: response.status, message: error.message, repo, path }); return null; }
  const data = await response.json() as { content?: { html_url?: string } };
  return data.content?.html_url || `https://github.com/${repo}/blob/${process.env.GITHUB_BRANCH || "main"}/${path}`;
}

export async function POST(request: Request) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "MiniMax is not configured yet. Add MINIMAX_API_KEY in Vercel project settings." }, { status: 503 });
  try {
    const body = await request.json() as { prompt?: string; context?: string; topicIndex?: number; history?: { role: "user" | "assistant"; content: string }[] };
    if (!body.prompt?.trim()) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
    const deep = syllabusContext(body.topicIndex);
    const messages = [
      { role: "system", content: `You are Quaere, the study guide inside Lumen. Lumen is the dashboard; you are the guide within it. Explain every idea in fifth-grade reading language while keeping the technical meaning exact. Use short sentences, define jargon immediately, give one concrete technical example, connect it to production systems and FDE interviews, and finish with one practical next step. Use the plan, library map, and repository map as supporting context; do not invent progress. The user message contains the COMPLETE plan — every topic across every track. Never tell the learner a subject is missing from the plan without checking that full list first. Never emit hidden reasoning, <think> tags, asterisks, or em dashes. The learner's indexed learning map is:\n${JSON.stringify(library)}\n\nThe local source catalog (metadata and chapter map only) is:\n${JSON.stringify(sourceCatalog)}\n\nThe public repository map is:\n${JSON.stringify(repositories)}` },
      ...(body.history || []).slice(-8),
      { role: "user", content: `${planMap()}\n\nCurrently visible in the dashboard:\n${body.context || "No topic filter is active."}${deep ? `\n\n${deep}` : ""}\n\nQuestion:\n${body.prompt}` },
    ];
    const response = await fetch("https://api.minimax.io/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "MiniMax-M3", thinking: { type: "disabled" }, messages, temperature: 0.4, max_completion_tokens: 1600, stream: false }), signal: AbortSignal.timeout(55000) });
    const raw = await response.text();
    let data: { choices?: { message?: { content?: string } }[]; base_resp?: { status_msg?: string } } = {};
    try { data = JSON.parse(raw); } catch { console.error("[api/ask] MiniMax returned non-JSON", { status: response.status }); }
    if (!response.ok) { console.error("[api/ask] MiniMax rejected request", { status: response.status, message: data.base_resp?.status_msg }); return NextResponse.json({ error: "The learning guide is temporarily unavailable. Try again in a moment." }, { status: 502 }); }
    const answer = cleanAnswer(data.choices?.[0]?.message?.content || "");
    if (!answer) { console.error("[api/ask] MiniMax returned an empty answer", { status: response.status }); return NextResponse.json({ error: "The learning guide returned an empty answer. Try asking again." }, { status: 502 }); }
    let reportUrl: string | null = null;
    try { reportUrl = await saveAskReport(body.prompt, body.context || "", answer); } catch (error) { console.error("[api/ask] GitHub report save exception", { error: String(error) }); }
    return NextResponse.json({ answer, reportUrl });
  } catch (error) { const message = String(error); console.error("[api/ask] request failed", { error: message }); if (message.includes("TimeoutError") || message.includes("timed out")) return NextResponse.json({ error: "Lumen is taking longer than expected. Try the question again with a shorter prompt." }, { status: 504 }); return NextResponse.json({ error: "Lumen could not reach the learning guide. Try again in a moment." }, { status: 500 }); }
}
