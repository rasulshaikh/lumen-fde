/**
 * Market benchmark tests. Run with:  npx tsx lib/market/benchmark.test.mts
 *
 * The class of bug this file exists to catch is the one that never announces itself: a
 * classification false positive, or a missed dedupe, produces a headline percentage that is
 * *plausible*. Nothing throws, nothing 500s, the tab renders, the email sends - and "62% of core
 * FDE reqs ask for evals" is quietly a statement about fifteen LangChain city clones of one
 * requisition, or about a Field Marketing Manager that matched "Field", or about Perplexity's
 * core research MTS req that matched "Applied AI" (a string that is genuinely CORE at Mistral and
 * Anthropic, which is why no global pattern list can exist). A wrong number here survives for
 * months because it looks exactly like a right one.
 *
 * So the fixtures below are not "some postings". Every row is a title that was audited against a
 * real JD body and written into data/market-sources.json with a `why`, and each assertion pins
 * one guard that config bought. If a guard regresses, the arithmetic downstream stays perfectly
 * self-consistent and perfectly wrong.
 *
 * Re-run this after touching classify.ts's PLACES/LEADERSHIP/JUNIOR vocabularies, skills.ts's
 * boilerplate thresholds, or the core/adjacent/exclude lists in market-sources.json.
 */
import { readFileSync } from "node:fs";
import { classify, normalizeTitle, dedupeKey, type Source } from "./classify.ts";
import { htmlToText, stripBoilerplate, matchSkills } from "./skills.ts";
import { computeBenchmark, BOARD_COUNT, DELTA_MIN_BOARDS, MOVE_MIN_POINTS, type SkillMap, type Workbook } from "./benchmark.ts";
// skills.ts and benchmark.ts each declare their own view of data/market-skill-map.json and they
// disagree on optionality (`exclude` is required in one, optional in the other), so the single
// parsed file is typed as the intersection rather than cast at each call site.
import type { SkillMap as MatcherSkillMap } from "./skills.ts";
import type { Posting } from "./fetch.ts";
import type { MarketIndex, ReqRecord, TrendPoint } from "./store.ts";

let fails = 0;
const ck = (n: string, c: boolean, x = "") => { if (!c) { fails++; console.log(`  FAIL ${n} ${x}`); } else console.log(`  ok   ${n} ${x}`); };

const root = new URL("../../", import.meta.url);
const load = (p: string) => JSON.parse(readFileSync(new URL(p, root), "utf8"));

const sourcesFile = load("data/market-sources.json") as { boards: (Source & { company: string; token: string; enabled: boolean; boilerplate?: string[] })[] };
const skillMap = load("data/market-skill-map.json") as SkillMap & MatcherSkillMap;
const workbook = load("data/workbook.json") as Workbook;

const byCompany = new Map(sourcesFile.boards.map((b) => [b.company, b]));
const sourceFor = (company: string) => {
  const s = byCompany.get(company);
  if (!s) throw new Error(`fixture names a company absent from market-sources.json: ${company}`);
  return s;
};

// ---------------------------------------------------------------------------
// Fixtures: 44 synthetic postings (including Samsara's 3 region clones and Cohere's 2
// city clones) plus LangChain's 15-clone block, 59 in all. Titles are verbatim shapes
// from the audit - including the leading tab Databricks ships and the trailing spaces
// Sierra and Anyscale ship. `expect` is the audited verdict, not the current output.
// ---------------------------------------------------------------------------

type Expect = "core" | "adjacent" | "leadership" | "junior" | null;
type Fixture = { company: string; title: string; dept?: string; team?: string; expect: Expect; skills?: string[]; firstSeen?: string; why: string };

const AGENTS = ["agents"];
const EVALS = ["agents", "evals"];
const RAG = ["agents", "rag"];

