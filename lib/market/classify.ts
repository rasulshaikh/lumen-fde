/**
 * Title and structured-field classification. Pure: no network, no I/O, no config loading -
 * the caller passes the board's own entry from `data/market-sources.json` in.
 *
 * Two rules govern everything below.
 *
 * 1. **Per company, never globally.** There is no global FDE pattern list and building one is
 *    the mistake this file exists to prevent: "Applied AI" is core FDE at Mistral and
 *    Anthropic and a false positive at Databricks and Perplexity; "Solutions Engineer" is real
 *    field engineering at Scale and Glean and the internal IT ladder at OpenAI. The audited
 *    per-company config is the asset; this file is only the matcher for it.
 *
 * 2. **Never classify on description text.** 23 of Baseten's 88 postings mention "forward
 *    deployed" in the body - including `Account Executive - Enterprise` and `Site Reliability
 *    Engineer` - because unrelated roles describe partnering with the FDE team. A JD that
 *    mentions FDEs is not an FDE role. `posting.jd` is deliberately not read here; description
 *    text is for skill extraction only, after a role has already been classified.
 */

import type { Posting } from "./fetch";

export type RoleClass = "core" | "adjacent" | "leadership" | "junior";

/**
 * Structured-field guards, for the two companies where a substring cannot express the rule.
 * Typed loosely on purpose: consumers get this shape from `import sources from
 * "@/data/market-sources.json"`, where TypeScript infers `type: string` rather than the
 * literal union, and a stricter type here would force a cast at every call site.
 */
export type FieldGuard = {
  /** "require" voids a matching posting unless the fields agree; "promote" classifies outright. */
  type: string;
  when: { titleContains?: string; teamContainsAny?: string[] };
  require?: { department?: string; team?: string };
  effect?: string;
};

/** The subset of a `market-sources.json` board entry that classification reads. */
export type Source = {
  company: string;
  core?: string[];
  adjacent?: string[];
  exclude?: string[];
  fieldGuards?: FieldGuard[];
};

/**
 * Everything is compared in this form: lowercased, every non-alphanumeric run collapsed to a
 * single space, trimmed.
 *
 * Trimming is mandatory before anything else - Anyscale ships "Head of Customer Engineering ",
 * Sierra ships "Deployed Infrastructure Engineer " and dbt/Fivetran ships " Staff Product
 * Manager - dbt v2" with a leading space. Flattening punctuation is what lets the config's
 * "Software Engineer, Agent" match a title whose comma or hyphen differs, and it is why the
 * stored key for "Forward Deployed Engineer, Healthcare" is "forward deployed engineer
 * healthcare".
 */
const flatten = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Phrase match on the flattened form, bounded at both ends.
 *
 * The spec calls these substrings, but a raw `includes` is wrong in the direction that costs
 * real roles: every board excludes "Intern", and a bare substring test voids "Internal Tools
 * Engineer" and any "International" title along with it. Bounded matching still lets a pattern
 * match a longer title ("Forward Deployed" inside "Forward Deployed Engineer, Healthcare"),
 * which is the behaviour the config was authored against.
 */
const hasPhrase = (flatTitle: string, pattern: string) => {
  const flat = flatten(pattern);
  return flat.length > 0 && new RegExp(`\\b${escapeRegex(flat)}\\b`).test(flatTitle);
};

/**
 * Location vocabulary, curated rather than inferred.
 *
 * A general "strip the last comma-separated segment" rule would eat "Forward Deployed
 * Engineer, Healthcare" and "Solutions Architect, Public Sector" - the segments that carry the
 * actual signal. So a suffix is only dropped when every word in it is known to be a place.
 * Multi-word entries are matched greedily, longest first, so "bay area" and "new york city"
 * survive tokenization.
 */
