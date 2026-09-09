# Field notebook - a visual identity of Lumen's own

Date: 2026-09-08
Status: approved, ready for implementation

## Why this replaces the current direction

`.impeccable.md` records the aesthetic as **Linear**, chosen from 74 candidates because Linear's
system is built for dense planning tools. That was a defensible decision and it is why the app
works. It is also why it does not feel like anything: it is a faithful implementation of someone
else's system, down to Geist standing in for Linear's private faces - and Geist is one of the most
recognisable "shipped in 2025" tells in circulation.

Rasul asked for something distinctive, was shown the trade (Linear's density is genuinely
dense-data-proven; leaving it is real risk), and chose to leave it.

## The direction

A **field notebook**: gridded, annotated, worked-in, honest about wear. This is not a metaphor
bolted on - it is the direct expression of the brand line already in `.impeccable.md`:

> A well-made field notebook rather than an analytics product: warm, worked-in, honest about the
> size of the task. **It never flatters.**

### The graph-paper substrate is structural, not decorative

The single differentiating idea, and it earns its place by solving a real problem. Lumen shows 119
rows and 2,236 subtopics, and Design Principle 4 says density is a feature. Ruled paper is
*natively* dense - it is the one ground on which tight packing reads as correct rather than
cramped.

It also resolves the surface-separation problem cleanly. On a ruled ground a panel is identified by
**the grid interrupting**, exactly as Linear identifies one by its hairline - the same mechanism,
differently expressed. That satisfies the disjunctive floor `.impeccable.md` already states:
luminance ≥ 1.25 **or** a visibly present edge on every panel.

### Type

Chosen by Impeccable's selection procedure, not by reflex. Brand words: **worked-in, exacting,
unsentimental**. The reflex picks - Fraunces, IBM Plex Mono, Space Grotesk - are all on the banned
list precisely because they are everyone's reflex, and were rejected.

| role | face | why |
|---|---|---|
| display | **Bricolage Grotesque** | designed with intentional irregularity; *bricolage* means made from what is at hand, which is the field-notebook idea rendered as a typeface |
| body / UI | **Atkinson Hyperlegible** | drawn for low-vision readers, so every letterform is disambiguated - the right instinct for a wall of dense rows |
| data | **Martian Mono** | a technical mono with actual character, for numbers and row references only |

Mono is confined to data. Setting 2,236 subtopics in mono would be both fatiguing and, per
Impeccable, an AI tell in itself.

### Colour

Warm near-black ground, warm off-white ink, and **one** accent - ochre - reserved for numbers that
were *earned*: a readiness gain, a shipped artifact, a cleared skill. Never for chrome, never for
decoration. Principle 3 already says colour encodes state; this narrows it further, so seeing ochre
means something happened.

**Values are solved, not picked.** Every token is derived to clear the measured floors below
simultaneously, the way the previous palette was re-solved: pick the hue and the ground, then
compute the rest. Warm greys are tinted toward the ochre hue rather than toward blue.

## The contrast contract

Carried forward unchanged, and re-measured after implementation from `getComputedStyle`, in both
themes, not by eye:

| step | floor |
|---|---|
| canvas → card | ≥ 1.25 **or** a visibly present edge on every panel |
| card → chip | ≥ 1.20 |
| ink vs muted on card | ≥ 1.70 |
| muted on card | ≥ 4.50 (AA body) |
| control boundary | ≥ 3.00 |

The grid lines are part of the design, so they get their own floor: **the ruling must be visible
against the ground and must not compete with body text.** State the measured value.

## The companion: `/design`

A living style guide inside Lumen. Not a static page - it reads the same tokens the app uses, so
it cannot drift:

- every colour token with its measured contrast against the surfaces it is used on
- the type scale at real sizes, with the three faces named and their roles
- each component in its real states
- the five floors above, measured live in the browser, pass or fail

Two reasons this is worth building rather than documenting in markdown. It cannot go stale, because
it renders from the tokens. And it is interview material: walking someone through why a palette was
solved rather than chosen is a stronger signal than the palette itself.

It is a route like any other, under `app/(app)/design/`, and appears in `NAV`.

## Migration

The visual language is centralised - `app/globals.css` holds the tokens and nearly all component
styles, and the ten sections are now separate components. So this is a token-and-type change plus a
substrate, not a rewrite of every view.

Ordered by risk:
1. Fonts and tokens in `globals.css`; measure the five floors.
2. The graph-paper ground and the panel treatment that sits on it.
3. `/design`, which then becomes the surface for verifying 4.
4. Component-level adjustments where the new type scale breaks a layout.

## Not doing

- **No change to information architecture.** The ten routes, the nav, and what each page shows are
  settled. This is skin, not bones.
- **No motion beyond what exists.** A study tool opened daily for two years should not animate.
- **No light-mode abandonment.** Dark-first, but light must remain usable and must clear the same
  floors; the daily digest is read in the morning.
- **No new dependencies.** Fonts load the way Geist does today.
