/**
 * Reachability: one requisition in, one of five tiers out. Design section 2.
 *
 * Pure. No network, no filesystem, no `Date.now()` - same contract as benchmark.ts and for the
 * same reason: this decides whether a role counts toward "the market you can actually take",
 * and a rule that can only be exercised by running a 47 MB scan against 27 live boards is a
 * rule nobody ever checks.
 *
 * Two inputs, and the split is the whole point of putting this at scan time.
 *
 *  - `location` is ALREADY STORED on every ReqRecord, so three of the five tiers are a pure
 *    function of data the index already holds and can be recomputed with no re-scan, exactly
 *    like the skill fingerprint. All 745 stored reqs carry a non-empty `location`; none is
 *    blank, which is why `title` is deliberately not read here - its region suffix is a clone
 *    marker classify.ts already strips, and it never carries a location the field does not.
 *  - Visa, sponsorship and clearance language exists ONLY in the JD body, which store.ts
 *    deliberately discards (47 MB/day, 38 MB of it Ashby descriptions). So it has to be reduced
 *    to a tier in the same pass that reduces the body to a skill fingerprint, and the
 *    never-store-JD-text rule stays intact.
 *
 * `jdText` must be the `htmlToText` output and NOT the `stripBoilerplate` output. The 60%-
 * frequency detector removes lines that appear in most of a company's postings, and "we are
 * unable to provide visa sponsorship", the ITAR paragraph and the clearance clause are exactly
 * such lines - they are boilerplate in the literal sense and load-bearing here. Stripping first
 * would silently reclassify every Palantir and Anduril req out of `out-of-reach`.
 *
 * The conservative direction is asymmetric on purpose. Over-reporting `out-of-reach` costs a
 * role that was never going to be takeable; over-reporting `india-remote` puts an unreachable
 * req into the denominator of "42% of the market you can actually take", which is a number that
 * looks right, survives for months, and is used to decide what to study.
 */

export type ReachTier = "india-remote" | "emea-apac-remote" | "india-office" | "relocate-sponsor" | "out-of-reach";

/**
 * Ordered by how directly employable the tier is from Pune, best first.
 *
 * This is the merge order for a multi-location posting AND a total order the consumer can
 * iterate to render a distribution in a stable sequence. It is NOT the reachable set - the
 * design defines that as `india-remote + emea-apac-remote`, and which tiers a headline
 * percentage is recomputed within belongs to the tab, not here.
 *
 * `india-office` sits above `emea-apac-remote` because an Indian city is a role you can take
 * with a domestic move, and a remote EMEA req is not one you can take at all today. The design
 * table lists them the other way round; that ordering is about the report, this one is about
 * which segment of "Bengaluru, India; Remote - UK" wins, and the answer is Bengaluru.
 */
export const REACH_TIERS: readonly ReachTier[] = [
  "india-remote",
  "india-office",
  "emea-apac-remote",
  "relocate-sponsor",
  "out-of-reach",
];

/** One wording per tier, here rather than in the tab, so the panel and the digest cannot drift. */
export const REACH_LABELS: Record<ReachTier, string> = {
  "india-remote": "employable from Pune today - remote-global, or explicit India remote",
  "india-office": "an Indian city in the location",
  "emea-apac-remote": "remote with a stated region that overlaps IST",
  "relocate-sponsor": "on-site elsewhere, no stated blocker - would need a move and a visa",
  "out-of-reach": "US-person clause, active clearance, or a region that excludes India",
};

/**
 * The subset of a posting this reads. `Posting` (scan time, `location: string | null`) and
 * `ReqRecord` (recompute, `location: string`) both satisfy it structurally, so neither module
 * has to be imported - fetch.ts talks to the network and store.ts talks to GitHub, and either
 * import would put a network module in this file's graph for the sake of one field.
 */
export type ReachPosting = { location: string | null };

/**
 * Lowercase, strip diacritics, collapse every non-alphanumeric run to one space.
 *
 * The diacritic pass is not cosmetic: the corpus ships "Montreal" as `Montréal` and Zurich as
 * `Zürich, Switzerland`, and a plain `[^a-z0-9]+` collapse turns those into "montr al" and
 * "z rich", which match nothing in either vocabulary and fall through to the residual tier.
 */
const flatten = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Word-bounded alternation over an already-flattened vocabulary. */
const vocab = (words: string[]) => new RegExp(`\\b(?:${words.join("|")})\\b`);

/**
 * India, by place name. `\b` matching is what keeps `india` off `indiana` and `indianapolis`;
 * a raw `includes("india")` would read Indianapolis as an Indian city, and the corpus does
 * carry Indiana as `US-IN-Remote`.
 */
