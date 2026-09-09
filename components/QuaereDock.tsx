"use client";

import { useEffect, useRef, useState } from "react";
import { buildBrief, opening } from "@/lib/companion/brief";
import { weeklyPace } from "@/lib/profile";
import { usePathname } from "next/navigation";
import library from "@/data/library-context.json";
import repositories from "@/data/repository-context.json";
import { AskMark } from "@/app/brand";
import { useAppState } from "@/components/AppState";
import { NAV } from "@/components/Nav";
import { compRows, mockRows, months, planRows, roadmapRows, tracks } from "@/components/shared";

/**
 * Quaere, as a dock: one instance, mounted by app/(app)/layout.tsx above the route slot, present
 * on all ten routes.
 *
 * The conversation is NOT here. `messages`, `asking`, `askOpen` and `askText` live in
 * AppStateProvider, which sits in the same layout — so React keeps them mounted while the segment
 * below swaps. That is the whole reason this is a dock rather than a modal each page renders:
 * ask on /market, walk to /plan, and the thread, the pending request and the open state are all
 * still there because nothing they live in ever unmounted. This file owns only what is true of
 * the dock itself — where you are standing, and the keyboard.
 *
 * THE RULE: Quaere reads every number and writes none. It has no write path and does not gain
 * one here. Note what this component pulls out of the provider below — `statuses` and `setStatus`
 * are deliberately not in that list, so there is no expression in this file that could commit a
 * progress event. The only request it can cause is the POST /api/ask that fetches an answer.
 */

// Starter questions. The first one is deliberate: Quaere once answered "there is no ML
// topic in the visible plan" because the client sent it 8 of 119 rows. Asking it is now
// the fastest way to see that the whole plan is in context.
/**
 * Starter questions, grouped by what Quaere can now actually answer.
 *
 * The list was five flat questions written when it could only see the plan, the library and a
 * readiness slice. It now also holds the compensation sheet, the audited gaps, the
 * over-investment analysis, the shipped artifacts, the session history and the recall state — so
 * the questions worth suggesting changed.
 *
 * The pace question reads the profile rather than saying "16 hours a week", which it did until
 * now: the weekly target is editable, and a suggested question that contradicts the setting is
 * the same stale-string defect this project has chased out of the digest and the login page.
 */
const FAQ_GROUPS: { group: string; questions: string[] }[] = [
  {
    group: "The plan",
    questions: [
      "What should I focus on this week, and why that over anything else?",
      "Does my plan cover machine learning, and where?",
      `Am I on pace to finish in ${months[months.length - 1]} months at ${weeklyPace()}?`,
      "What is in my plan that the market is not asking for?",
    ],
  },
  {
    group: "Market and paths",
    questions: [
      "Which market should I actually aim at first, and what does my own comp sheet say about it?",
      "What do the audited gaps mean for the next three months of the plan?",
      "If I wanted to build something of my own instead, what would this plan already give me?",
      "What will a senior FDE interview actually test that my plan does not cover?",
    ],
  },
  {
    group: "Evidence and rhythm",
    questions: [
      "What have I actually shipped, and what would make the strongest portfolio piece next?",
      "Given my session history, am I being honest with myself about pace?",
      "What is the single next thing that moves readiness the most?",
    ],
  },
  {
    group: "Library",
    questions: [
      "Which of my indexed books actually helps with the topic I have open?",
      "Which repo in my map is worth reading end to end, and why?",
    ],
  },
];

/**
 * What each route contributes to a question, so "what does this mean?" resolves differently on
 * /market than on /plan without the learner naming the page.
 *
 * This is the `context` string /api/ask already takes — it lands under "Currently visible in the
 * dashboard:" in the user message. No new parameter: the route builds the full 119-topic plan
 * server-side and reads `topicIndex` for a deep syllabus, and both of those stay exactly as they
 * were. All this map does is stop the fallback ("No topic filter is active.") from being the
 * answer to "where am I" on nine of the ten routes.
 *
 * Counts are read off the workbook rather than typed, for the same reason every other figure in
 * this app is derived: a sentence that says "15 markets" next to a sheet holding 12 is a number
 * Quaere will then repeat back.
 */
