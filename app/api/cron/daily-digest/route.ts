import { NextResponse } from "next/server";
import { weeklyPace, weeksAtPace } from "@/lib/profile";
import workbook from "@/data/workbook.json";
import library from "@/data/library-context.json";
import bank from "@/data/recall-bank.json";
import skillMap from "@/data/market-skill-map.json";
import { BOARD_COUNT, DELTA_MIN_BOARDS, computeBenchmark, type NewReqEntry, type Workbook } from "@/lib/market/benchmark";
import { INDEX_PATH, readJson, readProgress, type MarketIndex } from "@/lib/market/store";

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
    .replace(/[–—]/g, " - ")
    .trim();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A plan row is complete only on these - the four spellings lib/market/insight.ts accepts, and
 * for its reasons: the dashboard POST writes `done`, a human or an MCP client types one of the
 * others, "in progress" is not evidence and "skipped" is a decision not to acquire the skill
 * rather than a claim to have it. Copied rather than imported because that module does not
 * export the set; the surfacing test pins the two in agreement.
 */
const DONE_STATUSES = new Set(["done", "complete", "completed", "finished"]);

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();
/** Progress statuses arrive underscored from the dashboard POST and spaced from a human. */
const normStatus = (value: unknown) => norm(value).replace(/_/g, " ");

/**
 * The one status that means a topic is being worked right now. Not in DONE_STATUSES, and it never
 * will be - it is not evidence of a skill - but it IS evidence of where the reader is, which is a
 * different question and the one that picks today's topic.
 */
const IN_PROGRESS = "in progress";

/** UTC day, the same slice the stored progress events and this file's day counts are compared on. */
const iso = (date: Date) => date.toISOString().slice(0, 10);

/**
 * A topic must have led the email this many days before the email says so.
 *
 * Day 1 is the morning after an event was recorded, which is the plan working rather than
 * stalling. From day 2 the repetition is real and the reader deserves the count instead of an
 * email that looks stuck without admitting it.
 */
const STALE_TOPIC_DAYS = 2;

/**
 * One topic's current standing: the newest status recorded against it, and the day that event
 * was recorded.
 *
 * The day is carried because two decisions below need it and neither may store anything new -
 * which of several in-progress topics is the freshest, and how long the chosen one has led.
 */
type Standing = {
  status: string;
  /** The newest event's day: what you last did. */
  day: string;
  /**
   * The OLDEST event's day: when this topic was first touched.
   *
   * The day count is measured from here, not from `day`. Measuring from the newest event let any
   * event reset the counter, so re-recording "not started" on a topic silenced the stall line
   * that exists to report the stall -- a no-op that hides the very thing being reported. That is
   * not hypothetical: an automated session wrote a not_started event on 2026-09-07 against a
   * topic marked in_progress on 2026-09-05, and it would have reset the count to day 1.
   */
  since: string;
};

/**
 * Whole days from a recorded event to today, counting both ends: an event recorded today is day 1.
 *
 * Null when either day is unparseable, or when the event is dated in the future - a clock skew or
 * a hand-edited file must cost the line, not ship "Day -3 on this topic".
 */