const PLACES = new Set([
  // regions and blocs, which is how most boards clone a req
  "emea", "apac", "apj", "amer", "amers", "americas", "namer", "latam", "anz", "dach", "benelux",
  "mena", "uki", "nordics", "eu", "europe", "asia", "asia pacific", "middle east", "africa",
  "north america", "south america", "latin america", "east coast", "west coast", "global",
  // countries
  "us", "usa", "united states", "uk", "united kingdom", "ireland", "canada", "mexico", "brazil",
  "argentina", "chile", "colombia", "germany", "france", "spain", "portugal", "italy",
  "netherlands", "belgium", "switzerland", "austria", "sweden", "norway", "denmark", "finland",
  "poland", "czechia", "czech republic", "romania", "turkey", "israel", "uae", "saudi arabia",
  "india", "japan", "china", "taiwan", "korea", "south korea", "singapore", "malaysia",
  "indonesia", "philippines", "thailand", "vietnam", "australia", "new zealand",
  // cities and metros
  "san francisco", "san francisco bay area", "bay area", "palo alto", "mountain view",
  "menlo park", "sunnyvale", "san jose", "los angeles", "san diego", "seattle", "portland",
  "denver", "boulder", "austin", "dallas", "houston", "chicago", "minneapolis", "detroit",
  "atlanta", "miami", "tampa", "orlando", "nashville", "raleigh", "boston", "new york",
  "new york city", "nyc", "sf", "philadelphia", "pittsburgh", "washington", "washington dc",
  "salt lake city", "phoenix", "toronto", "vancouver", "montreal", "ottawa", "mexico city",
  "sao paulo", "london", "dublin", "paris", "berlin", "munich", "hamburg", "amsterdam",
  "brussels", "zurich", "geneva", "madrid", "barcelona", "milan", "rome", "lisbon", "stockholm",
  "copenhagen", "oslo", "helsinki", "vienna", "prague", "warsaw", "krakow", "bucharest",
  "tel aviv", "dubai", "abu dhabi", "bangalore", "bengaluru", "hyderabad", "pune", "chennai",
  "mumbai", "delhi", "gurgaon", "gurugram", "noida", "tokyo", "osaka", "seoul", "beijing",
  "shanghai", "shenzhen", "taipei", "hong kong", "manila", "jakarta", "bangkok",
  "kuala lumpur", "ho chi minh city", "sydney", "melbourne", "brisbane", "auckland",
]);

/**
 * Words that decorate a location without naming one. They are dropped before the place check,
 * so "- Remote, Germany", "(Remote - US)" and "(Hybrid)" all reduce to a location segment.
 */
const PLACE_FILLER = new Set([
  "remote", "hybrid", "onsite", "on", "site", "based", "in", "or", "and", "the", "office",
  "only", "preferred", "region", "location", "locations", "anywhere", "flexible",
]);

const LONGEST_PLACE = 4; // the longest entries above: "san francisco bay area", "ho chi minh city"

/** True when a segment is nothing but places and location filler. */
function isPlace(segment: string): boolean {
  const flat = flatten(segment);
  if (!flat) return false;
  const words = flat.split(" ").filter((word) => !PLACE_FILLER.has(word));
  // "(Remote)" is pure filler and must still be stripped, or the remote clone of a role
  // survives as its own requisition.
  if (!words.length) return true;
  for (let i = 0; i < words.length; ) {
    let matched = 0;
    for (let take = Math.min(LONGEST_PLACE, words.length - i); take > 0; take--) {
      if (PLACES.has(words.slice(i, i + take).join(" "))) {
        matched = take;
        break;
      }
    }
    if (!matched) return false; // one non-place word means the whole segment is signal
    i += matched;
  }
  return true;
}

/**
 * Canonical title for dedupe: lowercased, whitespace collapsed, location suffixes and
 * location parentheticals removed.
 *
 * Seniority tokens (Senior, Staff, Lead, Sr.) are KEPT. They are the signal this whole
 * benchmark is about - a market of Staff FDE reqs is a different market from a market of new
 * Senior ones - and stripping them would merge the two.
 */
export function normalizeTitle(title: string): string {
  let working = title.toLowerCase().replace(/\s+/g, " ").trim();

  // Parentheses and brackets first: LangChain ships fifteen "Deployed Engineer (City)" clones
  // of one role. A non-location parenthetical ("(Contract)", "(L5)") is left alone.
  working = working.replace(/[([{]([^)\]}]*)[)\]}]/g, (whole, inner: string) => (isPlace(inner) ? " " : whole));

  // Then trailing segments, repeatedly: "Solutions Engineer - Mid Market, EMEA - Remote" sheds
  // two segments and stops at "mid market". Samsara clones one Mid-Market SE req across six
  // regions this way; without the loop only the last of them is removed.
  for (;;) {
    const cut = Math.max(working.lastIndexOf(" – "), working.lastIndexOf(" — "), working.lastIndexOf(" - "), working.lastIndexOf(","), working.lastIndexOf("|"));
    if (cut <= 0) break;
    const tail = working.slice(cut).replace(/^[\s,|–—-]+/, "");
    if (!isPlace(tail)) break;
    working = working.slice(0, cut);
  }

  return flatten(working);
}

/**
 * `company::normalized title`. Company is folded too, because the same board's entries reach
 * this function from a config label ("Mistral AI") and an ATS payload with different casing.
 *
 * This key is what stops two companies deciding every percentage: LangChain's fifteen city
 * clones collapse to one, Samsara's six region-cloned SEs collapse to one. Uncollapsed, the
 * headline number describes those two boards' cloning habits rather than the market.
 */
export function dedupeKey(company: string, title: string): string {
  return `${flatten(company)}::${normalizeTitle(title)}`;
}

