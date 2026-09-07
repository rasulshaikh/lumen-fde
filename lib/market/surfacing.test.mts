/**
 * Surfacing tests: what the two cron routes actually PUT IN FRONT OF A READER.
 * Run with:  npx tsx lib/market/surfacing.test.mts
 *
 * benchmark.test.mts pins the arithmetic. This file pins the rendering, which is a separate
 * class of bug: `computeBenchmark` can be perfectly right and the email still wrong, because
 * every decision about what reaches the inbox — omit the section, cap at three, print "+N
 * more", send on Monday only, drop a paragraph that invented a number — lives in the route,
 * not in the pure module. None of those decisions has a return value anybody inspects. They
 * are only observable in the bytes handed to Resend.
 *
 * So that is what these tests read. Neither route exports anything but `GET` (see the note in
 * the header of the market-scan section below), so both are driven end to end through `GET`
 * with `globalThis.fetch` replaced by a stub that answers GitHub, MiniMax and the job boards
 * and CAPTURES the Resend payload. The stub throws on any URL it does not recognise, so a
 * test that silently starts talking to the real internet fails instead of passing slowly.
 *
 * `Date` is frozen for the same reason `computeBenchmark` takes `now` as a parameter: the
 * Monday gate reads the wall clock inside the handler, and a test for "Monday only" that
 * passes six days a week is not a test.
 */
import { INDEX_PATH, PROGRESS_DIR, type MarketIndex, type ReqClass, type ReqRecord } from "./store.ts";
import { dedupeKey } from "./classify.ts";
import { BOARD_COUNT, DELTA_MIN_BOARDS, NEW_ROLES_CAP } from "./benchmark.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };

// ---------------------------------------------------------------------------
// Environment. Set before the routes are imported: market-scan reads
// SCAN_DEADLINE_MS at module scope, and everything else is read per request.
// ---------------------------------------------------------------------------

const SECRET = "test-cron-secret";
process.env.CRON_SECRET = SECRET;
process.env.GITHUB_TOKEN = "test-github-token";
process.env.GITHUB_REPO = "test/lumen-fde";
process.env.GITHUB_BRANCH = "main";
process.env.RESEND_API_KEY = "test-resend-key";
process.env.RESEND_FROM_EMAIL = "lumen@example.test";
process.env.DIGEST_TO_EMAIL = "reader@example.test";
delete process.env.MARKET_TO_EMAIL;
delete process.env.MINIMAX_API_KEY;

const { GET: digestGET } = await import("../../app/api/cron/daily-digest/route.ts");
const { GET: scanGET } = await import("../../app/api/cron/market-scan/route.ts");

// ---------------------------------------------------------------------------
// Harness: a frozen clock, a fetch stub, and an email capture.
// ---------------------------------------------------------------------------

const RealDate = Date;
function freeze(when: string) {
  const ms = new RealDate(when).getTime();
  class FrozenDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(ms);
      else super(...(args as [number]));
    }
    static now() { return ms; }
  }
  (globalThis as unknown as { Date: unknown }).Date = FrozenDate;
}
const thaw = () => { (globalThis as unknown as { Date: unknown }).Date = RealDate; };

const realFetch = globalThis.fetch;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** The GitHub contents API shape `readJson` parses: base64 content plus a sha. */
const ghFile = (data: unknown) => json({ content: Buffer.from(JSON.stringify(data)).toString("base64"), sha: "sha-1" });
const ghMissing = () => new Response(null, { status: 404 });
const ghWrote = () => json({ content: { sha: "sha-2" } });

type Email = { from: string; to: string[]; subject: string; text: string; html: string };
type Stub = (url: string, init: RequestInit | undefined) => Promise<Response> | Response;

let emails: Email[] = [];
let seenUrls: string[] = [];
function install(stub: Stub) {
  emails = [];
  seenUrls = [];
  (globalThis as unknown as { fetch: unknown }).fetch = async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String((input as { url?: string })?.url ?? input);
    seenUrls.push(url);
    if (url === "https://api.resend.com/emails") {
      emails.push(JSON.parse(String(init?.body)) as Email);
      return json({ id: "email-1" });
    }
    return stub(url, init);
  };
}

const req = (path: string) => new Request(`http://localhost${path}`, { headers: { authorization: `Bearer ${SECRET}` } });

// ---------------------------------------------------------------------------
// Fixture index for the digest.
// ---------------------------------------------------------------------------

const DAY = "2026-09-14";           // a Monday
const TUESDAY = "2026-09-15";
const YESTERDAY = "2026-09-13";