const FIXTURES: Fixture[] = [
  // --- OpenAI: "Solutions Engineer" is the internal IT ladder here and real field engineering at Scale/Glean.
  { company: "OpenAI", title: "Forward Deployed Engineer, Healthcare", expect: "core", skills: EVALS, why: "literal FDE, non-location suffix must survive normalization" },
  { company: "OpenAI", title: "Forward Deployed Engineer, New Grad", expect: "junior", why: "OpenAI excludes Intern but not New Grad; the JUNIOR backstop catches it" },
  { company: "OpenAI", title: "Director, Forward Deployed Engineering", expect: "leadership", why: "matches core but is people leadership; counted, never in the denominator" },
  { company: "OpenAI", title: "Solutions Engineer, Corporate IT", expect: null, why: "OpenAI's exclude[] - internal IT, not field engineering" },
  { company: "OpenAI", title: "Technical Account Manager, EMEA", expect: "adjacent", why: "IC delivery role ending in Manager; not demoted to leadership" },
  { company: "OpenAI", title: "Technical Accounting & Reporting Senior Manager", expect: null, why: "must NOT match the adjacent pattern 'Technical Account' by bare substring" },

  // --- Databricks: bare "Solutions Architect" returns 321 postings, so core is the literal-FDE family only.
  { company: "Databricks", title: "\tForward Deployed Engineer, Financial Services  ", expect: "core", skills: EVALS, why: "leading tab + trailing spaces; Databricks ships both" },
  { company: "Databricks", title: "Applied AI Engineer", expect: null, why: "'Applied AI' is a FALSE POSITIVE at Databricks and CORE at Mistral/Anthropic" },
  { company: "Databricks", title: "Engagement Manager, Professional Services", expect: null, why: "exclude[] beats adjacent[] on the same board" },
  { company: "Databricks", title: "Delivery Solutions Architect", expect: "core", skills: AGENTS, why: "the one SA family that is a build role here" },
  { company: "Databricks", title: "Specialist Solutions Architect - EMEA", expect: "adjacent", why: "pre-sales; real signal, never a headline number" },

  // --- The "Applied AI" trio: the same string, three verdicts, decided per company.
  { company: "Anthropic", title: "Applied AI Architect", expect: "core", skills: EVALS, why: "'Applied AI' is CORE here" },
  { company: "Anthropic", title: "Research Engineer, Alignment", expect: null, why: "exclude[] - research ladder" },
  { company: "Mistral AI", title: "Applied AI Engineer", expect: "core", skills: EVALS, why: "'Applied AI' is CORE here too" },
  { company: "Perplexity", title: "MTS (Software Engineer, Applied AI)", expect: null, why: "THE guard: core product research, not deployment" },
  { company: "Perplexity", title: "Forward Deployed Engineer", expect: "core", skills: EVALS, why: "the literal title is still core at Perplexity" },

  // --- Sierra: department AND team must both agree, or the title is a platform req.
  { company: "Sierra", title: "Software Engineer, Agent", dept: "Engineering", team: "Agent Engineering", expect: "core", skills: AGENTS, why: "both fields agree" },
  { company: "Sierra", title: "Software Engineer, Agent", dept: "Engineering", team: "Platform", expect: null, why: "right department, wrong team" },
  { company: "Sierra", title: "Software Engineer, Agent", dept: "Product", team: "Agent Engineering", expect: null, why: "right team, wrong department" },
  { company: "Sierra", title: "Software Engineer, Agent Builder", dept: "Engineering", team: "Agent Engineering", expect: null, why: "exclude[] voids it even when the guard's fields agree" },
  { company: "Sierra", title: "Deployed Infrastructure Engineer ", expect: "core", skills: RAG, why: "Sierra ships this title with a trailing space" },

  // --- Baseten: the title carries no FDE substring at all. Only the team field catches it.
  { company: "Baseten", title: "AI Inference Engineer", dept: "Engineering", team: "Forward Deployed Engineering", expect: "core", skills: EVALS, why: "THE guard: caught via team, invisible to a title-only filter" },
  { company: "Baseten", title: "Site Reliability Engineer", dept: "Engineering", team: "Model Performance", expect: null, why: "its JD says 'forward deployed'; classification never reads the JD" },
  { company: "Baseten", title: "Account Executive - Enterprise", dept: "Sales", team: "Enterprise", expect: null, why: "same - 23 of 88 Baseten bodies mention FDEs" },

  // --- Fireworks: "AI Field Engineer" is core, so "Field" is a live prefix on this board.
  { company: "Fireworks AI", title: "Field Marketing Manager", expect: null, why: "THE guard: must not ride the Field Engineer pattern into core" },
  { company: "Fireworks AI", title: "AI Field Engineer, Enterprise", expect: "core", skills: AGENTS, why: "the real one" },

  // --- Datadog: leadership prefixes sit directly on top of the IC ladder.
  { company: "Datadog", title: "Manager, Services Architect", expect: null, why: "excluded by prefix before the matcher sees it" },
  { company: "Datadog", title: "Services Architect", expect: "adjacent", why: "the IC version" },
  { company: "Datadog", title: "Area Vice President, Solutions Engineering", expect: null, why: "excluded by prefix" },

  // --- Anyscale: "Head of Customer Engineering " contains "Customer Engineer".
  { company: "Anyscale", title: "Head of Customer Engineering ", expect: "leadership", why: "trailing space plus a leadership marker over a core string" },
  { company: "Anyscale", title: "Customer Engineer", expect: "core", skills: AGENTS, why: "the IC version" },

  // --- Bounded matching: a raw includes() on "Intern" would void this real role.
  { company: "Applied Intuition", title: "Field Engineer, International", expect: "core", skills: AGENTS, why: "'Intern' must not match inside 'International'" },

  { company: "Palantir", title: "Forward Deployed Software Engineer", expect: "core", skills: AGENTS, why: "house title" },
  { company: "Palantir", title: "Deployment Strategist - Intern", expect: null, why: "the 34 Intern/New Grad variants are stripped at classification" },

  { company: "Scale AI", title: "Frontier Agents Engineer", expect: "core", skills: RAG, why: "verified house equivalent" },
  { company: "Decagon", title: "Agent Deployment Engineer", expect: "core", skills: RAG, why: "verified house equivalent" },
  { company: "Abridge", title: "Implementation Engineer", expect: "core", skills: AGENTS, why: "verified house equivalent" },
  { company: "Writer", title: "AI deployment engineer", expect: "core", skills: AGENTS, why: "Writer uses sentence case; matching is case-insensitive" },
  { company: "dbt Labs / Fivetran", title: " Staff Product Manager - dbt v2", expect: null, why: "leading space, and excluded as a PM req" },

  // --- Samsara: one Mid-Market SE req, cloned across three regions.
  { company: "Samsara", title: "Solutions Engineer - Mid Market, EMEA - Remote", expect: "adjacent", why: "region clone 1 of 3" },
  { company: "Samsara", title: "Solutions Engineer - Mid Market, AMER - Remote", expect: "adjacent", why: "region clone 2 of 3" },
  { company: "Samsara", title: "Solutions Engineer - Mid Market, APAC - Remote", expect: "adjacent", why: "region clone 3 of 3" },

  // --- Cohere: the literal FDE family, regionally cloned.
  { company: "Cohere", title: "Forward Deployed Engineer (Singapore)", expect: "core", skills: EVALS, why: "location parenthetical" },
  { company: "Cohere", title: "Forward Deployed Engineer (London)", expect: "core", skills: EVALS, why: "same req, other city" },
];

