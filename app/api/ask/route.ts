import { NextResponse } from "next/server";
import library from "@/data/library-context.json";
import sourceCatalog from "@/data/library-sources.json";
import repositories from "@/data/repository-context.json";

function cleanAnswer(value: string) {
  return value.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/\*/g, "").replace(/[—–]/g, " - ").replace(/\n{3,}/g, "\n\n").trim();
}

export async function POST(request: Request) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "MiniMax is not configured yet. Add MINIMAX_API_KEY in Vercel project settings." }, { status: 503 });
  try {
    const body = await request.json() as { prompt?: string; context?: string; history?: { role: "user" | "assistant"; content: string }[] };
    if (!body.prompt?.trim()) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
    const messages = [
      { role: "system", content: `You are Lumen, a concise Senior FDE learning guide. Explain every idea in fifth-grade reading language while keeping the technical meaning exact. Use short sentences, define jargon immediately, give one concrete technical example, connect it to production systems and FDE interviews, and finish with one practical next step. Use the plan, library map, and repository map as supporting context; do not invent progress. Never emit hidden reasoning, <think> tags, asterisks, or em dashes. The learner's indexed learning map is:\n${JSON.stringify(library)}\n\nThe local source catalog (metadata and chapter map only) is:\n${JSON.stringify(sourceCatalog)}\n\nThe public repository map is:\n${JSON.stringify(repositories)}` },
      ...(body.history || []).slice(-8),
      { role: "user", content: `Plan context:\n${body.context || "No topic filter is active."}\n\nQuestion:\n${body.prompt}` },
    ];
    const response = await fetch("https://api.minimax.io/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "MiniMax-M3", messages, temperature: 0.4, max_completion_tokens: 900 }), signal: AbortSignal.timeout(25000) });
    const raw = await response.text();
    let data: { choices?: { message?: { content?: string } }[]; base_resp?: { status_msg?: string } } = {};
    try { data = JSON.parse(raw); } catch { console.error("[api/ask] MiniMax returned non-JSON", { status: response.status }); }
    if (!response.ok) { console.error("[api/ask] MiniMax rejected request", { status: response.status, message: data.base_resp?.status_msg }); return NextResponse.json({ error: "The learning guide is temporarily unavailable. Try again in a moment." }, { status: 502 }); }
    const answer = cleanAnswer(data.choices?.[0]?.message?.content || "");
    if (!answer) { console.error("[api/ask] MiniMax returned an empty answer", { status: response.status }); return NextResponse.json({ error: "The learning guide returned an empty answer. Try asking again." }, { status: 502 }); }
    return NextResponse.json({ answer });
  } catch (error) { console.error("[api/ask] request failed", { error: String(error) }); return NextResponse.json({ error: "Lumen could not reach the learning guide. Try again in a moment." }, { status: 500 }); }
}
