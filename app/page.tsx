"use client";

import { Fragment, useMemo, useState, useEffect } from "react";
import workbook from "@/data/workbook.json";
import library from "@/data/library-context.json";
import repositories from "@/data/repository-context.json";
import { LogoMark, AskMark } from "./brand";

type Row = (string | number | null)[];
const planRows = workbook.Plan.slice(1) as Row[];
// The workbook sheets end with a "Total" summary row and a one-cell instruction
// note. Both are presentation, not data: rendering them produced "Mnull"/"Mundefined"
// rows, and counting the Total row doubled the mock target (57 became 114).
const isDataRow = (r: Row, width: number) => r.length >= width && String(r[0]).trim().toLowerCase() !== "total";
const mockRows = (workbook.Mocks.slice(1) as Row[]).filter((r) => isDataRow(r, 9));
const roadmapRows = (workbook.Roadmaps.slice(1) as Row[]).filter((r) => isDataRow(r, 3));
const compRows = (workbook.CompReality.slice(1) as Row[]).filter((r) => isDataRow(r, 5));
const tracks = Array.from(new Set(planRows.map((r) => String(r[0]))));
const months = Array.from(new Set(planRows.map((r) => Number(r[1])))).sort((a, b) => a - b);
const pct = (done: number, total: number) => total ? Math.round((done / total) * 100) : 0;
const topicKey = (r: Row) => `${String(r[0])}::${String(r[2])}`;

function Link({ href, children }: { href: string; children: React.ReactNode }) { if (!href.startsWith("http")) return <span className="resource-link no-link" title="No resource assigned">{children}</span>; return <a className="resource-link" href={href} target="_blank" rel="noreferrer">{children}<span>↗</span></a>; }
function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) { return <div className={`metric ${tone}`}><span className="metric-label">{label}</span><strong>{value}</strong><span className="metric-detail">{detail}</span></div>; }
const quizQuestions = [
  { question: "Which Bash option makes a failed command inside a pipeline fail the pipeline?", options: ["set -u", "set -o pipefail", "trap EXIT", "getopts"], answer: 1 },
  { question: "What is the safest default place to clean up a temporary file?", options: ["A comment", "The README", "An EXIT trap", "A global variable"], answer: 2 },
  { question: "What should a strong FDE learning artifact preserve?", options: ["Only the final screenshot", "Command, directory, exit code, and artifact", "A copied tutorial", "A list of tool names"], answer: 1 },
  { question: "What is the best first move when a customer automation fails?", options: ["Guess and rerun it", "Change five things at once", "Capture the error, inputs, and last known good run", "Delete the logs"], answer: 2 },
];
function QuickQuiz() {
  const [index, setIndex] = useState(0); const [selected, setSelected] = useState<number | null>(null); const [score, setScore] = useState(0);
  const question = quizQuestions[index]; const finished = index === quizQuestions.length;
  const choose = (option: number) => { if (selected !== null) return; setSelected(option); if (option === question.answer) setScore((value) => value + 1); };
  const next = () => { setSelected(null); setIndex((value) => value + 1); };
  return <section className="quiz-strip" aria-label="Quick plan quiz"><div className="quiz-copy"><span className="quiz-label">5-minute check</span><strong>{finished ? `Score ${score}/${quizQuestions.length}` : question.question}</strong><span>{finished ? "Good. Repeat it tomorrow or ask Lumen to go deeper." : `Question ${index + 1} of ${quizQuestions.length}`}</span></div>{finished ? <button className="quiz-action" onClick={() => { setIndex(0); setScore(0); setSelected(null); }}>Replay</button> : <div className="quiz-options">{question.options.map((option, optionIndex) => <button key={option} className={selected === null ? "quiz-option" : optionIndex === question.answer ? "quiz-option correct" : selected === optionIndex ? "quiz-option wrong" : "quiz-option muted-option"} onClick={() => choose(optionIndex)}>{option}</button>)}{selected !== null && <button className="quiz-action" onClick={next}>{index === quizQuestions.length - 1 ? "See score" : "Next"} →</button>}</div>}</section>;
}
const assessmentSets = [
  { title: "Weekly checkpoint", cadence: "Every week · 30 minutes", instruction: "Close your notes. Explain one topic, solve two small problems, then write one production lesson. Pass when you can explain the why, not only the command.", topics: "Current plan topics · shell · networking · systems", key: quizQuestions.map((q, i) => `${i + 1}${String.fromCharCode(65 + q.answer)}`).join(" · ") },
  { title: "Monthly deep dive", cadence: "Every month · 90 minutes", instruction: "Part 1: explain three ideas simply. Part 2: design a small system. Part 3: debug a failure case. Part 4: show evidence from your build. Review mistakes the next day.", topics: "One month of plan work · one build artifact · one mock", key: "Rubric: correctness 40% · tradeoffs 25% · debugging 20% · communication 15%" },
  { title: "Quarterly capstone", cadence: "Every quarter · 3 hours", instruction: "Treat this like an MIT-style open-book systems examination. Start with assumptions, draw the design, implement a thin slice, test failure paths, and defend your choices aloud. Submit notes, code, tests, and a short retrospective.", topics: "End-to-end FDE case · architecture · delivery · customer impact", key: "Rubric: problem framing 20% · system design 25% · implementation 25% · reliability 15% · FDE communication 15%" },
];
function Assessments() {
  const [open, setOpen] = useState<number | null>(0);
  return <section className="panel full-panel assessment-panel"><div className="panel-head"><div><p className="eyebrow">Serious practice</p><h2>Assessments that compound</h2></div><span className="panel-meta">Weekly · monthly · quarterly</span></div><p className="assessment-lead">Use retrieval, not rereading. Write your answer before checking the key. Keep the result as interview evidence.</p><div className="assessment-list">{assessmentSets.map((assessment, index) => <article className={`assessment-card ${open === index ? "open" : ""}`} key={assessment.title}><button className="assessment-toggle" onClick={() => setOpen(open === index ? null : index)}><span><strong>{assessment.title}</strong><small>{assessment.cadence}</small></span><b>{open === index ? "−" : "+"}</b></button>{open === index && <div className="assessment-body"><p>{assessment.instruction}</p><span className="assessment-topics">{assessment.topics}</span><div className="answer-key"><strong>Answer key and rubric</strong><span>{assessment.key}</span></div><p className="assessment-note">Score your work through Ask Lumen or the MCP <code>score_assessment</code> tool. Results are guidance, not a pass/fail gate.</p></div>}</article>)}</div></section>;
}