/** LangChain's fifteen location clones of one requisition - the block that would otherwise set every percentage. */
const LANGCHAIN_CITIES = ["San Francisco", "New York", "Seattle", "Austin", "Boston", "Denver", "Chicago", "Toronto", "London", "Berlin", "Paris", "Amsterdam", "Dublin", "Singapore", "Sydney"];
for (const city of LANGCHAIN_CITIES) {
  FIXTURES.push({ company: "LangChain", title: `Deployed Engineer (${city})`, expect: "core", skills: EVALS, firstSeen: "TODAY", why: `location clone: ${city}` });
}

const posting = (f: Fixture, i: number): Posting => ({
  company: f.company,
  ats: "test",
  sourceId: `s${i}`,
  title: f.title,
  titleRaw: f.title,
  location: "Remote",
  department: f.dept ?? null,
  team: f.team ?? null,
  url: `https://example.test/${i}`,
  publishedAt: "2026-08-01",
  jd: null,
});

// ---------------------------------------------------------------------------
console.log("\n  classification - every row is an audited per-company verdict");
// ---------------------------------------------------------------------------

let classified = 0;
const actual: Expect[] = FIXTURES.map((f, i) => classify(posting(f, i), sourceFor(f.company)));
FIXTURES.forEach((f, i) => {
  if (actual[i] === f.expect) { classified++; return; }
  fails++;
  console.log(`  FAIL ${f.company} "${f.title.trim()}" -> ${actual[i]} (want ${f.expect}) - ${f.why}`);
});
ck(`all ${FIXTURES.length} fixtures classify as audited`, classified === FIXTURES.length, `(${classified}/${FIXTURES.length})`);

