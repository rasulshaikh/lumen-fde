# Lumen FDE

**Senior Forward Deployed Engineer command center** — plan, curriculum, practice, market scan, and Ask, wired for real GTM / RevOps delivery work.

Live: **[rasul-senior-fde-dashboard.vercel.app](https://rasul-senior-fde-dashboard.vercel.app)**

Built as the operating surface for a senior FDE track: what to learn, what to ship, how to prove it, and how to brief agents (Claude / Codex / MCP) from the same source of truth.

---

## What it is

| Surface | Purpose |
| --- | --- |
| **Plan** | Senior FDE syllabus from the workbook — topics, outcomes, proof-of-work |
| **Curriculum** | Deep per-topic syllabi (`data/curriculum/*.json`) with resources and failure modes |
| **Ask Lumen** | Context-grounded answers over plan + library + repo maps (MiniMax-backed) |
| **Market / Paths** | Market scan and GTM path views for FDE positioning |
| **MCP bridge** | Protected remote MCP for agents (`get_syllabus`, progress, Ask, notes) |
| **Reports** | Durable Markdown ask/progress artifacts in-repo for agent follow-up |

Stack: **Next.js · TypeScript · Vercel · MCP · GitHub Contents API**.

---

## Why it exists

Most “learning dashboards” are passive lists. Lumen is built like an FDE engagement:

1. **Operate from one plan** (`data/workbook.json` is source of truth)
2. **Ground answers in that plan** (Ask + MCP, not generic chat)
3. **Leave artifacts** agents and humans can pull (`reports/`)
4. **Stay deployable** (Vercel dashboard + optional Render MCP)

---

## Quick start

```bash
npm install
cp .env.example .env.local   # fill keys as needed
npm run dev
```

Production dashboard: Vercel. MCP bridge (optional): Render service at `/mcp` with bearer auth.

---

## Repo map

```
app/           Next.js UI + API routes (plan, curriculum, ask, market, …)
data/          workbook, curriculum, library/repo/lesson context
mcp/           MCP server surface
reports/       durable Ask / progress markdown
scripts/       curriculum build + URL verify
```

See `PRODUCT.md` and `DESIGN.md` for product/design detail. Ops notes (cron, SurfSense, env vars) live in `README.ops.md`.

---

## Profile / proof

- Dashboard: https://rasul-senior-fde-dashboard.vercel.app  
- Author: [Rasul Shaikh](https://github.com/rasulshaikh) — Senior FDE · AI GTM systems  

---

MIT-style personal project unless otherwise noted in `LICENSE`.