const INDIA = vocab([
  "india", "bengaluru", "bangalore", "mumbai", "pune", "delhi", "gurgaon", "gurugram", "noida",
  "hyderabad", "chennai", "kolkata", "ahmedabad", "jaipur",
]);

/** A location that names no region at all. "Remote" alone is NOT here - see `segmentTier`. */
const GLOBAL = vocab(["global", "globally", "worldwide", "anywhere"]);

/**
 * EMEA and APAC: the regions whose working day overlaps IST.
 *
 * Checked before the Americas vocabulary, so a two-letter US abbreviation can never outrank a
 * spelled-out European or Asian place. The one collision that matters in the other direction is
 * `Paris, Texas`; the corpus carries only `Paris` and `Paris, France`, and the Americas anchor
 * below catches any segment that also names the US.
 */
const IST_OVERLAP = vocab([
  // blocs and regions, which is how most boards clone a req
  "emea", "apac", "apj", "anz", "dach", "benelux", "nordics", "uki", "mena", "eu", "europe",
  "asia", "asia pacific", "middle east", "africa",
  // countries
  "united kingdom", "uk", "great britain", "england", "scotland", "wales", "ireland", "france",
  "germany", "netherlands", "belgium", "luxembourg", "switzerland", "austria", "spain",
  "portugal", "italy", "greece", "sweden", "norway", "denmark", "finland", "iceland", "poland",
  "czechia", "czech republic", "hungary", "romania", "bulgaria", "lithuania", "latvia",
  "estonia", "ukraine", "turkey", "israel", "uae", "united arab emirates", "saudi arabia",
  "qatar", "bahrain", "kuwait", "egypt", "kenya", "nigeria", "south africa", "japan", "korea",
  "south korea", "china", "hong kong", "taiwan", "singapore", "malaysia", "indonesia",
  "philippines", "thailand", "vietnam", "australia", "new zealand",
  // cities and metros
  "london", "dublin", "paris", "berlin", "munich", "hamburg", "frankfurt", "amsterdam",
  "rotterdam", "brussels", "zurich", "geneva", "vienna", "madrid", "barcelona", "lisbon",
  "milan", "rome", "athens", "stockholm", "copenhagen", "oslo", "helsinki", "prague", "warsaw",
  "krakow", "bucharest", "vilnius", "tallinn", "riga", "tel aviv", "jerusalem", "dubai",
  "abu dhabi", "riyadh", "jeddah", "doha", "cairo", "lagos", "nairobi", "cape town",
  "johannesburg", "istanbul", "tokyo", "osaka", "kyoto", "seoul", "beijing", "shanghai",
  "shenzhen", "taipei", "manila", "jakarta", "bangkok", "hanoi", "ho chi minh city",
  "kuala lumpur", "sydney", "melbourne", "brisbane", "perth", "canberra", "adelaide",
  "auckland", "wellington",
]);

/**
 * The Americas anchor: a segment naming the country, not a place inside it.
 *
 * Tested before `IST_OVERLAP` because these strings are unambiguous, and the corpus builds its
 * remote regions out of them - `Remote, Washington, United States, AMER`,
 * `Remote-Friendly, United States`, `United States (Remote)`, `California, USA, Remote`.
 */
const AMERICAS_ANCHOR = vocab(["united states", "usa", "u s a", "us", "amer", "amers", "americas", "namer", "usca"]);

/**
 * The Americas by place, tested last.
 *
 * All fifty state names are here because the corpus states remote regions state by state:
 * `Remote - California; Remote - Colorado; Remote - Illinois; Remote - Massachusetts; Remote -
 * New York; Remote - Oregon; Remote - Texas; Remote - Washington` is one requisition.
 *
 * Two-letter abbreviations are deliberately incomplete. Only the ones the corpus actually uses
 * and that are not also English words are listed: `or` (Oregon), `in` (Indiana), `me` (Maine),
 * `hi` (Hawaii), `id` (Idaho), `ok`, `oh`, `de`, `la`, `pa`, `ma`, `co` and `va` are omitted,
 * because a segment like "Remote or Hybrid" would otherwise read as Oregon. The state NAMES
 * still catch every one of them, and the abbreviations only ever have to carry a segment like
 * `Remote - TX` or `Remote - NYC` where no other token names the country.
 */
