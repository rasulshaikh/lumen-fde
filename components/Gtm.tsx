"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/AppState";
import {
  GTM_CHECK_KEY,
  GTM_DRAFT_KEY,
  GTM_MODULES,
  GTM_STATUS_KEY,
  GTM_STATUSES,
  gtmPageContext,
  moduleById,
  parseGtmChecks,
  parseGtmDrafts,
  parseGtmStatuses,
  type GtmOutlineModule,
  type GtmReadyModule,
  type GtmStatus,
} from "@/lib/gtm/path";

/**
 * /gtm — the revenue-system path.
 *
 * Completion stays in localStorage, the same way a path aim or a weekly target does, and it is
 * deliberately not posted to /api/progress. That route appends a plan-topic event in the repo.
 * These modules are not plan rows, and a topic string that is not in the workbook is how that
 * store grows a file nothing else can match.
 */
export function GtmView({ initialModule }: { initialModule: string }) {
  const router = useRouter();
  const { setPageContext, setAskOpen, setAskText, setAskTopic } = useAppState();
  const [selected, setSelected] = useState(initialModule);
  const [statuses, setStatuses] = useState<Record<string, GtmStatus>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, boolean[]>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setSelected(initialModule); }, [initialModule]);

  // Read after mount. localStorage during render is a server/client mismatch, and writing the
  // empty initial state back would wipe a mark the moment the page opened.
  useEffect(() => {
    try {
      setStatuses(parseGtmStatuses(localStorage.getItem(GTM_STATUS_KEY)));
      setDrafts(parseGtmDrafts(localStorage.getItem(GTM_DRAFT_KEY)));
      setChecks(parseGtmChecks(localStorage.getItem(GTM_CHECK_KEY)));
    } catch { /* private mode: the page still renders, nothing is remembered */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(GTM_STATUS_KEY, JSON.stringify(statuses));
      localStorage.setItem(GTM_DRAFT_KEY, JSON.stringify(drafts));
      localStorage.setItem(GTM_CHECK_KEY, JSON.stringify(checks));
    } catch { /* private mode */ }
  }, [hydrated, statuses, drafts, checks]);

  const module = moduleById(selected) ?? GTM_MODULES[0];
  const draft = drafts[module.id] ?? "";
  const ticks = checks[module.id];

  useEffect(() => {
    setPageContext(gtmPageContext({
      moduleId: module.id,
      statuses,
      draft,
      checks: ticks,
      marksKnown: hydrated,
    }), null);
    return () => setPageContext("", null);
  }, [module.id, statuses, draft, ticks, hydrated, setPageContext]);

  const pick = (id: string) => {
    setSelected(id);
    router.replace(`/gtm?m=${id}`, { scroll: false });
  };

  const ask = () => {
    setAskTopic(null);
    if (module.kind === "ready") {
      const written = draft.trim();
      setAskText(written
        ? `Score my answer to the review question on "${module.title}" against the three acceptance checks on this page. Keep the next exercise free.\n\n${written}`
        : `Ask me the review question for "${module.title}" and score what I say against the acceptance checks on this page. Keep the next exercise free.`);
    } else {
      setAskText(`I am looking at the outline for "${module.title}", which follows "${module.follows}". What has to be true in the revenue map before this contract is worth writing?`);
    }
    setAskOpen(true);
  };

  const done = GTM_MODULES.filter((item) => statuses[item.id] === "Done").length;

  return <section className="panel gtm">
    <div className="panel-head">
      <div>
        <p className="eyebrow">GTM / RevOps</p>
        <h2>Revenue system path</h2>
      </div>
      <span className="panel-meta">{GTM_MODULES.length} modules · {done} marked done on this device</span>
    </div>
    <p className="gtm-lead">A path beside the FDE plan, not a row inside it. The first module is the work. The second is the outline of what that work turns into. Marks stay in this browser and are not written to plan progress.</p>
    <nav className="gtm-picker" aria-label="GTM modules">
      {GTM_MODULES.map((item) => (
        <button key={item.id} type="button" className={item.id === module.id ? "gtm-pick is-here" : "gtm-pick"} aria-current={item.id === module.id ? "page" : undefined} onClick={() => pick(item.id)}>
          <strong>{item.title}</strong>
          <span>{item.kind === "ready" ? "Module" : "Outline"} · {statuses[item.id] ?? "Not started"}</span>
        </button>
      ))}
    </nav>
    {module.kind === "ready"
      ? <ReadyModule module={module} status={statuses[module.id] ?? "Not started"} hydrated={hydrated} draft={draft} ticks={ticks ?? module.acceptance.map(() => false)} onStatus={(status) => setStatuses((current) => ({ ...current, [module.id]: status }))} onDraft={(value) => setDrafts((current) => ({ ...current, [module.id]: value }))} onTick={(index) => setChecks((current) => {
          const next = [...(current[module.id] ?? module.acceptance.map(() => false))];
          next[index] = !next[index];
          return { ...current, [module.id]: next };
        })} onAsk={ask} />
      : <OutlineModule module={module} onAsk={ask} />}
  </section>;
}

