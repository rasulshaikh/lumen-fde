"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppState } from "@/components/AppState";

/**
 * /design - the living style guide.
 *
 * THE ONE RULE OF THIS FILE: it may not contain a colour, a size or a ratio. Everything printed
 * below is read out of the running document with `getComputedStyle` at the moment you look at it.
 *
 * That rule is not fussiness. This project has been bitten three times by a document that
 * described the code instead of reading it - a doc that claimed 13 MCP tools while the server
 * served 18, a checker that read a file the routing migration had deleted, a sidebar that said 34
 * workflows next to 41. A style guide with `#b89435` typed into it is the same failure with a
 * swatch on it: the moment `globals.css` is re-solved, this page starts lying, and it lies
 * confidently, in the one place a reader would go to check.
 *
 * So the swatches are painted with `var(--token)` and the hex beside them is what the browser
 * says it painted. The type specimens are real elements carrying the app's real classes, and
 * their sizes are measured off the boxes. The five floors are measured between real rendered
 * panels, chips and controls further down this same page - not between two constants.
 *
 * The consequence worth stating: if someone breaks the palette, this page goes red on its own.
 */

/* ------------------------------------------------------------------------------------------
   Colour maths. WCAG 2.1 relative luminance and contrast ratio, nothing else.
   ------------------------------------------------------------------------------------------ */

type RGB = [number, number, number];

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: RGB) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a: RGB, b: RGB) => {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/**
 * Parse whatever `getComputedStyle` hands back for a colour.
 *
 * Chrome returns `rgb(32, 24, 16)` / `rgba(12, 7, 2, 0.55)` for the hex and rgba() values this
 * app declares; `color(srgb 0.12 0.09 0.06)` is handled too because a future re-solve in OKLCH
 * would serialise that way, and a style guide that silently prints "-" for the whole palette the
 * day the palette moves to a wider gamut would be worse than useless.
 */
function parseColor(css: string): { rgb: RGB; alpha: number } | null {
  const nums = css.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!nums || nums.length < 3) return null;
  const [a, b, c] = nums.slice(0, 3).map(Number);
  const alpha = nums.length > 3 ? Number(nums[3]) : 1;
  const scaled = css.startsWith("color(") ? ([a * 255, b * 255, c * 255] as RGB) : ([a, b, c] as RGB);
  return { rgb: scaled.map((n) => Math.round(Math.min(255, Math.max(0, n)))) as RGB, alpha };
}

/** Alpha over an opaque backdrop, so a scrim can be measured rather than hand-waved. */
const composite = (fg: RGB, alpha: number, bg: RGB): RGB =>
  fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as RGB;

const hex = ([r, g, b]: RGB) => "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
const ratio = (n: number) => `${n.toFixed(2)}:1`;

/* ------------------------------------------------------------------------------------------
   The catalogue. Token names and the surfaces each one is ACTUALLY used on - which is the part
   worth writing down, because it is the part `globals.css` cannot tell you. No values here.
   ------------------------------------------------------------------------------------------ */

type Ground = { token: string; label: string };
const CANVAS: Ground = { token: "--bg", label: "canvas" };
const CARD: Ground = { token: "--surface", label: "card" };
const CHIP: Ground = { token: "--surface-strong", label: "chip" };
const TINT: Ground = { token: "--accent-soft", label: "tint" };
const FILL: Ground = { token: "--accent", label: "accent fill" };

type Measure = Ground & { floor: number | null };
const on = (g: Ground, floor: number | null): Measure => ({ ...g, floor });

type Swatch = { token: string; role: string; on: Measure[] };
type Group = { title: string; note: string; rows: Swatch[] };

/** 4.50 is AA body text. 3.00 is a fill, a boundary, or text at 24px and above. */
const AA = 4.5;
const LARGE = 3;

const GROUPS: Group[] = [
  {
    title: "Grounds",
    note:
      "Four surfaces. A panel is identified by the ruling stopping, not by a shadow, so the step from canvas to card is load-bearing - it is floor 1 below. The tint is the only coloured ground in the app.",
    rows: [
      { token: "--bg", role: "The ruled canvas. Nothing is painted under it.", on: [] },
      { token: "--surface", role: "Panel, metric, book row, the Quaere dock, an input.", on: [on(CANVAS, null)] },
      { token: "--surface-strong", role: "A chip, a nested row, a progress track, a hovered card.", on: [on(CARD, null)] },
      { token: "--accent-soft", role: "Quaere's reading, the priority chip, a Read tag.", on: [on(CARD, null), on(CANVAS, null)] },
    ],
  },
  {
    title: "Ink",
    note:
      "Text. Every entry carries the 4.50 AA body floor on every surface it is set on: nothing in this app takes the large-text exemption, because nothing in this app that matters is set at 24px.",
    rows: [
      { token: "--ink", role: "Headings, a row's first cell, a lead line.", on: [on(CARD, AA), on(CANVAS, AA), on(CHIP, AA)] },
      { token: "--ink-2", role: "Table cells, chip labels, the reference block.", on: [on(CARD, AA), on(CHIP, AA)] },
      { token: "--muted", role: "Every eyebrow, caption, meta line and detail line.", on: [on(CARD, AA), on(CANVAS, AA), on(CHIP, AA)] },
      { token: "--accent-text", role: "Ochre below 24px: an earned numeral, a resource link, a counter.", on: [on(CARD, AA), on(CANVAS, AA), on(CHIP, AA), on(TINT, AA)] },
      { token: "--teal", role: "A correct answer, a cleared skill, a reachable segment.", on: [on(CARD, AA), on(CHIP, AA)] },
      { token: "--danger", role: "A wrong answer, a warning line, a failed floor.", on: [on(CARD, AA), on(CHIP, AA)] },
      { token: "--on-accent", role: "The only thing ever set on the accent fill.", on: [on(FILL, AA)] },
    ],
  },
  {
    title: "Structure",
    note:
      "Lines. The hairline is the second limb of floor 1 - where the fill step is small, the edge is what says panel. The two rulings are texture and are measured against the ground below, under the contract.",
    rows: [
      { token: "--line", role: "Panel hairline, table rule, the divider between two entries.", on: [on(CANVAS, null), on(CARD, null)] },
      { token: "--line-strong", role: "Control boundary and focus ring. Floor 5.", on: [on(CARD, LARGE), on(CANVAS, LARGE)] },
      { token: "--grid", role: "The minor ruling, at the 24px line box.", on: [on(CANVAS, null)] },
      { token: "--grid-strong", role: "The major ruling, every fourth cell.", on: [on(CANVAS, null)] },
    ],
  },
  {
    title: "Accent",
    note:
      "One accent, ochre, reserved for what was earned: a readiness gain, a shipped artifact, a cleared skill, and the single CTA per view. Never chrome, never decoration. As a fill it carries 3.00; as text below 24px it is not used at all - that is what --accent-text is for.",
    rows: [
      { token: "--accent", role: "Progress fill, CTA ground, the metric numeral at 28px.", on: [on(CARD, LARGE), on(CANVAS, LARGE)] },
    ],
  },
];