const AMERICAS = vocab([
  // countries and blocs
  "canada", "can", "mexico", "brazil", "argentina", "chile", "colombia", "peru", "latam",
  "latin america", "north america", "south america", "east coast", "west coast", "midwest",
  // states, spelled out
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut",
  "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas",
  "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota",
  "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
  "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon",
  "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas",
  "utah", "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming",
  "district of columbia", "puerto rico",
  // the abbreviations the corpus uses that are not also words
  "ca", "ny", "nyc", "tx", "fl", "il", "nc", "sc", "nj", "nv", "az", "wa", "wi", "mn", "mo",
  "md", "mi", "ga", "dc", "ne", "nd", "sd", "tn", "ky", "ut", "nm", "ks", "ri", "ct", "nh",
  "vt", "wv", "wy", "ak", "ia",
  // cities, for the segments that name one without naming the country
  "san francisco", "bay area", "palo alto", "mountain view", "menlo park", "sunnyvale",
  "san jose", "san mateo", "redwood city", "berkeley", "los angeles", "san diego", "seattle",
  "portland", "denver", "boulder", "colorado springs", "austin", "dallas", "houston", "omaha",
  "chicago", "minneapolis", "detroit", "st louis", "atlanta", "miami", "tampa", "orlando",
  "nashville", "raleigh", "charlotte", "fayetteville", "boston", "philadelphia", "pittsburgh",
  "phoenix", "honolulu", "mclean", "toronto", "ottawa", "montreal", "vancouver", "alberta",
  "mexico city", "sao paulo", "bogota", "buenos aires",
]);

/**
 * `XX-` prefixes, read off the raw segment before flattening.
 *
 * The corpus carries a Workday-style code family - `IN-Delhi-Remote`, `US-IN-Remote`,
 * `GB-London`, `IL-Israel-Remote`, `NO-Oslo-MSO`. Flattening destroys the distinction that
 * matters most: both `IN-Delhi-Remote` (India) and `US-IN-Remote` (Indiana) reduce to a token
 * `in`, and a vocabulary test cannot tell them apart. Anchoring on the raw prefix can - the
 * Indiana string leads with `US-`.
 *
 * `il` is Israel here and not Illinois for the same anchoring reason: the corpus's Illinois
 * codes are `US-IL-Chicago-MSO`, which lead with `US-`.
 */
const IST_CODES = new Set([
  "gb", "ie", "fr", "de", "nl", "be", "ch", "at", "es", "pt", "it", "gr", "se", "no", "dk",
  "fi", "pl", "cz", "hu", "ro", "lt", "lv", "ee", "tr", "il", "ae", "sa", "qa", "za", "ke",
  "ng", "eg", "jp", "kr", "cn", "hk", "tw", "sg", "my", "id", "ph", "th", "vn", "au", "nz",
]);

/**
 * One location segment to a tier.
 *
 * Segments are split on `;` and `|` and never on `,` - a comma joins the parts of one location
 * ("San Francisco, CA"), while both of the others separate distinct ones
 * ("San Francisco, CA | New York City, NY", "Bengaluru, India; Delhi, India; India").
 *
 * The order below is the rule set, and each step earns its position:
 *
 *  1. India first, because it is the only vocabulary that decides two tiers at once, and the
 *     `remote` token is what splits them.
 *  2. Global next: "worldwide"/"anywhere" is a positive signal wherever it appears.
 *  3. NOT remote means on-site somewhere that is not India, which is `relocate-sponsor`
 *     whatever the country. There is no need to know which country to know you would have to
 *     move to it.
 *  4. Remote with a stated region is where the two remote tiers separate. A remote requisition
 *     whose region excludes India is `out-of-reach` and NOT `relocate-sponsor`: an on-site req
 *     comes with an office to relocate into and a visa to go with it, and a US-remote req comes
 *     with neither - it requires you to already be there.
 *  5. Remote with NO recognizable region falls to `relocate-sponsor`, not to `india-remote`.
 *     One core requisition in the corpus has a bare `Remote` location, and most US companies
 *     mean "remote within the US" when they write it. Reading it as global would be the single
 *     cheapest way to inflate the reachable denominator, so a positive signal is required and a
 *     silent one does not count.
 */
function segmentTier(segment: string): ReachTier {
  const code = /^([A-Za-z]{2})-/.exec(segment)?.[1].toLowerCase() ?? null;
  const flat = flatten(segment);
  const remote = /\bremote\b/.test(flat);

  if (code === "in" || INDIA.test(flat)) return remote ? "india-remote" : "india-office";
  if (GLOBAL.test(flat)) return "india-remote";
  if (!remote) return "relocate-sponsor";

  if (code === "us" || AMERICAS_ANCHOR.test(flat)) return "out-of-reach";
  if ((code !== null && IST_CODES.has(code)) || IST_OVERLAP.test(flat)) return "emea-apac-remote";
  if (AMERICAS.test(flat)) return "out-of-reach";
  return "relocate-sponsor";
}

