# Design

## Direction

One product language across landing and the authenticated app.

**Lumen = light** everywhere by default: near-white canvas (`#FAFAF8`), white surfaces, Vercel-grade sparseness (hairline chrome, generous air, sharp intentional type). Brand accent is teal / light green `#47be98` on landing, login, and app. Lamp ochre `#B89435` is reserved for optional earned marks (`--brass`) only — not the public site’s primary colour. Structure may reference Unkapped’s discipline — **never** Unkapped’s brand (no Basalt/Daylight clone).

An optional dark field-notebook theme remains behind the theme toggle (`data-theme="dark"` / `localStorage lumen-theme=dark`). It is not the default post-login experience.

## Naming

Unkapped structure (reference only), Lumen language.

| Unkapped | Lumen |
|---|---|
| Ceiling Audit | **Light Audit** |
| Growth Systems | **Study System** |
| AI Transformation | **Market System** |
| Find the cap / Remove it / Hold the level | **Find the gap / Close it / Hold the level** |

Product: **Lumen**. Programme: **FDE Study System**. Site: **lumenlab.tech**.

## Palette

### Landing (light / luminous)

```css
--lp-canvas:#FAFAF8; --lp-canvas-warm:#F5F3EE; --lp-ink:#0A0A0A;
--lp-muted:#6B6B6B; --lp-paper:#FFFFFF;
--lp-lamp:#47be98; --lp-lamp-deep:#3aaa87; --lp-lamp-soft:#1f8a6a;
--lp-line:rgba(10,10,10,.08);
```

Do not introduce Unkapped Basalt / Daylight. Accent is teal (light green) — same as login/app.

### App (default light — shared with landing canvas)

```css
--bg:#FAFAF8; --surface:#FFFFFF; --surface-strong:#F5F3EE;
--ink:#0A0A0A; --muted:#6B6B6B;
--accent:#47be98; --accent-text:#0F766E; --brass:#B89435;
```

Optional dark (toggle only): cool neutral ground `#0A0A0A` / `#141414` surfaces — no sepia/umber yellow cast — with teal accent `#47be98` / `#6ee7b7`.

## Typography

Host Grotesk for the public landing (one family; clean grotesque suitable for Vercel-like UI — not an Unkapped poster face). Archivo for dashboard display, Schibsted Grotesk for dashboard body, JetBrains Mono for data.

## Components

Landing: fixed hairline nav on light glass, full-viewport light hero with hero-level **Lumen** wordmark (soft lamp glow, no purple), left-stacked headline + lede + dual CTAs, paper / warm-canvas bands, lamp close band, numbered capabilities, three-step method, marquee. Footer: `lumenlab.tech`. Dashboard: top bar, tabs, metric rows, progress bars, tables.