/**
 * Titles that contain a people-leadership marker are never core, however well the rest of the
 * title matches: Anyscale's "Head of Customer Engineering" contains "Customer Engineer", and
 * Datadog carries "Manager, Services Architect" and "Area Vice President" over its individual
 * contributor ladder. These are real signal about where the roles are, so they are classified
 * rather than dropped - they just never set the headline denominator.
 */
const LEADERSHIP = /\b(manager|managers|management|director|head of|vp|vps|vice president|svp|evp|avp|chief|principal manager)\b/;

/**
 * The two exceptions, both individual-contributor delivery roles that happen to end in
 * "Manager" and both listed as `adjacent` in the config itself. They are removed from the
 * title before the leadership test rather than special-cased after it, so "Senior Technical
 * Account Manager" reads as adjacent while "Manager, Technical Account Management" still reads
 * as leadership.
 */
const IC_MANAGER_TITLES = ["technical account manager", "engagement manager", "implementation manager"];

const isLeadership = (flatTitle: string) => {
  let residue = flatTitle;
  for (const phrase of IC_MANAGER_TITLES) residue = residue.split(phrase).join(" ");
  return LEADERSHIP.test(residue);
};

/**
 * Junior roles are counted separately and never stored. Most boards already exclude them by
 * substring, so this is the backstop for the boards that exclude "Intern" but not "New Grad"
 * (OpenAI, Snowflake, Cohere) - one new-grad FDE req in the denominator moves nothing, but it
 * would show up in the "new roles this week" list as if the market had opened a senior seat.
 */
const JUNIOR = /\b(intern|interns|internship|new grad|new grads|new graduate|graduate program|early career|apprentice|apprenticeship|campus|working student|student)\b/;

const guardApplies = (guard: FieldGuard, posting: Posting, flatTitle: string) => {
  const when = guard.when || {};
  if (when.titleContains && !hasPhrase(flatTitle, when.titleContains)) return false;
  if (when.teamContainsAny) {
    const team = flatten(String(posting.team ?? ""));
    if (!when.teamContainsAny.some((needle) => hasPhrase(team, needle))) return false;
  }
  return true;
};

const fieldsAgree = (guard: FieldGuard, posting: Posting) => {
  const required = guard.require || {};
  if (required.department && flatten(String(posting.department ?? "")) !== flatten(required.department)) return false;
  if (required.team && flatten(String(posting.team ?? "")) !== flatten(required.team)) return false;
  return true;
};

/**
 * Classify one posting against its own board's config. `null` means no match at all, which is
 * the answer for the overwhelming majority of postings on these boards (OpenAI matches 72 of
 * ~780) and means the posting is never stored.
 *
 * Order is fixed and each step earns its position:
 *
 *   1. `exclude[]` voids the posting outright - it beats `core[]` and `adjacent[]`, so
 *      Databricks' "Engagement Manager" and Sierra's "Agent Builder" never reach the matcher
 *      even though a sibling board carries those exact strings as a match.
 *   2. `fieldGuards` - Sierra's "Software Engineer, Agent" is a prefix shared with the product
 *      platform teams and only counts under `department = Engineering, team = Agent
 *      Engineering`; Baseten's team membership is the only structured signal that catches "AI
 *      Inference Engineer", whose body opens "As a Forward Deployed Engineer at Baseten..."
 *      but whose title carries no FDE substring. A title-only filter silently misses it.
 *   3. `core[]`, then `adjacent[]` - core wins ties, since a title matching both is a build
 *      role that also names a pre-sales string.
 *
 * Leadership and junior are demotions applied to a title that already matched. A Director of
 * Marketing is not "leadership" here, it is `null`: this file classifies the FDE family, not
 * every posting on the board.
 */
export function classify(posting: Posting, source: Source): RoleClass | null {
  const flatTitle = flatten(String(posting.title ?? ""));
  if (!flatTitle) return null;

  for (const pattern of source.exclude ?? []) {
    if (hasPhrase(flatTitle, pattern)) return null;
  }

  let base: "core" | "adjacent" | null = null;
  for (const guard of source.fieldGuards ?? []) {
    if (!guardApplies(guard, posting, flatTitle)) continue;
    if (guard.type === "require" && !fieldsAgree(guard, posting)) return null;
    if (guard.type === "promote") base = guard.effect === "adjacent" ? "adjacent" : "core";
  }

  if (!base && (source.core ?? []).some((pattern) => hasPhrase(flatTitle, pattern))) base = "core";
  if (!base && (source.adjacent ?? []).some((pattern) => hasPhrase(flatTitle, pattern))) base = "adjacent";
  if (!base) return null;

  if (isLeadership(flatTitle)) return "leadership";
  if (JUNIOR.test(flatTitle)) return "junior";
  return base;
}