function locationTier(location: string | null): ReachTier {
  const segments = String(location ?? "").split(/[;|]/).map((s) => s.trim()).filter(Boolean);
  if (!segments.length) return "relocate-sponsor";
  // Best-of, in REACH_TIERS order. A posting that lists Sydney AND remote-Australia offers the
  // remote option; taking the worst segment would report the whole req as needing a move.
  let best = REACH_TIERS.length - 1;
  for (const segment of segments) best = Math.min(best, REACH_TIERS.indexOf(segmentTier(segment)));
  return REACH_TIERS[best];
}

/**
 * Clearance. `clearance` alone is not enough - "clearance" appears in benign compliance prose -
 * so every alternative names the programme, the state, or the requirement.
 */
const CLEARANCE =
  /\b(?:ts\s?\/\s?sci|top[- ]secret|sci eligib\w*|security clearance|active(?:ly held)? clearance|dod clearance|government clearance|clearance (?:is )?required|clearable|polygraph|counterintelligence|public trust)\b/;

/**
 * The US-person family. This is the clause the design singles out, and it is the reason
 * reachability cannot be read off `location`: these reqs are posted to `Washington, D.C.` and
 * `Maryland; Virginia; Washington, D.C.`, which look like ordinary on-site roles.
 *
 * ITAR and export control are in here rather than in a softer bucket because an export-
 * controlled role is a US-person role by operation of law, whatever the posting says about
 * sponsorship.
 */
const US_PERSON =
  /\b(?:u\.?\s?s\.?\s+persons?|united states persons?|u\.?\s?s\.?\s+citizens?(?:hip)?|united states citizens?(?:hip)?|citizenship (?:is )?required|must be a (?:us |u\.s\. )?citizen|lawful permanent resident|green card holder|itar|export[- ]control(?:led|s)?|ear99)\b/;

/**
 * A refusal to sponsor, always with the negation in the same sentence.
 *
 * `[^.]{0,40}` is what keeps the negation and the verb inside one sentence: without it,
 * "We do not discriminate. We sponsor visas." reads as a refusal. The period bound is also what
 * makes "we are able to sponsor" safe, since no negation precedes it.
 *
 * `\bnot?\b` covers both "no" and "not" and cannot fire inside "Note:", because the `\b` after
 * `not` requires a non-word character.
 */
const NO_SPONSORSHIP =
  /\b(?:not?|unable|cannot|can not|does not|do not|will not|won t|without|ineligible for)\b[^.]{0,40}\bsponsor(?:ship|ing|ed)?\b/;

/**
 * "You must already live in the US" - a region that excludes India, stated in the body rather
 * than in the location.
 *
 * A modal is required before the verb on purpose. "Our headquarters is based in the United
 * States" is a fact about the company, not a constraint on the candidate, and matching a bare
 * "based in the United States" would blocklist most US postings on a sentence about an office.
 *
 * Deliberately NOT here: "must be legally authorized to work in the United States". It is
 * standard on essentially every US requisition including the ones that do sponsor, so it
 * separates nothing - adding it collapses the whole `relocate-sponsor` tier into
 * `out-of-reach` and erases the distinction the tier exists to draw. The discriminating signal
 * is the explicit refusal above, not the boilerplate authorization line. That exclusion is
 * enforced by the verb list: residence verbs only, and `work` is not one of them.
 */
const US_ONLY_REGION =
  /\b(?:must|required to|need to|expected to|should)\b[^.]{0,40}\b(?:reside|residing|located|locate|based|live|living)\b[^.]{0,25}\b(?:in|within) the (?:united states|u\.?s\.?a?)\b|\bremote (?:with)?in the (?:united states|u\.?s\.?)\b/;

/**
 * The positive signals, and they are narrow on purpose.
 *
 * `\bglobal\b` on its own is worthless in a JD body - every one of these companies calls itself
 * global - so each alternative below ties the word to where the work happens. Same for India:
 * "our customers in India" is not an offer to employ you there, so only phrasings about hiring,
 * residence or an entity count.
 */
const GLOBAL_JD =
  /\b(?:work from anywhere|anywhere in the world|remote from anywhere|fully remote[^.]{0,30}\b(?:worldwide|globally|any country)|remote[^.]{0,20}\bworldwide|globally distributed team|hire (?:globally|anywhere))\b/;

const INDIA_JD =
  /\b(?:remote in india|based in india|reside in india|work from india|hiring in india|india[- ]based|our india (?:office|team|entity|subsidiary)|employer of record in india)\b/;

