import { NextResponse } from "next/server";
import workbook from "@/data/workbook.json";
import library from "@/data/library-context.json";
import repositories from "@/data/repository-context.json";

/**
 * MiniMax-M3 does not reliably honour thinking:disabled, so reasoning has to be stripped.
 * Two failure modes, both seen in a real delivered email:
 *   - the reply is ENTIRELY a <think> block, so stripping leaves "" and the email arrives
 *     blank. The old `|| "Lumen could not generate…"` fallback could not catch this because
 *     it ran BEFORE cleaning, against a non-empty string.
 *   - the tag is never closed, so the pair regex misses and raw reasoning ships to the inbox.
 * Handle the unclosed case too, and let the caller decide what to do with an empty result.
 */
function cleanEmailText(value: string) {
  return value
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .replace(/\*/g, "")
    .replace(/[—–]/g, " - ")
    .trim();
}

/**
 * A brief built from the plan itself, with no model involved. Used when the model returns
 * nothing usable — an email that states the next real action beats an apology, and beats
 * the blank message that actually shipped.
 */
function fallbackBrief(rows: (string | number | null)[][]) {
  const next = rows.find((r) => { const s = String(r[15]).trim().toLowerCase(); return s !== "done" && s !== "skipped"; });
  const active = rows.filter((r) => String(r[15]).trim().toLowerCase() !== "skipped");
  const remaining = active.filter((r) => String(r[15]).trim().toLowerCase() !== "done").reduce((n, r) => n + Number(r[13] || 0), 0);
  if (!next) return `Every topic in the plan is done or skipped. ${active.length} topics complete.`;
  return [
    `Next up: ${String(next[2])} (Month ${next[1]}, ${next[13]}h).`,
    ``,
    `What it asks of you: ${String(next[3])}`,
    ``,
    `Ship this: ${String(next[14])}`,
    ``,
    `${remaining}h of active plan remain across ${active.length} topics.`,
  ].join("\n");
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const minimaxKey = process.env.MINIMAX_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const to = process.env.DIGEST_TO_EMAIL || "shaikhrasul02@gmail.com";
  const from = process.env.RESEND_FROM_EMAIL;
  if (!minimaxKey || !resendKey || !from) return NextResponse.json({ ok: false, error: "Missing MINIMAX_API_KEY, RESEND_API_KEY, or RESEND_FROM_EMAIL." }, { status: 503 });
  try {
    // slice(1, 22) pinned the brief to the first 21 rows forever, so the digest only ever
    // saw months 1-3 of a 119-topic plan and could never mention anything you are doing now.
    const rows = workbook.Plan.slice(1);
    const plan = rows.map((r) => `${r[0]} · M${r[1]} · ${r[2]} · ${r[13]}h · ${r[15]}`).join("\n");
    const prompt = `Write a concise daily Senior FDE study brief for Rasul. Include: one honest progress lens, one concept connection across the book and repository library, one 25-minute action, and one encouraging line that does not sound generic. Keep it under 220 words. Use fifth-grade reading language with exact technical meaning. Do not use hidden reasoning, asterisks, or em dashes.\n\nThe full plan (${rows.length} topics, ${rows.reduce((n, r) => n + Number(r[13] || 0), 0)} hours). Pick from topics that are not Done or Skipped:\n${plan}\n\nLibrary map:\n${JSON.stringify(library)}\n\nRepository map:\n${JSON.stringify(repositories)}`;
    const aiResponse = await fetch("https://api.minimax.io/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${minimaxKey}`, "Content-Type": "application/json" }, // thinking:disabled and max_completion_tokens match the two sibling call sites; without
    // them MiniMax-M3 emits raw chain-of-thought and the legacy field is ignored.
    body: JSON.stringify({ model: "MiniMax-M3", thinking: { type: "disabled" }, messages: [{ role: "system", content: "You are Lumen, a candid and motivating Senior FDE coach. Use fifth-grade reading language with exact technical meaning. Do not use hidden reasoning, asterisks, or em dashes." }, { role: "user", content: prompt }], temperature: 0.5, max_completion_tokens: 500, stream: false }), signal: AbortSignal.timeout(45_000) });
    const aiData = await aiResponse.json();
    if (!aiResponse.ok) return NextResponse.json({ ok: false, error: "MiniMax request failed." }, { status: 502 });
    // Clean FIRST, then check — a reply that is entirely reasoning cleans to "" and used to
    // ship as a blank email.
    const cleaned = cleanEmailText(aiData?.choices?.[0]?.message?.content || "");
    const brief = cleaned || fallbackBrief(rows);
    if (!cleaned) console.error("[cron/daily-digest] model returned no usable text; sent the plan-derived fallback");
    const emailResponse = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [to], subject: "Lumen Brief · your next Senior FDE move", text: brief, html: `<div style="font-family:system-ui,sans-serif;max-width:620px;line-height:1.6"><h1>Lumen Brief</h1><p>${brief.replace(/\n/g, "<br />")}</p><p style="color:#667085;font-size:12px">Generated from your Lumen plan and study library.</p></div>` }) });
    if (!emailResponse.ok) return NextResponse.json({ ok: false, error: "Email delivery failed." }, { status: 502 });
    return NextResponse.json({ ok: true, sentTo: to });
  } catch { return NextResponse.json({ ok: false, error: "Digest generation failed." }, { status: 500 }); }
}
