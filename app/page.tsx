"use client";

import { useMemo, useState, useEffect } from "react";
import library from "@/data/library-context.json";
import repositories from "@/data/repository-context.json";
import { LogoMark, AskMark } from "./brand";
import { RecallStrip } from "./recall";
import { Terminal } from "./terminal";
import { compRows, months, planRows, topicKey, tracks, verdictTier, type Row, type Syllabus } from "@/components/shared";
import { SyllabusView } from "@/components/SyllabusView";
import { Assessments } from "@/components/Assessments";
import { Market } from "@/components/Market";
import { Overview } from "@/components/Overview";
import { Plan } from "@/components/Plan";
import { Curriculum } from "@/components/Curriculum";
import { Mocks } from "@/components/Mocks";
import { Roadmaps } from "@/components/Roadmaps";
import { Library } from "@/components/Library";
import { CompReality } from "@/components/CompReality";

// Starter questions. The first one is deliberate: Quaere once answered "there is no ML
// topic in the visible plan" because the client sent it 8 of 119 rows. Asking it is now
// the fastest way to see that the whole plan is in context.
const FAQS = [
  "Does my plan cover machine learning, and where?",
  "What should I focus on this week, and why that over anything else?",
  "Which of my indexed books actually helps with the topic I have open?",
  // derived, not typed: this said "13 months" until the Hours column was re-baselined
  `Am I on pace to finish in ${months[months.length - 1]} months at 16 hours a week?`,
  "What will a senior FDE interview actually test that my plan does not cover?",
];

const TABS = ["Overview", "Plan", "Curriculum", "Sandbox", "Mocks", "Roadmaps", "Library", "Assessments", "Comp reality", "Market"];

