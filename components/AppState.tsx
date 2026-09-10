"use client";

import Link from "next/link";
import { machinesForTopic } from "@/lib/machines";
import { lessonsForTopic } from "@/lib/lessons";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { compRows, months, planRows, topicKey, tracks, verdictTier, type Row, type Syllabus } from "./shared";
import { computeStreak } from "@/lib/motivation";
import type { Progress } from "@/lib/market/insight";
import { SyllabusView } from "./SyllabusView";

/**
 * The state that outlives a route change.
 *
 * Before the split every one of these lived in `app/page.tsx`, which was the only mounted
 * component - so "survives navigation" was free. It is not free any more, and the split is only
 * safe because this provider sits in `app/(app)/layout.tsx`, above the route slot: React keeps a
 * layout mounted while the segment below it changes, so nothing here remounts or refetches when
 * you move between the ten pages.
 *
 * What is deliberately NOT here: the Plan explorer's filters (track/month/query/progress) and
 * which syllabus row is expanded. Those are one page's view of its own data, they mean nothing on
 * /market, and keeping them local is what stops this file from becoming the old page.tsx again.
 */

export type ProgressSync = "loading" | "ready" | "failed";
type Message = { role: "user" | "assistant"; content: string; reportUrl?: string };

type AppState = {
  // progress
  statuses: Record<string, string>;
  progressSync: ProgressSync;
  /** Re-runs the progress fetch after a failure, so a blip is not terminal for the session. */
  retryProgress: () => void;
  /**
   * UTC day of the newest recorded progress event, or null when none is known.
   *
   * Captured from the fetch the provider ALREADY makes. The dock needs to know how long it has
   * been in order to open with something other than a blank box, and a second request for a
   * number already in hand is how a page acquires a second answer to one question.
   */
  lastEventDay: string | null;
  setStatus: (r: Row, status: string) => void;
  statusOf: (r: Row) => string;
  // settings
  theme: "light" | "dark";
  toggleTheme: () => void;
  weeklyHours: number;
  setWeekly: (value: number) => void;
  // curriculum
  curSummary: Record<string, { parts: number; minutes: number }> | null;
  ensureSummary: () => void;
  requestSyllabus: (indices: number[]) => void;
  renderSyllabus: (index: number) => React.ReactNode;
  /**
   * The cached syllabus for one row, or null if it has not been fetched yet.
   *
   * `renderSyllabus` returns JSX, which is the wrong shape for a caller that needs the part
   * NAMES as data - the daily brief lists what today's topic is actually made of. Reading the
   * same cache rather than adding a second one is the point: the merged syllabus is ~3.7MB and
   * is deliberately fetched per topic and kept, so /plan, /curriculum and the brief share one
   * copy and one request.
   */
  syllabusFor: (index: number) => Syllabus | null;
  // Quaere
  askOpen: boolean;
  setAskOpen: (open: boolean) => void;
  askText: string;
  setAskText: (text: string) => void;
  askTopic: number | null;
  setAskTopic: (index: number | null) => void;
  messages: Message[];
  asking: boolean;
  askLumen: (prompt?: string, opts?: { web?: boolean; selection?: string }) => Promise<void>;
  setPageContext: (context: string, topicIndex: number | null) => void;
  // derived from statuses, shared by the layout chrome and the Overview page
  done: number;
  skipped: number;
  activeRows: Row[];
  hours: number;
  doneHours: number;
  skippedHours: number;
  monthHours: { month: number; hours: number }[];
  maxMonthHours: number;
  peakMonth: { month: number; hours: number };
  nextRow: Row | null;
  nextIndex: number;
  focus: { month: number; track: string } | null;
  trackTotals: { name: string; count: number; hours: number; done: number }[];
  startedTopics: number[];
  marketTiers: { market: string; window: string; rank: number; label: string; tone: string }[];
  /**
   * Which of the four routes on /paths the reader is aiming at, or null.
   *
   * It lives here rather than in the Paths view because a preference nothing else can read is not
   * a preference, it is a highlight. The Overview rail marks it, and Quaere is told about it, so
   * choosing a route actually changes what the product says to you.
   */
  aim: string | null;
  setAim: (id: string | null) => void;
  curParts: number;
};