const ROUTE_CONTEXT: Record<string, string> = {
  "/": `Overview — headline progress across the plan, hours by month, the single next action, and the by-track breakdown.`,
  "/overview": `Overview — headline progress across the plan, hours by month, the single next action, and the by-track breakdown.`,
  "/curriculum": `Curriculum — the deep syllabus behind the plan, ${planRows.length} topics across ${tracks.length} tracks, opened one topic at a time.`,
  "/sandbox": `Sandbox — a hands-on terminal for practising commands against this plan.`,
  // Four keys here — /mocks, /assessments, /roadmaps, /comp — described routes that now 308 to
  // their merged homes, so they could never match a live pathname again and their text was
  // unreachable. The merged pages inherit what they said, which is the point of a merge.
  "/practice": `Practice — where you find out whether you actually know it: ${mockRows.length} scheduled mock interviews with their repetition counts, plus the serious assessment questions and their answer keys, scoped to this week and this month.`,
  "/library": `Library — the ${library.length} indexed books and ${repositories.length} build references that make up your study context, which is the same context given to me, plus the ${roadmapRows.length} external roadmaps used as scaffolding around the plan.`,
  "/market": `Market — the daily first-party job board scan: most-asked skills, reachability tiers, marginal skills and segment fit, all measured rather than estimated. Compensation reality sits below it: ${compRows.length} markets, each with a reachability verdict rather than a promise.`,
  "/paths": `Paths — the four routes out of this plan (stay in India, the Gulf, the US market, your own thing), each joining the compensation sheet's bands and odds to the live reach tiers from the scan. Two of the four read the same relocation pool, because a requisition records that a move is needed and not where to — say so if it comes up rather than splitting the number.`,
};

/**
 * The one route that describes itself, and the reason this is a set rather than an omission.
 *
 * /plan's view already calls `setPageContext` with the rows actually on screen after four filters
 * plus the row it has expanded, which is strictly better than anything this file could write from
 * a pathname. Effect order makes the guard load-bearing: this dock is a sibling rendered after
 * `{children}`, so its effect runs AFTER the page's, and writing a generic "/plan — a table of
 * topics" here would overwrite the filtered rows a fraction of a second after the page set them.
 */
const PAGE_OWNED = new Set(["/plan"]);

const LABELS = Object.fromEntries(NAV.map((item) => [item.href, item.label]));