export default function Home() {
  const [tab, setTab] = useState("Overview");
  const [track, setTrack] = useState("All tracks");
  const [month, setMonth] = useState("All months");
  const [query, setQuery] = useState("");
  const [progress, setProgress] = useState("All progress");
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  // statuses starts empty and hydrates asynchronously below, so between first paint and
  // hydration every select shows the workbook baseline ("Not started" on 117 rows) rather
  // than recorded state. Touching one in that window used to POST a durable commit that
  // reverted real progress — that is how a not_started event landed on "Shell mastery and
  // scripting" two days after it was marked in progress. No write is allowed until the
  // fetch settles, and on failure it stays blocked: the baseline is known-possibly-stale,
  // and a read-only dashboard is recoverable by refreshing, while a wrong commit is not.
  const [progressSync, setProgressSync] = useState<"loading" | "ready" | "failed">("loading");
  const [askOpen, setAskOpen] = useState(false);
  const [askText, setAskText] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string; reportUrl?: string }[]>([]);
  const [asking, setAsking] = useState(false);
  const [shared, setShared] = useState(false);
  // Was hardcoded "16h" next to a separate hours/16, so the two could disagree and
  // neither tracked reality. One source of truth, editable, persisted like statuses.
  const [weeklyHours, setWeeklyHours] = useState(16);
  useEffect(() => { const v = Number(localStorage.getItem("lumen-weekly-hours")); if (v >= 1 && v <= 80) setWeeklyHours(v); }, []);
  const setWeekly = (value: number) => { const v = Math.min(80, Math.max(1, Math.round(value) || 1)); setWeeklyHours(v); localStorage.setItem("lumen-weekly-hours", String(v)); };
  // The applied theme is set by an inline script in layout.tsx before first paint, so this
  // only mirrors it into React state for the button label — reading it here rather than
  // recomputing avoids a flash of the wrong icon on hydration.
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => { setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"); }, []);
  const toggleTheme = () => setTheme((current) => {
    const next = current === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.dataset.theme = next;
    localStorage.setItem("lumen-theme", next);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
    return next;
  });
  const [curriculum, setCurriculum] = useState<Record<string, Syllabus>>({});
  const [curSummary, setCurSummary] = useState<Record<string, { parts: number; minutes: number }> | null>(null);
  const [curriculumState, setCurriculumState] = useState<"idle" | "loading" | "error">("idle");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [curOpen, setCurOpen] = useState<Set<number>>(new Set());
  const [askTopic, setAskTopic] = useState<number | null>(null);
  const toggleCur = (idx: number) => setCurOpen((s) => { const n = new Set(s); if (n.has(idx)) n.delete(idx); else n.add(idx); return n; });
  const syllabusFor = (idx: number) => curriculum[String(idx)];
  const renderSyllabus = (idx: number) => { const s = syllabusFor(idx); if (s) return <SyllabusView s={s} row={planRows[idx]} />; if (curriculumState === "loading") return <p className="syllabus-empty">Loading the syllabus…</p>; if (curriculumState === "error") return <p className="syllabus-empty">The syllabus could not be loaded. Refresh and try again.</p>; return <p className="syllabus-empty">No deep syllabus for this topic yet.</p>; };
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title: "Lumen · Senior FDE plan", url }); return; }
      await navigator.clipboard.writeText(url);
      setShared(true); window.setTimeout(() => setShared(false), 2000);
    } catch { /* cancelled, or clipboard blocked without a secure context */ }
  };
  // A non-ok response must reject rather than resolve to null: swallowing it would mark the
  // sync settled and re-open writes against the un-hydrated baseline, which is the exact bug.
  useEffect(() => { try { setStatuses(JSON.parse(localStorage.getItem("lumen-statuses") || "{}")); } catch {} fetch("/api/progress").then((res) => res.ok ? res.json() : Promise.reject(new Error(String(res.status)))).then((data) => { const synced: Record<string, string> = {}; for (const event of data?.events || []) { const row = planRows.find((item) => String(item[2]).trim().toLowerCase() === String(event.topic).trim().toLowerCase()); if (row && !synced[topicKey(row)]) synced[topicKey(row)] = String(event.status).replace("_", " ").replace(/^\w/, (letter) => letter.toUpperCase()); } if (Object.keys(synced).length) { setStatuses((current) => { const merged = { ...current, ...synced }; localStorage.setItem("lumen-statuses", JSON.stringify(merged)); return merged; }); } setProgressSync("ready"); }).catch(() => setProgressSync("failed")); }, []);
  useEffect(() => {
    // The merged syllabus is ~2.5MB, so never fetch it whole: pull a tiny summary to label
    // collapsed rows, then one topic at a time as it is opened.
    if (curSummary || tab !== "Curriculum") return;
    fetch("/api/curriculum?summary=1").then((res) => res.ok ? res.json() : Promise.reject(new Error(String(res.status))))
      .then((data) => setCurSummary(Object.fromEntries((data.summary || []).map((x: { i: number; parts: number; minutes: number }) => [String(x.i), { parts: x.parts, minutes: x.minutes }]))))
      .catch(() => {});
  }, [tab, curSummary]);
  const wanted = tab === "Curriculum" ? Array.from(curOpen) : expanded === null ? [] : [expanded];
  const wantedKey = wanted.join(",");
  useEffect(() => {
    const need = wanted.filter((i) => !curriculum[String(i)]);
    if (!need.length) return;
    setCurriculumState("loading");
    Promise.all(need.map((i) => fetch(`/api/curriculum?i=${i}`).then((res) => res.ok ? res.json() : null).then((d) => [i, d] as const).catch(() => [i, null] as const)))
      .then((pairs) => {
        const add: Record<string, Syllabus> = {};
        let failed = false;
        for (const [i, d] of pairs) { if (d) add[String(i)] = d as Syllabus; else failed = true; }
        if (Object.keys(add).length) setCurriculum((c) => ({ ...c, ...add }));
        setCurriculumState(failed ? "error" : "idle");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey]);
  useEffect(() => {
    if (!askOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAskOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [askOpen]);
  // Every POST here is a permanent commit in the user's repo, so it has to be a deliberate
  // change: refuse while the sync is unsettled or failed (the select is disabled then, but a
  // stale event handler or an autofill must not slip through), and skip a re-select of the
  // value already shown — a no-op should write nothing, not another commit for readiness to
  // replay. Local state is only written on a real change, for the same reason.
  const setStatus = (r: Row, status: string) => {
    if (progressSync !== "ready") return;
    if (status === String(statuses[topicKey(r)] || r[15] || "Not started")) return;
    const next = { ...statuses, [topicKey(r)]: status }; setStatuses(next); localStorage.setItem("lumen-statuses", JSON.stringify(next));
    fetch("/api/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: String(r[2]), status: status.toLowerCase().replace(" ", "_") }) }).catch(() => {});
  };
  // The Target calibration panel sat as one paragraph beside a 15-row track list, leaving
  // most of its column empty. The CompReality sheet already answers the question the panel
  // asks — which markets are actually reachable, and when — so it carries a ranked digest
  // instead of blank space. Tier is read off the probability prose, so it stays in sync
  // with the sheet rather than being a second hardcoded opinion.
  const marketTiers = useMemo(() => compRows
    .map((r) => ({ market: String(r[0]), window: String(r[4]), ...verdictTier(String(r[4])) }))
    .sort((a, b) => a.rank - b.rank), []);

  // Footer provenance. The old line credited "Senior FDE Plan.xlsx", but data/source.xlsx
  // was frozen once the plan grew past it — workbook.json is the source of truth, so the
  // credit was pointing at a file the dashboard no longer reads. Scale is derived rather
  // than written down, for the same reason every other count on this page is.
  const curParts = useMemo(() => (curSummary ? Object.values(curSummary).reduce((n, x) => n + x.parts, 0) : 0), [curSummary]);

  const filtered = useMemo(() => planRows.filter((r) => (track === "All tracks" || r[0] === track) && (month === "All months" || String(r[1]) === month) && (progress === "All progress" || String(statuses[topicKey(r)] || r[15] || "Not started") === progress) && String(r[2]).toLowerCase().includes(query.toLowerCase())), [track, month, progress, query, statuses]);
  const statusOf = (r: Row) => String(statuses[topicKey(r)] || r[15] || "Not started");

  // Only topics actually in play enter the review schedule — drilling something never
  // opened is noise. Indices are curriculum keys, which are plan-row indices.
  const startedTopics = useMemo(() => planRows
    .map((r, i) => [i, statusOf(r)] as const)
    .filter(([, s]) => s === "In progress" || s === "Done")
    .map(([i]) => i), [statuses]);

  const done = planRows.filter((r) => statusOf(r) === "Done").length;
  const skipped = planRows.filter((r) => statusOf(r) === "Skipped").length;
  // Progress counted non-skipped topics (117 of 119) while every hours figure counted all
  // 119, so the plan advertised 916h that included 26h you had already decided to skip —
  // and inflated the timeline by 1.6 weeks. Scope is now one definition: active = not
  // skipped. The skipped amount is disclosed rather than silently dropped.
  const activeRows = planRows.filter((r) => statusOf(r) !== "Skipped");
  const planHours = planRows.reduce((n, r) => n + Number(r[13] || 0), 0);
  const hours = activeRows.reduce((n, r) => n + Number(r[13] || 0), 0);
  const skippedHours = planHours - hours;
  const doneHours = planRows.filter((r) => statusOf(r) === "Done").reduce((n, r) => n + Number(r[13] || 0), 0);
  const monthHours = months.map((m) => ({ month: m, hours: activeRows.filter((r) => Number(r[1]) === m).reduce((n, r) => n + Number(r[13] || 0), 0) }));
  // Built from activeRows and statusOf for the same reason every other figure on this screen
  // is: the By-track list was the one place that still counted skipped rows and re-derived
  // status inline, so it summed to 1,614h under a header saying 1,588h, and a track whose only
  // incomplete topic was skipped could never reach 100%. Derived here rather than inline so the
  // next figure added to this panel cannot pick a third definition of "in the plan".
  const trackTotals = useMemo(() => tracks
    .map((name) => {
      const rows = activeRows.filter((r) => r[0] === name);
      return { name, count: rows.length, hours: rows.reduce((n, r) => n + Number(r[13] || 0), 0), done: rows.filter((r) => statusOf(r) === "Done").length };
    })
    // A track every one of whose topics is skipped is not a track with no work left; it is a
    // track that is not in the plan, and "0 topics 0h" reads as the former.
    .filter((t) => t.count > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statuses]);
  const maxMonthHours = Math.max(...monthHours.map((x) => x.hours));
  const peakMonth = monthHours.find((x) => x.hours === maxMonthHours)!;
  // First topic that is neither done nor skipped, in plan order — the real "you are here".
  // The first topic that is neither done nor skipped. The hero note already used this;
  // the "Next action" panel did not — it read planRows[0] literally, so it kept saying
  // "Start here" about topic 1 long after you had finished topic 1.
  const nextIndex = useMemo(() => planRows.findIndex((x) => { const st = String(statuses[topicKey(x)] || x[15]); return st !== "Done" && st !== "Skipped"; }), [statuses]);
  const nextRow = nextIndex >= 0 ? planRows[nextIndex] : null;
  const focus = nextRow ? { month: Number(nextRow[1]), track: String(nextRow[0]).replace(/^[A-Z]\. /, "") } : null;
  const setView = (name: string) => { setTab(name); window.scrollTo({ top: 0, behavior: "smooth" }); };
  // A plan row cited by the benchmark is 1-based against workbook.Plan, whose header sits at
  // index 0 — so planRows[row - 1] is that topic. The filters are cleared first because a cited
  // row is usually outside whatever filter the Plan tab was left on, and expanding a row the
  // current filter hides looks exactly like a link that did nothing.
  const openPlanRow = (row: number) => {
    const index = row - 1;
    if (index < 0 || index >= planRows.length) return;
    setTrack("All tracks"); setMonth("All months"); setProgress("All progress"); setQuery("");
    setExpanded(index);
    setView("Plan");
  };
  const askLumen = async (prompt = askText) => {
    if (!prompt.trim() || asking) return;
    const context = filtered.slice(0, 8).map((r) => `${r[0]} | ${r[2]} | ${r[3]} | resources: ${r[4]}, ${r[7]}, ${r[10]}`).join("\n");
    setMessages((m) => [...m, { role: "user", content: prompt }]); setAskText(""); setAsking(true);
    const topicIndex = askTopic ?? expanded ?? undefined;
    try { const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, context, topicIndex, history: messages }) }); const data = await res.json(); setMessages((m) => [...m, { role: "assistant", content: data.answer || data.error || "Lumen could not answer right now.", reportUrl: data.reportUrl || undefined }]); } catch { setMessages((m) => [...m, { role: "assistant", content: "Lumen is unavailable. Add MINIMAX_API_KEY in Vercel project settings and try again." }]); } finally { setAsking(false); }
  };

  return <main className={askOpen ? "shell ask-open" : "shell"}>
    <header className="topbar"><a className="brand brand-link" href="/" aria-label="Return to Lumen home"><LogoMark className="brand-mark" /><div><div className="brand-name">Lumen</div><div className="brand-sub">by Rasul</div></div></a><div className="top-actions"><button className="ask-trigger" onClick={() => { setAskTopic(null); setAskOpen(true); }}><AskMark size={14} /> Quaere</button><button className="ghost-button" onClick={share} aria-live="polite">{shared ? "✓ Link copied" : "↗ Share"}</button><button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? "☀" : "☾"}</button></div></header>
    <section className="hero"><div><p className="kicker">Preparation command center</p><h1>Build proof, not just knowledge.</h1><p className="hero-copy">Your {hours}-hour Senior FDE plan, reduced to the pace, practice, and proof that matter this week.</p></div><div className="hero-note"><span className="note-pin">●</span><div><strong>Current focus</strong><p>{focus ? `Month ${focus.month} · ${focus.track}` : "Plan complete"}</p></div></div></section>
    <nav className="tabs" aria-label="Workbook views">{TABS.map((item) => <button key={item} className={tab === item ? "tab active" : "tab"} onClick={() => setView(item)}>{item}</button>)}</nav><RecallStrip startedTopics={startedTopics} />
    {tab === "Assessments" && <Assessments />}
    {tab === "Sandbox" && <Terminal />}
    {tab === "Market" && <Market statuses={statuses} openPlanRow={openPlanRow} />}
    {tab === "Overview" && <Overview done={done} activeRows={activeRows} skipped={skipped} hours={hours} doneHours={doneHours} skippedHours={skippedHours} weeklyHours={weeklyHours} setWeekly={setWeekly} monthHours={monthHours} maxMonthHours={maxMonthHours} peakMonth={peakMonth} nextRow={nextRow} nextIndex={nextIndex} setView={setView} trackTotals={trackTotals} setTrack={setTrack} marketTiers={marketTiers} />}
    {tab === "Plan" && <Plan filtered={filtered} query={query} setQuery={setQuery} track={track} setTrack={setTrack} month={month} setMonth={setMonth} progress={progress} setProgress={setProgress} expanded={expanded} setExpanded={setExpanded} statuses={statuses} progressSync={progressSync} setStatus={setStatus} setAskTopic={setAskTopic} setAskOpen={setAskOpen} setAskText={setAskText} renderSyllabus={renderSyllabus} />}
    {tab === "Curriculum" && <Curriculum curSummary={curSummary} curOpen={curOpen} setCurOpen={setCurOpen} toggleCur={toggleCur} renderSyllabus={renderSyllabus} />}
    {tab === "Mocks" && <Mocks />}
    {tab === "Roadmaps" && <Roadmaps />}
    {tab === "Library" && <Library setAskOpen={setAskOpen} setAskTopic={setAskTopic} setAskText={setAskText} />}
    {tab === "Comp reality" && <CompReality />}
    {!askOpen && <button className="ask-fab" onClick={() => { setAskTopic(null); setAskOpen(true); }} aria-label="Open Quaere"><AskMark size={16} /> Quaere</button>}
    {askOpen && <aside className="ask-panel" aria-label="Quaere"><div className="ask-head"><div className="ask-title"><AskMark size={20} className="ask-head-mark" /><div><p className="eyebrow">Lumen study guide</p><h2>Quaere</h2></div></div><button className="close-button" onClick={() => setAskOpen(false)}>×</button></div><p className="ask-intro">Latin for “seek”. Ask for a plain-English explanation, a session recap, or the next hands-on step. Quaere sees your whole plan and the indexed study library.</p><div className="context-status"><span className="sync-dot" /><span>Plan snapshot · {library.length} books · {repositories.length} repos</span></div><div className="suggestions"><button onClick={() => askLumen("Explain the current topic like I am preparing for a senior FDE interview.")}>Explain this</button><button onClick={() => askLumen("Turn the current topic into a 20-minute hands-on exercise.")}>Give me a lab</button><button onClick={() => askLumen("What should I be able to say or build after this session?")}>Check grasp</button></div><div className="messages">{messages.length === 0 && <div className="empty-chat"><AskMark size={22} className="empty-chat-mark" /><strong>Nothing asked yet</strong><span>Quaere reads your whole plan — all {planRows.length} topics across {tracks.length} tracks — plus the {library.length} indexed books. Not the open web.</span><ul className="faq-list">{FAQS.map((q) => <li key={q}><button onClick={() => askLumen(q)}>{q}</button></li>)}</ul></div>}{messages.map((m, i) => <div className={`message ${m.role}`} key={i}><span>{m.role === "user" ? "You" : "Lumen"}</span><p>{m.content}</p>{m.reportUrl && <a className="report-link" href={m.reportUrl} target="_blank" rel="noreferrer">Open saved report ↗</a>}</div>)}{asking && <div className="message assistant"><span>Lumen</span><p>Working through the plan context…</p></div>}</div><form className="ask-form" onSubmit={(e) => { e.preventDefault(); askLumen(); }}><input value={askText} onChange={(e) => setAskText(e.target.value)} placeholder="Ask about what you are learning…" /><button aria-label="Send question" disabled={asking || !askText.trim()}>→</button></form><div className="ask-foot">Study guide · private context</div></aside>}
    <footer><span>Built from Rasul&apos;s Senior FDE plan · {activeRows.length} active topics · {hours} hours{curParts ? ` · ${curParts.toLocaleString()} syllabus parts` : ""}</span><span>{TABS.length} views · dashboard and MCP read the same plan</span></footer>
  </main>;
}