/**
 * The legacy aliases. ~50 rules still name --primary and --brass; both were kept pointing at the
 * solved tokens so no rule could hold an old value. Printed here as a measured equality rather
 * than a claim, because "it resolves to the accent" is exactly the kind of sentence that stops
 * being true quietly.
 */
const ALIASES: { token: string; target: string }[] = [
  { token: "--primary", target: "--accent" },
  { token: "--primary-hover", target: "--accent-text" },
  { token: "--primary-soft", target: "--accent-soft" },
  { token: "--brass", target: "--accent-text" },
];

/** Alpha over the ground. No contrast floor applies to a shadow or a scrim, so none is printed. */
const ALPHA_TOKENS = [
  { token: "--scrim", role: "The horizontal-overflow cue on a scrolling table." },
];

/* ------------------------------------------------------------------------------------------
   Type. The specimens are real elements with the app's real classes; the numbers beside them
   are measured off those boxes after layout.
   ------------------------------------------------------------------------------------------ */

type Specimen = {
  key: string;
  role: string;
  /** Rendered by the component below; the key ties the rendered element to its measured row. */
  sample: string;
};

const SCALE: Specimen[] = [
  { key: "hero", role: "Hero title - fluid, clamped. Measured off the live header above.", sample: "" },
  { key: "h1", role: "Page title", sample: "Build proof, not just knowledge." },
  { key: "h2", role: "Panel title", sample: "Target calibration" },
  { key: "h3", role: "Row title, section head", sample: "Retrieval-augmented generation" },
  { key: "body", role: "Body copy. 16 at 1.5 - a 24px line box, which is the ruling.", sample: "" },
  { key: "lead", role: "Lead line - the first sentence of a block", sample: "Twenty-seven rows clear a skill the market asked for this week." },
  { key: "detail", role: "Detail line - the sentence under it", sample: "Measured against 412 requisitions scanned in the last seven days." },
  { key: "meta", role: "Meta, caption, panel head right-hand side", sample: "2,236 syllabus parts" },
  { key: "eyebrow", role: "Eyebrow - mono, uppercase, the label above a block", sample: "Private study context" },
  { key: "data", role: "A measured value - mono, tabular", sample: "" },
  { key: "code", role: "A command or a key - mono", sample: "" },
];

const FACES = [
  { token: "--font-display", role: "Display - headings and the brand. Intentionally irregular; made from what is at hand." },
  { token: "--font-body", role: "Body and UI - drawn to disambiguate every letterform, for a wall of dense rows." },
  { token: "--font-data", role: "Data only - numerals, row references, keys, shell output. Nothing else." },
];

/* ------------------------------------------------------------------------------------------
   The measured state.
   ------------------------------------------------------------------------------------------ */

type Reading = { hex: string; rgb: RGB; alpha: number; resolved: boolean };
type Floor = { step: string; floor: string; measured: string; detail: string; pass: boolean };
type FaceReading = { token: string; role: string; family: string; loaded: boolean };
type ScaleReading = { family: string; size: string; leading: string; weight: string; tracking: string };

type Snapshot = {
  theme: string;
  tokens: Record<string, Reading>;
  floors: Floor[];
  ruling: { minor: number; major: number; body: number };
  faces: FaceReading[];
  scale: Record<string, ScaleReading>;
};

/** The sentinel the probe inherits. If a token fails to resolve, the probe lands back on this. */
const SENTINEL = "rgb(1, 2, 3)";
/** A family that cannot exist, for the advance-width test that catches a face silently not loading. */
const ABSENT = "__lumen_absent_family__";