/**
 * Classify one posting into exactly one tier.
 *
 * `jdText` is nullable because it genuinely is: a Greenhouse stage-2 fetch can fail, and the
 * three location-only tiers still resolve without it. A null body never upgrades and never
 * blocks - it just leaves the location's own answer standing, which is the same understate-
 * rather-than-corrupt behaviour `skills: null` already has.
 *
 * Precedence:
 *
 *  1. A JD blocker wins outright, over any location. This is the design's explicit instruction
 *     and the reason the extraction is here at all: 22 of the 189 distinct core reqs sit in the
 *     Washington/Maryland/Virginia/Colorado Springs/Fayetteville belt, 11 of them Palantir's,
 *     and every one of them reads as an ordinary on-site role until you read the body.
 *  2. Otherwise the location decides, because it is the field the company filled in to say
 *     where the job is.
 *  3. A JD positive signal is allowed to resolve `relocate-sponsor` and nothing else.
 *     `relocate-sponsor` is this file's residual - "nothing stated either way" - so promoting
 *     out of it adds information. Promoting out of `out-of-reach` or across an explicit
 *     `Remote - US` would be the model of the JD overruling the company's own location field,
 *     and the location field is the more reliable of the two.
 */
export function classifyReach(posting: ReachPosting, jdText: string | null): ReachTier {
  // Whitespace collapsed, punctuation preserved: the patterns depend on `u.s.`, on the period
  // that bounds a sentence, and on the hyphen in `india-based`.
  const jd = jdText ? jdText.toLowerCase().replace(/\s+/g, " ") : "";

  if (jd && (CLEARANCE.test(jd) || US_PERSON.test(jd) || NO_SPONSORSHIP.test(jd) || US_ONLY_REGION.test(jd))) {
    return "out-of-reach";
  }

  const tier = locationTier(posting.location);
  if (tier === "relocate-sponsor" && jd && (GLOBAL_JD.test(jd) || INDIA_JD.test(jd))) return "india-remote";
  return tier;
}

/*
 * Where the corpus actually lands. Measured, not guessed: `classifyReach(req, null)` run over
 * the 189 distinct core requisitions in reports/market/index.json (745 stored reqs, 253 distinct
 * location strings, deduped by `dedupeKey` exactly as benchmark.ts does it). Counts are distinct
 * reqs; strings are verbatim.
 *
 * `jdText` is null in this table, because the stored index holds no bodies - that is the point
 * of the design. So this is the location-only half. The JD pass only ever moves reqs INTO
 * `out-of-reach` and out of `relocate-sponsor`, never the other way, so every number below is
 * an upper bound on its tier except the last.
 *
 *   tier              n    %    the strings that produce it
 *   -----------------------------------------------------------------------------------------
 *   india-remote      4    2    "Remote - India" (x4). Nothing else. No board in the corpus
 *                               writes a global-remote location.
 *   india-office      2    1    "Bengaluru, India", "Bengaluru"
 *   emea-apac-remote  1    1    "Finland; Remote - Denmark; Stockholm, Sweden" - one req, and
 *                               it only qualifies because one of its three segments is remote.
 *   relocate-sponsor 178   94   61 distinct strings, all on-site: "San Francisco, CA" (14),
 *                               "Washington, D.C." (12), "London" (11), "Singapore" (9),
 *                               "San Francisco, CA; New York, NY" (9), "Tokyo, Japan" (6),
 *                               "Seoul" (6), "Paris" (7), "United States" (6),
 *                               "US-CA-Menlo Park" (3), "Ottawa", "Montréal", "Abu Dhabi",
 *                               "PL-Warsaw-Lixa C", "Redwood City, CA (Hybrid)",
 *                               "Denver, Colorado; West Coast - United States" (a remote US
 *                               region, but it also names a Denver office to move to) - and
 *                               the single bare "Remote", which is here rather than in
 *                               india-remote for the reason `segmentTier` step 5 gives.
 *   out-of-reach      4    2    remote with a region that excludes India, and only that:
 *                               "Remote - Texas", "Canada (Remote)",
 *                               "Remote - California; Remote - Oregon; Remote - Washington",
 *                               "Remote - California; Remote - Colorado; Remote - Illinois;
 *                               Remote - Massachusetts; Remote - New York; Remote - Oregon;
 *                               Remote - Texas; Remote - Washington"
 *
 * The shape to take from it: this market posts offices, not regions. 94% of core reqs name a
 * city and nothing else, which is why `relocate-sponsor` is a residual rather than a finding -
 * and why the JD pass is the half that does the real work. 22 of those 178 are in the US
 * clearance belt and will land in `out-of-reach` the first time this runs with bodies attached.
 */
