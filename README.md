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

The deployed app does not currently expose a custom MCP server. Claude and Codex can work with the same context through the repository files, GitHub MCP or CLI access, and the Vercel API when those tools are configured in the client.

The daily Vercel cron requires `MINIMAX_API_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, and a verified `RESEND_FROM_EMAIL`.

```bash
npm install
npm run dev
```