// The named guards, asserted individually so a regression names itself in the output.
const one = (company: string, title: string, dept?: string, team?: string) =>
  classify(posting({ company, title, dept, team, expect: null, why: "" }, 999), sourceFor(company));

ck("'Field Marketing Manager' is not core", one("Fireworks AI", "Field Marketing Manager") !== "core");
ck("Perplexity MTS does not match on 'Applied AI'", one("Perplexity", "MTS (Software Engineer, Applied AI)") === null);
ck("...while the same string is core at Mistral", one("Mistral AI", "Applied AI Engineer") === "core");
ck("Sierra guard needs department AND team", one("Sierra", "Software Engineer, Agent", "Engineering", "Agent Engineering") === "core"
  && one("Sierra", "Software Engineer, Agent", "Engineering", "Agent Platform") === null
  && one("Sierra", "Software Engineer, Agent", "Product", "Agent Engineering") === null);
ck("Baseten 'AI Inference Engineer' is core via team", one("Baseten", "AI Inference Engineer", "Engineering", "FDE") === "core");
ck("...and no Baseten title-only match exists for it", one("Baseten", "AI Inference Engineer", "Engineering", "Model Performance") === null);
ck("'Technical Accounting ... Senior Manager' does not match 'Technical Account'", one("OpenAI", "Technical Accounting & Reporting Senior Manager") === null);
ck("'International' does not trip the 'Intern' exclude", one("Applied Intuition", "Field Engineer, International") === "core");

// ---------------------------------------------------------------------------
console.log("\n  normalization - trim, location vocabulary, seniority");
// ---------------------------------------------------------------------------

ck("leading tab and trailing spaces normalize away",
  dedupeKey("Databricks", "\tForward Deployed Engineer, Financial Services  ") === dedupeKey("Databricks", "Forward Deployed Engineer, Financial Services"));
ck("trailing space alone does not fork a req",
  normalizeTitle("Deployed Infrastructure Engineer ") === "deployed infrastructure engineer");
ck("seniority tokens survive", normalizeTitle("Senior Forward Deployed Engineer - EMEA") === "senior forward deployed engineer",
  `("${normalizeTitle("Senior Forward Deployed Engineer - EMEA")}")`);
ck("Sr. survives, city does not", normalizeTitle("Sr. Deployed Engineer (Tokyo)") === "sr deployed engineer",
  `("${normalizeTitle("Sr. Deployed Engineer (Tokyo)")}")`);
ck("Staff survives", normalizeTitle("Staff Forward Deployed Engineer, Bay Area") === "staff forward deployed engineer");
ck("Senior and non-senior stay distinct reqs",
  dedupeKey("OpenAI", "Senior Forward Deployed Engineer") !== dedupeKey("OpenAI", "Forward Deployed Engineer"));
ck("non-location suffixes are signal, not noise",
  normalizeTitle("Forward Deployed Engineer, Healthcare") === "forward deployed engineer healthcare");
ck("multiple trailing location segments all strip",
  normalizeTitle("Solutions Engineer - Mid Market, EMEA - Remote") === "solutions engineer mid market");
ck("15 LangChain city clones share one key",
  new Set(LANGCHAIN_CITIES.map((c) => dedupeKey("LangChain", `Deployed Engineer (${c})`))).size === 1);

// ---------------------------------------------------------------------------
console.log("\n  skills - html, boilerplate, and what must not count");
// ---------------------------------------------------------------------------

