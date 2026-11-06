# Ask Lumen retrieval and workspace updates

Ask Lumen can search private workspace passages, choose a follow-up query and cite the excerpts it actually used. This extends the existing MiniMax-M3 integration; it does not introduce a new provider, vector database, background agent or paid service.

## Sources and limits

The server indexes 4,323 base passages from plan rows, detailed syllabus parts, failure modes, interview questions, proof briefs, book reference maps, repository maps and the two GTM modules. Long passages are chunked for retrieval. A cached local token index, BM25 scorer, title weighting and small query expansions provide the initial search. The model can reformulate the query and call `search_workspace` when more evidence is needed.

Book maps contain titles, topics and chapter names, **not PDF text**. Lumen cannot honestly quote a book page or claim to have read the private PDFs. Repository maps are curated references, not cloned source code.

Dated market data and available personal evidence are read at request time. Dashboard progress is labelled client-reported. Recorded note/answer retrieval uses fixed GitHub directories (`reports/notes` and `reports/asks`), examines up to 80 recent filenames per directory and reads at most three matching files per search. A cap or failed read is disclosed; missing evidence is never proof that no work exists. There is no arbitrary path or URL argument.

Web search stays opt-in through the existing toggle. Its snippets can be cited, but the agent cannot turn on external browsing by itself. Stored web brief context remains dated reference context. Retrieved content and prior answers are data, not tool instructions.

## Agent loop and evidence

Each request makes an initial search, then permits at most two model search rounds and four allowed search calls, followed by a final answer turn. The hard maximum is three model requests, each capped at 3,600 completion tokens, within a shared 55-second request budget. Independent context reads start together. At most 16 unique passages and 20,000 excerpt characters enter the retrieval evidence set. The model's internal reasoning is kept server-side only when the provider needs it for the next turn.

The only tool is read-only workspace search. It cannot change progress, run shell commands, fetch a model-supplied URL or open credential files. The route's existing answer-report and companion-memory bookkeeping still happens after a successful answer; the retrieval tool itself has no write operation.

Source labels `[S1]`, `[S2]` are checked against the evidence supplied to that answer. Unknown labels are replaced with an unverified-source marker. Clicking a citation opens its source excerpt. If a reply has no validated citations, the UI explicitly calls it general guidance. Label validation proves that a cited passage was supplied; it is not automated proof that every generated claim is entailed by it. Inspect sources for consequential decisions.

The implementation follows the provider's [OpenAI-compatible tool schema](https://platform.minimax.io/docs/api-reference/text-openai-api) and [tool-use conversation rules](https://platform.minimax.io/docs/guides/text-m3-function-call). It keeps the existing M3 model and disabled thinking mode rather than changing model families during this release.

## Shared workspace state

`/api/workspace` stores validated preferences, mock repetition counts and saved GTM modules in `reports/workspace/state.json`. It is protected by the same owner-session and same-origin mutation policy as the rest of the app.

Each field has a revision. Updating one field preserves unrelated fields; a stale edit of the same field returns a conflict instead of replacing another device's work. Identical retries are idempotent. The client retains failed writes on the device and offers retry. Conflicts require loading the latest copy before editing again.

Mock counts are editable within each practice loop's target and use stable keys based on the mock type. Theme, weekly hours, career aim and display mode sync after an edit. GTM keeps unsaved drafts on the device; Save module explicitly syncs the module's answer, checks and status. A different cloud version does not silently erase an unsaved device draft: the user chooses which copy to keep. The active session timer remains device-local until explicitly recorded.

This is a private workspace, not real-time collaborative editing. Another device reads the saved state when its workspace mounts or reconnects; there is no live push channel between open tabs. Keep provider access and the GitHub contents token under owner control. A missing token or inaccessible store pauses cloud writes and leaves a visible sync status.

## UI changes

- Plan pages show 12 topics, with a current-topic shortcut, filters, previous/next controls and deep-link support.
- Market row references wrap on narrow screens; phone controls use larger interaction areas.
- Ask Lumen uses one visible name, restores keyboard focus and shows source excerpts.
- Large display mode is available under More. Above 1000 CSS pixels it increases type, control size and content width. Phone layout stays compact. This is a readability mode, not a Smart TV or remote-control certification.
- Both GTM modules now include practical material and acceptance criteria. The HubSpot contract is an exercise schema; it does not connect to or modify a live CRM.

## Verification

`npm run test:rag` covers corpus relevance, follow-up tools, citation validation, unknown tools, injection boundaries, cancellation, loop limits, conditional workspace writes, retries, conflicts, pagination and shared mock counts. Existing test scripts, lint, build and documentation checks remain release gates.

Browser verification uses a local production build with isolated GitHub and model fixtures, so no fake production learning records are created. Live MiniMax behavior must also be checked in the approved deployed environment: the connected environment tools do not expose the model credential for an isolated local live-provider test. Do not describe a fixture response as live provider validation.

## Visual and transport verification in 1.3.0

The dashboard now includes a linked Learn / Build / Test / Ship diagram. The graphic and transition effects use opacity and transform, are brief, and honor reduced-motion preferences. Assistant replies render a restricted Markdown subset with escaped raw HTML, safe links, code, tables and validated citation targets.

Retrieval indexes are reused for unchanged passages and invalidated when passage content or metadata changes. A local nine-query comparison measured mean warm retrieval at 360 ms before indexing and 39 ms after; the three compared query rankings were identical. This is a local microbenchmark, not an end-to-end provider latency promise. The 13-query evaluation finds each expected topic in the top five, including shell, Kubernetes, IAM, SQL, RAG, ACLs, inference and SSO.

Recorded searches report how many candidates were listed and files inspected, and disclose record truncation. The tool never claims a bounded search proves that no work exists. This reduces a source of misleading absence claims; citation-label validation still does not establish factual entailment for every generated sentence.

MCP uses stateless JSON responses with an explicit set of supported protocol versions, byte-based request limits and tool-schema validation. It handles malformed JSON, null bodies, unsupported methods, notifications, ping and legacy batches capped at four concurrent messages without crashing. Standalone GET/SSE returns 405. Browser origins are limited to `MCP_ALLOWED_ORIGINS` (default lumenfde.com and lumen-fde.vercel.app); native clients with no Origin still require the bearer credential. The health endpoint exposes version, revision and configured answer mode, not secrets. Unmatched progress topics are rejected before writing. A partially configured Ask proxy fails clearly, and a direct-model fallback is labelled context-only.

Transport rules were checked against the [MCP transport specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports). The server advertises support through 2025-11-25; it does not pretend to support newer revisions by echoing an arbitrary requested version.

`npm run test:pipelines` covers real MCP read tools, a local HTTP Ask proxy, source and warning preservation, malformed requests, argument checks, origin rejection and UTF-8 body limits, plus answer-rendering safety. All mutations remain isolated in test fixtures. Full authenticated live MCP calls require an existing configured MCP credential; a health check and unauthenticated 401 alone do not verify them.
