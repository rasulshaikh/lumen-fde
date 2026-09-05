# Rasul's Senior FDE Dashboard

A Vercel-ready command center built from `Rasul's Senior FDE Plan.xlsx`.

## Naming

- GitHub repository: `rasul-senior-fde-dashboard`
- Vercel project: `rasul-senior-fde-dashboard`
- Intended Vercel URL: `https://rasul-senior-fde-dashboard.vercel.app`

The final URL depends on the Vercel account/team slug and availability. GitHub Actions runs a production build on pushes and pull requests.

The workbook is normalized into `data/workbook.json`; replace that snapshot from the source workbook when the plan changes. The original workbook is retained at `data/source.xlsx`.

```bash
npm install
npm run dev
```