export function DesignGuide() {
  const { theme, toggleTheme } = useAppState();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  // The tables below are the only new layout on this page, and their column widths live here
  // rather than in globals.css because this component owns them - so the breakpoint has to live
  // here too. Below 700px every table collapses to a stack; a 108px value column beside two
  // fluid ones is unreadable on a phone.
  const [narrow, setNarrow] = useState(false);

  const probe = useRef<HTMLSpanElement | null>(null);
  const rig = useRef<HTMLDivElement | null>(null);
  const specimens = useRef<Record<string, HTMLElement | null>>({});
  const setSpecimen = (key: string) => (el: HTMLElement | null) => { specimens.current[key] = el; };

  const measure = useCallback(() => {
    const pen = probe.current;
    const panel = rig.current;
    if (!pen || !panel) return;

    /* --- tokens ------------------------------------------------------------------------- */
    const read = (token: string): Reading => {
      pen.style.color = "";
      pen.style.color = `var(${token})`;
      const raw = getComputedStyle(pen).color;
      const parsed = parseColor(raw);
      // The probe inherits SENTINEL from its wrapper, so a token that does not resolve leaves the
      // declaration invalid at computed-value time and the sentinel shows through. That is the
      // difference between "this token is black" and "this token does not exist".
      const resolved = !!parsed && raw.replace(/\s+/g, " ") !== SENTINEL;
      return parsed
        ? { hex: hex(parsed.rgb), rgb: parsed.rgb, alpha: parsed.alpha, resolved }
        : { hex: "-", rgb: [0, 0, 0], alpha: 1, resolved: false };
    };
    const tokens: Record<string, Reading> = {};
    const want = new Set<string>();
    GROUPS.forEach((g) => g.rows.forEach((r) => { want.add(r.token); r.on.forEach((m) => want.add(m.token)); }));
    ALIASES.forEach((a) => { want.add(a.token); want.add(a.target); });
    ALPHA_TOKENS.forEach((a) => want.add(a.token));
    [CANVAS, CARD, CHIP, TINT, FILL].forEach((g) => want.add(g.token));
    want.add("--grid");
    want.add("--grid-strong");
    want.forEach((t) => { tokens[t] = read(t); });

    /* --- the five floors, measured between the real elements in the rig below ----------- */
    const el = (sel: string) => panel.querySelector<HTMLElement>(sel);
    const colourOf = (node: Element | null, prop: string, fallback: RGB): RGB => {
      if (!node) return fallback;
      const parsed = parseColor(getComputedStyle(node).getPropertyValue(prop));
      return parsed ? parsed.rgb : fallback;
    };

    const canvas = colourOf(document.body, "background-color", tokens["--bg"].rgb);
    const card = colourOf(panel, "background-color", tokens["--surface"].rgb);
    const chip = colourOf(el(".rig-chip"), "background-color", tokens["--surface-strong"].rgb);
    const ink = colourOf(el(".rig-ink"), "color", tokens["--ink"].rgb);
    const muted = colourOf(el(".rig-muted"), "color", tokens["--muted"].rgb);

    const edgeWidth = parseFloat(getComputedStyle(panel).borderTopWidth) || 0;
    const edge = colourOf(panel, "border-top-color", tokens["--line"].rgb);

    // Floor 5 is WCAG 1.4.11: a boundary must clear 3.00 against every colour adjacent to it.
    // Two controls, because they do not share a fill - the text input is on the card, the recall
    // textarea is on the canvas colour - and the floor is the worse of the four comparisons.
    const controls = [el(".rig-input"), el(".rig-textarea")].filter(Boolean) as HTMLElement[];
    const boundaries = controls.flatMap((c) => {
      const border = colourOf(c, "border-top-color", tokens["--line-strong"].rgb);
      const fillOf = colourOf(c, "background-color", card);
      return [contrast(border, fillOf), contrast(border, card)];
    });
    const boundary = boundaries.length ? Math.min(...boundaries) : 0;

    const fillStep = contrast(canvas, card);
    const edgeStep = contrast(edge, canvas);
    const floors: Floor[] = [
      {
        step: "canvas → card",
        floor: "≥ 1.25, or a hairline actually painted and measurably distinct (≥ 1.10)",
        measured: ratio(fillStep),
        detail: `fill step ${ratio(fillStep)} · hairline ${edgeWidth}px at ${ratio(edgeStep)} against the canvas`,
        // 1.1 was the exact regime that shipped broken for months, so accepting it here would make
        // this page go green on the failure it exists to catch. The solved hairline floor is 1.40.
        pass: fillStep >= 1.25 || (edgeWidth > 0 && edgeStep >= 1.4),
      },
      { step: "card → chip", floor: "≥ 1.20", measured: ratio(contrast(card, chip)), detail: "a chip, an input, a nested row against the panel it sits in", pass: contrast(card, chip) >= 1.2 },
      { step: "ink vs muted on card", floor: "≥ 1.70", measured: ratio(contrast(ink, muted)), detail: "a lead line against the detail line under it - the two must not read as one", pass: contrast(ink, muted) >= 1.7 },
      { step: "muted on card", floor: "≥ 4.50 (AA body)", measured: ratio(contrast(muted, card)), detail: "the quietest text in the app, on the surface it is quietest on", pass: contrast(muted, card) >= 4.5 },
      { step: "control boundary", floor: "≥ 3.00", measured: ratio(boundary), detail: "worst of two controls against both their own fill and the panel behind them", pass: boundary >= 3 },
    ];

    const ruling = {
      minor: contrast(tokens["--grid"].rgb, canvas),
      major: contrast(tokens["--grid-strong"].rgb, canvas),
      // --muted is what actually sits on the canvas (hero copy, eyebrow, inactive tabs, footer),
      // not --ink. Measuring the ruling against the brightest text flattered the margin and is
      // why this page did not surface the light-theme failure it was built to surface.
      body: contrast(muted, canvas),
    };

    /* --- faces: does the browser actually have them? ------------------------------------ */
    // `document.fonts.check()` cannot answer this. It returns true when no matching @font-face
    // exists at all, because the system fallback is "available" - which is precisely how Geist
    // rendered as ui-sans-serif here for months without anyone noticing. So measure an advance
    // width against a family that cannot exist: if the two widths agree, the face is not loading.
    pen.style.color = "";
    const widthIn = (family: string) => {
      pen.style.font = "";
      pen.style.fontSize = "48px";
      pen.style.fontFamily = family;
      pen.textContent = "Handgloves 0123456789";
      return pen.getBoundingClientRect().width;
    };
    const baseline = widthIn(`${ABSENT}, monospace`);
    const faces: FaceReading[] = FACES.map(({ token, role }) => {
      const stack = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
      const first = (stack.split(",")[0] || "").replace(/['"]/g, "").trim();
      const w = widthIn(`"${first}", ${ABSENT}, monospace`);
      return { token, role, family: first || "-", loaded: Math.abs(w - baseline) > 0.5 };
    });
    pen.textContent = "";
    pen.style.fontFamily = "";
    pen.style.fontSize = "";

    /* --- the scale, off the specimen boxes ---------------------------------------------- */
    const hero = document.querySelector<HTMLElement>(".hero h1");
    const scale: Record<string, ScaleReading> = {};
    SCALE.forEach(({ key }) => {
      const node = key === "hero" ? hero : specimens.current[key];
      if (!node) return;
      const s = getComputedStyle(node);
      const px = parseFloat(s.fontSize);
      const lh = s.lineHeight === "normal" ? NaN : parseFloat(s.lineHeight);
      const ls = s.letterSpacing === "normal" ? 0 : parseFloat(s.letterSpacing);
      scale[key] = {
        family: (s.fontFamily.split(",")[0] || "").replace(/['"]/g, "").trim(),
        size: `${px.toFixed(px % 1 ? 2 : 0)}px`,
        leading: Number.isNaN(lh) ? "normal" : `${lh.toFixed(lh % 1 ? 1 : 0)}px · ${(lh / px).toFixed(2)}`,
        weight: s.fontWeight,
        tracking: `${(ls / px).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}em`,
      };
    });

    setSnap({ theme: document.documentElement.dataset.theme || "dark", tokens, floors, ruling, faces, scale });
  }, []);

  // Re-measure on the two things that change what would be measured: the theme, and the fonts
  // arriving. Both matter - a snapshot taken before the webfonts land reports the fallback's
  // metrics, and reporting the dark floors while the light palette is on screen is the drift
  // this page exists to prevent.
  useEffect(() => {
    let live = true;
    const run = () => { if (live) measure(); };
    const frame = requestAnimationFrame(run);
    document.fonts?.ready.then(run).catch(() => {});
    window.addEventListener("resize", run);
    return () => { live = false; cancelAnimationFrame(frame); window.removeEventListener("resize", run); };
  }, [measure, theme]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    // The resize listener is not redundant: an emulated viewport change (devtools, a responsive
    // preview) resizes the window without always firing the media query's change event.
    window.addEventListener("resize", sync);
    return () => { mq.removeEventListener("change", sync); window.removeEventListener("resize", sync); };
  }, []);

  const cols = narrow ? NARROW : COLS;

  const tokenRow = (row: Swatch) => {
    const reading = snap?.tokens[row.token];
    return (
      <div className="mkt-cols-row" style={cols.token} key={row.token}>
        <span
          aria-hidden="true"
          style={{
            width: 26, height: 26, borderRadius: "var(--r-sm)", background: `var(${row.token})`,
            border: "1px solid var(--line-strong)", display: "block",
          }}
        />
        <span>
          <code className="home-code">{row.token}</code>
          <span className="mkt-sub">{row.role}</span>
        </span>
        <b>{reading ? (reading.alpha < 1 ? `${reading.hex} · α ${reading.alpha}` : reading.hex) : "measuring…"}</b>
        <span style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-start", textAlign: "left" }}>
          {row.on.length === 0 && <span className="mkt-sub" style={{ margin: 0 }}>nothing sits under it</span>}
          {row.on.map((m) => {
            const fg = snap?.tokens[row.token];
            const bg = snap?.tokens[m.token];
            return (
              <span className="mkt-chip" key={m.token}>
                {m.label}
                {fg && bg ? (
                  <b style={m.floor === null ? undefined : { color: contrast(fg.rgb, bg.rgb) >= m.floor ? "var(--teal)" : "var(--danger)" }}>
                    {ratio(contrast(fg.rgb, bg.rgb))}
                  </b>
                ) : <b>-</b>}
              </span>
            );
          })}
        </span>
      </div>
    );
  };

  return (
    <>
      {/* The probe. One hidden span does two jobs: it is painted with each token in turn so the
          browser reports the computed colour, and it is set in each face in turn so the advance
          width says whether that face is really there. The wrapper's colour is the sentinel an
          unresolvable token falls back to. */}
      <span aria-hidden="true" style={{ position: "absolute", left: -99999, top: 0, color: SENTINEL, whiteSpace: "pre", pointerEvents: "none" }}>
        <span ref={probe} />
      </span>

      {/* ---- 1. COLOUR ---------------------------------------------------------------- */}
      <section className="panel full-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Living style guide · 1 of 4</p>
            <h2>Colour</h2>
          </div>
          <span className="panel-meta">
            {snap ? `${snap.theme} theme · measured in your browser` : "measuring…"}
          </span>
        </div>
        <p className="mkt-note">
          Every swatch below is painted with <code className="home-code">var(--token)</code> and every value beside it is
          what the browser says it painted. Nothing on this page is typed. Values were solved, not picked: the ground is
          anchored, the accent hue is the measured hue of yellow-ochre pigment, and each remaining token is the luminance
          the floor above it demands. If one needs to move, move it in the solve and re-derive the chain - do not nudge
          it here and do not nudge it there.
        </p>
        <p className="mkt-note">
          You are reading the <b>{snap?.theme ?? "…"}</b> theme. The contract holds in both, so the honest way to check
          the other one is to look at it.{" "}
          <button className="text-button" onClick={toggleTheme} style={{ padding: 0 }}>
            Measure the {theme === "dark" ? "light" : "dark"} theme →
          </button>
        </p>

        {GROUPS.map((group) => (
          <div className="mkt-section" key={group.title}>
            <div className="mkt-section-head"><h3>{group.title}</h3></div>
            <p className="mkt-note">{group.note}</p>
            <div className="mkt-cols">
              {!narrow && <div className="mkt-cols-head" style={cols.token}>
                <span aria-hidden="true" />
                <span>Token</span>
                <span>Computed</span>
                <span>Measured against</span>
              </div>}
              {group.rows.map(tokenRow)}
            </div>
          </div>
        ))}

        <div className="mkt-section">
          <div className="mkt-section-head"><h3>Aliases</h3></div>
          <p className="mkt-note">
            Around fifty rules still name <code className="home-code">--primary</code> and{" "}
            <code className="home-code">--brass</code> from the palette this one replaced. They were left pointing at the
            solved tokens rather than find-and-replaced, so no rule anywhere can be holding an old value. That is a claim,
            so it is measured: each pair below is compared as computed colour, not as source text.
          </p>
          <div className="mkt-cols">
            {!narrow && <div className="mkt-cols-head" style={cols.alias}>
              <span>Alias</span><span>Resolves to</span><span>Same</span>
            </div>}
            {ALIASES.map((a) => {
              const from = snap?.tokens[a.token];
              const to = snap?.tokens[a.target];
              const same = !!from && !!to && from.hex === to.hex;
              return (
                <div className="mkt-cols-row" style={cols.alias} key={a.token}>
                  <span><code className="home-code">{a.token}</code><span className="mkt-sub">points at {a.target}</span></span>
                  <b>{from ? from.hex : "-"}</b>
                  <span style={{ color: same ? "var(--teal)" : "var(--danger)", fontFamily: "var(--font-data)", fontSize: 11.5 }}>
                    {snap ? (same ? "identical" : `differs - ${to?.hex}`) : "…"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mkt-section">
          <div className="mkt-section-head"><h3>Alpha</h3></div>
          <p className="mkt-note">
            Scrims and shadows are alpha over the ground rather than a surface, so no contrast floor applies to them.
            They are warmed to the neutral hue for the same reason everything else is: nothing in this app is tinted blue.
          </p>
          <div className="mkt-cols">
            {!narrow && <div className="mkt-cols-head" style={cols.alias}><span>Token</span><span>Computed</span><span>Over the canvas</span></div>}
            {ALPHA_TOKENS.map((a) => {
              const t = snap?.tokens[a.token];
              const over = t && snap ? hex(composite(t.rgb, t.alpha, snap.tokens["--bg"].rgb)) : "-";
              return (
                <div className="mkt-cols-row" style={cols.alias} key={a.token}>
                  <span><code className="home-code">{a.token}</code><span className="mkt-sub">{a.role}</span></span>
                  <b>{t ? `${t.hex} · α ${t.alpha}` : "-"}</b>
                  <span style={{ fontFamily: "var(--font-data)", fontSize: 11.5 }}>{over}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---- 2. TYPE ------------------------------------------------------------------- */}
      <section className="panel full-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Living style guide · 2 of 4</p>
            <h2>Type</h2>
          </div>
          <span className="panel-meta">{snap ? "sizes measured off the boxes" : "measuring…"}</span>
        </div>

        <p className="mkt-note">
          Three faces, three jobs. The family names below are read out of the font tokens, and
          &ldquo;loaded&rdquo; is not a guess: <code className="home-code">document.fonts.check()</code> returns true when
          no matching face exists at all, because the system fallback counts as available - which is exactly how the
          previous face rendered as <code className="home-code">ui-sans-serif</code> here for months. So each face is set
          against a family that cannot exist and the advance width is compared. Same width, not loading.
        </p>

        <div className="mkt-cols">
          {!narrow && <div className="mkt-cols-head" style={cols.face}><span>Face</span><span>Specimen</span><span>Loaded</span></div>}
          {FACES.map((f, i) => {
            const reading = snap?.faces[i];
            return (
              <div className="mkt-cols-row" style={cols.face} key={f.token}>
                <span>
                  <b style={{ fontFamily: `var(${f.token})`, fontSize: 14 }}>{reading?.family ?? "…"}</b>
                  <span className="mkt-sub">{f.role}</span>
                </span>
                <span aria-hidden="true" style={{ fontFamily: `var(${f.token})`, fontSize: 19, lineHeight: 1.3, color: "var(--ink)", textAlign: "left" }}>
                  Handgloves 0123 · Il1 O0
                </span>
                <span style={{ fontFamily: "var(--font-data)", fontSize: 11.5, color: reading?.loaded ? "var(--teal)" : "var(--danger)" }}>
                  {snap ? (reading?.loaded ? "yes" : "NO - falling back") : "…"}
                </span>
              </div>
            );
          })}
        </div>

        <p className="mkt-note" style={{ marginTop: 22 }}>
          <b>Mono is data only.</b> Numerals, row references, keys, shell output, and the uppercase eyebrows that label a
          block. Never body copy: 2,236 subtopics set in a monospace would be exhausting to read, and a wall of mono is an
          AI tell in its own right. The rule is worth stating on this page because it is the one rule here that a
          stylesheet cannot enforce.
        </p>

        <div className="mkt-cols" style={{ marginTop: 16 }}>
          {!narrow && <div className="mkt-cols-head" style={cols.scale}><span>Step</span><span>Specimen</span><span>Measured</span></div>}
          {SCALE.map((s) => {
            const m = snap?.scale[s.key];
            return (
              <div className="mkt-cols-row" style={cols.scale} key={s.key}>
                <span>
                  <code className="home-code">{s.key}</code>
                  <span className="mkt-sub">{s.role}</span>
                </span>
                <div aria-hidden="true" style={{ textAlign: "left", minWidth: 0, overflow: "hidden" }}>
                  {s.key === "hero" && <span className="mkt-sub" style={{ margin: 0 }}>↑ the title at the top of this page</span>}
                  {s.key === "h1" && <h1 ref={setSpecimen("h1")} style={{ margin: 0 }}>{s.sample}</h1>}
                  {s.key === "h2" && <h2 ref={setSpecimen("h2")} style={{ margin: 0 }}>{s.sample}</h2>}
                  {s.key === "h3" && <h3 ref={setSpecimen("h3")} style={{ margin: 0 }}>{s.sample}</h3>}
                  {/* The body step cannot be demonstrated inside this table: `.mkt-cols-row` sets
                      its own 13px, and an unclassed <p> in here would inherit that and report the
                      table's size as the app's body size. It is measured and shown below the
                      table instead, where it inherits from <body> as every paragraph does. */}
                  {s.key === "body" && <span className="mkt-sub" style={{ margin: 0 }}>↓ the paragraph under this table</span>}
                  {s.key === "lead" && <p className="home-line" ref={setSpecimen("lead")}>{s.sample}</p>}
                  {s.key === "detail" && <p className="home-sub" ref={setSpecimen("detail")} style={{ marginTop: 0 }}>{s.sample}</p>}
                  {s.key === "meta" && <span className="panel-meta" ref={setSpecimen("meta")}>{s.sample}</span>}
                  {s.key === "eyebrow" && <p className="eyebrow" ref={setSpecimen("eyebrow")} style={{ margin: 0 }}>{s.sample}</p>}
                  {/* The ref goes on the <b>, not on the chip around it: the numeral is the step. */}
                  {s.key === "data" && (
                    <span className="home-stat"><b ref={setSpecimen("data")}>112.5 h</b>readiness 41%</span>
                  )}
                  {s.key === "code" && <code className="home-code" ref={setSpecimen("code")}>lumen mcp get_plan</code>}
                </div>
                <span style={{ textAlign: "left", fontFamily: "var(--font-data)", fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>
                  {m ? (
                    <>
                      {m.size} / {m.leading}
                      <span className="mkt-sub" style={{ margin: 0 }}>{m.family} · {m.weight} · {m.tracking}</span>
                    </>
                  ) : "…"}
                </span>
              </div>
            );
          })}
        </div>

        {/* The body specimen, unclassed, inheriting from <body> exactly as the app's prose does -
            and measured there rather than inside the table above. */}
        <p ref={setSpecimen("body")} style={{ maxWidth: "66ch", marginTop: 20 }}>
          Body sits at 16 on a 1.5 leading, so a line box is exactly 24px - the same 24px as the minor ruling under the
          whole page. That is the reason the substrate reads as paper rather than as a pattern: a line of copy sits on a
          rule instead of across one. This paragraph is that step; the numbers for it are in the table above.
        </p>
      </section>

      {/* ---- 3. COMPONENTS ------------------------------------------------------------- */}
      <section className="panel full-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Living style guide · 3 of 4</p>
            <h2>Components</h2>
          </div>
          <span className="panel-meta">real classes, real states</span>
        </div>
        <p className="mkt-note">
          Nothing here is a picture of a component. Each one carries the class the app gives it, so hover it, tab to it,
          and it behaves exactly as it does on the tab it came from. Muting is always a colour and never an opacity -
          a control that looks half-erased reads as a rendering bug rather than a disabled state.
        </p>

        <div className="mkt-section">
          <div className="mkt-section-head"><h3>Buttons</h3></div>
          <p className="mkt-note">One accent CTA per view. Everything else is a bordered control or plain text.</p>
          <div style={ROW}>
            <button className="primary-button" style={{ width: "auto" }}>Open the plan <span aria-hidden="true">→</span></button>
            <button className="quiz-action">Reveal</button>
            <button className="quiz-action" disabled>Reveal (disabled)</button>
            <button className="ask-trigger">Quaere</button>
            <button className="ghost-button">↗ Share</button>
            <button className="text-button">See all rows</button>
            <button className="theme-toggle" aria-label="Theme toggle specimen">☾</button>
          </div>
        </div>

        <div className="mkt-section">
          <div className="mkt-section-head"><h3>Answer states</h3></div>
          <p className="mkt-note">Correct and wrong carry a border as well as a colour, so the state survives monochrome.</p>
          <div style={ROW}>
            <button className="quiz-option">Untouched</button>
            <button className="quiz-option correct">Correct</button>
            <button className="quiz-option wrong">Wrong</button>
            <button className="quiz-option muted-option">Not chosen</button>
            <button className="quiz-option" disabled>Locked</button>
          </div>
        </div>

        <div className="mkt-section">
          <div className="mkt-section-head"><h3>Chips</h3></div>
          <p className="mkt-note">Mono, tight, quiet. A chip labels; it never shouts.</p>
          <div style={ROW}>
            <span className="status">In progress</span>
            <span className="priority">P1</span>
            <span className="res-kind res-read">Read</span>
            <span className="res-kind res-watch">Watch</span>
            <span className="res-kind res-do">Do</span>
            <span className="market-tier go">Go</span>
            <span className="market-tier hold">Hold</span>
            <span className="market-tier stop">Stop</span>
            <span className="mkt-chip">reachable <b>27</b></span>
            <span className="wall-num">R 59</span>
            <kbd className="ask-kbd">⌘K</kbd>
          </div>
          <div className="topic-chips" style={{ marginTop: 12 }}>
            <span>retrieval</span><span>evaluation</span><span>agent governance</span>
          </div>
        </div>

        <div className="mkt-section">
          <div className="mkt-section-head"><h3>Controls</h3></div>
          <p className="mkt-note">
            The boundary is what makes a control a control - it is floor 5, and it is measured on these very elements in
            the next section. Focus is a ring at the same weight; tab through them.
          </p>
          <div className="filters" style={{ alignItems: "center" }}>
            <input defaultValue="retrieval" aria-label="Filter specimen" />
            <select defaultValue="All tracks" aria-label="Track specimen">
              <option>All tracks</option>
              <option>Applied AI</option>
            </select>
            <select className="status-select" defaultValue="Not started" aria-label="Status specimen">
              <option>Not started</option>
              <option>In progress</option>
            </select>
          </div>
          <div className="recall-strip" style={{ marginTop: 12, border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--surface)" }}>
            <p className="recall-prompt">A prompt, and the answer box under it.</p>
            <textarea className="recall-answer" rows={2} defaultValue="" aria-label="Recall specimen" />
          </div>
        </div>

        <div className="mkt-section">
          <div className="mkt-section-head"><h3>Measured values</h3></div>
          <p className="mkt-note">Proportion is drawn with the accent and nothing else on a page is. A metric numeral is ochre because it was earned.</p>
          <div className="metric-grid" style={{ marginBottom: 16 }}>
            <div className="metric"><span className="metric-label">Readiness</span><strong>41%</strong><span className="metric-detail">14 of 34 skills</span></div>
            <div className="metric"><span className="metric-label">Hours banked</span><strong>112.5</strong><span className="metric-detail">of 1,120 planned</span></div>
          </div>
          <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
            <span className="track-progress"><span style={{ width: "62%" }} /></span>
            <span className="mkt-bar"><span style={{ width: "38%" }} /></span>
            <span className="mock-bar"><span style={{ width: "80%" }} /></span>
          </div>
          <div className="home-stats">
            <span className="home-stat"><b>+2.4 pts</b>readiness gain</span>
            <span className="home-stat"><b>7 days</b>longest run</span>
          </div>
        </div>

        <div className="mkt-section">
          <div className="mkt-section-head"><h3>Links and rows</h3></div>
          <p className="mkt-note">A resource with no URL is not a dead link - it is muted text that never claimed to be one.</p>
          <div style={ROW}>
            <a className="resource-link" href="/plan">Read<span aria-hidden="true">↗</span></a>
            <span className="resource-link no-link">Watch</span>
            <button className="mkt-rowlink">R 59 <span>retrieval evaluation</span></button>
            <button className="ask-row">Quaere</button>
          </div>
          <div className="wall-list" style={{ marginTop: 14 }}>
            <div className="wall-row"><span className="wall-num">R 12</span><span className="wall-main"><strong>Eval harness for a RAG pipeline</strong><span className="wall-topic">Retrieval-augmented generation</span></span><span className="wall-date">2026-08-14</span></div>
            <div className="wall-row"><span className="wall-num">R 27</span><span className="wall-main"><strong>Agent audit log, end to end</strong><span className="wall-topic">Agent governance</span></span><span className="wall-date">2026-08-29</span></div>
          </div>
        </div>

        <div className="mkt-section">
          <div className="mkt-section-head"><h3>Tabs</h3></div>
          <p className="mkt-note">The active tab is read from the URL, not from state, so the underline cannot disagree with what is below it.</p>
          {/* A div and not a <nav>: the real tab bar is a navigation landmark and there is only
              one of those per page. This is a picture of its states, drawn with its own classes. */}
          <div className="tabs" style={{ marginBottom: 0 }}>
            <span className="tab active">Active</span>
            <span className="tab">Inactive</span>
            <span className="tab">Inactive</span>
          </div>
        </div>

        <div className="mkt-section">
          <div className="mkt-section-head"><h3>Surfaces</h3></div>
          <p className="mkt-note">
            A panel is a panel because the ruling stops at it. Scroll this page and watch the paper stay still under the
            layout - it is fixed to the viewport, which is why it never tiles against an edge.
          </p>
          <div className="mkt-quaere">
            <p className="eyebrow">Quaere&apos;s reading</p>
            <p>The one tinted block in the system, and the one block that is not a measurement. A reader skimming should be able to tell that before reading a word of it.</p>
            <p className="mkt-quaere-foot">Generated from your plan · never a promise</p>
          </div>
        </div>
      </section>

      {/* ---- 4. THE CONTRACT ----------------------------------------------------------- */}
      <section className="panel full-panel" ref={rig}>
        <div className="panel-head">
          <div>
            <p className="eyebrow">Living style guide · 4 of 4</p>
            <h2>The contract</h2>
          </div>
          <span className="panel-meta">{snap ? `${snap.theme} theme · live` : "measuring…"}</span>
        </div>
        <p className="mkt-note">
          Five floors. They are not measured between two constants - they are measured between this panel, the canvas
          behind it, and the chip, the lead line, the detail line and the two controls immediately below, which are real
          elements carrying the app&apos;s real classes. Break the palette and this table goes red without anyone editing
          it.
        </p>

        {/* The rig. Also the demonstration: these are the elements the numbers come from. */}
        <div className="home-block" style={{ marginTop: 4 }}>
          <p className="home-line rig-ink">Ink on the card - a lead line.</p>
          <p className="home-sub rig-muted">Muted on the card - the detail line under it, and the quietest text in the app.</p>
          {/* `.filters` and `.recall-answer` rather than inline styling: the floor has to be
              measured on the boundary the app actually draws, not on one this page draws for it. */}
          <div className="filters" style={{ marginTop: 12, alignItems: "center" }}>
            <span className="status rig-chip">a chip on the card</span>
            <input className="rig-input" defaultValue="a control on the card" aria-label="Boundary specimen" />
            <textarea className="recall-answer rig-textarea" rows={1} defaultValue="a control on the canvas colour" aria-label="Boundary specimen 2" style={{ width: 260 }} />
          </div>
        </div>

        <div className="mkt-cols" style={{ marginTop: 20 }}>
          {!narrow && <div className="mkt-cols-head" style={cols.floor}>
            <span>Step</span><span>Floor</span><span>Measured</span><span>Verdict</span>
          </div>}
          {(snap?.floors ?? []).map((f) => (
            <div className="mkt-cols-row" style={cols.floor} key={f.step}>
              <span>{f.step}<span className="mkt-sub">{f.detail}</span></span>
              <span style={{ textAlign: "left", fontFamily: "inherit", fontSize: 12.5, color: "var(--muted)" }}>{f.floor}</span>
              <b>{f.measured}</b>
              <span style={{ textAlign: "left", fontFamily: "var(--font-data)", fontSize: 11.5, color: f.pass ? "var(--teal)" : "var(--danger)" }}>
                {f.pass ? "PASS" : "FAIL"}
              </span>
            </div>
          ))}
          {!snap && <div className="mkt-cols-row" style={cols.floor}><span>measuring…</span><span /><b>-</b><span /></div>}
        </div>

        <div className="mkt-section">
          <div className="mkt-section-head"><h3>The ruling</h3></div>
          <p className="mkt-note">
            The graph paper is part of the design, so it gets its own condition rather than a floor: it must be visible
            against the ground and it must not compete with body text. Both numbers are stated, and the second is what
            keeps the substrate a substrate - the ruling sits far below the text set on top of it.
          </p>
          <div className="mkt-tiers">
            <div className="mkt-tierline"><span>Minor rule · 24px cell</span><span className="mkt-bar"><span style={{ width: `${Math.min(100, ((snap?.ruling.minor ?? 1) / (snap?.ruling.body ?? 1)) * 100)}%` }} /></span><b>{snap ? snap.ruling.minor.toFixed(2) : "-"}</b><span /></div>
            <div className="mkt-tierline"><span>Major rule · every 4th</span><span className="mkt-bar"><span style={{ width: `${Math.min(100, ((snap?.ruling.major ?? 1) / (snap?.ruling.body ?? 1)) * 100)}%` }} /></span><b>{snap ? snap.ruling.major.toFixed(2) : "-"}</b><span /></div>
            <div className="mkt-tierline"><span>Body text, for scale</span><span className="mkt-bar"><span style={{ width: "100%" }} /></span><b>{snap ? snap.ruling.body.toFixed(2) : "-"}</b><span /></div>
          </div>
          <p className="mkt-caveat mkt-note">
            The ruling is texture, not structure: it is removed under forced colours, where it would be redrawn as a
            system border and read as a diagram, and in print, where it would be a printer&apos;s practical joke.
          </p>
        </div>

        <p className="mkt-note" style={{ marginTop: 24 }}>
          Floors 1 and 2 are the separation floors, 3 and 4 are the reading floors, 5 is the operable floor. A palette
          that clears all five is not automatically good - it is merely honest, which is the only part a page can check.
          The rest is the judgement in the solve, and that is written down in the spec, not here.
        </p>
      </section>
    </>
  );
}

/* Column templates for the four table shapes on this page. `.mkt-cols-row` is a grid whose base
   rule sets four columns for the Market tab; each shape here overrides only its own widths, in
   the same way every other use of that class does. */
const COLS = {
  token: { gridTemplateColumns: "26px minmax(0,1.15fr) 108px minmax(0,1.3fr)" } as const,
  alias: { gridTemplateColumns: "minmax(0,1fr) 108px minmax(0,0.9fr)" } as const,
  face: { gridTemplateColumns: "minmax(0,1fr) minmax(0,1.1fr) 120px" } as const,
  scale: { gridTemplateColumns: "minmax(0,0.9fr) minmax(0,1.5fr) 150px" } as const,
  floor: { gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) 84px 78px" } as const,
};

/* Under 700px each shape stacks. The swatch keeps its column - a colour beside its name is the
   one pairing on this page that is worth a phone's width. */
const NARROW = {
  token: { gridTemplateColumns: "26px minmax(0,1fr)" } as const,
  alias: { gridTemplateColumns: "minmax(0,1fr)" } as const,
  face: { gridTemplateColumns: "minmax(0,1fr)" } as const,
  scale: { gridTemplateColumns: "minmax(0,1fr)" } as const,
  floor: { gridTemplateColumns: "minmax(0,1fr)" } as const,
};

/** A row of specimens: they are inline-ish elements with their own sizes, so wrap and align. */
const ROW: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" };