const TABS = ["Overview", "Plan", "Curriculum", "Mocks", "Roadmaps", "Library", "Assessments", "Comp reality"];
type Subtopic = { name: string; learn: string; minutes: number; resource: { label: string; url: string } };
type Syllabus = { i: number; topic: string; hours: number; why: string; prerequisites: string[]; subtopics: Subtopic[]; outcomes: string[]; failureModes: string[]; interviewQuestions: string[]; proofOfWork: string };
function SyllabusView({ s, row }: { s: Syllabus; row?: Row }) {
  const minutes = s.subtopics.reduce((n, x) => n + (Number(x.minutes) || 0), 0);
  // The row carries the topic's three vetted resources. The syllabus parts below link to
  // docs only, so without this strip the video is unreachable from the Curriculum tab.
  const primary = row ? ([["Read", 4, 5], ["Watch", 7, 8], ["Do", 10, 11]] as const).map(([kind, labelCol, urlCol]) => ({ kind, label: String(row[labelCol] ?? ""), url: String(row[urlCol] ?? "") })) : [];
  return <div className="syllabus">
    {primary.length > 0 && <section className="syllabus-primary"><h4>Start with these three</h4><ul>{primary.map((p) => <li key={p.kind}><span className={`res-kind res-${p.kind.toLowerCase()}`}>{p.kind}</span><Link href={p.url}>{p.label || p.kind}</Link></li>)}</ul></section>}
    <p className="syllabus-why">{s.why}</p>
    <div className="syllabus-grid"><section><h4>Before you start</h4><ul>{s.prerequisites.map((p, i) => <li key={i}>{p}</li>)}</ul></section><section><h4>Afterwards, you can</h4><ul>{s.outcomes.map((o, i) => <li key={i}>{o}</li>)}</ul></section></div>
    <section className="syllabus-subtopics"><h4>What to learn <span>{s.subtopics.length} parts · {s.hours}h planned{Math.abs(minutes / 60 - s.hours) >= 1 ? ` (${(minutes / 60).toFixed(1)}h of material)` : ""}</span></h4><ol>{s.subtopics.map((x, i) => <li key={i}><div className="sub-head"><strong>{x.name}</strong><span>{x.minutes} min</span></div><p>{x.learn}</p><Link href={x.resource?.url || ""}>{x.resource?.label || "Resource"}</Link></li>)}</ol></section>
    <div className="syllabus-grid"><section><h4>How it breaks in production</h4><ul>{s.failureModes.map((f, i) => <li key={i}>{f}</li>)}</ul></section><section><h4>Interview questions</h4><ol>{s.interviewQuestions.map((q, i) => <li key={i}>{q}</li>)}</ol></section></div>
    <section className="syllabus-proof"><h4>Proof of work</h4>{row && String(row[14] ?? "").trim() && <p className="syllabus-deliverable"><strong>Ship this:</strong> {String(row[14])}</p>}<p>{s.proofOfWork}</p></section>
  </div>;
}

