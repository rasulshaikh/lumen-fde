# Lumen · Senior FDE Dashboard

A Vercel-ready command center built from `Rasul's Senior FDE Plan.xlsx`.

## Naming

- GitHub repository: `lumen-fde`
- Vercel project: `lumen-fde`
- Intended Vercel URL: `https://lumen-fde.vercel.app`

The final URL depends on the Vercel account/team slug and availability. GitHub Actions runs a production build on pushes and pull requests.

The workbook is normalized into `data/workbook.json`; replace that snapshot from the source workbook when the plan changes. The original workbook is retained at `data/source.xlsx`.

The private study library is represented by `data/library-context.json`; source PDFs stay on the local machine. Repository learning references are summarized in `data/repository-context.json`, and the Shell Mastery lesson is in `data/lesson-context.json`. The Ask Lumen route sends the active plan context plus these indexed maps to MiniMax. When `GITHUB_TOKEN` is configured, every successful Ask response is saved as a Markdown file under `reports/asks/` through the GitHub Contents API. Claude and Codex can then read the reports after `git pull`.

## CLI and API connection

Vercel remains the hosted runtime. Use the Vercel CLI for deployment, environment variables, logs, and protected smoke tests. Use the GitHub CLI or GitHub Contents API for the durable Markdown report layer:

```bash
vercel logs https://lumen-fde.vercel.app
vercel env ls production
git pull origin main
rg --files reports/asks
```

Render hosts the protected Lumen MCP bridge at `https://lumen-fde.onrender.com/mcp`. The Render service is named `lumen-mcp`; its URL slug remains `lumen-fde`. It exposes plan and library context, direct MiniMax Ask, SurfSense semantic search, Ask report access, study notes, progress history, assessment scoring, analytics, audit logs, and a connection map. GitHub is the durable source for reports, notes, progress events, and durable audit records; Vercel is the dashboard and MiniMax-backed Ask UI.

For a remote MCP client, use the Render `/mcp` URL with an `Authorization: Bearer <MCP_API_KEY>` header. The same service also provides `GET /healthz`. Add `SURFSENSE_API_KEY`, `SURFSENSE_WORKSPACE_ID`, and optionally `SURFSENSE_API_URL` on Render to enable live Google Search and other SurfSense connectors; without them, semantic search safely falls back to GitHub repository search.

The MCP is intentionally protected and rate-limited to 30 requests per minute per client. Mutating study actions create an audit record. The quick check has deterministic answer keys; weekly, monthly, and quarterly assessments accept rubric ratings and return weighted scores with next-step guidance. Progress is append-only in GitHub and can be read through `get_progress_history` and `get_progress_analytics`.

Claude and Codex can also work with the same context through the repository files, GitHub MCP or CLI access, and the Vercel API when those tools are configured in the client.

The daily Vercel cron requires `MINIMAX_API_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, and a verified `RESEND_FROM_EMAIL`.

```bash
npm install
npm run dev
```