ck("entities unescape before tags strip", htmlToText("&lt;h3&gt;Responsibilities&lt;/h3&gt;&lt;p&gt;Own the rollout&lt;/p&gt;").split("\n")[0] === "Responsibilities");
ck("exactly one unescape pass - double-escaped markup stays literal text", htmlToText("&lt;p&gt;Ship it &amp;lt;fast&amp;gt;&lt;/p&gt;").includes("&lt;fast&gt;"));
ck("an escaped comparison operator is not eaten as a tag", htmlToText("&lt;li&gt;Keep p95 latency &lt; 200ms&lt;/li&gt;").includes("< 200ms"));

/** Six Decagon postings that all carry the same infra sentence - the shape the 60% rule exists for. */
const SHARED_INFRA = "We run every customer deployment on Kubernetes and Terraform across three production clouds.";
const decagonCorpus = ["retail", "fintech", "travel", "telco", "healthcare", "logistics"].map((seg) => [
  "Responsibilities",
  `Own the ${seg} agent rollout end to end alongside the customer's own platform owners.`,
  `Build evaluation frameworks for the ${seg} workstream to measure model quality in production.`,
  `Partner with the ${seg} account team on quarterly business reviews and adoption planning.`,
  SHARED_INFRA,
].join("\n"));

const decagonSource = sourceFor("Decagon") as { boilerplate?: string[] };
const rawSkills = matchSkills(decagonCorpus[0], skillMap);
const strippedText = stripBoilerplate(decagonCorpus[0], "Decagon", decagonCorpus, decagonSource);
const strippedSkills = matchSkills(strippedText, skillMap);

ck("the boilerplate line would otherwise score a skill", rawSkills.includes("kubernetes"));
ck("a skill mentioned only in boilerplate does not count", !strippedSkills.includes("kubernetes"));
ck("the posting's own content still scores", strippedSkills.includes("evals"));
ck("the 60% rule does not eat the whole body", strippedText.includes("agent rollout"));

/** Below the 5-posting auto threshold, the static per-company list is the only mechanism. */
const anthropicBody = [
  "About the role",
  "Anthropic's mission is to create reliable, interpretable, and steerable AI systems that people can rely on.",
  "Help customers develop evaluation frameworks to measure model performance for their own use cases.",
].join("\n");
const anthropicStripped = stripBoilerplate(anthropicBody, "Anthropic", [anthropicBody, anthropicBody], sourceFor("Anthropic") as { boilerplate?: string[] });
ck("static boilerplate strips below the auto threshold", !anthropicStripped.includes("steerable"));
ck("...without taking the real line with it", anthropicStripped.includes("evaluation frameworks"));

ck("an EEO tail is cut by section scoping",
  !matchSkills("Responsibilities\nBuild evaluation frameworks with customers.\nEqual opportunity employer\nWe use Kubernetes and Terraform in our production cloud.", skillMap).includes("kubernetes"));

// ---------------------------------------------------------------------------
console.log("\n  benchmark - denominators, dedupe, movement, suppression");
// ---------------------------------------------------------------------------

const DAY = "2026-09-07";
const NOW = new Date(`${DAY}T03:04:11Z`);
const board = (ok: boolean) => ({ ok, total: 100, matched: 4, bytes: 1000, fetchedAt: NOW.toISOString(), error: ok ? null : "HTTP 502" });

