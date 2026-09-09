import { useEffect, useState } from "react";
import type { ExternalBrief } from "@/lib/external/brief";
import { STALE_AFTER_DAYS, briefAgeDays } from "@/lib/external/brief";

/**
 * What is happening outside this repository, on the page rather than only inside an answer.
 *
 * The brief shipped with no on-screen presence at all: it was fetched, committed, and injected
 * into Quaere's prompt, and the only way to find out whether any of that had happened was to ask
 * Quaere a question and judge the answer. That is the one shape of feature this project keeps
 * ruling out — a state nobody can check.
 *
 * The cost of that was immediate and concrete. For a day the only evidence about whether the
 * feature worked was an absent `reports/external/` directory, which is consistent with half a
 * dozen different causes; it was read as "the key is missing from Vercel" and that turned out to
 * be wrong — the first signed-in visit wrote a brief and the whole path worked. A panel naming
 * its own state would have settled it in a glance instead of an inference.
 *
 * **This component IS the refresh trigger.** The GET it makes on mount is the same call that
 * refreshes a stale brief, so the thing that causes the fetch is the thing that displays its
 * result — replacing a fire-and-forget call in Overview whose response was thrown away. One
 * request, one place to read what happened.
 *
 * Every absence is named. "Not configured", "could not be read", "nothing written yet" and "stale"
 * are four different situations with four different fixes, and collapsing them into an empty panel
 * would hide the only one the reader can act on.
 */

/** Kept short on purpose: this is a rail panel beside the plan, not a news feed. */
const SHOWN = 3;

type Response = {
  ok: boolean;
  brief: ExternalBrief | null;
  known?: boolean;
  refreshed?: boolean;
  note?: string | null;
  error?: string | null;
};

type State = { status: "loading" } | { status: "done"; data: Response } | { status: "failed"; code: number | null };

export function OutsidePanel() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let live = true;
    // A 503 is a real, readable answer here — "SurfSense is not configured" — so the body is read
    // on a non-ok response too, rather than collapsed into a generic failure.
    fetch("/api/external-brief")
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!live) return;
        if (data) setState({ status: "done", data: data as Response });
        else setState({ status: "failed", code: r.status });
      })
      .catch(() => { if (live) setState({ status: "failed", code: null }); });
    return () => { live = false; };
  }, []);

  return <div className="panel outside-panel">
    <p className="eyebrow">From outside</p>
    <h2>The world beyond the plan</h2>
    <OutsideBody state={state} />
    <p className="outside-foot">Context, never a correction. Nothing here overrides a number measured in your own repo.</p>
  </div>;
}

/**
 * The body, split out and pure.
 *
 * Same reason `Openings` is exported: every state worth checking here — configured-and-fetched,
 * not configured, store unreadable, nothing written yet, stale, partial — exists only after an
 * effect resolves, so a prerender shows the spinner and nothing else. As a function of its props
 * each state can be rendered and asserted directly, and the four different absences can be checked
 * to be four different sentences rather than one shrug.
 */
export function OutsideBody({ state }: { state: State }) {
  {
    if (state.status === "loading") return <p className="outside-quiet">Checking what is happening outside…</p>;
    if (state.status === "failed") return <p className="outside-quiet">The brief could not be reached{state.code ? ` (${state.code})` : ""}. This is unknown, not empty.</p>;

    const { brief, known, error } = state.data;
    // `known === false` is the store being unreadable. Distinct from "no brief has been written".
    if (known === false) return <p className="outside-quiet">{error || "The brief store could not be read, so this is unknown rather than empty."}</p>;
    if (!brief || !brief.items.length) {
      return <>
        <p className="outside-quiet">No brief has been written yet.</p>
        {error && <p className="outside-why">{error}</p>}
      </>;
    }

    const age = briefAgeDays(brief.day, new Date());
    const stale = age !== null && age > STALE_AFTER_DAYS;
    return <>
      <p className="outside-when">
        Fetched {brief.day}{age !== null ? age === 0 ? " · today" : ` · ${age} day${age === 1 ? "" : "s"} old` : ""}
        {stale ? <span className="outside-stale">stale</span> : null}
      </p>
      <ul className="outside-list">
        {brief.items.slice(0, SHOWN).map((item) => <li key={item.url}>
          <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
          <span>{new URL(item.url).hostname.replace(/^www\./, "")}</span>
        </li>)}
      </ul>
      {/* The brief records a partial fetch and, until this panel existed, told nobody. */}
      {brief.note && <p className="outside-why">Partial fetch — {brief.note}</p>}
    </>;
  }
}