function ReadyModule({ module, status, hydrated, draft, ticks, onStatus, onDraft, onTick, onAsk }: {
  module: GtmReadyModule;
  status: GtmStatus;
  hydrated: boolean;
  draft: string;
  ticks: boolean[];
  onStatus: (status: GtmStatus) => void;
  onDraft: (value: string) => void;
  onTick: (index: number) => void;
  onAsk: () => void;
}) {
  return <>
    <div className="gtm-status">
      <label htmlFor="gtm-status">Your mark</label>
      <select id="gtm-status" className="status-select" aria-label={`Status for ${module.title}`} value={status} disabled={!hydrated} onChange={(event) => { const next = GTM_STATUSES.find((item) => item === event.target.value); if (next) onStatus(next); }}>
        {GTM_STATUSES.map((item) => <option key={item}>{item}</option>)}
      </select>
      <span>Saved on this device. It does not change the FDE plan.</span>
    </div>
    <p className="gtm-promise">{module.promise} The practice company is {module.company}.</p>
    <h3 className="gtm-h">Vocabulary</h3>
    <dl className="gtm-terms">
      {module.terms.map((term) => <div key={term.term}><dt>{term.term}</dt><dd>{term.meaning}</dd></div>)}
    </dl>
    <h3 className="gtm-h">Lifecycle and deal stage</h3>
    <p className="gtm-note">A contact moves along the first line. A deal, when one exists, moves along the second. They are not the same list.</p>
    <ol className="gtm-flow" aria-label="Lifecycle stages">
      {module.lifecycle.map((stage) => <li key={stage}>{stage}</li>)}
    </ol>
    <ol className="gtm-flow gtm-flow-deal" aria-label="Deal stages">
      {module.dealStages.map((stage) => <li key={stage}>{stage}</li>)}
    </ol>
    <h3 className="gtm-h">Handoffs</h3>
    <ul className="gtm-list">
      {module.handoffs.map((handoff) => <li key={handoff}>{handoff}</li>)}
    </ul>
    <h3 className="gtm-h">Artifacts</h3>
    <ul className="gtm-artifacts">
      {module.artifacts.map((artifact) => <li key={artifact.file}><code>{artifact.file}</code><span>{artifact.holds}</span></li>)}
    </ul>
    <h3 className="gtm-h">Metrics, with denominators</h3>
    <div className="table-wrap">
      <table className="gtm-metrics">
        <thead><tr><th>Metric</th><th>Numerator</th><th>Denominator</th><th>Window</th></tr></thead>
        <tbody>
          {module.metrics.map((metric) => <tr key={metric.name}><td>{metric.name}</td><td>{metric.numerator}</td><td>{metric.denominator}</td><td>{metric.window}</td></tr>)}
        </tbody>
      </table>
    </div>
    <p className="gtm-example">{module.example}</p>
    <div className="gtm-review">
      <p className="eyebrow">Review question</p>
      <p className="gtm-question">{module.reviewQuestion}</p>
      <label htmlFor="gtm-answer">Your answer</label>
      <textarea id="gtm-answer" value={draft} disabled={!hydrated} onChange={(event) => onDraft(event.target.value)} rows={6} placeholder="Measure first. Name the counts, the denominators, and the window." />
      <ul className="gtm-checks">
        {module.acceptance.map((check, index) => <li key={check}>
          <label>
            <input type="checkbox" checked={ticks[index] === true} disabled={!hydrated} onChange={() => onTick(index)} />
            <span>{check}</span>
          </label>
        </li>)}
      </ul>
      <p className="gtm-note">Ticking a check records that you think your answer covers it. It is not a grade.</p>
      <button type="button" className="primary-button" onClick={onAsk}>Ask Quaere to score this</button>
    </div>
  </>;
}

function OutlineModule({ module, onAsk }: { module: GtmOutlineModule; onAsk: () => void }) {
  return <div className="gtm-outline">
    <p className="gtm-promise">Outline only. It follows {module.follows}. Nothing here is a schema, a property list, or a connection to HubSpot.</p>
    <ol className="gtm-list gtm-steps">
      {module.steps.map((step) => <li key={step}>{step}</li>)}
    </ol>
    <button type="button" className="primary-button" onClick={onAsk}>Ask Quaere what this needs from the map</button>
  </div>;
}
