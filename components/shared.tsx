import workbook from "@/data/workbook.json";

export type Row = (string | number | null)[];
export const planRows = workbook.Plan.slice(1) as Row[];
// The workbook sheets end with a "Total" summary row and a one-cell instruction
// note. Both are presentation, not data: rendering them produced "Mnull"/"Mundefined"
// rows, and counting the Total row doubled the mock target (57 became 114).
const isDataRow = (r: Row, width: number) => r.length >= width && String(r[0]).trim().toLowerCase() !== "total";
export const mockRows = (workbook.Mocks.slice(1) as Row[]).filter((r) => isDataRow(r, 9));
export const roadmapRows = (workbook.Roadmaps.slice(1) as Row[]).filter((r) => isDataRow(r, 3));
export const compRows = (workbook.CompReality.slice(1) as Row[]).filter((r) => isDataRow(r, 5));
export const tracks = Array.from(new Set(planRows.map((r) => String(r[0]))));
export const months = Array.from(new Set(planRows.map((r) => Number(r[1])))).sort((a, b) => a - b);
// The Mocks sheet carries its own Month column (index 3), and scripts/renumber-months.py only
// ever rewrites wb["Plan"] — so re-baselining Hours moved the plan out to M23 and left this
// sheet quoting the pre-rebaseline calendar: "Take-home builds" rendered M9 while the plan row
// that funds it sits at M19. No column ties a mock row to a plan row, so there is nothing to
// renumber it from. The sheet's own footnote says these hours are already inside the mocks
// track's plan hours, so the window is read off that track and the sheet's copy is not rendered
// at all — derived, it cannot drift away from the calendar again.
const mocksTrack = tracks.find((t) => t.toLowerCase().includes("mock"));
const mockMonths = mocksTrack ? planRows.filter((r) => r[0] === mocksTrack).map((r) => Number(r[1])) : [];
export const mockWindow = mockMonths.length ? `M${Math.min(...mockMonths)}–M${Math.max(...mockMonths)}` : "";
export const pct = (done: number, total: number) => total ? Math.round((done / total) * 100) : 0;
export const topicKey = (r: Row) => `${String(r[0])}::${String(r[2])}`;

/**
 * A CompReality verdict, read off the prose rather than off the row's position.
 *
 * Both places that colour these six facts now read this. The Comp reality tab used to emit
 * `prob-${i}` against CSS that only defined `.prob-0` through `.prob-3`, so rows 5 and 6 had no
 * colour at all and the other four were right only because the sheet happened to be ordered
 * Low, Very low, Realistic, High — reorder the sheet and Overview would still call "High in 3-6
 * months" green while the tab called it red. The verdict is the fact; its row number is not.
 */
export const verdictTier = (verdict: string) => {
  const v = verdict.toLowerCase();
  if (v.startsWith("high")) return { rank: 0, label: "High", tone: "go" };
  if (v.startsWith("realistic")) return { rank: 1, label: "Realistic", tone: "go" };
  if (v.startsWith("moderate")) return { rank: 2, label: "Moderate", tone: "hold" };
  if (v.startsWith("very low")) return { rank: 4, label: "Very low", tone: "stop" };
  if (v.startsWith("low")) return { rank: 3, label: "Low", tone: "stop" };
  return { rank: 5, label: "Long game", tone: "stop" };
};

export function Link({ href, children }: { href: string; children: React.ReactNode }) { if (!href.startsWith("http")) return <span className="resource-link no-link" title="No resource assigned">{children}</span>; return <a className="resource-link" href={href} target="_blank" rel="noreferrer">{children}<span>↗</span></a>; }

export type Subtopic = { name: string; learn: string; minutes: number; resource: { label: string; url: string } };
export type Syllabus = { i: number; topic: string; hours: number; why: string; prerequisites: string[]; subtopics: Subtopic[]; outcomes: string[]; failureModes: string[]; interviewQuestions: string[]; proofOfWork: string };