function daysLeading(day: string, today: string) {
  const from = Date.parse(`${day}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || from > to) return null;
  return Math.floor((to - from) / 864e5) + 1;
}

/**
 * Everything below is derived from the plan, with no model involved.
 *
 * The digest used to be a single model paragraph, so when the model returned nothing the
 * email was empty - which is exactly what shipped. The substance is now deterministic and
 * the model only writes one optional framing line on top. A bad model day now costs a
 * paragraph, not the whole email.
 *
 * `progress` is the recorded study history, matched to a row by topic string exactly as
 * app/page.tsx and lib/market/insight.ts match it - one matcher, or the email and the tab
 * disagree about which row is next. It carries the same meaning it has there: null is "we do
 * not know", never "nothing is done".
 *
 * Workbook column 15 is the committed BASELINE - 117 "Not started", 2 "Skipped", no other value
 * ever written - so a digest that reads it alone picks plan row 0 every morning for the life of
 * the plan, which is what this email did for months while only the recall question rotated.
 * The column survives as the per-row fallback: it is where "Skipped" lives, and where an
 * unreadable progress store lands, so a GitHub outage costs freshness and not the brief.
 */
function digest(rows: Row[], progress: Map<string, Standing> | null) {
  const status = (r: Row) => progress?.get(norm(r[2]))?.status ?? normStatus(r[15]);
  /** "" for a row with no recorded event, which sorts below every real ISO day. */
  const day = (r: Row) => progress?.get(norm(r[2]))?.day ?? "";
  const active = rows.filter((r) => status(r) !== "skipped");
  const done = active.filter((r) => DONE_STATUSES.has(status(r)));
  const totalH = active.reduce((n, r) => n + Number(r[13] || 0), 0);
  const doneH = done.reduce((n, r) => n + Number(r[13] || 0), 0);

  /**
   * Today's topic: what is actually being worked, else the plan's own order.
   *
   * "First row not done" ignored `in progress` entirely, so a reader who had started row 5 while
   * rows 0-4 sat untouched was sent row 0 every morning - plan order outranking the evidence the
   * reader had gone to the trouble of recording. Prefer the in-progress topic.
   *
   * Several at once resolves on the recorded day, newest first, because that is the one being
   * worked now. `>` and not `>=` on a stable filter order means a tie keeps the earlier plan row,
   * so two events recorded on the same day cannot make the email alternate between them.
   *
   * The fallback is unchanged and has to stay that way: with nothing in progress - the cold
   * start, and every morning the progress store is unreadable - this is still the first row that
   * is not done, which is the order the plan itself prescribes.
   */
  const underway = active.filter((r) => status(r) === IN_PROGRESS);
  const next = underway.length
    ? underway.reduce((best, r) => (day(r) > day(best) ? r : best))
    : active.find((r) => !DONE_STATUSES.has(status(r)));
  const idx = next ? rows.indexOf(next) : -1;

  /**
   * How long this topic has led, and when it was last touched.
   *
   * The email repeats a topic until progress moves it. That is correct for a study plan - a
   * rotation through unstarted topics would scatter the focus the plan exists to hold - but it
   * reads as a stuck email, so the honest fix is to say the repetition out loud. Derived from the
   * events and today's date alone: a counter file would be new stored state to keep in sync with
   * a history that already carries the answer.
   *
   * Silent when the progress store could not be read. "Nothing was ever recorded" would then be a
   * claim about a file nobody saw, and the rule in this email is that an outage costs freshness
   * and never truth.
   */
  let age: string | null = null;
  if (progress && next) {
    const standing = progress.get(norm(next[2]));
    // From `since`, so a later no-op event cannot reset the count. See the Standing type.
    const days = standing ? daysLeading(standing.since || standing.day, iso(new Date())) : null;
    if (!standing) {
      // The actionable fact, and the reason the email has not moved: nothing has been recorded
      // against this topic at all, and recording something is the only thing that advances it.
      age = "No progress has ever been recorded on this topic. Recording one is what moves this brief on.";
    } else if (days !== null && days >= STALE_TOPIC_DAYS) {
      age = `Day ${days} on this topic. Last progress recorded ${standing.day}.`;
    }
    // An event whose Date line is missing or unparseable falls through to no line at all: the
    // topic does have a history, so the sentence above would be false, and no day count can be
    // honestly derived from a timestamp that is not there.
  }

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
    next, idx, question, book, track, age,
    doneCount: done.length, activeCount: active.length,
    doneH, totalH, remainingH: totalH - doneH,
    // Divided by the declared weekly target, not by a literal. This line and the sentence that
    // renders it below each carried their own hand-written 16, so the pace could be changed in
    // one and not the other. AppState already records having fixed exactly this on the client
    // ("was hardcoded 16h next to a separate hours/16, so the two could disagree") - the digest
    // simply never got the same treatment.
    weeksLeft: (weeksAtPace(totalH - doneH) ?? 0).toFixed(1),
  };
}

/** GitHub read budget for the market index - see `newCoreReqs` for why it needs one at all. */
const MARKET_READ_MS = 8_000;

/**
 * The progress history's own budget, separate from the market's because the two reads are not
 * alike: this one is a directory listing plus a fetch per event file, up to a hundred requests
 * where the market makes a single GET, and it is the one read the digest cannot start early and
 * await later - the topic it chooses goes into the model prompt.
 */
const PROGRESS_READ_MS = 8_000;

/**
 * The current standing of every plan row a progress event names, keyed by topic string.
 *
 * `readProgress` already absorbs a missing GITHUB_TOKEN, a 404 cold start (an empty history,
 * which is genuinely "nothing done" rather than unknown) and a transport error, and it is
 * all-or-nothing on purpose - a partial set would drop a `done` event and silently rewind the
 * plan. What it has no defence against is an unanswered socket: without the race below, a hung
 * GitHub holds this function until the platform kills it and the brief never arrives at all.
 *
 * Null on every failure path, which `digest` reads as "fall back to the workbook baseline". A
 * GitHub outage therefore degrades this email to the topic it would have picked yesterday
 * rather than breaking it.
 */
async function progressStatuses(): Promise<Map<string, Standing> | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const progress = await Promise.race([
      readProgress(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`progress read exceeded ${PROGRESS_READ_MS}ms`)), PROGRESS_READ_MS);
      }),
    ]);
    if (!progress) return null;
    const byTopic = new Map<string, Standing>();
    // Newest first, as readProgress returns them, so the first event for a topic is that row's
    // current status and everything after it is that row's older history.
    for (const event of progress.events) {
      const topic = norm(event?.topic);
      // The stored Date is a full ISO instant; sliced to the day because that is the unit both
      // the freshest-in-progress comparison and the day count are stated in.
      if (!topic) continue;
      const day = String(event?.date ?? "").slice(0, 10);
      const held = byTopic.get(topic);
      // Newest wins for status and `day`; `since` keeps reaching back, because events arrive
      // newest-first and the last one seen for a topic is the oldest one recorded.
      if (!held) byTopic.set(topic, { status: normStatus(event?.status), day, since: day });
      else if (day && (!held.since || day < held.since)) held.since = day;
    }
    return byTopic;
  } catch (error) {
    console.error("[cron/daily-digest] progress unreadable; falling back to the workbook baseline", { error: String(error) });
    return null;
  } finally {
    // The loser of the race is still pending, and its timer would otherwise hold the function
    // open for the rest of the budget after the email has already gone out.
    clearTimeout(timer);
  }
}

/**
 * How stale index.json may be before this email calls the scan broken.
 *
 * The scan runs at 03:00 and this digest at 03:30, so a healthy index is half an hour old by the
 * time it is read here, and one missed night makes it 24.5h. 26h is that cycle plus slack: a
 * single scan that failed, ran late, or was retried does not cry wolf, while two consecutive
 * misses do. Tightening this below ~25h would fire on the first bad night, and an alert that
 * fires on ordinary jitter is one the reader learns to skim past - which is the failure this
 * whole section exists to prevent.
 */
const STALE_AFTER_MS = 26 * 60 * 60 * 1000;

/**
 * Hours while the age is still near the threshold, where the difference between 26 and 30 is the
 * entire judgement about whether one run or two were lost; days once it is long enough that
 * "214 hours" is a number the reader has to divide before it means anything.
 */
function staleAge(ms: number) {
  const hours = Math.floor(ms / 3_600_000);
  return hours < 48 ? `${hours} hours` : `${Math.floor(hours / 24)} days`;
}

type Alert = { label: string; line: string };

/**
 * The pipeline alerts, in render order. Empty on a healthy morning, which is most mornings.
 *
 * ALERTS ON STALENESS, NOT ON ERROR. A cron that never fires cannot report its own failure, and
 * that is exactly the silent case docs/platform/runbook.md section 1 describes: if the 03:00 scan
 * starts failing tonight it keeps failing every night, index.json simply stops being updated, and
 * every surface goes on rendering last week's numbers as though they were current. A week of dead
 * scans and a week of quiet market look identical. Nothing else in the system says otherwise.
 *
 * This email is the detector because it already exists: it runs thirty minutes after the scan, it
 * already reads index.json for the market section, and it already reaches a reader every morning.
 * No new channel, no new service, and it degrades in the right direction - if the digest itself
 * stops arriving, the absence of the email is the signal.
 *
 * Deterministic on purpose. The model writes one framing paragraph and nothing else in this email;
 * an alert that a model could soften, reword, or omit on a bad day is not an alert.
 */
function scanAlerts(index: MarketIndex, now: Date): Alert[] {
  const alerts: Alert[] = [];
  const lastRun = Date.parse(index.updatedAt);
  if (Number.isNaN(lastRun)) {
    // A stored index whose updatedAt is empty or malformed. Guarded rather than assumed away
    // because the arithmetic below would otherwise ship the reader a literal "NaN hours".
    alerts.push({
      label: "Scan stale",
      line: "SCAN STALE - the market scan has no successful run on record. Every market number below is a placeholder, not a measurement.",
    });
  } else if (now.getTime() - lastRun > STALE_AFTER_MS) {
    alerts.push({
      label: "Scan stale",
      line: `SCAN STALE - the market scan last succeeded ${staleAge(now.getTime() - lastRun)} ago, on ${index.updatedAt.slice(0, 10)}. Every market number in this email and on the dashboard is from that run.`,
    });
  }

  // The same threshold computeBenchmark suppresses its deltas on, checked here against the stored
  // count rather than inferred from the benchmark, so this line says why the movement went quiet
  // even when there is no movement section to notice it in. Without it a short scan reads as a
  // still market: the numbers stop moving and nothing distinguishes that from nothing happening.
  if (index.boardsOk < DELTA_MIN_BOARDS) {
    const boardsTotal = Math.max(BOARD_COUNT, Object.keys(index.boards).length);
    alerts.push({
      label: "Partial scan",
      line: `PARTIAL SCAN - the last scan reached ${index.boardsOk} of ${boardsTotal} boards, under the ${DELTA_MIN_BOARDS} needed, so movement and new roles are suppressed. The numbers are holding still because the scan is short, not because the market went quiet.`,
    });
  }

  return alerts;
}

type NewCoreReqs = { entries: NewReqEntry[]; total: number; overflow: number; alerts: Alert[] };
/**
 * Every market failure lands here, and this renders as nothing at all - including no alert. A
 * file that could not be read is not evidence the scan is broken: GitHub may be down and the
 * scan fine, and a stale-scan line on an outage morning is a false alarm that teaches the reader
 * to distrust the real one. That failure belongs in the Vercel logs, and `newCoreReqs` puts it
 * there. The staleness this alerts on is the one visible in a file it CAN read.
 */
const NO_MARKET: NewCoreReqs = { entries: [], total: 0, overflow: 0, alerts: [] };

/**
 * The digest's only market read: the new-core-reqs section, and the pipeline alerts derived from
 * the same file. The only part of this email that depends on anything outside the repo.
 *
 * The study brief is the product. A GitHub outage, a missing token, or a scan that has never
 * run must cost the reader three lines, never the email - so every path below returns
 * NO_MARKET rather than propagating. `readJson` already absorbs a missing GITHUB_TOKEN, a 404
 * cold start and a transport error, but it has no deadline of its own: an unanswered socket
 * would hang here until the platform killed the function, and the digest would simply never
 * arrive. The race is what turns that class of failure back into a missing section.
 *
 * This function never rejects, which is what makes it safe to start before the model call and
 * await after it. That overlap is deliberate: sequentially, the 40s model timeout and this one
 * add up against the function ceiling, and the market read could push the Resend call past it.
 * An in-flight promise nobody is awaiting yet is an unhandled rejection if it can reject, so
 * the guarantee and the overlap stand or fall together.
 *
 * Recomputed from index.json rather than read from benchmark.json on purpose. benchmark.json
 * carries the day the scan last succeeded; if this morning's scan did not run, its
 * newSinceLastRun still lists yesterday's roles and the digest would announce them a second
 * time. Recomputing against today reports nothing, which is the truth.
 */
async function newCoreReqs(): Promise<NewCoreReqs> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const stored = await Promise.race([
      readJson<MarketIndex>(INDEX_PATH),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`market index read exceeded ${MARKET_READ_MS}ms`)), MARKET_READ_MS);
      }),
    ]);
    if (!stored.data) return NO_MARKET;
    const now = new Date();
    // computeBenchmark is pure and already applies every rule this section needs: core only,
    // deduped so 15 city clones are one line, suppressed on a baseline or partial scan, capped
    // at NEW_ROLES_CAP with the remainder counted. The statements are rendered there so this
    // email and the Market tab print the identical sentence from one place.
    const benchmark = computeBenchmark(stored.data, skillMap, workbook as unknown as Workbook, now);
    return {
      entries: benchmark.newSinceLastRun,
      total: benchmark.newSinceLastRunTotal,
      overflow: benchmark.newSinceLastRunOverflow,
      // Read off the same fetch rather than from a second one: the alerts describe the health of
      // exactly the file this section renders, and a separate GET would double this function's
      // exposure to the outage it is meant to report on.
      alerts: scanAlerts(stored.data, now),
    };
  } catch (error) {
    console.error("[cron/daily-digest] market section skipped", { error: String(error) });
    return NO_MARKET;
  } finally {
    // The loser of the race is still pending, and its timer would otherwise hold the function
    // open for the rest of the budget after the email has already gone out.
    clearTimeout(timer);
  }
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
    // Started here rather than after the digest is built: the progress read below must be
    // awaited before the model prompt can name a topic, and starting the market read first
    // means the two GitHub reads overlap instead of adding up. Not awaited yet - it keeps
    // running while the model thinks. Safe only because newCoreReqs cannot reject.
    const marketRead = newCoreReqs();

    const rows = workbook.Plan.slice(1) as Row[];
    const d = digest(rows, await progressStatuses());
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

    const market = await marketRead;
    const marketLines = market.entries.map((r) => r.statement);
    if (market.overflow > 0) marketLines.push(`+${market.overflow} more`);

    const pace = `${d.doneCount} of ${d.activeCount} topics done · ${d.doneH}h of ${d.totalH}h · ${d.remainingH}h left, about ${d.weeksLeft} weeks at ${weeklyPace()}`;
    const text = [
      // Above everything, the new roles below it included. A broken pipeline outranks both the
      // study brief and the market section, because the study brief is still true when the scan
      // is dead and the market numbers are not. Buried lower these would be read on the morning
      // someone went looking for them, which is after the week of silence rather than on its
      // first day. Empty on a healthy morning, which is most of them.
      // Spread rather than an empty string, now that these two sections are the first elements in
      // the array: an empty string here is still joined, and a quiet morning would open the email
      // on two blank lines instead of on TODAY.
      ...(market.alerts.length ? [`${market.alerts.map((a) => a.line).join("\n\n")}\n`] : []),
      // Above TODAY, not under SHIP THIS. This section orders itself: it is empty on almost every
      // morning - 0 new core roles is the usual reading - so on a quiet day the study brief leads
      // with no special case anywhere in this array, and on the rare day a role appears it is the
      // first thing read, which is exactly when it is worth interrupting the brief for.
      ...(market.entries.length ? [`NEW CORE REQS - ${market.total}\n${marketLines.join("\n")}\n`] : []),
      `TODAY - ${topic}`, `Month ${d.next[1]} · ${d.next[13]}h · ${d.track}`,
      // Directly under the header it qualifies, because it is a fact about this exact topic.
      ...(d.age ? [d.age] : []),
      ``,
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
<div style="color:#8a8f98;font-size:13px;margin-top:4px">Month ${d.next[1]} · ${d.next[13]}h · ${esc(d.track)}</div>
${d.age ? `<div style="color:#8a8f98;font-size:13px;margin-top:4px">${esc(d.age)}</div>` : ""}</td></tr>
${market.alerts.map((a) => row(a.label, esc(a.line))).join("")}
${market.entries.length ? row(`New core reqs - ${market.total}`, `${market.entries.map((r) => `<a href="${esc(r.url)}" style="color:#828fff">${esc(r.statement)}</a>`).join("<br />")}${market.overflow > 0 ? `<br /><span style="color:#8a8f98">+${market.overflow} more</span>` : ""}`) : ""}
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
    return NextResponse.json({ ok: true, sentTo: to, topic, framing: Boolean(framing), newCoreReqs: market.total, chars: text.length });
  } catch (error) {
    console.error("[cron/daily-digest] failed", { error: String(error) });
    return NextResponse.json({ ok: false, error: "Digest generation failed." }, { status: 500 });
  }
}
