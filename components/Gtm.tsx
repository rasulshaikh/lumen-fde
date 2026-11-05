"use client";

import { useWorkspace } from "./WorkspaceState";
import { useEffect, useRef, useState } from "react";
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
  const cloud = useWorkspace();
  const cloudRevisions = useRef<Record<string, string>>({});
  const localModules = useRef<Record<string, { status: GtmStatus; draft: string; checks: boolean[] }>>({});
  const cloudBases = useRef<Record<string, { revision: string; payload: string }>>({});
  const [moduleConflicts, setModuleConflicts] = useState<Record<string, boolean>>({});
  const [saveRequested, setSaveRequested] = useState(false);
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
      const storedStatuses = parseGtmStatuses(localStorage.getItem(GTM_STATUS_KEY));
      const storedDrafts = parseGtmDrafts(localStorage.getItem(GTM_DRAFT_KEY));
      const storedChecks = parseGtmChecks(localStorage.getItem(GTM_CHECK_KEY));
      setStatuses(storedStatuses); setDrafts(storedDrafts); setChecks(storedChecks);
      for (const module of GTM_MODULES) localModules.current[module.id] = { status: storedStatuses[module.id] ?? "Not started", draft: storedDrafts[module.id] ?? "", checks: storedChecks[module.id] ?? (module.kind === "ready" ? module.acceptance.map(() => false) : []) };
      const bases = JSON.parse(localStorage.getItem("lumen-gtm-cloud-bases") || "{}");
      if (bases && typeof bases === "object" && !Array.isArray(bases)) cloudBases.current = bases;
    } catch { /* private mode: the page still renders, nothing is remembered */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    for (const module of GTM_MODULES) localModules.current[module.id] = { status: statuses[module.id] ?? "Not started", draft: drafts[module.id] ?? "", checks: checks[module.id] ?? (module.kind === "ready" ? module.acceptance.map(() => false) : []) };
    try {
      localStorage.setItem(GTM_STATUS_KEY, JSON.stringify(statuses));
      localStorage.setItem(GTM_DRAFT_KEY, JSON.stringify(drafts));
      localStorage.setItem(GTM_CHECK_KEY, JSON.stringify(checks));
      localStorage.setItem("lumen-gtm-cloud-bases", JSON.stringify(cloudBases.current));
    } catch { /* private mode */ }
  }, [hydrated, statuses, drafts, checks]);

  useEffect(() => {
    if (!hydrated) return;
    for (const module of GTM_MODULES) {
      const entry = cloud.entries[`gtm.${module.id}`];
      const value = entry?.value as { status: GtmStatus; draft: string; checks: boolean[] } | undefined;
      if (!value || cloudRevisions.current[module.id] === entry.revision) continue;
      cloudRevisions.current[module.id] = entry.revision;
      const local = localModules.current[module.id];
      const localPayload = JSON.stringify(local), remotePayload = JSON.stringify(value);
      const base = cloudBases.current[module.id];
      const dirty = base ? localPayload !== base.payload : !!local && (local.draft.trim() !== "" || local.status !== "Not started" || local.checks.some(Boolean));
      if (dirty && localPayload !== remotePayload) {
        setModuleConflicts((current) => ({ ...current, [module.id]: base?.revision !== entry.revision }));
        continue;
      }
      cloudBases.current[module.id] = { revision: entry.revision, payload: remotePayload };
      try { localStorage.setItem("lumen-gtm-cloud-bases", JSON.stringify(cloudBases.current)); } catch {}
      setStatuses((current) => ({ ...current, [module.id]: value.status }));
      setDrafts((current) => ({ ...current, [module.id]: value.draft }));
      setChecks((current) => ({ ...current, [module.id]: value.checks }));
      setModuleConflicts((current) => ({ ...current, [module.id]: false }));
    }
  }, [cloud.entries, hydrated]);

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
        ? `Score my answer to the review question on "${module.title}" against the acceptance checks on this page. Keep the next exercise free.\n\n${written}`
        : `Ask me the review question for "${module.title}" and score what I say against the acceptance checks on this page. Keep the next exercise free.`);
    } else {
      setAskText(`I am looking at the outline for "${module.title}", which follows "${module.follows}". What has to be true in the revenue map before this contract is worth writing?`);
    }
    setAskOpen(true);
  };

  const modulePayload = JSON.stringify({ status: statuses[module.id] ?? "Not started", draft, checks: ticks ?? (module.kind === "ready" ? module.acceptance.map(() => false) : []) });
  const dirty = cloudBases.current[module.id]?.payload !== modulePayload;
  const loadSavedModule = () => {
    const entry = cloud.entries[`gtm.${module.id}`];
    if (!entry) return;
    const value = entry.value as { status: GtmStatus; draft: string; checks: boolean[] };
    cloudBases.current[module.id] = { revision: entry.revision, payload: JSON.stringify(value) };
    setStatuses((current) => ({ ...current, [module.id]: value.status }));
    setDrafts((current) => ({ ...current, [module.id]: value.draft }));
    setChecks((current) => ({ ...current, [module.id]: value.checks }));
    setModuleConflicts((current) => ({ ...current, [module.id]: false }));
  };
  const done = GTM_MODULES.filter((item) => statuses[item.id] === "Done").length;

  return <section className="panel gtm">
    <div className="panel-head">
      <div>
        <p className="eyebrow">GTM / RevOps</p>
        <h2>Revenue system path</h2>
      </div>
      <span className="panel-meta">{GTM_MODULES.length} modules · {done} marked done</span>
    </div>
    <p className="gtm-lead">Two practical modules alongside the FDE plan. Drafts are kept on this device as you work. Save a module to sync its answer, checks and status across your signed-in devices.</p>
    <nav className="gtm-picker" aria-label="GTM modules">
      {GTM_MODULES.map((item) => (
        <button key={item.id} type="button" className={item.id === module.id ? "gtm-pick is-here" : "gtm-pick"} aria-current={item.id === module.id ? "page" : undefined} onClick={() => pick(item.id)}>
          <strong>{item.title}</strong>
          <span>{item.kind === "ready" ? "Module" : "Outline"} · {statuses[item.id] ?? "Not started"}</span>
        </button>
      ))}
    </nav>
    {moduleConflicts[module.id] && <p className="plan-sync" role="status">This device has an unsaved draft and a different cloud version. Your draft is retained. <button className="text-button" onClick={loadSavedModule}>Load saved module</button> Saving this draft replaces the cloud version.</p>}
    <div className="gtm-cloud-save"><button className="ghost-button" disabled={cloud.status !== "ready" || draft.length > 16000} onClick={() => { cloud.update(`gtm.${module.id}`, { status: statuses[module.id] ?? "Not started", draft, checks: ticks ?? (module.kind === "ready" ? module.acceptance.map(() => false) : []) }); setSaveRequested(true); }}>{moduleConflicts[module.id] ? "Replace saved module with this draft" : "Save module across devices"}</button><span role="status">{cloud.status === "saving" && saveRequested ? "Saving module…" : cloud.status === "ready" && !dirty ? "Module synced across devices." : cloud.status === "loading" ? "Connecting workspace sync…" : "Local draft retained until you save."}</span></div>
    {module.kind === "ready"
      ? <ReadyModule module={module} status={statuses[module.id] ?? "Not started"} hydrated={hydrated && cloud.status === "ready"} draft={draft} ticks={ticks ?? module.acceptance.map(() => false)} onStatus={(status) => setStatuses((current) => ({ ...current, [module.id]: status }))} onDraft={(value) => setDrafts((current) => ({ ...current, [module.id]: value }))} onTick={(index) => setChecks((current) => {
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
      <span>Draft on this device. Use Save module to sync it; FDE plan progress is separate.</span>
    </div>
    <p className="gtm-promise">{module.promise} The practice company is {module.company}.</p>
    {module.contract && <section className="gtm-contract" aria-label="Practice CRM contract"><h3 className="gtm-h">Object contract</h3><p className="gtm-note">Exercise fields to map to CRM properties before any live integration.</p>{module.contract.map((object) => <article key={object.object}><h4>{object.object} · key <code>{object.key}</code></h4><p>{object.writer}</p><p><code>{object.properties.join(", ")}</code></p><p>{object.rule}</p></article>)}</section>}
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
      <textarea id="gtm-answer" maxLength={16000} value={draft} disabled={!hydrated} onChange={(event) => onDraft(event.target.value)} rows={6} placeholder="Measure first. Name the counts, the denominators, and the window." />
      <ul className="gtm-checks">
        {module.acceptance.map((check, index) => <li key={check}>
          <label>
            <input type="checkbox" checked={ticks[index] === true} disabled={!hydrated} onChange={() => onTick(index)} />
            <span>{check}</span>
          </label>
        </li>)}
      </ul>
      <p className="gtm-note">Ticking a check records that you think your answer covers it. It is not a grade.</p>
      <button type="button" className="primary-button" onClick={onAsk}>Ask Lumen to score this</button>
    </div>
  </>;
}

function OutlineModule({ module, onAsk }: { module: GtmOutlineModule; onAsk: () => void }) {
  return <div className="gtm-outline">
    <p className="gtm-promise">Outline only. It follows {module.follows}. Nothing here is a schema, a property list, or a connection to HubSpot.</p>
    <ol className="gtm-list gtm-steps">
      {module.steps.map((step) => <li key={step}>{step}</li>)}
    </ol>
    <button type="button" className="primary-button" onClick={onAsk}>Ask Lumen what this needs from the map</button>
  </div>;
}