function buildIndex(boardsOk: number): MarketIndex {
  const reqs: Record<string, ReqRecord> = {};
  FIXTURES.forEach((f, i) => {
    const cls = actual[i];
    if (cls !== "core" && cls !== "adjacent" && cls !== "leadership") return; // junior/null are never stored
    reqs[`${f.company.toLowerCase().replace(/[^a-z0-9]+/g, "")}::s${i}`] = {
      company: f.company,
      title: f.title,
      key: dedupeKey(f.company, f.title),
      location: "Remote",
      url: `https://example.test/${i}`,
      class: cls,
      publishedAt: "2026-08-01",
      firstSeen: f.firstSeen === "TODAY" ? DAY : "2026-09-01",
      lastSeen: DAY,
      missingSince: null,
      skills: cls === "core" ? (f.skills ?? AGENTS) : [],
    };
  });
  // Two reqs that must never reach a denominator: a failed stage-2 JD fetch, and a req inside
  // its 14-day decay window after falling off the board.
  reqs["openai::pending"] = { ...reqs["openai::s0"], title: "Forward Deployed Engineer, Pending", key: dedupeKey("OpenAI", "Forward Deployed Engineer, Pending"), skills: null };
  reqs["openai::closed"] = { ...reqs["openai::s0"], title: "Forward Deployed Engineer, Closed", key: dedupeKey("OpenAI", "Forward Deployed Engineer, Closed"), missingSince: "2026-09-05" };
  return {
    version: 1,
    updatedAt: NOW.toISOString(),
    cursor: 0,
    boardsOk,
    boards: { openai: board(true), sierra: board(true), baseten: board(true), langchain: board(true) },
    reqs,
  };
}

const index = buildIndex(27);
// Last week's point. `evals` at 55% is deliberately above the 50 band and 13 points off this
// week's 42%, so both movement triggers - the ±3-point rule and the band crossing - are exercised
// by one number. `agents` and `rag` are flat, and every other skill is absent from the point and
// must therefore be skipped rather than treated as having been at 0%.
const previous: TrendPoint = { d: "2026-08-31", core: 19, companies: 17, s: { evals: 0.55, agents: 1, rag: 0.16 } };
const b = computeBenchmark(index, skillMap, workbook, NOW, previous);

const corePostings = actual.filter((c) => c === "core").length;
console.log(`\n  ${corePostings} core postings -> ${b.coreCount} distinct reqs across ${b.companyCount} companies`);
console.log(`    ${b.coreStatement}`);
console.log(`    ${b.adjacentStatement}`);

ck("core postings collapse to distinct reqs", corePostings === 34 && b.coreCount === 19, `(${corePostings} -> ${b.coreCount})`);
ck("15 LangChain clones dedupe to 1",
  b.coreCount === new Set(FIXTURES.filter((f, i) => actual[i] === "core").map((f) => dedupeKey(f.company, f.title))).size);
ck("Samsara's 3 region clones dedupe to 1", b.adjacentCount === 4, `(${b.adjacentCount} adjacent)`);
ck("leadership is counted, never in the denominator", b.leadershipCount === 2 && !b.coreStatement.includes("leadership"));
ck("companies are reported alongside the count", b.companyCount === 17 && b.coreStatement.includes("17 companies"), `(${b.companyCount})`);
ck("null-skill and closed reqs are out of the denominator",
  computeBenchmark({ ...index, reqs: Object.fromEntries(Object.entries(index.reqs).filter(([k]) => !k.startsWith("openai::pending") && !k.startsWith("openai::closed"))) }, skillMap, workbook, NOW, previous).coreCount === b.coreCount);
ck("this run is not a cold start", b.baseline === false && b.baselineStatement === null);

const cov = (id: string) => b.coverage.find((c) => c.id === id)!;
// 23 of the 34 core postings carry `evals`, but 15 of those are one LangChain req and 2 are one
// Cohere req. Counted per posting this skill reads 68%; counted per requisition it is 42%. That
// 26-point gap is the entire reason the dedupe exists.
ck("evals share is over distinct reqs, not postings", cov("evals").hits === 8 && cov("evals").reqs === 19 && cov("evals").pct === 42, `(${cov("evals").pct}%)`);
ck("the denominator always renders as a pair", cov("evals").statement.includes("8 of 19 reqs, across 8 of 17 companies"));
ck("a skill nobody asks for renders 0%", cov("kubernetes").pct === 0 && cov("kubernetes").hits === 0);
ck("coverage sorts by percentage descending", b.coverage[0].pct === 100 && b.coverage[0].id === "agents");
ck("plan rows resolve with the header at index 0",
  cov("evals").rows[0]?.row === 59 && cov("evals").rows[0].topic.startsWith("Evals as infrastructure"), `("${cov("evals").rows[0]?.topic}")`);
ck("skillShares are fractions, ready for trend.json", Math.abs(b.skillShares.evals - 8 / 19) < 1e-9);

