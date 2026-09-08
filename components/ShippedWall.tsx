import type { StoredArtifact } from "@/lib/artifacts";

/**
 * The wall of shipped deliverables.
 *
 * It is empty today and it will be empty for weeks, so the empty state is the primary state and
 * it is designed first. What it must NOT do is apologise: "no artifacts yet" is a sentence that
 * teaches nothing and reads as a scolding on a plan whose first deliverable is legitimately
 * months of reading away. So the empty state carries the three things a full wall would carry —
 * how many deliverables the plan holds, which one is next, and exactly how one gets recorded —
 * which makes the panel worth opening before a single row is done.
 *
 * Four states, and the caller must be able to tell them apart, for the reason lib/artifacts.ts
 * states at its head: `synced: false` means "we do not know", never "nothing has been built".
 * Rendering an unknown list as an empty one reports a missing token as an empty portfolio.
 */
export type ArtifactsFeed = {
  loading: boolean;
  artifacts: StoredArtifact[];
  /** Files in reports/artifacts that did not parse. Surfaced, never swallowed. */
  unreadable: number;
  synced: boolean;
  error: string | null;
};

/** Newest few. The panel is a homepage block, not the archive; the rest are counted. */
const SHOWN = 6;

export function ShippedWall({ feed, planCount, nextRow, nextIndex, openPlan }: {
  feed: ArtifactsFeed;
  /** Plan rows, from the workbook. Derived — no number describing the plan is ever typed. */
  planCount: number;
  nextRow: (string | number | null)[] | null;
  nextIndex: number;
  openPlan: () => void;
}) {
  const { loading, artifacts, unreadable, synced, error } = feed;
  // Distinct rows, not artifacts: two write-ups for one row is one row evidenced.
  const rows = new Set(artifacts.map((a) => a.row)).size;
  const deliverable = nextRow ? String(nextRow[14] ?? "").trim() : "";

  return <div className="panel wide home-panel">
    <div className="panel-head">
      <div><p className="eyebrow">The wall</p><h2>What you have shipped</h2></div>
      <span className="panel-meta">{artifacts.length ? `${rows} of ${planCount} rows evidenced` : `${planCount} deliverables in the plan`}</span>
    </div>

    {loading
      ? <p className="home-sub">Reading reports/artifacts…</p>
      : !synced
        ? <div className="home-block">
            <p className="home-line">This list is unknown, not empty.</p>
            <p className="home-sub">{error
              ? `GitHub did not answer: ${error}. Nothing has been lost — the artifacts live in the repo, and this panel will read them again on the next load.`
              : "Artifact sync is not configured, so the repo cannot be read from here. Recorded work still exists; this panel simply cannot see it."}</p>
          </div>
        : artifacts.length === 0
          ? <div className="home-block">
              {/* The teaching empty state. Every clause here is a fact about the store, because
                  the point is that the first artifact is recordable in the next five minutes,
                  not that its absence is forgivable. */}
              <p className="home-line">{planCount} deliverables exist in the plan. None are recorded.</p>
              <p className="home-sub">Every plan row names one thing to ship, and this is the only place that says it exists. Nothing here is inferred from progress: a row marked done is study, an artifact is a URL somebody else can open.</p>
              <ol className="home-steps">
                <li>
                  <strong>Build the one you are on.</strong>
                  {nextRow
                    ? <span>Row {nextIndex + 1} · {String(nextRow[2])}{deliverable ? ` — ships “${deliverable}”.` : "."}</span>
                    : <span>Every topic is done or skipped.</span>}
                </li>
                <li><strong>Put it somewhere with a URL.</strong><span>A repo, a write-up or a demo. The URL is what makes it evidence rather than a claim.</span></li>
                <li><strong>Record it.</strong><span>POST <code className="home-code">/api/artifacts</code> with <code className="home-code">{"{ row, title, url }"}</code>, or ask Quaere to record it for you.</span></li>
              </ol>
              <p className="home-note">The plan row is the join key and it is checked against the workbook, so a row that does not exist cannot be written. There is no edit and no delete: an artifact records that something happened on a date.</p>
              <button className="text-button" onClick={openPlan}>Open the plan →</button>
            </div>
          : <>
              <ol className="wall-list">
                {artifacts.slice(0, SHOWN).map((a) => <li className="wall-row" key={a.path}>
                  <span className="wall-num">R{String(a.row).padStart(3, "0")}</span>
                  <span className="wall-main">
                    <a className="resource-link" href={a.url} target="_blank" rel="noreferrer">{a.title}<span>↗</span></a>
                    <span className="wall-topic">{a.topic}</span>
                  </span>
                  <span className="wall-date">{a.date.slice(0, 10)}</span>
                </li>)}
              </ol>
              {artifacts.length > SHOWN && <p className="home-note">{artifacts.length - SHOWN} more recorded, newest shown first.</p>}
            </>}

    {/* Unreadable files are work that exists and is not being counted. The count is the only
        way anyone finds out, so it renders in every state that has one. */}
    {unreadable > 0 && <p className="home-note home-warn">{unreadable} file{unreadable === 1 ? "" : "s"} in reports/artifacts could not be read, so {unreadable === 1 ? "it is" : "they are"} not counted above.</p>}
  </div>;
}