export function QuaereDock() {
  // Read-only slice of the provider, by design. See the header note: no `setStatus` here.
  const { askOpen, setAskOpen, setAskTopic, askText, setAskText, messages, asking, askLumen, setPageContext, lastEventDay, nextRow, nextIndex, done, activeRows, hours, doneHours, focus, curParts, startedTopics } = useAppState();
  const pathname = usePathname();

  /**
   * What the dock says before it is asked anything.
   *
   * It used to open on "Nothing asked yet", which is true and useless — the panel stated its own
   * emptiness to someone who had just opened it. It now opens on a read of where the reader
   * actually is, built from the same `opening()` the daily brief uses so the companion does not
   * have two voices, and from state the provider already holds so this costs no request.
   *
   * Computed in an effect, never in render: `opening()` is a function of the clock, and text
   * derived from the clock during a render is the hydration mismatch this codebase already
   * avoids for the streak's sentences.
   */
  const [greeting, setGreeting] = useState("Ready when you are.");
  const [standing, setStanding] = useState("");
  const [facts, setFacts] = useState<{ k: string; v: string }[]>([]);
  /**
   * Search the web for THIS question.
   *
   * Off by default and not remembered between questions. Live results make an answer current and
   * make it unreproducible — ask twice, get two answers, with no way to tell which was right — so
   * it is a decision per question rather than a mode you can forget you left on.
   */
  const [web, setWeb] = useState(false);
  useEffect(() => {
    const brief = buildBrief({
      focus: nextRow ? {
        row: nextIndex + 1,
        topic: String(nextRow[2]),
        status: "",
        description: String(nextRow[3] ?? ""),
        month: Number(nextRow[1]),
        hours: Number(nextRow[13] || 0),
      } : null,
      lastEventDay,
    }, new Date());
    setGreeting(opening(brief));
    setStanding(brief.focus ? `You are on row ${brief.focus.row}, ${brief.focus.topic}.` : "Every topic is done or skipped.");

    /**
     * What it knows about you, stated before you ask.
     *
     * The panel used to open on one line, which is barely more useful than the blank box it
     * replaced. Every figure below is already in the provider — no fetch is added by this — and
     * each is dropped rather than guessed at when it cannot be derived, which is why this is
     * built by filtering rather than as a fixed list.
     */
    setFacts([
      focus ? { k: "Where you are", v: `Month ${focus.month} · ${focus.track}` } : null,
      nextRow ? { k: "Open row", v: `${String(nextRow[2])} · ${Number(nextRow[13] || 0)}h` } : null,
      { k: "Recorded", v: `${done} of ${activeRows.length} topics · ${hours - doneHours}h still ahead` },
      startedTopics.length ? { k: "In the recall schedule", v: `${startedTopics.length} topic${startedTopics.length === 1 ? "" : "s"} you have actually opened` } : null,
      curParts ? { k: "Syllabus it can read", v: `${curParts.toLocaleString()} parts across ${planRows.length} topics` } : null,
    ].filter((f): f is { k: string; v: string } => Boolean(f)));
  }, [lastEventDay, nextRow, nextIndex, done, activeRows, hours, doneHours, focus, curParts, startedTopics]);
  const scope = LABELS[pathname];
  const inputRef = useRef<HTMLInputElement>(null);
  // Set by the shortcut only, so a keyboard open focuses the field even on a touch device while a
  // tap on the FAB does not raise the on-screen keyboard over the answer being read.
  const openedByKey = useRef(false);
  const [keyHint, setKeyHint] = useState<string | null>(null);

  useEffect(() => { setKeyHint(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K"); }, []);

  // Where you are standing, refreshed on every navigation.
  //
  // `setAskTopic(null)` first: a topic pinned by the "Ask" button on a /plan row is a fact about
  // that row, not about you. Carrying it to /market would send `topicIndex` for a syllabus you
  // navigated away from, and — because `askLumen` prefers `askTopic` over the page's own index —
  // it would outrank the context of the page you are actually reading.
  useEffect(() => {
    setAskTopic(null);
    if (PAGE_OWNED.has(pathname)) return;
    const context = ROUTE_CONTEXT[pathname];
    if (!context) return;
    setPageContext(context, null);
    // Cleared on the way out so a question asked from the next route never carries this one.
    return () => setPageContext("", null);
  }, [pathname, setAskTopic, setPageContext]);

  /**
   * Cmd/Ctrl+K opens and focuses.
   *
   * Chosen because it is the one shortcut users already have for "open the thing that answers
   * questions" — Linear, Vercel, Notion, GitHub and Slack all bind it — and because the modifier
   * is what makes it safe here: the Plan explorer has a search box and four selects, and a bare
   * key like "/" or "?" would either be swallowed while typing in them or need an is-this-a-field
   * guard that gets it wrong on the first control it does not know about. Cmd/Ctrl+K fires from
   * inside a text field, which is exactly where a question tends to occur to you.
   *
   * Escape closes, and it is not re-registered here: AppStateProvider already listens for it
   * while `askOpen`. The listener is on `window`, so it fires with the caret in the dock's own
   * input too. One owner, one binding.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key !== "k" && event.key !== "K") return;
      event.preventDefault();
      if (askOpen) { focusInput(inputRef.current); return; }
      openedByKey.current = true;
      setAskTopic(null);
      setAskOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [askOpen, setAskOpen, setAskTopic]);

  // On a pointing device the panel is opened by a deliberate click, so focusing the field is what
  // was meant. `matchMedia` rather than a width query: the thing that matters is whether focusing
  // costs the reader half the screen to a software keyboard.
  useEffect(() => {
    if (!askOpen) return;
    const byKeyboard = openedByKey.current;
    openedByKey.current = false;
    if (byKeyboard || window.matchMedia("(pointer:fine)").matches) focusInput(inputRef.current);
  }, [askOpen]);

  // Route-aware wording for the three standing prompts. "Explain this" used to say "the current
  // topic", which was true on /plan and a guess everywhere else.
  const here = scope ? `the ${scope} view` : "this view";

  return <>
    {!askOpen && <button className="ask-fab" onClick={() => { setAskTopic(null); setAskOpen(true); }} aria-label="Open Quaere" aria-keyshortcuts="Meta+K Control+K"><AskMark size={16} /> Quaere</button>}
    {askOpen && <aside className="ask-panel" aria-label="Quaere"><div className="ask-head"><div className="ask-title"><AskMark size={20} className="ask-head-mark" /><div><p className="eyebrow">Lumen study guide</p><h2>Quaere</h2></div></div><button className="close-button" onClick={() => setAskOpen(false)} aria-label="Close Quaere (Escape)">×</button></div><p className="ask-intro">Latin for “seek”. Ask for a plain-English explanation, a session recap, or the next hands-on step. Quaere sees your whole plan and the indexed study library.</p><p className="ask-scope"><span>Reading</span><b>{scope || "Lumen"}</b>{keyHint && <kbd className="ask-kbd">{keyHint}</kbd>}</p><div className="context-status"><span className="sync-dot" /><span>Plan snapshot · {library.length} books · {repositories.length} repos · read-only</span></div><div className="suggestions"><button onClick={() => askLumen(`Explain what I am looking at in ${here} as if I am preparing for a senior FDE interview.`, { web })}>Explain this</button><button onClick={() => askLumen(`Turn what is in front of me in ${here} into a 20-minute hands-on exercise.`, { web })}>Give me a lab</button><button onClick={() => askLumen(`After working through ${here}, what should I be able to say or build?`, { web })}>Check grasp</button></div><div className="messages">{messages.length === 0 && <div className="empty-chat"><AskMark size={22} className="empty-chat-mark" /><strong>{greeting}</strong><span>{standing}</span><span>Quaere reads your whole plan — all {planRows.length} topics across {tracks.length} tracks — plus the {library.length} indexed books, your market scan, your compensation sheet, what you have shipped and whichever view you are on. It also reads a dated web brief stored in your repo — refreshed on your first visit each day, so an answer built on it is the same one you would get twice. It searches the web live only when you switch it on below. It never changes your progress.</span>{facts.length > 0 && <dl className="ask-facts">{facts.map((f) => <div key={f.k}><dt>{f.k}</dt><dd>{f.v}</dd></div>)}</dl>}{FAQ_GROUPS.map((g) => <div className="faq-group" key={g.group}><p className="faq-group-title">{g.group}</p><ul className="faq-list">{g.questions.map((q) => <li key={q}><button onClick={() => askLumen(q, { web })}>{q}</button></li>)}</ul></div>)}</div>}{messages.map((m, i) => <div className={`message ${m.role}`} key={i}><span>{m.role === "user" ? "You" : "Lumen"}</span><p>{m.content}</p>{m.reportUrl && <a className="report-link" href={m.reportUrl} target="_blank" rel="noreferrer">Open saved report ↗</a>}</div>)}{asking && <div className="message assistant"><span>Lumen</span><p>Working through the plan context…</p></div>}</div><label className="ask-web"><input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} /><span>Search the web for this question<b>{web ? "on" : "off"}</b></span></label><form className="ask-form" onSubmit={(e) => { e.preventDefault(); askLumen(undefined, { web }); }}><input ref={inputRef} value={askText} onChange={(e) => setAskText(e.target.value)} placeholder={scope ? `Ask about ${scope}…` : "Ask about what you are learning…"} /><button aria-label="Send question" disabled={asking || !askText.trim()}>→</button></form><div className="ask-foot">{web ? "Study guide · searches first, so this answer takes about half a minute longer" : "Study guide · your repo and a stored web brief"}</div></aside>}
  </>;
}

// A prefilled prompt arrives with the panel — /plan and /library both write one — so the caret
// goes to the end of it rather than in front of it, which is where a bare focus() leaves it in
// Safari and turns "add a word" into "type over the sentence".
function focusInput(input: HTMLInputElement | null) {
  if (!input) return;
  input.focus();
  const end = input.value.length;
  try { input.setSelectionRange(end, end); } catch { /* not a type that supports selection */ }
}
