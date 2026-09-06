import { NextResponse } from "next/server";
import workbook from "@/data/workbook.json";
import library from "@/data/library-context.json";
import bank from "@/data/recall-bank.json";

type Row = (string | number | null)[];
type Bank = { meta: Record<string, { topic: string; track: string; outcomes: string[] }>; prompts: { i: number; k: string; kind: string; p: string }[] };

/**
 * MiniMax-M3 does not reliably honour thinking:disabled, so reasoning has to be stripped.
 * Two failure modes, both seen in a real delivered email:
 *   - the reply is ENTIRELY a <think> block, so stripping leaves "" and the email arrived
 *     blank. The old `|| "Lumen could not generate…"` fallback ran BEFORE cleaning against
 *     a non-empty string, so it could never fire.
 *   - the tag is never closed, so the pair regex misses and raw reasoning ships to the inbox.
 */
function clean(value: string) {
  return value
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .replace(/\*/g, "")
    .replace(/[—–]/g, " - ")
    .trim();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Everything below is derived from the plan, with no model involved.
 *
 * The digest used to be a single model paragraph, so when the model returned nothing the
 * email was empty — which is exactly what shipped. The substance is now deterministic and
 * the model only writes one optional framing line on top. A bad model day now costs a
 * paragraph, not the whole email.
 */
function digest(rows: Row[]) {
  const status = (r: Row) => String(r[15] ?? "").trim().toLowerCase();
  const active = rows.filter((r) => status(r) !== "skipped");
  const done = active.filter((r) => status(r) === "done");
  const totalH = active.reduce((n, r) => n + Number(r[13] || 0), 0);
  const doneH = done.reduce((n, r) => n + Number(r[13] || 0), 0);
  const next = active.find((r) => status(r) !== "done");
  const idx = next ? rows.indexOf(next) : -1;

  const b = bank as unknown as Bank;
  const qs = b.prompts.filter((x) => x.i === idx && x.kind === "recall");
  // rotate by day-of-year so a stalled topic does not send the same question every morning
  const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 864e5);
  const question = qs.length ? qs[dayOfYear % qs.length].p : null;

  const track = next ? String(next[0]) : "";
  // The indexed library is entirely ML/AI, while tracks A-L are infrastructure and FDE
  // craft. A loose match therefore paired a probabilistic-ML textbook with a bash topic.
  // Match on real overlap against the topic and its depth target, and if nothing matches,
  // omit the section rather than recommend something irrelevant.
  const haystack = next ? `${next[2]} ${next[0]} ${next[3]}`.toLowerCase() : "";
  const book = (library as { title: string; author: string; role: string; topics?: string[] }[])
    .find((x) => (x.topics || []).some((tag) => {
      const words = String(tag).toLowerCase().split(/\s+/).filter((w) => w.length > 4);
      return words.length > 0 && words.every((w) => haystack.includes(w));
    })) ?? null;

  return {
    next, idx, question, book, track,
    doneCount: done.length, activeCount: active.length,
    doneH, totalH, remainingH: totalH - doneH,
    weeksLeft: ((totalH - doneH) / 16).toFixed(1),
  };
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const minimaxKey = process.env.MINIMAX_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const to = process.env.DIGEST_TO_EMAIL || "shaikhrasul02@gmail.com";
  const from = process.env.RESEND_FROM_EMAIL;
  if (!resendKey || !from) return NextResponse.json({ ok: false, error: "Missing RESEND_API_KEY or RESEND_FROM_EMAIL." }, { status: 503 });

  try {
    const rows = workbook.Plan.slice(1) as Row[];
    const d = digest(rows);
    if (!d.next) return NextResponse.json({ ok: true, skipped: "plan complete" });

    const topic = String(d.next[2]);
    const depth = String(d.next[3]);
    const deliverable = String(d.next[14]);

    // The model writes ONE framing paragraph. If it fails, the rest of the email stands.
    let framing = "";
    if (minimaxKey) {
      try {
        const r = await fetch("https://api.minimax.io/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${minimaxKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "MiniMax-M3", thinking: { type: "disabled" }, temperature: 0.5, max_completion_tokens: 260, stream: false,
            messages: [
              { role: "system", content: "You are Quaere, a candid Senior FDE study guide. Plain language, exact technical meaning. No hidden reasoning, no asterisks, no em dashes. Never invent progress." },
              { role: "user", content: `In 60 words or fewer, say why "${topic}" matters for a Forward-Deployed Engineer on a customer site, and name one failure it prevents. Do not restate the task or pad. Context: ${depth}` },
            ],
          }),
          signal: AbortSignal.timeout(40_000),
        });
        if (r.ok) framing = clean((await r.json())?.choices?.[0]?.message?.content || "");
      } catch { /* the digest does not depend on this */ }
    }
    if (!framing) console.error("[cron/daily-digest] no framing from the model; sending the deterministic digest alone");

    const pace = `${d.doneCount} of ${d.activeCount} topics done · ${d.doneH}h of ${d.totalH}h · ${d.remainingH}h left, about ${d.weeksLeft} weeks at 16h/week`;
    const text = [
      `TODAY — ${topic}`, `Month ${d.next[1]} · ${d.next[13]}h · ${d.track}`, ``,
      framing ? `${framing}\n` : ``,
      `WHAT IT ASKS OF YOU`, depth, ``,
      `SHIP THIS`, deliverable, ``,
      d.question ? `ANSWER THIS COLD (before you open anything)\n${d.question}\n` : ``,
      `READ · ${d.next[4]}\n${d.next[5]}`, ``,
      `DO · ${d.next[10]}\n${d.next[11]}`, ``,
      d.book ? `FROM YOUR LIBRARY\n${d.book.title} - ${d.book.author}\n${d.book.role}\n` : ``,
      `PACE`, pace, ``,
      `https://lumenfde.com`,
    ].filter((l) => l !== undefined).join("\n");

    const row = (label: string, body: string) =>
      `<tr><td style="padding:14px 0;border-top:1px solid #23252a"><div style="font:500 11px ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#8a8f98;margin-bottom:6px">${esc(label)}</div><div style="color:#f7f8f8;font-size:14px;line-height:1.6">${body}</div></td></tr>`;
    const html = `<div style="background:#010102;padding:28px;font-family:ui-sans-serif,system-ui,sans-serif">
<table style="max-width:620px;margin:auto;background:#0f1011;border:1px solid #23252a;border-radius:12px;padding:24px;border-collapse:separate">
<tr><td style="padding-bottom:4px"><div style="font:500 11px ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#828fff">Lumen brief</div>
<div style="font-size:22px;font-weight:600;color:#f7f8f8;letter-spacing:-.02em;margin-top:6px">${esc(topic)}</div>
<div style="color:#8a8f98;font-size:13px;margin-top:4px">Month ${d.next[1]} · ${d.next[13]}h · ${esc(d.track)}</div></td></tr>
${framing ? row("Why it matters", esc(framing)) : ""}
${row("What it asks of you", esc(depth))}
${row("Ship this", esc(deliverable))}
${d.question ? row("Answer this cold", esc(d.question)) : ""}
${row("Read", `<a href="${esc(String(d.next[5]))}" style="color:#828fff">${esc(String(d.next[4]))}</a>`)}
${row("Do", `<a href="${esc(String(d.next[11]))}" style="color:#828fff">${esc(String(d.next[10]))}</a>`)}
${d.book ? row("From your library", `${esc(d.book.title)} - ${esc(d.book.author)}<br /><span style="color:#8a8f98">${esc(d.book.role)}</span>`) : ""}
${row("Pace", esc(pace))}
<tr><td style="padding-top:16px"><a href="https://lumenfde.com" style="color:#828fff;font-size:13px">Open Lumen</a></td></tr>
</table></div>`;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: `Lumen · ${topic}`, text, html }),
    });
    if (!emailResponse.ok) {
      const err = await emailResponse.text().catch(() => "");
      console.error("[cron/daily-digest] Resend rejected", { status: emailResponse.status, err: err.slice(0, 200) });
      return NextResponse.json({ ok: false, error: "Email delivery failed." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sentTo: to, topic, framing: Boolean(framing), chars: text.length });
  } catch (error) {
    console.error("[cron/daily-digest] failed", { error: String(error) });
    return NextResponse.json({ ok: false, error: "Digest generation failed." }, { status: 500 });
  }
}
