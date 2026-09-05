import { NextResponse } from "next/server";
import library from "@/data/library-context.json";

export async function POST(request: Request) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "MiniMax is not configured yet. Add MINIMAX_API_KEY in Vercel project settings." }, { status: 503 });
  try {
    const body = await request.json() as { prompt?: string; context?: string; history?: { role: "user" | "assistant"; content: string }[] };
    if (!body.prompt?.trim()) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
    const messages = [
      { role: "system", content: `You are Lumen, a concise Senior FDE study partner. Explain concepts plainly, connect them to production systems and FDE interviews, and finish with one practical next step. Use the plan and library map as supporting context; do not invent progress. The learner's indexed library is:\n${JSON.stringify(library)}` },
      ...(body.history || []).slice(-8),
      { role: "user", content: `Plan context:\n${body.context || "No topic filter is active."}\n\nQuestion:\n${body.prompt}` },
    ];
    const response = await fetch("https://api.minimax.io/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "MiniMax-M3", messages, temperature: 0.4, max_completion_tokens: 900 }) });
    const data = await response.json();
    if (!response.ok) return NextResponse.json({ error: data?.base_resp?.status_msg || "MiniMax returned an error." }, { status: 502 });
    return NextResponse.json({ answer: data?.choices?.[0]?.message?.content || "No answer returned." });
  } catch { return NextResponse.json({ error: "Lumen could not reach MiniMax right now." }, { status: 500 }); }
}