export default function Home() {
  const [tab, setTab] = useState("Overview");
  const [track, setTrack] = useState("All tracks");
  const [month, setMonth] = useState("All months");
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<Record<string, string>>({});
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
  useEffect(() => { try { setStatuses(JSON.parse(localStorage.getItem("lumen-statuses") || "{}")); } catch {} fetch("/api/progress").then((res) => res.ok ? res.json() : null).then((data) => { if (!data?.events?.length) return; const synced: Record<string, string> = {}; for (const event of data.events) { const row = planRows.find((item) => String(item[2]).trim().toLowerCase() === String(event.topic).trim().toLowerCase()); if (row && !synced[topicKey(row)]) synced[topicKey(row)] = String(event.status).replace("_", " ").replace(/^\w/, (letter) => letter.toUpperCase()); } if (Object.keys(synced).length) { setStatuses((current) => { const merged = { ...current, ...synced }; localStorage.setItem("lumen-statuses", JSON.stringify(merged)); return merged; }); } }).catch(() => {}); }, []);
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
  const setStatus = (r: Row, status: string) => { const next = { ...statuses, [topicKey(r)]: status }; setStatuses(next); localStorage.setItem("lumen-statuses", JSON.stringify(next)); fetch("/api/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: String(r[2]), status: status.toLowerCase().replace(" ", "_") }) }).catch(() => {}); };
  const filtered = useMemo(() => planRows.filter((r) => (track === "All tracks" || r[0] === track) && (month === "All months" || String(r[1]) === month) && String(r[2]).toLowerCase().includes(query.toLowerCase())), [track, month, query]);
  const done = planRows.filter((r) => (statuses[topicKey(r)] || r[15]) === "Done").length;
  const skipped = planRows.filter((r) => (statuses[topicKey(r)] || r[15]) === "Skipped").length;
  const hours = planRows.reduce((n, r) => n + Number(r[13] || 0), 0);
  const doneHours = planRows.filter((r) => (statuses[topicKey(r)] || r[15]) === "Done").reduce((n, r) => n + Number(r[13] || 0), 0);
  const monthHours = months.map((m) => ({ month: m, hours: planRows.filter((r) => Number(r[1]) === m).reduce((n, r) => n + Number(r[13] || 0), 0) }));
  const maxMonthHours = Math.max(...monthHours.map((x) => x.hours));
  const peakMonth = monthHours.find((x) => x.hours === maxMonthHours)!;
  // First topic that is neither done nor skipped, in plan order — the real "you are here".
  const focus = useMemo(() => { const r = planRows.find((x) => { const st = statuses[topicKey(x)] || x[15]; return st !== "Done" && st !== "Skipped"; }); return r ? { month: Number(r[1]), track: String(r[0]).replace(/^[A-Z]\. /, "") } : null; }, [statuses]);
  const setView = (name: string) => { setTab(name); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const askLumen = async (prompt = askText) => {
    if (!prompt.trim() || asking) return;
    const context = filtered.slice(0, 8).map((r) => `${r[0]} | ${r[2]} | ${r[3]} | resources: ${r[4]}, ${r[7]}, ${r[10]}`).join("\n");
    setMessages((m) => [...m, { role: "user", content: prompt }]); setAskText(""); setAsking(true);
    const topicIndex = askTopic ?? expanded ?? undefined;
    try { const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, context, topicIndex, history: messages }) }); const data = await res.json(); setMessages((m) => [...m, { role: "assistant", content: data.answer || data.error || "Lumen could not answer right now.", reportUrl: data.reportUrl || undefined }]); } catch { setMessages((m) => [...m, { role: "assistant", content: "Lumen is unavailable. Add MINIMAX_API_KEY in Vercel project settings and try again." }]); } finally { setAsking(false); }
  };

  return <main className={askOpen ? "shell ask-open" : "shell"}>
    <header className="topbar"><a className="brand brand-link" href="/" aria-label="Return to Lumen home"><LogoMark className="brand-mark" /><div><div className="brand-name">Lumen</div><div className="brand-sub">Rasul · {months.length}-month operating view</div></div></a><div className="top-actions"><span className="sync-dot" /> Workbook snapshot · {library.length} books · {repositories.length} repos<button className="ask-trigger" onClick={() => { setAskTopic(null); setAskOpen(true); }}><AskMark size={14} /> Ask Lumen</button><button className="ghost-button" onClick={share} aria-live="polite">{shared ? "✓ Link copied" : "↗ Share"}</button><button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? "☀" : "☾"}</button></div></header>
    <section className="hero"><div><p className="kicker">Preparation command center</p><h1>Build proof, not just knowledge.</h1><p className="hero-copy">Your {hours}-hour Senior FDE plan, reduced to the pace, practice, and proof that matter this week.</p></div><div className="hero-note"><span className="note-pin">●</span><div><strong>Current focus</strong><p>{focus ? `Month ${focus.month} · ${focus.track}` : "Plan complete"}</p></div></div></section>
    <nav className="tabs" aria-label="Workbook views">{TABS.map((item) => <button key={item} className={tab === item ? "tab active" : "tab"} onClick={() => setView(item)}>{item}</button>)}</nav><QuickQuiz />
    {tab === "Assessments" && <Assessments />}
    {tab === "Overview" && <>
      <section className="metric-grid"><Metric label="Plan progress" value={`${pct(done, planRows.length - skipped)}%`} detail={`${done} of ${planRows.length - skipped} non-skipped topics`} tone="rose" /><Metric label="Hours remaining" value={`${Math.max(hours - doneHours, 0)}`} detail={`of ${hours} planned hours`} tone="teal" /><div className="metric brass"><span className="metric-label">Weekly commitment</span><strong><input className="weekly-input" type="number" min={1} max={80} value={weeklyHours} aria-label="Hours you study each week" onChange={(e) => setWeekly(Number(e.target.value))} />h</strong><span className="metric-detail">{(hours / weeklyHours).toFixed(1)} weeks · {(hours / weeklyHours / 4.333).toFixed(1)} months</span></div><Metric label="Mocks" value={`${mockRows.reduce((n, r) => n + Number(r[6] || 0), 0)} / ${mockRows.reduce((n, r) => n + Number(r[1] || 0), 0)}`} detail="completed / target" tone="ink" /></section>
      <section className="content-grid"><div className="panel wide"><div className="panel-head"><div><p className="eyebrow">Pace map</p><h2>Where the hours go</h2></div><span className="panel-meta">{hours}h · {tracks.length} tracks</span></div><div className="bar-chart">{monthHours.map((item) => <div className="bar-item" key={item.month}><div className="bar-value">{item.hours}h</div><div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(12, item.hours / maxMonthHours * 100)}%` }} /></div><div className="bar-label">M{item.month}</div></div>)}</div><div className="chart-foot"><span><i className="legend-dot rose" /> planned hours</span><span>Peak: Month {peakMonth.month} · {peakMonth.hours}h</span></div></div><div className="panel"><div className="panel-head"><div><p className="eyebrow">Next action</p><h2>Start here</h2></div><span className="priority">P1</span></div><div className="next-action"><div className="action-index">01</div><div><h3>{String(planRows[0][2])}</h3><p>{String(planRows[0][3]).length > 118 ? `${String(planRows[0][3]).slice(0, 118)}…` : String(planRows[0][3])}</p><Link href={String(planRows[0][5])}>Open reading</Link></div></div><button className="primary-button" onClick={() => setView("Plan")}>Open the plan <span>→</span></button></div></section>
      <section className="content-grid lower"><div className="panel wide"><div className="panel-head"><div><p className="eyebrow">By track</p><h2>Coverage at a glance</h2></div><button className="text-button" onClick={() => setView("Plan")}>View all →</button></div><div className="track-list">{tracks.map((name) => { const rows = planRows.filter((r) => r[0] === name); const h = rows.reduce((n, r) => n + Number(r[13] || 0), 0); return <button className="track-row" key={name} onClick={() => { setTrack(name); setView("Plan"); }}><span className="track-name">{name}</span><span className="track-count">{rows.length} topics</span><span className="track-progress"><span style={{ width: `${pct(rows.filter((r) => (statuses[topicKey(r)] || r[15]) === "Done").length, rows.length)}%` }} /></span><span className="track-hours">{h}h</span></button>; })}</div></div><div className="panel reality"><p className="eyebrow">Reality check</p><h2>Target calibration</h2><p>“$250K” is a 2–3 year target from Pune, not something this plan promises on its own. The nearer proof point is a strong global-remote India role.</p><button className="text-button" onClick={() => setView("Comp reality")}>Read the assumptions →</button></div></section>
    </>}
    {tab === "Plan" && <section className="panel full-panel"><div className="panel-head plan-head"><div><p className="eyebrow">{planRows.length} topics · three resources each</p><h2>Plan explorer</h2></div><div className="filters"><input aria-label="Search topics" placeholder="Search topics…" value={query} onChange={(e) => setQuery(e.target.value)} /><select value={track} onChange={(e) => setTrack(e.target.value)}><option>All tracks</option>{tracks.map((t) => <option key={t}>{t}</option>)}</select><select value={month} onChange={(e) => setMonth(e.target.value)}><option>All months</option>{months.map((m) => <option key={m}>{m}</option>)}</select></div></div><div className="table-wrap"><table><thead><tr><th>Topic</th><th>Track</th><th>Month</th><th>Hours</th><th>Depth target</th><th>Resources</th><th>Progress</th></tr></thead><tbody>{filtered.map((r) => { const idx = planRows.indexOf(r); const open = expanded === idx; return <Fragment key={`${r[0]}-${r[2]}`}><tr><td><button className="topic-toggle" aria-expanded={open} aria-controls={`syllabus-${idx}`} onClick={() => setExpanded(open ? null : idx)}><strong>{String(r[2])}</strong><span className="chev" aria-hidden="true">{open ? "−" : "+"}</span></button><span className="status">{statuses[topicKey(r)] || r[15] || "Not started"}</span></td><td>{String(r[0]).replace(/^[A-Z]\. /, "")}</td><td>M{String(r[1])}</td><td>{String(r[13])}h</td><td className="depth">{String(r[3])}</td><td className="resource-stack"><Link href={String(r[5])}>Read</Link><Link href={String(r[8])}>Watch</Link><Link href={String(r[11])}>Do</Link></td><td><select className="status-select" aria-label={`Update ${String(r[2])}`} value={statuses[topicKey(r)] || String(r[15] || "Not started")} onChange={(e) => setStatus(r, e.target.value)}><option>Not started</option><option>In progress</option><option>Done</option><option>Skipped</option></select><button className="ask-row" onClick={() => { setAskTopic(idx); setAskOpen(true); setAskText(`Explain ${String(r[2])} with a practical example and a 20-minute exercise.`); }}>Ask</button></td></tr>{open && <tr className="syllabus-row" id={`syllabus-${idx}`}><td colSpan={7}>{renderSyllabus(idx)}</td></tr>}</Fragment>; })}</tbody></table></div></section>}
    {tab === "Curriculum" && <section className="panel full-panel"><div className="panel-head"><div><p className="eyebrow">Deep syllabus</p><h2>Everything to learn, topic by topic</h2></div><span className="panel-meta">{curSummary ? `${Object.keys(curSummary).length} of ${planRows.length} topics detailed · ${Object.values(curSummary).reduce((n, x) => n + x.parts, 0)} parts` : "Loading…"}</span></div><p className="library-note">Each topic opens into what to know first, 12–20 parts with exactly what to learn and one public resource for each, measurable outcomes, the ways it fails in production, interview questions at senior-FDE level, and a proof-of-work artifact. Open a topic below, or expand a whole track.</p>{tracks.map((t) => { const rows = planRows.map((r, idx) => ({ r, idx })).filter(({ r }) => r[0] === t); const allOpen = rows.every(({ idx }) => curOpen.has(idx)); return <div className="cur-track" key={t}><div className="cur-track-head"><h3>{t}</h3><button className="text-button" onClick={() => setCurOpen((s) => { const n = new Set(s); rows.forEach(({ idx }) => allOpen ? n.delete(idx) : n.add(idx)); return n; })}>{allOpen ? "Collapse track" : "Expand track"}</button></div>{rows.map(({ r, idx }) => { const open = curOpen.has(idx); return <article className="cur-topic" key={idx}><button className="topic-toggle" aria-expanded={open} onClick={() => toggleCur(idx)}><strong>{String(r[2])}</strong><span>M{String(r[1])} · {String(r[13])}h{curSummary?.[String(idx)] ? ` · ${curSummary[String(idx)].parts} parts` : ""}</span><span className="chev" aria-hidden="true">{open ? "−" : "+"}</span></button>{open && renderSyllabus(idx)}</article>; })}</div>; })}</section>}
    {tab === "Mocks" && <section className="panel full-panel"><div className="panel-head"><div><p className="eyebrow">Interview proof</p><h2>Mocks & repetitions</h2></div><span className="panel-meta">{mockRows.length} practice loops</span></div><div className="mock-grid">{mockRows.map((r, i) => <div className="mock-row" key={i}><div className="mock-title"><strong>{String(r[0])}</strong><span>M{String(r[3])}</span></div><div className="mock-bar"><span style={{ width: `${pct(Number(r[6] || 0), Number(r[1] || 0))}%` }} /></div><div className="mock-stats"><b>{String(r[6] || 0)} / {String(r[1])}</b><span>{String(r[5])}</span></div></div>)}</div></section>}
    {tab === "Roadmaps" && <section className="panel full-panel"><div className="panel-head"><div><p className="eyebrow">External scaffolding</p><h2>Roadmaps & guides</h2></div></div><div className="resource-grid">{roadmapRows.map((r, i) => <a className="resource-card" href={String(r[1])} target="_blank" rel="noreferrer" key={i}><span className="resource-number">{String(i + 1).padStart(2, "0")}</span><div><h3>{String(r[0])}</h3><p>{String(r[2])}</p></div><span className="arrow">↗</span></a>)}</div></section>}
    {tab === "Library" && <section className="panel full-panel"><div className="panel-head"><div><p className="eyebrow">Private study context</p><h2>{library.length} books and {repositories.length} build references</h2></div><span className="panel-meta">{library.reduce((n, b) => n + b.pages, 0).toLocaleString()} pages indexed</span></div><p className="library-note">Lumen uses the book and repository maps to connect first principles, production systems, agent governance, and build evidence. Source PDFs stay private and repository context is summarized, not cloned.</p><div className="book-list">{library.map((book, i) => <article className="book-row" key={book.id}><div className="book-number">{String(i + 1).padStart(2, "0")}</div><div><h3>{book.title}</h3><p>{book.author} · {book.pages} pages · {book.role}</p><div className="topic-chips">{book.topics.map((topic) => <span key={topic}>{topic}</span>)}</div></div><button className="ask-row" onClick={() => { setAskOpen(true); setAskTopic(null); setAskText(`Build a practical study sequence connecting ${book.title} to my Senior FDE plan.`); }}>Ask Lumen</button></article>)}</div><div className="repo-list">{repositories.map((repo) => <article className="repo-row" key={repo.id}><div><p className="eyebrow">Build reference</p><h3>{repo.name}</h3><p>{repo.summary}</p><div className="topic-chips">{repo.topics.map((topic) => <span key={topic}>{topic}</span>)}</div></div><a className="resource-link" href={repo.url} target="_blank" rel="noreferrer">Open repo ↗</a></article>)}</div></section>}
    {tab === "Comp reality" && <section className="panel full-panel"><div className="panel-head"><div><p className="eyebrow">Context, not promises</p><h2>Compensation reality</h2></div></div><div className="comp-list">{compRows.map((r, i) => <article className="comp-row" key={i}><div><span className="comp-market">{String(r[0])}</span><h3>{String(r[1])}</h3></div><p>{String(r[3])}</p><span className={`prob prob-${i}`}>{String(r[4])}</span></article>)}</div></section>}
    {!askOpen && <button className="ask-fab" onClick={() => { setAskTopic(null); setAskOpen(true); }} aria-label="Open Ask Lumen"><AskMark size={16} /> Ask</button>}
    {askOpen && <aside className="ask-panel" aria-label="Ask Lumen"><div className="ask-head"><div className="ask-title"><AskMark size={20} className="ask-head-mark" /><div><p className="eyebrow">Lumen study guide</p><h2>Ask Lumen</h2></div></div><button className="close-button" onClick={() => setAskOpen(false)}>×</button></div><p className="ask-intro">Ask for a plain-English explanation, a session recap, or the next hands-on step. Lumen sees the filtered plan and the indexed study library.</p><div className="context-status"><span className="sync-dot" /><span>Plan snapshot · {library.length} books · {repositories.length} repos</span></div><div className="suggestions"><button onClick={() => askLumen("Explain the current topic like I am preparing for a senior FDE interview.")}>Explain this</button><button onClick={() => askLumen("Turn the current topic into a 20-minute hands-on exercise.")}>Give me a lab</button><button onClick={() => askLumen("What should I be able to say or build after this session?")}>Check grasp</button></div><div className="messages">{messages.length === 0 && <div className="empty-chat"><AskMark size={22} className="empty-chat-mark" /><strong>Nothing asked yet</strong><span>Pick one of the three prompts above, or ask anything about the topic you have open. Answers use your plan and library, not the open web.</span></div>}{messages.map((m, i) => <div className={`message ${m.role}`} key={i}><span>{m.role === "user" ? "You" : "Lumen"}</span><p>{m.content}</p>{m.reportUrl && <a className="report-link" href={m.reportUrl} target="_blank" rel="noreferrer">Open saved report ↗</a>}</div>)}{asking && <div className="message assistant"><span>Lumen</span><p>Working through the plan context…</p></div>}</div><form className="ask-form" onSubmit={(e) => { e.preventDefault(); askLumen(); }}><input value={askText} onChange={(e) => setAskText(e.target.value)} placeholder="Ask about what you are learning…" /><button aria-label="Send question" disabled={asking || !askText.trim()}>→</button></form><div className="ask-foot">Study guide · private context</div></aside>}
    <footer><span>Built from Rasul&apos;s Senior FDE Plan.xlsx</span><span>{TABS.length} views · one operating system</span></footer>
  </main>;
}
