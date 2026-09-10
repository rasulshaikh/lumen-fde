"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { INCIDENTS, probeById, fixById, resolvingFix, type Incident as IncidentDef } from "@/lib/incidents";

/**
 * Run the incident.
 *
 * The whole of the feedback is whether the service came back. There is no score, no rating of the
 * path you took, and no "you used 3 of 5 optimal commands" - `lib/incidents/types.ts` carries the
 * reasoning, which is the same reasoning `TestRunner` used to refuse automatic marking.
 *
 * A wrong fix is not rejected. It runs, and the sim reports what it actually did: rolling back
 * serves the old version the customer already told you they tried; deleting a pod to make room
 * takes the customer from a stale version to no version at all. The consequence is the teaching.
 *
 * ## Two things this deliberately does not do
 *
 * It does not gate the fixes behind the probes. You can guess from the first screen, and guessing
 * will sometimes work - six fixes, one right. That is a real weakness, and the alternative is
 * grading your reasoning, which needs a judgement nothing here can make honestly.
 *
 * It does not hide the machine. If you are stuck, the system underneath is one click away, still
 * steppable, still breakable. Being stuck is not a failure state to be punished with silence.
 */

const decisiveRun = (incident: IncidentDef, ran: string[]) =>
  incident.probes.filter((p) => p.decisive && ran.includes(p.id));

export function IncidentView({ incident }: { incident: IncidentDef }) {
  const [ran, setRan] = useState<string[]>([]);
  const [tried, setTried] = useState<string[]>([]);
  const [resolved, setResolved] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);

  const run = useCallback((id: string) => {
    setRan((current) => (current.includes(id) ? current : [...current, id]));
  }, []);

  const apply = useCallback((id: string) => {
    const fix = fixById(incident, id);
    if (!fix) return;
    setTried((current) => (current.includes(id) ? current : [...current, id]));
    if (fix.resolves) setResolved(true);
  }, [incident]);

  const over = resolved || gaveUp;
  const right = resolvingFix(incident);
  const seen = decisiveRun(incident, ran);

  return (
    <section className="panel inc">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Incident · {incident.probes.length} commands · {incident.fixes.length} things you could do</p>
          <h2>{incident.title}</h2>
        </div>
      </div>

      <blockquote className="inc-ticket">{incident.ticket}</blockquote>

      <div className="inc-cols">
        <div className="inc-col">
          <p className="label">Run something</p>
          <div className="inc-cmds">
            {incident.probes.map((p) => {
              const done = ran.includes(p.id);
              return (
                <button key={p.id} type="button" className={`inc-cmd${done ? " is-run" : ""}`} onClick={() => run(p.id)} disabled={done}>
                  <code>{p.cmd}</code>
                  <span>{p.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="inc-col">
          <p className="label">Terminal</p>
          {ran.length === 0
            ? <p className="inc-quiet">Nothing run yet. The ticket is a claim, not a diagnosis.</p>
            : (
              <div className="inc-term">
                {ran.map((id) => {
                  const p = probeById(incident, id);
                  if (!p) return null;
                  return (
                    <div key={id} className="inc-out">
                      <p className="inc-prompt">$ {p.cmd}</p>
                      <pre>{p.output}</pre>
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      </div>

      {!over ? (
        <div className="inc-fixes">
          <p className="label">Do something about it</p>
          <p className="inc-note">
            Nothing is marked right or wrong. Whatever you pick runs, and you are told what it
            actually did to the system.
          </p>
          {incident.fixes.map((f) => {
            const done = tried.includes(f.id);
            return (
              <div key={f.id}>
                <button type="button" className={`inc-fix${done ? " is-tried" : ""}`} onClick={() => apply(f.id)} disabled={done}>
                  <span className="inc-fix-label">{f.label}</span>
                  <code>{f.cmd}</code>
                </button>
                {done ? <p className="inc-effect">{f.effect}</p> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {resolved ? (
        <div className="inc-done">
          <p className="inc-back">The service is back.</p>
          <p className="inc-effect">{right?.effect}</p>
          <p className="label">What was actually wrong</p>
          <p className="inc-cause">{incident.cause}</p>
          {/* Reported, not scored. Which evidence was on your screen is a fact worth knowing; how
              efficiently you got there is a judgement this sim has no business making. */}
          <p className="inc-seen">
            {seen.length === 0
              ? "You fixed it without running any of the commands that carry the evidence. That works here. It does not work on a system you have not seen before."
              : `The evidence was on your screen in ${seen.map((p) => p.cmd).join(" / ")}.`}
          </p>
        </div>
      ) : null}

      {gaveUp && !resolved ? (
        <div className="inc-done">
          <p className="label">What was actually wrong</p>
          <p className="inc-cause">{incident.cause}</p>
          <p className="inc-effect">The fix was: {right?.label}. {right?.effect}</p>
        </div>
      ) : null}

      <div className="inc-actions">
        {incident.machineId ? <Link className="text-button" href={`/machines?m=${incident.machineId}`}>Stuck? Step through the system underneath</Link> : null}
        {!over ? <button type="button" className="text-button" onClick={() => setGaveUp(true)}>Tell me what it was</button> : null}
        {over ? <button type="button" className="text-button" onClick={() => { setRan([]); setTried([]); setResolved(false); setGaveUp(false); }}>Run it again from the top</button> : null}
      </div>
    </section>
  );
}

export function Incidents() {
  const [id, setId] = useState(INCIDENTS[0].id);
  const incident = INCIDENTS.find((i) => i.id === id) ?? INCIDENTS[0];
  return (
    <>
      <nav className="inc-picker" aria-label="Incidents">
        {INCIDENTS.map((i) => (
          <button key={i.id} type="button" className={`inc-pick${i.id === incident.id ? " is-here" : ""}`}
            aria-current={i.id === incident.id ? "page" : undefined} onClick={() => setId(i.id)}>
            {i.title}
          </button>
        ))}
      </nav>
      {/* Keyed, so switching incidents starts a clean one rather than carrying the last one's
          terminal and attempted fixes into it. */}
      <IncidentView key={incident.id} incident={incident} />
    </>
  );
}