function record(company: string, title: string, cls: ReqClass, firstSeen: string): ReqRecord {
  return {
    company,
    title,
    key: dedupeKey(company, title),
    location: "Remote",
    url: `https://example.test/${company.toLowerCase()}`,
    class: cls,
    publishedAt: "2026-08-01",
    firstSeen,
    lastSeen: DAY,
    missingSince: null,
    skills: cls === "core" ? ["agents"] : [],
  };
}

const okBoard = { ok: true, total: 100, matched: 4, bytes: 1000, fetchedAt: `${DAY}T03:00:00.000Z`, error: null };

/**
 * `reqs` keyed so `Object.keys().sort()` is the order the route renders in: "brd::new1"
 * sorts before "brd::old1", and new1..new5 sort in that sequence. The cap test depends on
 * knowing WHICH three survive, not just how many.
 *
 * `old1` exists in every fixture and is deliberately not new: without at least one core req
 * whose firstSeen predates today, `baseline` flips true and the section is suppressed for a
 * reason that has nothing to do with what is being tested.
 */
function index(newOnes: [string, string, ReqClass][]): MarketIndex {
  const reqs: Record<string, ReqRecord> = {
    "brd::old1": record("Established", "Forward Deployed Engineer", "core", "2026-08-20"),
    "brd::old2": record("Established", "Solutions Engineer", "adjacent", "2026-08-20"),
  };
  newOnes.forEach(([company, title, cls], i) => {
    reqs[`brd::new${i + 1}`] = record(company, title, cls, DAY);
  });
  return {
    version: 1,
    updatedAt: `${DAY}T03:00:00.000Z`,
    cursor: 0,
    // >= DELTA_MIN_BOARDS, so nothing below is suppressed as a partial scan.
    boardsOk: BOARD_COUNT,
    boards: { brd: okBoard },
    reqs,
  };
}

/** One recorded study event, exactly the three fields POST /api/progress writes per file. */
type Event = { topic: string; status: string; date: string };

/**
 * The study history as GitHub serves it: a directory listing, then one markdown file per event.
 * Both hops are stubbed because `readProgress` makes both, and a stub that answered only the
 * listing would fail the whole read and be indistinguishable from the outage case below.
 *
 * "unreadable" is a 500 on the listing — GitHub down, which is NOT an empty history. `[]` is the
 * empty history, and the two must produce different behaviour: the first falls back to the
 * workbook baseline, the second is a truthful "nothing is done yet".
 *
 * Returns null for a URL that is not the progress history, so the caller can go on matching.
 */
function progressStub(progress: Event[] | "unreadable") {
  // readProgress sorts filenames descending and treats that as newest-first, so the stamp in
  // the name has to be the event's own date or "the newest event wins" cannot be tested.
  const files = progress === "unreadable" ? [] : progress.map((e, i) => `${e.date}-${i}.md`);
  return (url: string): Response | null => {
    if (!url.includes(PROGRESS_DIR)) return null;
    if (progress === "unreadable") return json({ message: "Server Error" }, 500);
    const i = files.findIndex((name) => url.includes(name));
    if (i === -1) return json(files.map((name) => ({ name, path: `${PROGRESS_DIR}/${name}` })));
    const e = progress[i];
    return json({ content: Buffer.from(`Topic: ${e.topic}\nStatus: ${e.status}\nDate: ${e.date}\n`).toString("base64") });
  };
}