const Ctx = createContext<AppState | null>(null);

export function useAppState() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useAppState must be used inside <AppStateProvider>");
  return value;
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  // statuses starts empty and hydrates asynchronously below, so between first paint and
  // hydration every select shows the workbook baseline ("Not started" on 117 rows) rather
  // than recorded state. Touching one in that window used to POST a durable commit that
  // reverted real progress - that is how a not_started event landed on "Shell mastery and
  // scripting" two days after it was marked in progress. No write is allowed until the
  // fetch settles, and on failure it stays blocked: the baseline is known-possibly-stale,
  // and a read-only dashboard is recoverable by refreshing, while a wrong commit is not.
  //
  // Routing makes this stricter, not looser. If this pair lived in a route page it would
  // return to "loading" on every navigation, and - far worse - the fetch would re-run per
  // route, reopening the un-hydrated write window each time. It lives above the route slot
  // for that reason: one fetch per session, one settle, and the guard is never re-armed.
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [progressSync, setProgressSync] = useState<ProgressSync>("loading");
  /**
   * Bumped to retry the progress fetch.
   *
   * The fetch below ran once, in a `[]` effect, and `setProgressSync("failed")` was terminal: no
   * retry, no other writer. A 502 from /api/progress - which happens whenever GITHUB_TOKEN is
   * missing or GitHub is briefly unreachable - disabled the status dropdown on all 119 plan rows
   * for the rest of the session, with no way back except reloading the page. The write-guard that
   * disables them is right; being unable to leave that state is not.
   */
  const [retry, setRetry] = useState(0);
  const retryProgress = useCallback(() => { setProgressSync("loading"); setRetry((n) => n + 1); }, []);
  const [lastEventDay, setLastEventDay] = useState<string | null>(null);
  const [aim, setAimState] = useState<string | null>(null);
  const progressRef = useRef<Progress | null>(null);

  // A non-ok response must reject rather than resolve to null: swallowing it would mark the
  // sync settled and re-open writes against the un-hydrated baseline, which is the exact bug.
  useEffect(() => { try { setStatuses(JSON.parse(localStorage.getItem("lumen-statuses") || "{}")); } catch {} fetch("/api/progress").then((res) => res.ok ? res.json() : Promise.reject(new Error(String(res.status)))).then((data) => { const synced: Record<string, string> = {};
      // Newest dated event, taken while the same payload is already in hand.
      let newest: string | null = null;
      for (const event of data?.events || []) { const d = String(event.date || "").slice(0, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(d) && (!newest || d > newest)) newest = d; }
      setLastEventDay(newest);
      // Kept, not discarded. `computeStreak` is pure and needs the events; the provider already
      // pays for this fetch, and asking the network twice for one answer is how a page acquires
      // two answers to one question.
      progressRef.current = Array.isArray(data?.events) ? data : null;
      for (const event of data?.events || []) { const row = planRows.find((item) => String(item[2]).trim().toLowerCase() === String(event.topic).trim().toLowerCase()); if (row && !synced[topicKey(row)]) synced[topicKey(row)] = String(event.status).replace("_", " ").replace(/^\w/, (letter) => letter.toUpperCase()); } if (Object.keys(synced).length) { setStatuses((current) => { const merged = { ...current, ...synced }; localStorage.setItem("lumen-statuses", JSON.stringify(merged)); return merged; }); } setProgressSync("ready"); }).catch(() => setProgressSync("failed")); }, [retry]);

  // Every POST here is a permanent commit in the user's repo, so it has to be a deliberate
  // change: refuse while the sync is unsettled or failed (the select is disabled then, but a
  // stale event handler or an autofill must not slip through), and skip a re-select of the
  // value already shown - a no-op should write nothing, not another commit for readiness to
  // replay. Local state is only written on a real change, for the same reason.
  // The POST stays outside the state updater on purpose: React StrictMode invokes an updater
  // twice, and a durable commit is not something to run twice.
  const setStatus = useCallback((r: Row, status: string) => {
    if (progressSync !== "ready") return;
    if (status === String(statuses[topicKey(r)] || r[15] || "Not started")) return;
    const key = topicKey(r);
    const previous = String(statuses[key] || r[15] || "Not started");
    const next = { ...statuses, [key]: status }; setStatuses(next); localStorage.setItem("lumen-statuses", JSON.stringify(next));
    fetch("/api/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: String(r[2]), status: status.toLowerCase().replace(" ", "_") }) })
      .then((response) => { if (!response.ok) throw new Error(`progress sync failed: ${response.status}`); })
      .catch(() => {
        setStatuses((current) => {
          if (current[key] !== status) return current;
          const restored = { ...current };
          if (previous === "Not started") delete restored[topicKey(r)];
          else restored[key] = previous;
          localStorage.setItem("lumen-statuses", JSON.stringify(restored));
          return restored;
        });
      });
  }, [progressSync, statuses]);

  // Was hardcoded "16h" next to a separate hours/16, so the two could disagree and
  // neither tracked reality. One source of truth, editable, persisted like statuses.
  const [weeklyHours, setWeeklyHours] = useState(16);
  useEffect(() => { const v = Number(localStorage.getItem("lumen-weekly-hours")); if (v >= 1 && v <= 80) setWeeklyHours(v); }, []);
  const setWeekly = useCallback((value: number) => { const v = Math.min(80, Math.max(1, Math.round(value) || 1)); setWeeklyHours(v); localStorage.setItem("lumen-weekly-hours", String(v)); }, []);

  // The applied theme is set by an inline script in layout.tsx before first paint, so this
  // only mirrors it into React state for the button label - reading it here rather than
  // recomputing avoids a flash of the wrong icon on hydration. It is provider state because a
  // per-route copy would re-read the DOM on every navigation for no gain.
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => { setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"); }, []);
  const toggleTheme = useCallback(() => setTheme((current) => {
    const next = current === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.dataset.theme = next;
    localStorage.setItem("lumen-theme", next);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
    return next;
  }), []);

  // The merged syllabus is ~3.7MB, so never fetch it whole: pull a tiny summary to label
  // collapsed rows, then one topic at a time as it is opened. Both caches are provider state
  // because /plan and /curriculum render the same syllabus - refetching a topic because you
  // walked from one page to the other is exactly the regression routing invites.
  const [curriculum, setCurriculum] = useState<Record<string, Syllabus>>({});
  const [curriculumState, setCurriculumState] = useState<"idle" | "loading" | "error">("idle");
  const [curSummary, setCurSummary] = useState<Record<string, { parts: number; minutes: number }> | null>(null);
  const summaryRequested = useRef(false);

  const ensureSummary = useCallback(() => {
    if (summaryRequested.current) return;
    summaryRequested.current = true;
    fetch("/api/curriculum?summary=1").then((res) => res.ok ? res.json() : Promise.reject(new Error(String(res.status))))
      .then((data) => setCurSummary(Object.fromEntries((data.summary || []).map((x: { i: number; parts: number; minutes: number }) => [String(x.i), { parts: x.parts, minutes: x.minutes }]))))
      .catch(() => { summaryRequested.current = false; });
  }, []);

  // Requested indices are tracked in a ref rather than read off `curriculum`, so this callback
  // has a stable identity and a page can safely call it from an effect. A failed topic is
  // un-marked so reopening the row retries, which is what the old effect did by looking at a
  // still-missing key.
  const requested = useRef<Record<string, true>>({});
  const syllabusFor = useCallback((index: number) => curriculum[String(index)] ?? null, [curriculum]);

  const requestSyllabus = useCallback((indices: number[]) => {
    const need = indices.filter((i) => !requested.current[String(i)]);
    if (!need.length) return;
    for (const i of need) requested.current[String(i)] = true;
    setCurriculumState("loading");
    Promise.all(need.map((i) => fetch(`/api/curriculum?i=${i}`).then((res) => res.ok ? res.json() : null).then((d) => [i, d] as const).catch(() => [i, null] as const)))
      .then((pairs) => {
        const add: Record<string, Syllabus> = {};
        let failed = false;
        for (const [i, d] of pairs) { if (d) add[String(i)] = d as Syllabus; else { failed = true; delete requested.current[String(i)]; } }
        if (Object.keys(add).length) setCurriculum((c) => ({ ...c, ...add }));
        setCurriculumState(failed ? "error" : "idle");
      });
  }, []);

  const renderSyllabus = useCallback((idx: number) => {
    const s = curriculum[String(idx)];
    /*
     * The machine for this topic, offered where the topic is being read.
     *
     * `machinesForTopic` existed with zero callers, while the design spec claimed each machine is
     * "reachable from the topic you are studying rather than floating in its own world". It was
     * not: the only way to a machine was the Machines tab. That is defect class 2 - a document
     * asserting something the code does not do - and this is the code catching up rather than the
     * sentence being deleted.
     */
    const machines = machinesForTopic(idx);
    const lessons = lessonsForTopic(idx);
    const strip = machines.length || lessons.length ? (
      <p className="syllabus-machine">
        {machines.map((m) => (
          <Link key={m.id} href={`/machines?m=${m.id}`}>Step through {m.title.split(":")[0]} and break it</Link>
        ))}
        {lessons.map((l) => (
          <Link key={l.id} href={`/machines?l=${l.id}`}>Drag {l.title.split(",")[0].toLowerCase()}</Link>
        ))}
      </p>
    ) : null;
    if (s) return <>{strip}<SyllabusView s={s} row={planRows[idx]} /></>;
    if (strip) return <>{strip}<p className="syllabus-empty">No deep syllabus for this topic yet.</p></>;
    if (curriculumState === "loading") return <p className="syllabus-empty">Loading the syllabus…</p>;
    if (curriculumState === "error") return <p className="syllabus-empty">The syllabus could not be loaded. Refresh and try again.</p>;
    return <p className="syllabus-empty">No deep syllabus for this topic yet.</p>;
  }, [curriculum, curriculumState]);

  // The conversation. This is the one piece of state whose whole point is that it outlives the
  // page you asked from: a dock that follows you across routes but drops the answer you are
  // waiting on is worse than no dock.
  const [askOpen, setAskOpen] = useState(false);
  const [askText, setAskText] = useState("");
  const [askTopic, setAskTopic] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [asking, setAsking] = useState(false);

  // What the page you are standing on contributes to a question. /plan sets its visible rows
  // and its expanded topic here; every other route contributes nothing, and /api/ask falls back
  // to "No topic filter is active." - which is honest, since the route already builds the
  // complete 119-topic plan server-side and never trusts this for grounding.
  const pageContext = useRef<{ context: string; topicIndex: number | null }>({ context: "", topicIndex: null });
  const setPageContext = useCallback((context: string, topicIndex: number | null) => { pageContext.current = { context, topicIndex }; }, []);

  /**
   * Ask Quaere, optionally searching the web first.
   *
   * Two requests when `web` is on, and that is a platform constraint rather than a preference:
   * the search measures 27-39s, the model claims up to 55, and a Hobby function stops at 60. Run
   * as two calls each gets its own budget. `/api/external-brief` never throws for a failed
   * search - it answers `{ok:false, items:[]}` - so a search that times out costs the results and
   * not the question, and `web:true` still reaches the route, which is what makes the answer say
   * the search did not come back rather than quietly answering without it.
   */
  /*
   * The live statuses, held in a ref so `askLumen` can read them without listing `statuses` as a
   * dependency. Quaere's plan block is built server-side from the workbook, whose status column is
   * a frozen baseline reading "Not started" for 117 of 119 rows; these are what make it current.
   */
  // Read after mount, never during render: localStorage does not exist on the server, and reading
  // it while rendering would give the server one answer and the client another.
  useEffect(() => {
    try { setAimState(localStorage.getItem("lumen-path")); } catch { /* private mode */ }
  }, []);
  const setAim = useCallback((id: string | null) => {
    setAimState(id);
    try { id ? localStorage.setItem("lumen-path", id) : localStorage.removeItem("lumen-path"); } catch { /* nothing to do */ }
  }, []);

  const statusesRef = useRef<Record<string, string>>({});
  // A ref so askLumen does not need `aim` in its dependency array and go stale.
  const aimRef = useRef<string | null>(null);
  useEffect(() => { aimRef.current = aim; }, [aim]);
  useEffect(() => {
    const live: Record<string, string> = {};
    for (const r of planRows) {
      const s = statuses[topicKey(r)];
      if (s) live[String(r[2]).trim()] = s;
    }
    statusesRef.current = live;
  }, [statuses]);

  const askLumen = useCallback(async (prompt = askText, opts: { web?: boolean; selection?: string } = {}) => {
    if (!prompt.trim() || asking) return;
    setMessages((m) => [...m, { role: "user", content: prompt }]); setAskText(""); setAsking(true);
    const topicIndex = askTopic ?? pageContext.current.topicIndex ?? undefined;
    let webItems: unknown[] | undefined;
    if (opts.web) {
      try {
        const res = await fetch("/api/external-brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: prompt }) });
        const data = await res.json();
        if (Array.isArray(data.items) && data.items.length) webItems = data.items;
      } catch { /* the answer still goes ahead, and says the search did not come back */ }
    }
    try { const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, context: pageContext.current.context, topicIndex, history: messages, web: Boolean(opts.web), webItems, selection: opts.selection || undefined, statuses: statusesRef.current, streak: progressRef.current ? computeStreak(progressRef.current, new Date()).statement : undefined, aim: aimRef.current }) }); const data = await res.json(); setMessages((m) => [...m, { role: "assistant", content: data.answer || data.error || "Lumen could not answer right now.", reportUrl: data.reportUrl || undefined }]); } catch { setMessages((m) => [...m, { role: "assistant", content: "Lumen is unavailable. Add MINIMAX_API_KEY in Vercel project settings and try again." }]); } finally { setAsking(false); }
  }, [askText, asking, askTopic, messages]);

  useEffect(() => {
    if (!askOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAskOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [askOpen]);

  const statusOf = useCallback((r: Row) => String(statuses[topicKey(r)] || r[15] || "Not started"), [statuses]);

  // Everything below is derived from `statuses`, and it is derived once here because the layout
  // chrome (hero, footer) and the Overview page both read it. Two copies of these definitions is
  // how the plan once advertised 916h that included 26h of skipped work.
  const derived = useMemo(() => {
    const of = (r: Row) => String(statuses[topicKey(r)] || r[15] || "Not started");
    const done = planRows.filter((r) => of(r) === "Done").length;
    const skipped = planRows.filter((r) => of(r) === "Skipped").length;
    // Progress counted non-skipped topics (117 of 119) while every hours figure counted all
    // 119, so the plan advertised 916h that included 26h you had already decided to skip -
    // and inflated the timeline by 1.6 weeks. Scope is now one definition: active = not
    // skipped. The skipped amount is disclosed rather than silently dropped.
    const activeRows = planRows.filter((r) => of(r) !== "Skipped");
    const planHours = planRows.reduce((n, r) => n + Number(r[13] || 0), 0);
    const hours = activeRows.reduce((n, r) => n + Number(r[13] || 0), 0);
    const doneHours = planRows.filter((r) => of(r) === "Done").reduce((n, r) => n + Number(r[13] || 0), 0);
    const monthHours = months.map((m) => ({ month: m, hours: activeRows.filter((r) => Number(r[1]) === m).reduce((n, r) => n + Number(r[13] || 0), 0) }));
    const maxMonthHours = Math.max(...monthHours.map((x) => x.hours));
    // Built from activeRows and `of` for the same reason every other figure on this screen
    // is: the By-track list was the one place that still counted skipped rows and re-derived
    // status inline, so it summed to 1,614h under a header saying 1,588h, and a track whose only
    // incomplete topic was skipped could never reach 100%.
    const trackTotals = tracks
      .map((name) => {
        const rows = activeRows.filter((r) => r[0] === name);
        return { name, count: rows.length, hours: rows.reduce((n, r) => n + Number(r[13] || 0), 0), done: rows.filter((r) => of(r) === "Done").length };
      })
      // A track every one of whose topics is skipped is not a track with no work left; it is a
      // track that is not in the plan, and "0 topics 0h" reads as the former.
      .filter((t) => t.count > 0);
    // The first topic that is neither done nor skipped, in plan order - the real "you are here".
    const nextIndex = planRows.findIndex((x) => { const st = of(x); return st !== "Done" && st !== "Skipped"; });
    const nextRow = nextIndex >= 0 ? planRows[nextIndex] : null;
    // Only topics actually in play enter the review schedule - drilling something never
    // opened is noise. Indices are curriculum keys, which are plan-row indices.
    const startedTopics = planRows.map((r, i) => [i, of(r)] as const).filter(([, s]) => s === "In progress" || s === "Done").map(([i]) => i);
    return {
      done, skipped, activeRows, hours, doneHours, skippedHours: planHours - hours,
      monthHours, maxMonthHours, peakMonth: monthHours.find((x) => x.hours === maxMonthHours)!,
      nextRow, nextIndex, trackTotals, startedTopics,
      focus: nextRow ? { month: Number(nextRow[1]), track: String(nextRow[0]).replace(/^[A-Z]\. /, "") } : null,
    };
  }, [statuses]);

  // The Target calibration panel sat as one paragraph beside a 15-row track list, leaving
  // most of its column empty. The CompReality sheet already answers the question the panel
  // asks - which markets are actually reachable, and when - so it carries a ranked digest
  // instead of blank space. Tier is read off the probability prose, so it stays in sync
  // with the sheet rather than being a second hardcoded opinion.
  const marketTiers = useMemo(() => compRows
    .map((r) => ({ market: String(r[0]), window: String(r[4]), ...verdictTier(String(r[4])) }))
    .sort((a, b) => a.rank - b.rank), []);

  // Footer provenance. Scale is derived rather than written down, for the same reason every
  // other count on this page is.
  const curParts = useMemo(() => (curSummary ? Object.values(curSummary).reduce((n, x) => n + x.parts, 0) : 0), [curSummary]);

  const value = useMemo<AppState>(() => ({
    statuses, progressSync, retryProgress, setStatus, statusOf,
    theme, toggleTheme, weeklyHours, setWeekly,
    lastEventDay,
    curSummary, ensureSummary, requestSyllabus, renderSyllabus, syllabusFor,
    askOpen, setAskOpen, askText, setAskText, askTopic, setAskTopic, messages, asking, askLumen, setPageContext,
    ...derived, marketTiers, curParts, aim, setAim,
  }), [statuses, progressSync, retryProgress, lastEventDay, setStatus, statusOf, theme, toggleTheme, weeklyHours, setWeekly, curSummary, ensureSummary, requestSyllabus, renderSyllabus, syllabusFor, askOpen, askText, askTopic, messages, asking, askLumen, setPageContext, derived, marketTiers, curParts, aim, setAim]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
