/**
 * GTM path tests. Run with: npx tsx lib/gtm/path.test.mts
 *
 * The page and the Ask context are the same data. These pin the two ways that pairing goes
 * wrong: a context string that names a catalog the tab does not have, and a stored mark that
 * survives a shape the page never wrote.
 */
import {
  GTM_MODULES,
  gtmPageContext,
  moduleById,
  parseGtmChecks,
  parseGtmDrafts,
  parseGtmStatuses,
} from "./path.ts";

let fails = 0;
const ck = (name: string, condition: boolean, extra = "") => {
  if (!condition) { fails++; console.log(`  FAIL ${name}${extra ? ` ${extra}` : ""}`); }
  else console.log(`  ok   ${name}`);
};

const ready = GTM_MODULES[0];
const outline = GTM_MODULES[1];

console.log("the path is one written module and one outline");
{
  ck("two modules", GTM_MODULES.length === 2);
  ck("first is Map the revenue system, and it is ready", ready?.kind === "ready" && ready.title === "Map the revenue system");
  ck("second is the HubSpot contract, and it is an outline", outline?.kind === "outline" && outline.title === "Build the HubSpot data contract");
  ck("the outline names the module it follows", outline?.kind === "outline" && outline.follows === "Map the revenue system");
  if (ready?.kind === "ready") {
    ck("three acceptance checks", ready.acceptance.length === 3);
    ck("the review question is the bad-leads question", /bad leads/.test(ready.reviewQuestion));
    ck("artifacts are the three the module names", ready.artifacts.map((artifact) => artifact.file).join(",") === "revenue-map.md,metric-dictionary.csv,lifecycle diagram");
  }
}

console.log("stored marks that are not this path are dropped");
{
  ck("garbage is empty", Object.keys(parseGtmStatuses("nope")).length === 0);
  ck("unknown status dropped", !("map-the-revenue-system" in parseGtmStatuses('{"map-the-revenue-system":"Finished"}')));
  ck("unknown module dropped", !("invented" in parseGtmStatuses('{"invented":"Done","map-the-revenue-system":"Done"}')));
  ck("a real mark is kept", parseGtmStatuses('{"map-the-revenue-system":"Done"}')["map-the-revenue-system"] === "Done");
  ck("non-string drafts dropped", !("map-the-revenue-system" in parseGtmDrafts('{"map-the-revenue-system":12}')));
  ck("a real draft is kept", parseGtmDrafts('{"map-the-revenue-system":"measure first"}')["map-the-revenue-system"] === "measure first");
  ck("checks of the wrong length are dropped", !("map-the-revenue-system" in parseGtmChecks('{"map-the-revenue-system":[true]}')));
  ck("checks for an outline module are dropped", !("hubspot-data-contract" in parseGtmChecks('{"hubspot-data-contract":[true]}')));
  ck("three booleans are kept", parseGtmChecks('{"map-the-revenue-system":[true,false,true]}')["map-the-revenue-system"]?.join(",") === "true,false,true");
}

console.log("Ask context names the tab and the selected module, and nothing that is not on screen");
{
  const unread = gtmPageContext({ moduleId: ready.id, statuses: {}, marksKnown: false });
  ck("names the tab before marks have loaded", unread.startsWith("GTM / RevOps tab."));
  ck("names the selected module", unread.includes("Selected module: Map the revenue system (map-the-revenue-system)."));
  ck("does not call unread marks none", unread.includes("not read yet") && !/Learner-marked complete: none/.test(unread));

  const none = gtmPageContext({ moduleId: ready.id, statuses: { "map-the-revenue-system": "In progress" }, marksKnown: true });
  ck("none complete is said only once marks are known", /Learner-marked complete: none\./.test(none));
  ck("the review question is in the context because it is on the page", none.includes(ready.kind === "ready" ? ready.reviewQuestion : ""));
  ck("acceptance checks are in the context", ready.kind === "ready" && ready.acceptance.every((check) => none.includes(check)));

  const done = gtmPageContext({
    moduleId: outline.id,
    statuses: { "map-the-revenue-system": "Done" },
    marksKnown: true,
  });
  ck("a finished module is named", done.includes("Learner-marked complete: Map the revenue system."));
  ck("the outline says it is an outline", done.includes("outline only"));
  ck("the outline does not carry the previous module's review question", ready.kind === "ready" && !done.includes(ready.reviewQuestion));

  const unknown = gtmPageContext({ moduleId: "not-a-module", statuses: {}, marksKnown: true });
  ck("an unknown id is said to be unknown", unknown.includes("Selected module: none."));

  const invented = [/supplied server-side/i, /catalogs are supplied/i, /full module catalog/i, /the video list includes/i];
  for (const text of [unread, none, done, unknown]) {
    ck("does not claim a catalog exists", invented.every((pattern) => !pattern.test(text)));
  }
  ck("the refusal to invent a catalog is itself in the context", none.includes("Do not invent one."));
  ck("the denial names the catalogs that are absent", none.includes("no video catalog, reading list, or source catalog"));
  ck("moduleById misses an unknown id", moduleById("not-a-module") === null);
}

if (fails) {
  console.error(`\n${fails} failed`);
  process.exit(1);
}
console.log("\nall passed");