ck("15 clones posted today are one new-role line", b.newSinceLastRun.length === 1 && b.newSinceLastRun[0].company === "LangChain",
  `(${b.newSinceLastRun.length})`);

console.log(`    ${b.movement.statement}`);
ck("a band crossing is reported as movement", !b.movement.suppressed
  && b.movement.changes.some((c) => c.id === "evals" && c.from === 55 && c.to === 42 && c.delta === -13 && c.crossed === 50));
ck("a skill absent from last week's point is skipped, not treated as 0%", !b.movement.changes.some((c) => c.id === "kubernetes"));
ck("a flat skill is not", !b.movement.changes.some((c) => c.id === "agents"));
ck("movement threshold is whole points", MOVE_MIN_POINTS === 3);

const partial = computeBenchmark(buildIndex(DELTA_MIN_BOARDS - 1), skillMap, workbook, NOW, previous);
ck("boardsOk < 24 suppresses deltas", partial.movement.suppressed && partial.movement.changes.length === 0);
ck("...and says so instead of printing a number", partial.movement.statement === `partial scan, 23 of ${BOARD_COUNT} boards, deltas suppressed`, `("${partial.movement.statement}")`);
ck("...and suppresses the new-roles list too", partial.newSinceLastRun.length === 0);
ck("boardsOk === 24 does not suppress", computeBenchmark(buildIndex(DELTA_MIN_BOARDS), skillMap, workbook, NOW, previous).movement.suppressed === false);
ck("counts are unaffected by suppression", partial.coreCount === b.coreCount);

const baseline = computeBenchmark(
  { ...index, reqs: Object.fromEntries(Object.entries(index.reqs).map(([k, r]) => [k, { ...r, firstSeen: DAY }])) },
  skillMap, workbook, NOW, previous,
);
ck("cold start emits no new-roles list", baseline.baseline === true && baseline.newSinceLastRun.length === 0);
ck("...and says baseline once", (baseline.baselineStatement ?? "").startsWith("Market baseline established"));

console.log(`\n  ${b.overInvestedTotal.statement}`);
ck("BOARD_COUNT matches the enabled board set", BOARD_COUNT === sourcesFile.boards.filter((s) => s.enabled).length,
  `(${sourcesFile.boards.filter((s) => s.enabled).length} enabled)`);
ck("all three over-invested tracks resolve", b.overInvested.length === 3 && b.overInvested.every((t) => t.rowCount > 0));
ck("over-investment is a share of active hours", b.overInvestedTotal.activeHours > 1000 && b.overInvestedTotal.pct >= 15 && b.overInvestedTotal.pct <= 30,
  `(${b.overInvestedTotal.hours}h of ${b.overInvestedTotal.activeHours}h = ${b.overInvestedTotal.pct}%)`);
// The lead sentence has to follow planCoverage, not be hardcoded. It was hardcoded to
// "No plan row covers this" and was false for six entries -- the plan teaches knowledge
// distillation at row 99 subtopics[16] and cites LangGraph at row 53. A gap registry that
// overstates itself argues for evicting real curriculum, so both branches are pinned.
ck("gaps are reported verbatim, never inferred", b.gaps.length === skillMap.gaps.length && b.gaps.every((g) => g.statement.startsWith("GAP - ")));
ck("a gap the plan does not cover says so",
  b.gaps.filter((g) => g.statement.includes("No plan row covers this.")).length ===
    skillMap.gaps.filter((g) => g.planCoverage !== "partial").length);
ck("a partly covered gap never claims no row covers it",
  b.gaps.every((g) => {
    const src = skillMap.gaps.find((x) => x.id === g.id);
    return src?.planCoverage !== "partial" || (g.statement.includes("Partly covered") && !g.statement.includes("No plan row covers this."));
  }));
ck("computeBenchmark is pure over its arguments", JSON.stringify(computeBenchmark(index, skillMap, workbook, NOW, previous)) === JSON.stringify(b));

console.log(fails ? `\n${fails} FAILURES` : "\nall assertions passed");
process.exit(fails ? 1 : 0);