/** Drive the digest against one stored index and one study history, and return the email. */
async function digest(stored: MarketIndex | "unreadable", progress: Event[] | "unreadable" = []) {
  const study = progressStub(progress);
  install((url) => {
    const recorded = study(url);
    if (recorded) return recorded;
    if (url.startsWith("https://api.github.com/") && url.includes(INDEX_PATH)) {
      return stored === "unreadable" ? json({ message: "Server Error" }, 500) : ghFile(stored);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  const response = await digestGET(req("/api/cron/daily-digest"));
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body, email: emails[0] };
}

// ---------------------------------------------------------------------------
console.log("\n  digest — the market section is omitted, not emptied");
// ---------------------------------------------------------------------------

freeze(`${DAY}T06:00:00Z`);

const quiet = await digest(index([]));
ck("a morning with no new core roles still sends the brief", quiet.status === 200 && quiet.body.ok === true && Boolean(quiet.email));
ck("the plain-text section header is absent entirely", !quiet.email.text.includes("NEW CORE REQS"));
ck("...and so is the HTML block", !quiet.email.html.includes("New core reqs"));
ck("...leaving no empty scaffold behind", !quiet.email.text.includes("+0 more") && !/NEW CORE REQS\s*[-—]\s*0/.test(quiet.email.text));
ck("the study brief is untouched by the omission", quiet.email.text.includes("SHIP THIS") && quiet.email.text.includes("PACE"));
ck("the response reports zero rather than omitting the field", quiet.body.newCoreReqs === 0);

// A req that is new but has already closed inside its decay window is not news either.
const closed = index([["Ghost", "Forward Deployed Engineer", "core"]]);
closed.reqs["brd::new1"].missingSince = DAY;
const ghosted = await digest(closed);
ck("a role that appeared and closed the same day is not surfaced", !ghosted.email.text.includes("NEW CORE REQS") && ghosted.body.newCoreReqs === 0);

// The whole point of NO_MARKET: GitHub failing costs three lines, never the email.
const blind = await digest("unreadable");
ck("an unreadable market index omits the section instead of failing the email",
  blind.status === 200 && blind.body.ok === true && !blind.email.text.includes("NEW CORE REQS"));
ck("...and the study brief still ships", blind.email.text.includes("SHIP THIS"));

// ---------------------------------------------------------------------------
console.log("\n  digest — at most three, then \"+N more\" with the right N");
// ---------------------------------------------------------------------------

const five: [string, string, ReqClass][] = [
  ["Alpha", "Forward Deployed Engineer", "core"],
  ["Bravo", "Deployed Solutions Engineer", "core"],
  ["Charlie", "Customer Engineer", "core"],
  ["Delta", "Applied AI Architect", "core"],
  ["Echo", "Field Engineer", "core"],
];
const many = await digest(index(five));
const marketBlock = many.email.text.split("NEW CORE REQS")[1]?.split("ANSWER THIS COLD")[0] ?? "";

ck("the cap constant the route renders against is three", NEW_ROLES_CAP === 3);
ck("the header carries the true total, not the printed count", many.email.text.includes("NEW CORE REQS — 5"));
ck("exactly three roles are printed", ["Alpha", "Bravo", "Charlie"].every((c) => marketBlock.includes(c)));
ck("...and the rest are not", !marketBlock.includes("Delta") && !marketBlock.includes("Echo"));
ck("the overflow is 5 - 3, not 5 and not 3", marketBlock.includes("+2 more"),
  `("${marketBlock.trim().split("\n").pop()}")`);
ck("the HTML block agrees with the text", many.email.html.includes("New core reqs — 5") && many.email.html.includes("+2 more"));
ck("the HTML prints three links, not five",
  (many.email.html.match(/https:\/\/example\.test\/(alpha|bravo|charlie|delta|echo)/g) ?? []).length === 3,
  `(${(many.email.html.match(/https:\/\/example\.test\/(alpha|bravo|charlie|delta|echo)/g) ?? []).length})`);
ck("the response's count is the total, so a truncated list is still auditable", many.body.newCoreReqs === 5);

// Exactly at the cap: the "+N more" line must not appear at all.
const exact = await digest(index(five.slice(0, 3)));
ck("exactly three prints no overflow line", exact.email.text.includes("NEW CORE REQS — 3") && !exact.email.text.includes("more"),
  "");
ck("...and none in the HTML either", !exact.email.html.includes("+0 more") && !exact.email.html.includes("more</span>"));

// One clone group is one line, and the overflow must not count the clones it collapsed.
const clones = await digest(index([
  ["LangChain", "Deployed Engineer (San Francisco)", "core"],
  ["LangChain", "Deployed Engineer (London)", "core"],
  ["LangChain", "Deployed Engineer (Singapore)", "core"],
  ["LangChain", "Deployed Engineer (Berlin)", "core"],
]));
ck("four city clones are one line and zero overflow",
  clones.body.newCoreReqs === 1 && clones.email.text.includes("NEW CORE REQS — 1") && !clones.email.text.includes("more"));

// ---------------------------------------------------------------------------
console.log("\n  digest — core only; adjacent and leadership never surface");
// ---------------------------------------------------------------------------

const mixed = await digest(index([
  ["Coreco", "Forward Deployed Engineer", "core"],
  ["Adjco", "Solutions Engineer", "adjacent"],
  ["Adjco", "Technical Account Manager", "adjacent"],
  ["Leadco", "Director, Forward Deployed Engineering", "leadership"],
]));
ck("the one core role is surfaced", mixed.email.text.includes("Coreco") && mixed.body.newCoreReqs === 1);
ck("a new adjacent role never reaches the reader", !mixed.email.text.includes("Adjco") && !mixed.email.html.includes("Adjco"));
ck("nor does a new leadership role", !mixed.email.text.includes("Leadco") && !mixed.email.html.includes("Leadco"));
ck("adjacent roles cannot inflate the header count", mixed.email.text.includes("NEW CORE REQS — 1"));

// Three new adjacent roles and no new core role must render as no section at all — the
// failure would be a section headed "NEW CORE REQS" listing pre-sales requisitions.
const adjacentOnly = await digest(index([
  ["Adjco", "Solutions Engineer", "adjacent"],
  ["Adjco", "Services Architect", "adjacent"],
  ["Leadco", "Head of Customer Engineering", "leadership"],
]));
ck("a day of only adjacent and leadership news renders no market section",
  !adjacentOnly.email.text.includes("NEW CORE REQS") && adjacentOnly.body.newCoreReqs === 0);

// ---------------------------------------------------------------------------
console.log("\n  digest — today's topic comes from recorded progress, not the baseline");
// ---------------------------------------------------------------------------

/**
 * The bug this section exists to keep closed. `status()` read workbook column 15, which is the
 * committed baseline: 117 "Not started", 2 "Skipped", nothing else ever written to it. No row
 * could therefore become done, so `next` was plan row 0 every morning for the life of the plan
 * and only the recall question rotated — within that one topic, for twenty-three months.
 *
 * These assertions read `body.topic`, which is the same string the route puts in the subject
 * line, and the plain text, so a fix that changed the selection without changing what shipped
 * would still fail here.
 */
const ROW0 = "Shell mastery and scripting";
const ROW1 = "Linux internals: processes, systemd, permissions, filesystems, packaging";
const ROW2 = "Networking: TCP/IP, DNS, TLS, HTTP/2, load balancers, firewalls";
const asked = (email: Email) => email.text.split("ANSWER THIS COLD (before you open anything)\n")[1]?.split("\n")[0] ?? "";

const fresh = await digest(index([]), []);
ck("an empty history still yields plan row 0 — the baseline reading is unchanged", fresh.body.topic === ROW0, `("${String(fresh.body.topic)}")`);
ck("...in the subject line and the body alike", fresh.email.subject === `Lumen · ${ROW0}` && fresh.email.text.startsWith(`TODAY — ${ROW0}`));
ck("...and the pace counts nothing done", fresh.email.text.includes("0 of 117 topics done · 0h of 1588h"));
ck("...while the recall question is one of row 0's", asked(fresh.email).length > 0);

const advanced = await digest(index([]), [{ topic: ROW0, status: "done", date: "2026-09-10" }]);
ck("a progress event marking row 0 done moves the digest off row 0", advanced.body.topic !== ROW0, `("${String(advanced.body.topic)}")`);
ck("...onto the next incomplete row", advanced.body.topic === ROW1 && advanced.email.text.startsWith(`TODAY — ${ROW1}`));
ck("...and the recall question follows the topic instead of rotating inside the old one", asked(advanced.email) !== asked(fresh.email) && asked(advanced.email).length > 0);
ck("...and the pace credits the finished row's hours", advanced.email.text.includes("1 of 117 topics done · 14h of 1588h"));

// The three other spellings a human or an MCP client types, and the underscored one the
// dashboard POST writes. If this file and lib/market/insight.ts ever disagree about what counts
// as complete, the tab and the email name different topics on the same morning.
const spelled = await digest(index([]), [{ topic: ROW0, status: "Completed", date: "2026-09-10" }]);
ck("\"Completed\" counts as done, as it does for readiness", spelled.body.topic === ROW1);
const underway = await digest(index([]), [{ topic: ROW0, status: "in_progress", date: "2026-09-10" }]);
ck("\"in_progress\" is not evidence and does not advance the plan", underway.body.topic === ROW0);

// Newest event wins: a row reopened after being marked done is not done. The events are served
// newest-first, so this pins that the FIRST one for a topic is the one read, not the last.
const reopened = await digest(index([]), [
  { topic: ROW0, status: "in_progress", date: "2026-09-11" },
  { topic: ROW0, status: "done", date: "2026-09-10" },
]);
ck("a row reopened after a done event is current again", reopened.body.topic === ROW0);

// "Skipped" is a decision not to acquire the skill, so the row is passed over rather than
// queued — the same rule the baseline's own two skipped rows have always had.
const skipped = await digest(index([]), [
  { topic: ROW1, status: "skipped", date: "2026-09-11" },
  { topic: ROW0, status: "done", date: "2026-09-10" },
]);
ck("a skipped row is stepped over, not offered", skipped.body.topic === ROW2);

// A GitHub outage must cost freshness, never the email: the digest degrades to exactly the
// topic the baseline alone would have picked.
const outage = await digest(index([]), "unreadable");
ck("an unreadable progress store still sends", outage.status === 200 && outage.body.ok === true && Boolean(outage.email));
ck("...falling back to the workbook baseline rather than to nothing", outage.body.topic === ROW0 && outage.email.text.startsWith(`TODAY — ${ROW0}`));
ck("...with the whole brief intact", outage.email.text.includes("SHIP THIS") && outage.email.text.includes("PACE") && outage.email.text.includes("READ · "));

// Both stores down at once is the compound case: neither failure may reach the reader.
const blackout = await digest("unreadable", "unreadable");
ck("both GitHub reads failing still sends the brief", blackout.status === 200 && blackout.body.ok === true
  && blackout.body.topic === ROW0 && !blackout.email.text.includes("NEW CORE REQS"));

// ---------------------------------------------------------------------------
console.log("\n  digest — a dead or short scan says so, above the study content");
// ---------------------------------------------------------------------------

/**
 * The gap in docs/platform/runbook.md section 1: nothing in the system says the 03:00 scan has
 * stopped. index.json stops being updated, every surface keeps rendering last week's numbers as
 * current, and a week of dead scans is indistinguishable from a week of quiet market.
 *
 * The digest is the detector — it runs thirty minutes after the scan and already reads the file.
 * These assertions are about the two lines it prints and, just as much, about the mornings it
 * prints neither: an alert that renders on a healthy day is one the reader stops seeing.
 *
 * The clock is 06:00 on DAY throughout, and the healthy fixture's updatedAt is 03:00 the same
 * morning, so "fresh" here is three hours old — what a working pipeline actually looks like.
 */
freeze(`${DAY}T06:00:00Z`);

/** Everything the reader sees before the study content begins. */
const preamble = (email: Email) => email.text.split("WHAT IT ASKS OF YOU")[0];

const healthy = await digest(index([]));
ck("a scan that ran this morning raises no stale line",
  !healthy.email.text.includes("SCAN STALE") && !healthy.email.html.includes("Scan stale"));
ck("...and no partial line either", !healthy.email.text.includes("PARTIAL SCAN") && !healthy.email.html.includes("Partial scan"));
ck("...leaving nothing between the header and the brief — no empty scaffold on a healthy morning",
  /^TODAY — .+\nMonth [^\n]+\n\s*$/.test(preamble(healthy.email)), `("${preamble(healthy.email).trim()}")`);

// 26h is the threshold — one cycle plus slack — so a single missed run must stay silent.
const lateByADay = index([]);
lateByADay.updatedAt = `${YESTERDAY}T05:30:00.000Z`; // 24.5h old: last night's scan failed once
const late = await digest(lateByADay);
ck("one missed night is inside the slack and does not cry wolf", !late.email.text.includes("SCAN STALE"));

// 30 hours: the scan last succeeded at 00:00 on the 13th and it is now 06:00 on the 14th.
const stale = index([]);
stale.updatedAt = `${YESTERDAY}T00:00:00.000Z`;
const dead = await digest(stale);
const staleLine = dead.email.text.split("\n").find((l) => l.startsWith("SCAN STALE")) ?? "";
ck("a scan silent for 30 hours is reported", staleLine.length > 0, `("${staleLine}")`);
ck("...with the age stated in hours", staleLine.includes("30 hours ago"), `("${staleLine}")`);
ck("...and the last day it succeeded", staleLine.includes(`on ${YESTERDAY}`));
ck("...above the study content, not under it",
  dead.email.text.indexOf("SCAN STALE") < dead.email.text.indexOf("WHAT IT ASKS OF YOU"));
ck("...in the HTML too, before the first study row",
  dead.email.html.includes("Scan stale") && dead.email.html.indexOf("Scan stale") < dead.email.html.indexOf("What it asks of you"));
ck("...while the brief itself still ships whole",
  dead.status === 200 && dead.body.ok === true && dead.email.text.includes("SHIP THIS") && dead.email.text.includes("PACE"));
ck("...and a stale scan alone does not claim a partial one", !dead.email.text.includes("PARTIAL SCAN"));

// Days once hours stop being readable: a week of silence is the case the runbook describes.
const week = index([]);
week.updatedAt = "2026-09-07T03:00:00.000Z";
const abandoned = await digest(week);
ck("a week of silence is stated in days, not in hours",
  abandoned.email.text.includes("7 days ago") && abandoned.email.text.includes("on 2026-09-07"));

// A stored index nobody ever wrote a timestamp into must not ship arithmetic on NaN.
const undated = index([]);
undated.updatedAt = "";
const nodate = await digest(undated);
ck("an index with no timestamp reports no successful run, never \"NaN hours\"",
  nodate.email.text.includes("no successful run on record") && !nodate.email.text.includes("NaN"));

// ---------------------------------------------------------------------------

/**
 * The partial-scan line answers a question the reader would otherwise answer wrongly. Below
 * DELTA_MIN_BOARDS the benchmark suppresses movement AND the new-core-reqs section, so the email
 * goes quiet — and a quiet email reads as a quiet market rather than as a short scan.
 */
const short = index([]);
short.boardsOk = 20;
const partial = await digest(short);
const partialLine = partial.email.text.split("\n").find((l) => l.startsWith("PARTIAL SCAN")) ?? "";
ck("a scan that reached 20 boards says so", partialLine.length > 0, `("${partialLine}")`);
ck("...naming the real count and the real threshold",
  partialLine.includes(`20 of ${BOARD_COUNT} boards`) && partialLine.includes(`under the ${DELTA_MIN_BOARDS} needed`));
ck("...and saying why the numbers stopped moving, so silence is not read as a quiet market",
  partialLine.includes("not because the market went quiet"));
ck("...without claiming the scan is also stale", !partial.email.text.includes("SCAN STALE"));
ck("...and the brief still ships", partial.status === 200 && partial.email.text.includes("SHIP THIS"));

// One board above the line is the boundary DELTA_MIN_BOARDS actually draws.
const nearly = index([]);
nearly.boardsOk = DELTA_MIN_BOARDS;
ck("boardsOk exactly at the threshold is not partial", !(await digest(nearly)).email.text.includes("PARTIAL SCAN"));
const enough = index([]);
enough.boardsOk = 27;
ck("a full 27-board scan raises nothing", !(await digest(enough)).email.text.includes("PARTIAL SCAN"));

// Both at once: a scan that has been failing partially for days must report both facts.
const both = index([]);
both.boardsOk = 20;
both.updatedAt = `${YESTERDAY}T00:00:00.000Z`;
const bothAlerts = await digest(both);
ck("a stale AND partial scan prints both lines",
  bothAlerts.email.text.includes("SCAN STALE") && bothAlerts.email.text.includes("PARTIAL SCAN"));
ck("...stale first, because it is the one that invalidates the numbers",
  bothAlerts.email.text.indexOf("SCAN STALE") < bothAlerts.email.text.indexOf("PARTIAL SCAN"));

// The alert may never cost the email. An unreadable store is not evidence the scan is broken —
// GitHub may be down and the scan fine — so it buys silence, not a false alarm.
const unread = await digest("unreadable");
ck("an unreadable store still sends the digest",
  unread.status === 200 && unread.body.ok === true && Boolean(unread.email) && unread.email.text.includes("SHIP THIS"));
ck("...and raises neither alert, having nothing truthful to say about a file it could not read",
  !unread.email.text.includes("SCAN STALE") && !unread.email.text.includes("PARTIAL SCAN")
  && !unread.email.html.includes("Scan stale") && !unread.email.html.includes("Partial scan"));

// ---------------------------------------------------------------------------
console.log("\n  market scan — the weekly email is Monday-only");
// ---------------------------------------------------------------------------

/**
 * NOTE — what this section cannot reach.
 *
 * market-scan/route.ts exports only `GET`. `weeklyFraming`, `sendWeekly` and the
 * `now.getUTCDay() === 1` gate are all module-private, and the gate reads a `new Date()`
 * constructed inside the handler, so there is no seam to pass a day through. Every
 * assertion below therefore drives the whole handler and observes the two things that do
 * escape it: the JSON summary, and the bytes handed to Resend.
 *
 * The boards are all made to fail. That is the cheapest complete cycle: the cursor still
 * wraps, so `complete` is true and the route runs the writes, the Monday gate and the email
 * — and `boardsOk: 0` is also exactly the suppression state the last section needs.
 */
function scanStub(minimax?: string): Stub {
  return (url, init) => {
    if (url.startsWith("https://api.github.com/")) {
      if (init?.method === "PUT") return ghWrote();
      return ghMissing(); // cold start: index, benchmark and trend all absent
    }
    if (url === "https://api.minimax.io/v1/chat/completions") {
      if (minimax === undefined) throw new Error("model called with no key set");
      return json({ choices: [{ message: { content: minimax } }] });
    }
    // Every job board: a 502 is a recorded failure, never a throw.
    return json({ message: "Bad Gateway" }, 502);
  };
}

async function scan(minimax?: string) {
  // The key gates weeklyFraming before anything else, so it has to follow the fixture:
  // set here, the model paragraph is exercised; absent, the route never calls the model.
  if (minimax === undefined) delete process.env.MINIMAX_API_KEY;
  else process.env.MINIMAX_API_KEY = "test-minimax-key";
  install(scanStub(minimax));
  const response = await scanGET(req("/api/cron/market-scan"));
  const body = (await response.json()) as Record<string, unknown>;
  delete process.env.MINIMAX_API_KEY;
  return { status: response.status, body, email: emails[0], emailCount: emails.length, modelCalled: seenUrls.includes("https://api.minimax.io/v1/chat/completions") };
}

freeze(`${DAY}T04:00:00Z`);
const monday = await scan();
ck("Monday completes a cycle and sends", monday.status === 200 && monday.body.ok === true && monday.body.partial === false);
ck("...exactly one email", monday.emailCount === 1 && monday.body.emailed === true);
ck("...and it is the benchmark email", monday.email.subject.startsWith("Lumen market ·") && monday.email.text.startsWith("MARKET BENCHMARK"));

freeze(`${TUESDAY}T04:00:00Z`);
const tuesday = await scan();
ck("Tuesday runs the same scan", tuesday.status === 200 && tuesday.body.ok === true && tuesday.body.partial === false);
ck("...and sends nothing at all", tuesday.emailCount === 0 && !seenUrls.includes("https://api.resend.com/emails"));
ck("...and does not even report an email outcome", !("emailed" in tuesday.body) && !("emailError" in tuesday.body));

freeze(`${YESTERDAY}T23:59:59Z`); // Sunday
const sunday = await scan();
ck("Sunday is not Monday either", sunday.emailCount === 0 && !("emailed" in sunday.body));

// ---------------------------------------------------------------------------
console.log("\n  market scan — a paragraph that invents a number is dropped");
// ---------------------------------------------------------------------------

freeze(`${DAY}T04:00:00Z`);

const CLEAN_PARAGRAPH = "Spend this week on evaluation harnesses and defer the deployment tooling; the market is asking for measurement before it asks for plumbing.";
const clean = await scan(CLEAN_PARAGRAPH);
// Asserted first: without it every check below passes for the wrong reason when the model
// is never called at all, which is exactly how this section failed on its first run.
ck("the model is actually consulted", clean.modelCalled);
ck("a digit-free paragraph is kept", clean.body.emailFraming === true && clean.email.text.includes("Spend this week on evaluation harnesses"));
ck("...and rendered in the HTML too", clean.email.html.includes("What to do this week"));

// The prompt forbids every digit, so there is no allow-set to be absent from.
const INVENTED = "Coverage sits at 99% this week, so prioritise evaluation harnesses over deployment tooling.";
const invented = await scan(INVENTED);
ck("a paragraph carrying a number is dropped", invented.modelCalled && invented.body.emailFraming === false);
ck("...and none of it reaches the reader", !invented.email.text.includes("Coverage sits at") && !invented.email.html.includes("Coverage sits at"));
ck("...while the deterministic benchmark still sends", invented.emailCount === 1 && invented.email.text.startsWith("MARKET BENCHMARK"));
ck("...and the email carries no 'What to do this week' block", !invented.email.html.includes("What to do this week"));

const HUGE = "Roughly 1234567 requisitions point the same way, so defer the deployment tooling.";
ck("an obviously fabricated figure is dropped", (await scan(HUGE)).body.emailFraming === false);

// Even a number the route itself supplied is dropped. The prompt says "Write no numbers at
// all", the numbers are already printed above the paragraph, and any allow-set built from text
// the model can read is one the model can quote from — which is exactly how 58 and 60 leaked.
const SUPPLIED = `Hold the line on evaluation work across all ${BOARD_COUNT} boards before touching deployment tooling.`;
const echoed = await scan(SUPPLIED);
ck("even a number the route supplied is dropped", echoed.body.emailFraming === false && !echoed.email.text.includes(`all ${BOARD_COUNT} boards`));
ck("...and the deterministic benchmark still sends without it", echoed.emailCount === 1 && echoed.email.text.startsWith("MARKET BENCHMARK"));

// A decimal is a distinct token: "27.5" must not be waved through because "27" was supplied.
const DECIMAL = `Coverage moved to ${BOARD_COUNT}.5 points, so defer the deployment tooling.`;
const decimal = await scan(DECIMAL);
ck("a decimal that is not verbatim in the prompt is still an invention", decimal.body.emailFraming === false);

// A model reply that is entirely reasoning cleans to "" and must not ship an empty block.
const onlyThinking = await scan("<think>The user wants advice about the market this week.");
ck("an unterminated <think> block leaves no framing", onlyThinking.body.emailFraming === false
  && !onlyThinking.email.text.includes("<think>") && !onlyThinking.email.html.includes("&lt;think&gt;"));
ck("...and no empty framing block is rendered", !onlyThinking.email.html.includes("What to do this week"));

// ---------------------------------------------------------------------------
console.log("\n  market scan — the two number leaks that were found and closed");
// ---------------------------------------------------------------------------

/**
 * Both of these shipped a fabricated percentage past the post-check, and both had the same
 * cause: the allow-set was built from text the model could read, so the model could quote from
 * it. Deriving it from the whole prompt whitelisted 60 forever ("In 60 words or fewer");
 * deriving it from the facts still whitelisted 58, because the coverage block cites `row 58,
 * "..." - 18h, month 4` and a row number reads as a percentage once a % follows it.
 *
 * The fix is an empty allow-set — the prompt forbids every digit, so the check enforces that.
 * These two assertions are the regression guard; they were characterizations of the bug and
 * are now characterizations of the fix.
 */
const rowNumber = await scan("Coverage sits at 58% this week, so prioritise evaluation harnesses.");
ck("a plan row number cannot launder itself into a percentage",
  rowNumber.body.emailFraming === false && !rowNumber.email.text.includes("58%"),
  "(58 is plan row 58 in the coverage block)");

const promptWords = await scan("About 60% of the work is evaluation, so defer the deployment tooling.");
ck("the instruction's own \"60 words\" does not whitelist \"60%\"",
  promptWords.body.emailFraming === false);
// Deliberately not asserting "60%" is absent from the email body: the deterministic benchmark
// may legitimately print a real 60% coverage figure, and the claim here is about the model's
// paragraph being dropped, not about the digits the audited block is entitled to show.
ck("...and the dropped paragraph's wording is absent",
  !promptWords.email.text.includes("About 60% of the work") && !promptWords.email.html.includes("What to do this week"));

// ---------------------------------------------------------------------------
console.log("\n  market scan — a suppressed movement says so, never a number");
// ---------------------------------------------------------------------------

const suppressed = monday.email;
const movementBlock = suppressed.text.split("MOVEMENT\n")[1]?.split("\n\n")[0] ?? "";
ck("the movement section is present", suppressed.text.includes("MOVEMENT"), `("${movementBlock}")`);
ck("it states the partial scan in words", /^partial scan, \d+ of \d+ boards, deltas suppressed$/.test(movementBlock.trim()),
  `("${movementBlock.trim()}")`);
ck("it names the real board count, not a fabricated one", movementBlock.includes(`of ${BOARD_COUNT} boards`));
ck("no skill delta is printed alongside it", !/\d+% to \d+%/.test(movementBlock) && !movementBlock.includes("MOVED THIS WEEK"));
ck("...and no movement claim appears anywhere in the email", !suppressed.text.includes("MOVED THIS WEEK") && !suppressed.html.includes("MOVED THIS WEEK"));
// Weaker than it looks: this fixture is also a cold start, so the section would be empty
// either way. It is here to pin that the weekly email omits the block rather than printing
// an empty heading, which is the one thing the two paths share.
ck("the weekly email omits an empty new-core-reqs block", !suppressed.text.includes("NEW CORE REQS") && !suppressed.html.includes("New core reqs"));
ck("the scan reports the suppression honestly", monday.body.boardsOk === 0 && monday.body.newRoles === 0);

// ---------------------------------------------------------------------------
thaw();
(globalThis as unknown as { fetch: unknown }).fetch = realFetch;
console.log(fails ? `\n${fails} FAILURES` : "\nall assertions passed");
process.exit(fails ? 1 : 0);
