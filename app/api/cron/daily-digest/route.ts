import { NextResponse } from "next/server";
import workbook from "@/data/workbook.json";
import library from "@/data/library-context.json";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const minimaxKey = process.env.MINIMAX_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const to = process.env.DIGEST_TO_EMAIL || "shaikhrasul02@gmail.com";
  const from = process.env.RESEND_FROM_EMAIL;
  if (!minimaxKey || !resendKey || !from) return NextResponse.json({ ok: false, error: "Missing MINIMAX_API_KEY, RESEND_API_KEY, or RESEND_FROM_EMAIL." }, { status: 503 });
  try {
    const plan = workbook.Plan.slice(1, 22).map((r) => `${r[0]} · M${r[1]} · ${r[2]} · ${r[13]}h`).join("\n");
    const prompt = `Write a concise daily Senior FDE study brief for Rasul. Include: one honest progress lens, one concept connection across the book library, one 25-minute action, and one encouraging line that does not sound generic. Keep it under 220 words.\n\nPlan sample:\n${plan}\n\nLibrary map:\n${JSON.stringify(library)}`;
    const aiResponse = await fetch("https://api.minimax.io/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${minimaxKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "MiniMax-M3", messages: [{ role: "system", content: "You are Lumen, a candid and motivating Senior FDE coach." }, { role: "user", content: prompt }], temperature: 0.5, max_completion_tokens: 500 }) });
    const aiData = await aiResponse.json();
    if (!aiResponse.ok) return NextResponse.json({ ok: false, error: "MiniMax request failed." }, { status: 502 });
    const brief = aiData?.choices?.[0]?.message?.content || "Lumen could not generate today's brief.";
    const emailResponse = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [to], subject: "Lumen Brief · your next Senior FDE move", text: brief, html: `<div style="font-family:system-ui,sans-serif;max-width:620px;line-height:1.6"><h1>Lumen Brief</h1><p>${brief.replace(/\n/g, "<br />")}</p><p style="color:#667085;font-size:12px">Generated from your Lumen plan and study library.</p></div>` }) });
    if (!emailResponse.ok) return NextResponse.json({ ok: false, error: "Email delivery failed." }, { status: 502 });
    return NextResponse.json({ ok: true, sentTo: to });
  } catch { return NextResponse.json({ ok: false, error: "Digest generation failed." }, { status: 500 }); }
}
