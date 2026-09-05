# Lumen · Senior FDE Dashboard

A Vercel-ready command center built from `Rasul's Senior FDE Plan.xlsx`.

## Naming

- GitHub repository: `lumen-fde`
- Vercel project: `lumen-fde`
- Intended Vercel URL: `https://lumen-fde.vercel.app`

The final URL depends on the Vercel account/team slug and availability. GitHub Actions runs a production build on pushes and pull requests.

The workbook is normalized into `data/workbook.json`; replace that snapshot from the source workbook when the plan changes. The original workbook is retained at `data/source.xlsx`.

The private study library is represented by `data/library-context.json`; source PDFs stay on the local machine. The Ask Lumen route sends only the active plan context and library map to MiniMax. The daily Vercel cron requires `MINIMAX_API_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, and a verified `RESEND_FROM_EMAIL`.

```bash
npm install
npm run dev
```
