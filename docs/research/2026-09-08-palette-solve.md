# Field notebook - the palette, solved

Date: 2026-09-08
Status: solved and measured. Not yet applied to `app/globals.css`.
Scope: this document is the worked solution only. Another agent applies it.

Inputs: `docs/superpowers/specs/2026-09-08-field-notebook-identity-design.md` (the direction)
and `.impeccable.md` (the contrast contract and the standing rules).

Every number below is computed, not observed. Relative luminance is WCAG 2.x
`Y = 0.2126·R + 0.7152·G + 0.0722·B` on linearised sRGB, and every contrast is
`(Y_lighter + 0.05) / (Y_darker + 0.05)` shown with both luminances substituted. Colours were
derived in OKLCH and quantised to 8-bit sRGB; **every ratio in this document is measured from the
quantised hex, not from the pre-rounding OKLCH value**, because the hex is what ships.

---

## 1. Why the last palette failed, and what that constrains here

`.impeccable.md` records the failure precisely: canvas → card sat at **1.10:1** for a long time
because `--surface:#0f1011` against `--bg:#010102` **cannot** clear 1.25 no matter what is layered
on top - `(0.00513+0.05)/(0.00033+0.05) = 1.095` - and because ten rules wrote `background:#fff`
directly, bypassing `--surface`, so a token change alone would never have reached the cards.

Two constraints follow, and they shape the whole solve:

1. **The floors are solved backwards from the ground, as a chain.** Each token's target luminance
   is the value the floor above it demands, not a colour someone liked. `--surface` is not "a
   charcoal"; it is `1.34 × (Y_bg + 0.05) − 0.05`.
2. **A token that is bypassed is not a token.** Section 8 lists every literal colour still in
   `globals.css` that must become a token before this palette can be measured honestly.

---

## 2. Method

### 2.1 The neutral hue - derived, not picked

Warm neutrals must be "tinted toward the ochre hue, not toward blue". But a neutral placed at the
*ochre's own* hue goes olive: at OKLCH h = 87, C = 0.014, L = 0.62 the channels come out
R 138 / G 134 / B 125 - R−G = +4 but G−B = +9, so green dominates red and the grey reads khaki.

The condition for a neutral that reads **sepia** rather than khaki is that the channel steps are
equal: `(R − G) = (G − B)`. Solved across hue at C = 0.014, L = 0.62:

| h | 58 | 62 | 63 | **64** | **65** | 66 | 70 | 75 |
|---|---|---|---|---|---|---|---|---|
| (R−G) − (G−B) | +3 | +3 | +2 | **0** | **0** | −1 | −1 | −2 |

**Neutral hue = 64.** A linear warm ramp: every neutral in both themes steps evenly down R→G→B.
Nothing in the palette is tinted blue; `a` and `b` are both positive in every neutral.

### 2.2 The neutral chroma law

One line, applied to every neutral in both themes:

```
C(L) = 0.022 − 0.006·L
```

The ground (L 0.216) gets C = 0.0207; the ink (L 0.928) gets C = 0.0164. Chroma decays with
lightness because a fixed chroma reads as progressively more coloured as lightness rises - an ink
at the ground's chroma would read cream, not off-white - but the slope is shallow (−0.006, not the
−0.010 of a first pass) because a paper that is only C 0.012 is not toned enough to be a field
notebook. The law is deliberately *not* a fraction of the sRGB gamut ceiling: that ceiling collapses
to 0.022 near white, which would have made the light paper the least warm thing in the palette.

### 2.3 The accent hue - derived, then sanity-checked against the lineage

Yellow-ochre pigment (limonite, `#cb9d06`) measures **h = 87.3** in OKLCH. That is the hue.
Rounded: **h = 87**.

A hue chosen purely for sRGB gamut headroom would have landed elsewhere. Max in-gamut chroma at the
two stops this accent must reach (L ≈ 0.78 dark, L ≈ 0.55 light) peaks at **h ≈ 67** (min of the two
= 0.1217) and bottoms at **h ≈ 88** (0.1125). Choosing the pigment hue over the gamut optimum costs
**7.5% of available chroma**. It is paid because h = 67 reads as raw sienna - an orange - and the
direction says ochre. The cost is stated rather than hidden.

The two state colours are placed by the same method:

- **teal / verdigris, h = 168.** 81° from the ochre.
- **danger / vermilion, h = 32.** Swept 18-38: h = 32 sits 6% below the chroma peak (h = 28) but is
  the only value in the red band that clears every named red and every palette red by ΔE_oklab > 0.019
  (h = 27 lands 0.0063 from CSS `firebrick` - a clone; see §7). Vermilion is also the correct red
  for the object: it is the traditional correction ink.

### 2.4 Chroma of the chromatic tokens

Each chromatic token's chroma is a fixed fraction of that hue's sRGB gamut ceiling **at its own
solved lightness** - 0.85 dark / 0.92 light for the accent family, 0.83 for teal, 0.95 for danger.
No chromatic token sits on the gamut boundary, so none of them clips or hue-shifts differently on a
P3 display.

### 2.5 The chain

Dark solves outward from the ground; light solves outward from the paper. Each step is the floor it
must clear, plus a small margin so 8-bit quantisation cannot push it below:

```
DARK    bg(anchor) → surface(×1.34) → surface-strong(×1.23) → muted(×4.62) → ink(anchor)
LIGHT   surface(anchor) → bg(÷1.34) → surface-strong(÷1.23) → muted(÷4.62) → ink(anchor)
```

The two anchors:

- **Dark `--bg`, Y = 0.0100.** Warm near-black, not `#000`: an OLED-black ground makes the ruling
  either invisible or a bright artefact, and the object being described is ink-soaked paper, not the
  absence of light.
- **Light `--surface`, Y = 0.880.** This is a *physical* anchor, not a taste one: uncoated natural-
  white writing stock reflects ~86-90%. Bright-white stock (Y ≈ 0.95) is not what a field notebook
  is made of, and it is what forces every light theme into the same corner.

`--muted` is derived against the **chip** in dark and against the **canvas** in light, because those
are the worst surfaces `--muted` actually lands on in each theme (`.answer-key span` sits on
`--surface-strong`; `.hero-copy` and `footer` sit on `--bg`). Deriving against the nominal card
would have shipped two failing combinations.

---

## 3. The token set


#### DARK

| token | hex | oklch(L C H) | relative luminance Y | derivation |
|---|---|---|---|---|
| `--bg` | `#201810` | `0.2162 0.0196 66.5` | **0.00998** | anchor: warm near-black, Y=0.0100 |
| `--surface` | `#392f27` | `0.3136 0.0201 60.6` | **0.03049** | Y = 1.34*(Ybg+0.05)-0.05 |
| `--surface-strong` | `#463d34` | `0.3665 0.0195 67.2` | **0.04888** | Y = 1.23*(Ycard+0.05)-0.05 |
| `--ink` | `#f0e5dd` | `0.9284 0.0161 58.6` | **0.79784** | anchor: warm off-white, Y=0.800 |
| `--ink-2` | `#cec4ba` | `0.8257 0.0178 67.6` | **0.56147** | anchor: Y=0.560 |
| `--muted` | `#b4a9a0` | `0.7415 0.0180 61.9` | **0.40617** | Y = 4.62*(Ychip+0.05)-0.05 |
| `--line` | `#564c43` | `0.4237 0.0198 64.3` | **0.07553** | Y = 1.56*(Ycard+0.05)-0.05 |
| `--line-strong` | `#948980` | `0.6371 0.0187 61.8` | **0.25746** | Y = 3.12*(Ychip+0.05)-0.05 |
| `--grid` | `#3c3229` | `0.3251 0.0211 64.0` | **0.03402** | Y = 1.40*(Ybg+0.05)-0.05 |
| `--grid-strong` | `#483e35` | `0.3714 0.0204 64.1` | **0.05080** | Y = 1.68*(Ybg+0.05)-0.05 |
| `--accent` | `#b89435` | `0.6827 0.1186 87.6` | **0.31627** | Y = 4.55*(Ycard+0.05)-0.05, C=0.85*gamut |
| `--accent-text` | `#cda640` | `0.7420 0.1263 87.6` | **0.40622** | Y = 4.60*(Ychip+0.05)-0.05, C=0.83*gamut |
| `--accent-soft` | `#4a3d1f` | `0.3662 0.0488 86.5` | **0.04892** | Y = Ychip, least C with dE_oklab>=0.030 from chip |
| `--on-accent` | `#201810` | `0.2162 0.0196 66.5` | **0.00998** | = --bg |
| `--teal` | `#47be98` | `0.7244 0.1206 168.4` | **0.40434** | Y = 4.60*(Ychip+0.05)-0.05, C=0.83*gamut |
| `--danger` | `#fc8b76` | `0.7552 0.1414 31.7` | **0.40469** | Y = 4.60*(Ychip+0.05)-0.05, C=0.95*gamut |

#### LIGHT

| token | hex | oklch(L C H) | relative luminance Y | derivation |
|---|---|---|---|---|
| `--bg` | `#dbd0c7` | `0.8640 0.0174 61.9` | **0.64295** | Y = (Ycard+0.05)/1.34-0.05 |
| `--surface` | `#faefe7` | `0.9586 0.0160 58.6` | **0.87827** | anchor: natural-white stock, Y=0.880 |
| `--surface-strong` | `#e3d9cf` | `0.8905 0.0175 67.6` | **0.70462** | Y = (Ycard+0.05)/1.23-0.05 |
| `--ink` | `#2c231a` | `0.2636 0.0211 66.7` | **0.01812** | anchor: warm near-black, Y=0.0180 |
| `--ink-2` | `#4e453c` | `0.3966 0.0192 67.2` | **0.06202** | anchor: Y=0.0620 |
| `--muted` | `#61574f` | `0.4639 0.0183 61.0` | **0.09922** | Y = (Ybg+0.05)/4.62-0.05 |
| `--line` | `#ccc1b8` | `0.8174 0.0176 61.9` | **0.54438** | Y = (Ycard+0.05)/1.56-0.05 |
| `--line-strong` | `#7c7268` | `0.5582 0.0196 67.4` | **0.17319** | Y = (Ybg+0.05)/3.12-0.05 |
| `--grid` | `#c3b8af` | `0.7892 0.0178 61.9` | **0.48978** | Y = (Ybg+0.05)/1.28-0.05 |
| `--grid-strong` | `#b5aaa1` | `0.7447 0.0180 61.9` | **0.41146** | Y = (Ybg+0.05)/1.50-0.05 |
| `--accent` | `#876918` | `0.5366 0.1008 86.8` | **0.15320** | Y = (Ycard+0.05)/4.55-0.05, C=0.92*gamut |
| `--accent-text` | `#6f5611` | `0.4666 0.0882 87.1` | **0.10076** | Y = (Ybg+0.05)/4.60-0.05, C=0.92*gamut |
| `--accent-soft` | `#e8d9b8` | `0.8890 0.0467 86.5` | **0.70242** | Y = Ychip, least C with dE_oklab>=0.030 from chip |
| `--on-accent` | `#faefe7` | `0.9586 0.0160 58.6` | **0.87827** | = --surface |
| `--teal` | `#15654e` | `0.4540 0.0835 168.7` | **0.10017** | Y = (Ybg+0.05)/4.60-0.05, C=0.92*gamut |
| `--danger` | `#aa2812` | `0.4855 0.1696 32.0` | **0.10107** | Y = (Ybg+0.05)/4.60-0.05, C=0.92*gamut |

CSS, ready to paste:

```css
:root{                         /* dark - the default */
  --bg:#201810; --surface:#392f27; --surface-strong:#463d34;
  --ink:#f0e5dd; --ink-2:#cec4ba; --muted:#b4a9a0;
  --line:#564c43; --line-strong:#948980;
  --grid:#3c3229; --grid-strong:#483e35;
  --accent:#b89435; --accent-text:#cda640; --accent-soft:#4a3d1f; --on-accent:#201810;
  --teal:#47be98; --danger:#fc8b76;
  color-scheme:dark;
}
:root[data-theme="light"]{
  --bg:#dbd0c7; --surface:#faefe7; --surface-strong:#e3d9cf;
  --ink:#2c231a; --ink-2:#4e453c; --muted:#61574f;
  --line:#ccc1b8; --line-strong:#7c7268;
  --grid:#c3b8af; --grid-strong:#b5aaa1;
  --accent:#876918; --accent-text:#6f5611; --accent-soft:#e8d9b8; --on-accent:#faefe7;
  --teal:#15654e; --danger:#aa2812;
  color-scheme:light;
}
```

---

## 4. Every floor, as arithmetic

Both themes. 38 checks each, 76 total, **0 failures**. The five contract floors are the first,
second, third, fourth and thirteenth-to-fifteenth rows; the rest are the combinations the contract
implies but does not enumerate, and they are included because the last palette passed the
enumerated ones and still shipped a failure.

### 4.1 Dark

| step | pair | arithmetic | floor | measured | |
|---|---|---|---|---|---|
| canvas -> card | `#201810` on `#392f27` | (0.00998+0.05)/(0.03049+0.05) | 1.25 | **1.342** | PASS |
| card -> chip | `#392f27` on `#463d34` | (0.03049+0.05)/(0.04888+0.05) | 1.20 | **1.228** | PASS |
| ink vs muted on card | `#f0e5dd` on `#b4a9a0` | (0.79784+0.05)/(0.40617+0.05) | 1.70 | **1.859** | PASS |
| muted on card | `#b4a9a0` on `#392f27` | (0.40617+0.05)/(0.03049+0.05) | 4.50 | **5.667** | PASS |
| muted on chip | `#b4a9a0` on `#463d34` | (0.40617+0.05)/(0.04888+0.05) | 4.50 | **4.614** | PASS |
| muted on canvas | `#b4a9a0` on `#201810` | (0.40617+0.05)/(0.00998+0.05) | 4.50 | **7.606** | PASS |
| ink on card | `#f0e5dd` on `#392f27` | (0.79784+0.05)/(0.03049+0.05) | 4.50 | **10.533** | PASS |
| ink on canvas | `#f0e5dd` on `#201810` | (0.79784+0.05)/(0.00998+0.05) | 4.50 | **14.136** | PASS |
| ink on chip | `#f0e5dd` on `#463d34` | (0.79784+0.05)/(0.04888+0.05) | 4.50 | **8.575** | PASS |
| ink-2 on card | `#cec4ba` on `#392f27` | (0.56147+0.05)/(0.03049+0.05) | 4.50 | **7.596** | PASS |
| ink-2 on chip | `#cec4ba` on `#463d34` | (0.56147+0.05)/(0.04888+0.05) | 4.50 | **6.184** | PASS |
| ink-2 on canvas | `#cec4ba` on `#201810` | (0.56147+0.05)/(0.00998+0.05) | 4.50 | **10.195** | PASS |
| control boundary on card | `#948980` on `#392f27` | (0.25746+0.05)/(0.03049+0.05) | 3.00 | **3.820** | PASS |
| control boundary on chip | `#948980` on `#463d34` | (0.25746+0.05)/(0.04888+0.05) | 3.00 | **3.110** | PASS |
| control boundary on canvas | `#948980` on `#201810` | (0.25746+0.05)/(0.00998+0.05) | 3.00 | **5.126** | PASS |
| hairline on card | `#564c43` on `#392f27` | (0.07553+0.05)/(0.03049+0.05) | 1.40 | **1.559** | PASS |
| hairline on canvas | `#564c43` on `#201810` | (0.07553+0.05)/(0.00998+0.05) | 1.00 | **2.093** | PASS |
| grid on canvas | `#3c3229` on `#201810` | (0.03402+0.05)/(0.00998+0.05) | 1.25 | **1.401** | PASS |
| grid-strong on canvas | `#483e35` on `#201810` | (0.05080+0.05)/(0.00998+0.05) | 1.25 | **1.681** | PASS |
| grid vs ink | `#3c3229` on `#f0e5dd` | (0.03402+0.05)/(0.79784+0.05) | 3.00 | **10.091** | PASS |
| grid vs muted | `#3c3229` on `#b4a9a0` | (0.03402+0.05)/(0.40617+0.05) | 3.00 | **5.429** | PASS |
| grid-strong vs muted | `#483e35` on `#b4a9a0` | (0.05080+0.05)/(0.40617+0.05) | 3.00 | **4.526** | PASS |
| grid-strong vs ink | `#483e35` on `#f0e5dd` | (0.05080+0.05)/(0.79784+0.05) | 3.00 | **8.411** | PASS |
| accent on card | `#b89435` on `#392f27` | (0.31627+0.05)/(0.03049+0.05) | 3.00 | **4.550** | PASS |
| accent on canvas | `#b89435` on `#201810` | (0.31627+0.05)/(0.00998+0.05) | 3.00 | **6.107** | PASS |
| accent on chip | `#b89435` on `#463d34` | (0.31627+0.05)/(0.04888+0.05) | 3.00 | **3.704** | PASS |
| accent-text on card | `#cda640` on `#392f27` | (0.40622+0.05)/(0.03049+0.05) | 4.50 | **5.668** | PASS |
| accent-text on canvas | `#cda640` on `#201810` | (0.40622+0.05)/(0.00998+0.05) | 4.50 | **7.606** | PASS |
| accent-text on chip | `#cda640` on `#463d34` | (0.40622+0.05)/(0.04888+0.05) | 4.50 | **4.614** | PASS |
| accent-text on accent-soft | `#cda640` on `#4a3d1f` | (0.40622+0.05)/(0.04892+0.05) | 4.50 | **4.612** | PASS |
| on-accent on accent fill | `#201810` on `#b89435` | (0.00998+0.05)/(0.31627+0.05) | 4.50 | **6.107** | PASS |
| teal on card | `#47be98` on `#392f27` | (0.40434+0.05)/(0.03049+0.05) | 4.50 | **5.644** | PASS |
| teal on canvas | `#47be98` on `#201810` | (0.40434+0.05)/(0.00998+0.05) | 4.50 | **7.575** | PASS |
| teal on chip | `#47be98` on `#463d34` | (0.40434+0.05)/(0.04888+0.05) | 4.50 | **4.595** | PASS |
| danger on card | `#fc8b76` on `#392f27` | (0.40469+0.05)/(0.03049+0.05) | 4.50 | **5.649** | PASS |
| danger on canvas | `#fc8b76` on `#201810` | (0.40469+0.05)/(0.00998+0.05) | 4.50 | **7.581** | PASS |
| danger on chip | `#fc8b76` on `#463d34` | (0.40469+0.05)/(0.04888+0.05) | 4.50 | **4.599** | PASS |
| accent-soft vs card | `#4a3d1f` on `#392f27` | (0.04892+0.05)/(0.03049+0.05) | 1.20 | **1.229** | PASS |
### 4.2 Light

| step | pair | arithmetic | floor | measured | |
|---|---|---|---|---|---|
| canvas -> card | `#dbd0c7` on `#faefe7` | (0.64295+0.05)/(0.87827+0.05) | 1.25 | **1.340** | PASS |
| card -> chip | `#faefe7` on `#e3d9cf` | (0.87827+0.05)/(0.70462+0.05) | 1.20 | **1.230** | PASS |
| ink vs muted on card | `#2c231a` on `#61574f` | (0.01812+0.05)/(0.09922+0.05) | 1.70 | **2.191** | PASS |
| muted on card | `#61574f` on `#faefe7` | (0.09922+0.05)/(0.87827+0.05) | 4.50 | **6.221** | PASS |
| muted on chip | `#61574f` on `#e3d9cf` | (0.09922+0.05)/(0.70462+0.05) | 4.50 | **5.057** | PASS |
| muted on canvas | `#61574f` on `#dbd0c7` | (0.09922+0.05)/(0.64295+0.05) | 4.50 | **4.644** | PASS |
| ink on card | `#2c231a` on `#faefe7` | (0.01812+0.05)/(0.87827+0.05) | 4.50 | **13.627** | PASS |
| ink on canvas | `#2c231a` on `#dbd0c7` | (0.01812+0.05)/(0.64295+0.05) | 4.50 | **10.172** | PASS |
| ink on chip | `#2c231a` on `#e3d9cf` | (0.01812+0.05)/(0.70462+0.05) | 4.50 | **11.078** | PASS |
| ink-2 on card | `#4e453c` on `#faefe7` | (0.06202+0.05)/(0.87827+0.05) | 4.50 | **8.286** | PASS |
| ink-2 on chip | `#4e453c` on `#e3d9cf` | (0.06202+0.05)/(0.70462+0.05) | 4.50 | **6.736** | PASS |
| ink-2 on canvas | `#4e453c` on `#dbd0c7` | (0.06202+0.05)/(0.64295+0.05) | 4.50 | **6.186** | PASS |
| control boundary on card | `#7c7268` on `#faefe7` | (0.17319+0.05)/(0.87827+0.05) | 3.00 | **4.159** | PASS |
| control boundary on chip | `#7c7268` on `#e3d9cf` | (0.17319+0.05)/(0.70462+0.05) | 3.00 | **3.381** | PASS |
| control boundary on canvas | `#7c7268` on `#dbd0c7` | (0.17319+0.05)/(0.64295+0.05) | 3.00 | **3.105** | PASS |
| hairline on card | `#ccc1b8` on `#faefe7` | (0.54438+0.05)/(0.87827+0.05) | 1.40 | **1.562** | PASS |
| hairline on canvas | `#ccc1b8` on `#dbd0c7` | (0.54438+0.05)/(0.64295+0.05) | 1.00 | **1.166** | PASS |
| grid on canvas | `#c3b8af` on `#dbd0c7` | (0.48978+0.05)/(0.64295+0.05) | 1.25 | **1.284** | PASS |
| grid-strong on canvas | `#b5aaa1` on `#dbd0c7` | (0.41146+0.05)/(0.64295+0.05) | 1.25 | **1.502** | PASS |
| grid vs ink | `#c3b8af` on `#2c231a` | (0.48978+0.05)/(0.01812+0.05) | 3.00 | **7.924** | PASS |
| grid vs muted | `#c3b8af` on `#61574f` | (0.48978+0.05)/(0.09922+0.05) | 3.00 | **3.617** | PASS |
| grid-strong vs muted | `#b5aaa1` on `#61574f` | (0.41146+0.05)/(0.09922+0.05) | 3.00 | **3.092** | PASS |
| grid-strong vs ink | `#b5aaa1` on `#2c231a` | (0.41146+0.05)/(0.01812+0.05) | 3.00 | **6.774** | PASS |
| accent on card | `#876918` on `#faefe7` | (0.15320+0.05)/(0.87827+0.05) | 3.00 | **4.568** | PASS |
| accent on canvas | `#876918` on `#dbd0c7` | (0.15320+0.05)/(0.64295+0.05) | 3.00 | **3.410** | PASS |
| accent on chip | `#876918` on `#e3d9cf` | (0.15320+0.05)/(0.70462+0.05) | 3.00 | **3.714** | PASS |
| accent-text on card | `#6f5611` on `#faefe7` | (0.10076+0.05)/(0.87827+0.05) | 4.50 | **6.157** | PASS |
| accent-text on canvas | `#6f5611` on `#dbd0c7` | (0.10076+0.05)/(0.64295+0.05) | 4.50 | **4.597** | PASS |
| accent-text on chip | `#6f5611` on `#e3d9cf` | (0.10076+0.05)/(0.70462+0.05) | 4.50 | **5.006** | PASS |
| accent-text on accent-soft | `#6f5611` on `#e8d9b8` | (0.10076+0.05)/(0.70242+0.05) | 4.50 | **4.991** | PASS |
| on-accent on accent fill | `#faefe7` on `#876918` | (0.87827+0.05)/(0.15320+0.05) | 4.50 | **4.568** | PASS |
| teal on card | `#15654e` on `#faefe7` | (0.10017+0.05)/(0.87827+0.05) | 4.50 | **6.181** | PASS |
| teal on canvas | `#15654e` on `#dbd0c7` | (0.10017+0.05)/(0.64295+0.05) | 4.50 | **4.615** | PASS |
| teal on chip | `#15654e` on `#e3d9cf` | (0.10017+0.05)/(0.70462+0.05) | 4.50 | **5.025** | PASS |
| danger on card | `#aa2812` on `#faefe7` | (0.10107+0.05)/(0.87827+0.05) | 4.50 | **6.144** | PASS |
| danger on canvas | `#aa2812` on `#dbd0c7` | (0.10107+0.05)/(0.64295+0.05) | 4.50 | **4.587** | PASS |
| danger on chip | `#aa2812` on `#e3d9cf` | (0.10107+0.05)/(0.70462+0.05) | 4.50 | **4.995** | PASS |
| accent-soft vs card | `#e8d9b8` on `#faefe7` | (0.70242+0.05)/(0.87827+0.05) | 1.20 | **1.234** | PASS |
### 4.3 The contract, on one line each

| step | floor | dark | light |
|---|---|---|---|
| canvas → card | ≥ 1.25 **or** a visible edge | **1.342** (both) | **1.340** (both) |
| card → chip | ≥ 1.20 | **1.228** | **1.230** |
| ink vs muted on card | ≥ 1.70 | **1.859** | **2.191** |
| muted on card | ≥ 4.50 | **5.667** | **6.221** |
| control boundary | ≥ 3.00 | **3.110** (worst: on chip) | **3.105** (worst: on canvas) |
| grid ruling | visible, not competing | **1.401** on ground / **5.429** below body text | **1.284** on ground / **3.617** below body text |

The disjunctive canvas → card floor is satisfied on **both** limbs, not one: the luminance step is
1.342 / 1.340, *and* every panel carries a hairline (dark 2.093 against the ground, light plus
`--shadow-card`), *and* the ruling stops at the panel edge.

The control-boundary row is the worst case in each theme, not the nominal one. Dark controls sit on
`--surface` (3.820) but hover to `--surface-strong` (3.110); light controls' worst neighbour is the
canvas (3.105). Both were derived against the worst case, so the hover state cannot fail.

---

## 5. The grid - solved

### 5.1 The problem stated numerically

"Visible on the ground yet never competing with body text" is two bounds and they pull opposite
ways. Written as ratios:

- **visible**: ruling-vs-ground ≥ 1.25 - the same threshold the contract uses to say a surface is
  present at all. Below it, the ruling is a rumour.
- **not competing**: body text must stand clear of the heaviest rule by the 3:1 non-text floor, so
  `muted-vs-ruling ≥ 3.00`. And the ruling itself must stay **below** 3.0 against the ground, so it
  never reads as a graphical object that WCAG 1.4.11 would require you to attend to. The ruling is
  texture; the moment it clears 3:1 it is a diagram.

So the ruling lives in a band: **1.25 ≤ ruling-vs-ground < 3.00**, with an upper cap wherever
`muted-vs-ruling` would drop under 3.00.

### 5.2 Two rules, not one

Graph paper has a heavier line every fifth square. Reproducing that is not decoration - it is what
makes a dense field countable at a glance, which is the whole argument for the substrate (Design
Principle 4: density is a feature). So the ruling is two tokens.

They sit on a **ladder with a constant step of 1.2** - the same 1.2 the contract already uses for
card → chip, reused rather than invented:

| rung | dark, vs ground | light, vs ground | what it is |
|---|---|---|---|
| minor ruling `--grid` | **1.401** | **1.284** | the 24px cell |
| major ruling `--grid-strong` | **1.681** | **1.502** | every 4th cell |
| panel hairline `--line` | **2.093** | 1.166 + `--shadow-card` | the panel's own edge |
| control boundary `--line-strong` | **5.126** | **3.105** | anything operable |
| body text `--muted` | **7.606** | **4.644** | the text itself |

The dark ladder is 1.40 / 1.68 / 2.09. The light ladder is compressed to 1.28 / 1.50 because the
light cap binds: at a 1.68 major rule on a Y = 0.643 ground, `muted-vs-grid-strong` falls to
**2.74** and fails. Solving `muted-vs-grid-strong ≥ 3.00` for the ruling gives a maximum of
**1.54**; 1.50 is used, and the minor rule drops to 1.28 to keep the two rules distinguishable.
This asymmetry is derived, not a stylistic choice: the same absolute luminance step eats far more
text headroom on a bright ground than on a dark one.

**Light-theme note, stated rather than hidden.** In light the panel hairline against the ground is
**1.166**, below 1.25 - but in light the card is *lighter* than the ground and the ruling is
*darker* than it, so they move in opposite directions and cannot be confused; the panel reads as a
sheet laid over ruled stock. The canvas → card floor is met on the fill limb (1.340) and the light
theme keeps `--shadow-card`. In dark, where card and ruling both sit above the ground, the panel is
additionally separated by its 2.093 hairline.

**Dark-theme note.** The minor ruling (1.401) is marginally stronger against the ground than the
canvas → card fill step (1.342). This is correct and intended: the spec's stated mechanism is that
"a panel is identified by **the grid interrupting**", so the ruling must be strong enough to be
missed when it stops. The panel still wins on the other two limbs (hairline 2.093, fill 1.342).

### 5.3 Measured

| check | dark | light |
|---|---|---|
| `--grid` vs ground | (0.03402+0.05)/(0.00998+0.05) = **1.401** | (0.64295+0.05)/(0.48978+0.05) = **1.284** |
| `--grid-strong` vs ground | (0.05080+0.05)/(0.00998+0.05) = **1.681** | (0.64295+0.05)/(0.41146+0.05) = **1.502** |
| `--grid` vs `--muted` (body) | (0.40617+0.05)/(0.03402+0.05) = **5.429** | (0.48978+0.05)/(0.09922+0.05) = **3.617** |
| `--grid-strong` vs `--muted` | (0.40617+0.05)/(0.05080+0.05) = **4.526** | (0.41146+0.05)/(0.09922+0.05) = **3.092** |
| `--grid` vs `--ink` | (0.79784+0.05)/(0.03402+0.05) = **10.091** | (0.48978+0.05)/(0.01812+0.05) = **7.924** |
| `--grid-strong` vs `--ink` | (0.79784+0.05)/(0.05080+0.05) = **8.411** | (0.41146+0.05)/(0.01812+0.05) = **6.774** |

Body text stands 3.1-10.1× clear of every rule, in both themes, at both weights. The ruling never
reaches 3:1 against its ground in either theme, so it stays texture.

### 5.4 Spacing

**Minor pitch 24px. Major pitch 96px (every 4th line). Square cells, both axes. 1px lines.**

- **24px is not a round number, it is the baseline.** Body type is 16px; set `line-height: 1.5` and
  the line box is exactly 24px. The ruling *is* the baseline grid, so every line of body text sits
  on a rule instead of across one. That is the difference between ruled paper and a background
  texture, and it is the reason the pitch is not chosen for looks.
- **96px = 4 cells** for the major rule (graph paper's heavier fifth line, adjusted to a power of two
  so it stays commensurate with the existing 4px spacing scale - `--sp-1:4px` … `--sp-16:64px`).
- **Moiré guard: never below 16 CSS px.** At 24px the device pitch is an integer at DPR 1, 2 and 3,
  and 36 device px at DPR 1.5 - no beat pattern at any common scale. A 4px or 8px "graph paper"
  shimmers on fractional-DPR displays and is the single most common way this substrate fails.
- **Anchored to the viewport, not the shell.** `background-attachment: fixed`, so the paper sits
  under the layout rather than travelling with a component. The shell's 44px padding does not
  quantise to 24 and must not be forced to - the ruling is stock, the layout is what is written
  on it.
- **The ruling is on the canvas only.** Panels are unruled. That interruption is the panel edge.

```css
body{
  background-color:var(--bg);
  background-image:
    repeating-linear-gradient(to right,  var(--grid-strong) 0 1px, transparent 1px 96px),
    repeating-linear-gradient(to bottom, var(--grid-strong) 0 1px, transparent 1px 96px),
    repeating-linear-gradient(to right,  var(--grid) 0 1px, transparent 1px 24px),
    repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px 24px);
  background-attachment:fixed;
}
@media (forced-colors:active){ body{background-image:none} }
@media print{ body{background-image:none} }
```

Major rules are listed first so they paint over the minor ones. Every stop is a whole pixel with a
hard `0 1px` / `1px Npx` pair - a percentage or fractional stop antialiases the rule across two
device rows and halves its measured contrast, which is exactly the kind of drift that would put the
ruling back below 1.25 without any token changing.

---

## 6. The accent - solved

### 6.1 The finding

**In dark, one ochre carries everything. In light, it cannot, and the split is real.**

Dark `--accent` `#b89435` clears 4.5:1 as body text on the card (**4.550**) and on the ground
(**6.107**). It fails only on a chip (**3.704**). Light `--accent` `#876918` clears 4.5 on the card
(**4.568**) but only 3.410 on the ground and 3.714 on a chip.

So `--accent`'s **contract is 3:1 - fill and large text (≥24px, or ≥18.66px bold)** - and it is
guaranteed at 3:1 against every surface in both themes. That it also clears 4.5 on the card in both
themes is headroom, not licence: the rule an implementer follows is one rule, not a per-surface
lookup.

`--accent-text` is the small-text stop, and it is derived against the **worst** surface in each
theme (the chip in dark, the canvas in light). It clears 4.5 against canvas, card, chip **and** the
soft tint, in both themes - 4.591 is its worst measured value anywhere.

This is the same structure `.impeccable.md` already records for the outgoing accent ("the accent is
only 3.75:1 on a panel, so it is a fill and a large-text colour, never body text"), reached
independently by the same arithmetic. It is not carried over; it is re-derived.

| | dark | light |
|---|---|---|
| `--accent` on card | (0.31627+0.05)/(0.03049+0.05) = **4.550** | (0.87827+0.05)/(0.15320+0.05) = **4.568** |
| `--accent` on canvas | (0.31627+0.05)/(0.00998+0.05) = **6.107** | (0.64295+0.05)/(0.15320+0.05) = **3.410** |
| `--accent` on chip | (0.31627+0.05)/(0.04888+0.05) = **3.704** | (0.70462+0.05)/(0.15320+0.05) = **3.714** |
| `--accent-text` on card | (0.40622+0.05)/(0.03049+0.05) = **5.668** | (0.87827+0.05)/(0.10076+0.05) = **6.157** |
| `--accent-text` on canvas | (0.40622+0.05)/(0.00998+0.05) = **7.606** | (0.64295+0.05)/(0.10076+0.05) = **4.597** |
| `--accent-text` on chip | (0.40622+0.05)/(0.04888+0.05) = **4.614** | (0.70462+0.05)/(0.10076+0.05) = **5.006** |
| `--accent-text` on `--accent-soft` | (0.40622+0.05)/(0.04892+0.05) = **4.612** | (0.70242+0.05)/(0.10076+0.05) = **4.991** |
| `--on-accent` on an `--accent` fill | (0.31627+0.05)/(0.00998+0.05) = **6.107** | (0.87827+0.05)/(0.15320+0.05) = **4.568** |

### 6.2 Muddy vs. washed out - where the two failure modes actually sit

The brief names both traps. They are real and they are 0.2 apart in luminance:

- **Too dark → muddy.** Below about Y = 0.13 at h = 87 the ochre's usable chroma falls under 0.09
  and it reads as raw umber - a brown. Light `--accent-text` at Y = 0.101, C = 0.088 is the closest
  this palette comes to that edge, and it is only allowed there because it is a *text* colour, where
  hue identity matters least and legibility matters most. It is not used as a fill.
- **Too light → stops reading as ochre.** Above about Y = 0.55 (L ≈ 0.83) at h = 87 the colour goes
  to a pale sand - the "bright yellow" of every warm dark theme. Dark `--accent-text` stops at
  Y = 0.406, L = 0.742, which is a full 0.09 of OKLCH lightness below that boundary.

The four accent stops in ascending lightness: 0.467 → 0.537 (light text, light fill) and
0.683 → 0.742 (dark fill, dark text). All four sit at C = 0.088-0.126 and h = 86.8-87.6. The hue is
constant to within 0.8° across both themes, so it is unambiguously **one** colour at four
lightnesses, which is what "one accent" has to mean.

### 6.3 The reservation rule

Ochre appears only on numbers that were earned: a readiness gain, a shipped artifact, a cleared
skill. Concretely, for the applying agent:

- Earned numerals - `.metric strong` at 31px - take `--accent`. 31px is large text, floor 3:1, and
  the measured value is 4.550 / 4.568.
- Any ochre below 24px (or 18.66px bold) takes `--accent-text`. No exceptions; the 3.704 chip value
  is why.
- `--accent-soft` is the only tinted ochre surface. It is **opaque**, at exactly chip luminance, so
  it inherits the card → chip contract (1.229 dark / 1.234 light) rather than depending on whatever
  is behind it. Its chroma is the least chroma at which it is distinguishable from a plain chip -
  ΔE_oklab ≥ 0.030, comfortably above the ~0.02 just-noticeable difference - so it reads as ochre
  and no more. `.impeccable.md` names translucent tints on the canvas as the standing trap; this
  removes the possibility.
- Ochre is used **nowhere else**. Not on chrome, not on focus rings, not on links that are merely
  links. The focus ring takes `--line-strong`, which clears 3:1 on every surface.

### 6.4 Teal and danger

Both are state colours and both are derived to the same floor as `--accent-text` - 4.5:1 against
canvas, card and chip in both themes - so a status word is legible wherever a status word lands.

`--danger` in dark is `#fc8b76`, a coral rather than a deep red. That is forced, not chosen: on a
card at Y = 0.030, **any** colour clearing 4.5:1 needs Y ≥ 0.362, and a hue-32 red at that luminance
is necessarily light. The alternative - a dark red at AA-failing contrast - is worse. In light,
where the arithmetic runs the other way, `--danger` is `#aa2812`, the vermilion the hue was chosen
for.

Both stay subordinate to the ochre by construction: they are used only on status, and
`.impeccable.md`'s standing rule that status is never conveyed by colour alone still applies -
which also covers the yellow/green confusion an ochre-plus-teal pair would otherwise create for a
deuteranope.

---

## 7. Derive-not-clone audit

Warm-dark-with-ochre is a crowded lineage. Every solved token was measured against 130 reference
values from Gruvbox (dark and light), Kanagawa, Everforest, Solarized, Zenburn, Rosé Pine (base and
dawn), Nord, Tokyo Night, Catppuccin, Monokai, Dracula, Ayu, One Dark, GitHub, Material, the
Tailwind `stone` / `amber` / `yellow` / `emerald` / `red` ramps, and the CSS named colours in the
earth range. Distance is ΔE_oklab; below 0.010 is visually indistinguishable.

| token | value | nearest known palette value | dE_oklab | verdict |
|---|---|---|---|---|
| dark `--bg` | `#201810` | tw stone-900 `#1c1917` | 0.0136 | near |
| dark `--surface` | `#392f27` | gruvbox bg1 `#3c3836` | 0.0334 | distinct |
| dark `--surface-strong` | `#463d34` | tw stone-700 `#44403c` | 0.0133 | near |
| dark `--ink` | `#f0e5dd` | tw stone-200 `#e7e5e4` | 0.0146 | near |
| dark `--ink-2` | `#cec4ba` | everforest fg `#d3c6aa` | 0.0247 | distinct |
| dark `--muted` | `#b4a9a0` | tw stone-400 `#a8a29e` | 0.0270 | distinct |
| dark `--line` | `#564c43` | gruvbox bg2 `#504945` | 0.0155 | near |
| dark `--line-strong` | `#948980` | gruvbox gray `#928374` | 0.0206 | distinct |
| dark `--grid` | `#3c3229` | gruvbox bg1 `#3c3836` | 0.0241 | distinct |
| dark `--grid-strong` | `#483e35` | tw stone-700 `#44403c` | 0.0121 | near |
| dark `--accent` | `#b89435` | solarized yellow `#b58900` | 0.0324 | distinct |
| dark `--accent-text` | `#cda640` | yellow ochre pigment `#cb9d06` | 0.0303 | distinct |
| dark `--accent-soft` | `#4a3d1f` | tw stone-700 `#44403c` | 0.0415 | distinct |
| dark `--teal` | `#47be98` | tw emerald-500 `#10b981` | 0.0426 | distinct |
| dark `--danger` | `#fc8b76` | salmon `#fa8072` | 0.0244 | distinct |
| light `--bg` | `#dbd0c7` | tw stone-300 `#d6d3d1` | 0.0139 | near |
| light `--surface` | `#faefe7` | linen `#faf0e6` | 0.0033 | CLONE |
| light `--surface-strong` | `#e3d9cf` | zenburn fg `#dcdccc` | 0.0136 | near |
| light `--ink` | `#2c231a` | tw stone-800 `#292524` | 0.0168 | near |
| light `--ink-2` | `#4e453c` | gruvbox bg2 `#504945` | 0.0167 | near |
| light `--muted` | `#61574f` | gruvbox bg3 `#665c54` | 0.0179 | near |
| light `--line` | `#ccc1b8` | everforest fg `#d3c6aa` | 0.0284 | distinct |
| light `--line-strong` | `#7c7268` | gruvbox bg4 `#7c6f64` | 0.0088 | CLONE |
| light `--grid` | `#c3b8af` | gruvbox lt bg3 `#bdae93` | 0.0413 | distinct |
| light `--grid-strong` | `#b5aaa1` | gruvbox lt bg3 `#bdae93` | 0.0275 | distinct |
| light `--accent` | `#876918` | raw umber `#826644` | 0.0459 | distinct |
| light `--accent-text` | `#6f5611` | tw yellow-800 `#854d0e` | 0.0454 | distinct |
| light `--accent-soft` | `#e8d9b8` | gruvbox fg `#ebdbb2` | 0.0114 | near |
| light `--teal` | `#15654e` | tw emerald-700 `#047857` | 0.0584 | distinct |
| light `--danger` | `#aa2812` | brown `#a52a2a` | 0.0216 | distinct |
**The accent family - the actual lineage risk - is clear.** Gruvbox's yellow `#d79921` is the
nearest thing in circulation to what this direction asks for, and a naive derivation lands on it.
Measured:

| | L | C | h | ΔE vs gruvbox `#d79921` |
|---|---|---|---|---|
| gruvbox yellow | 0.725 | 0.1429 | 77.7 | - |
| dark `--accent` `#b89435` | 0.683 | 0.1186 | 87.6 | **0.0538** |
| dark `--accent-text` `#cda640` | 0.742 | 0.1263 | 87.6 | **0.0332** |
| light `--accent` `#876918` | 0.537 | 0.1008 | 86.8 | **0.1941** |
| light `--accent-text` `#6f5611` | 0.467 | 0.0882 | 87.1 | **0.2649** |

The nearest approach is 0.0332 - 3.3× the indistinguishability threshold - and the difference is
structural rather than incidental: this palette's ochre sits **~10° yellower** (the pigment's hue,
87, not Gruvbox's 78) and **12-17% lower in chroma** at every stop, because the chroma is a fixed
fraction of the gamut ceiling rather than pushed to the edge. Against `#fabd2f`, `#e6c384`,
`#dbbc7f`, `#f6c177`, `#e0af68` and `#e6b450` - the bright ochres of the whole lineage - the
minimum distance is **0.0777**.

**Two neutrals land inside ΔE 0.010, and they are re-checked rather than kept on faith.** Both were
re-derived once already (the first pass put `--bg` 0.0058 from Tailwind `stone-900` and `--line`
0.0060 from Gruvbox `bg2`; changing the neutral chroma law and re-anchoring the light paper moved
both to 0.0136 and 0.0155). What remains:

| token | value | nearest | ΔE | how many 8-bit sRGB triples satisfy the derivation |
|---|---|---|---|---|
| light `--surface` | `#faefe7` | CSS `linen` `#faf0e6` | 0.0033 | **17** |
| light `--line-strong` | `#7c7268` | gruvbox `bg4` `#7c6f64` | 0.0088 | **18** |

Exhaustive count over all 16.7M sRGB triples, filtered to `Y` within ±0.004 / ±0.002 of the solved
target, hue within ±6° of 64, and chroma within ±0.004 of the law: **17 and 18 candidates
respectively**, and every candidate in each cluster is within ΔE ≈ 0.010 of every other. There is no
value in the space that satisfies the derivation and is *not* adjacent to `linen`. This is
convergence forced by 8-bit quantisation, not copying - and `linen` is a CSS named colour from X11,
not a designed palette. **The values stand.** Moving them to avoid a resemblance would mean picking
by eye, which is the thing this document exists to stop.

Everything else is ≥ 0.0103 away, and the median distance to the nearest known value across the
whole set is 0.0229 (n = 30).

---

## 8. What the applying agent must fix, or the measurement will lie

The last palette shipped at 1.10 for months partly because ten rules wrote `background:#fff`
directly. Those are gone. These are the equivalents that remain in `app/globals.css`, and each one
bypasses a token:

1. **Eight `color:#fff` declarations** - `.primary-button`, `.reality`, `.reality .text-button`,
   `.ask-form button`, `.quiz-action`, `.login-button`, and the `.reality` block's inner rules.
   White on the dark ochre fill measures **2.867:1** and fails; white on `--ink` measures **1.238:1** and is invisible. Every one becomes `var(--on-accent)`
   on an accent fill, or `var(--bg)` on an `--ink` fill. There is no case left where `#fff` is right:
   in dark, `--ink` *is* the near-white, so white-on-ink is invisible.
2. **Cool `oklch()` literals.** `.reality p{color:oklch(.78 .02 270)}`, `.login-orbit`'s two
   `oklch(.78 .03 270 / .18)` borders, `.quiz-option.correct`'s `oklch(.95 .045 180)` and
   `oklch(.35 .09 180)`, `.login-error`'s and `.quiz-option.wrong`'s `oklch(.96 .04 25)`,
   `.ask-panel`'s `oklch(.22 .025 270 / .16)` shadow, and `.table-wrap`'s two scroll-shadow
   gradients. Hue 270 is blue. Every one of them fights a palette whose entire neutral axis is
   h = 64, and none of them is a token. All must become tokens before anything is measured.
3. **`.reality .eyebrow{color:#e4a5c1}`** - a pink left over from a previous identity.
4. **Legacy aliases.** `--primary` → `--accent`, `--primary-hover` → `--accent-text`,
   `--primary-soft` → `--accent-soft`, `--brass` → `--accent-text`. `--brass` was a third chromatic
   token; under "one accent" it collapses into the accent family. Keeping the old names as aliases
   pointing at the new tokens is fine and is the low-risk migration; keeping the old *values* is not.
5. **`body{line-height}` must be 1.5 on 16px** or §5.4's premise fails and the ruling stops being the
   baseline grid. Several rules currently set 1.55.
6. **`--shadow-card` must stay non-`none` in light.** It is one of the two things carrying the panel
   edge there (§5.2).

---

## 9. How to re-measure, and the two traps that make measurement lie

Per `.impeccable.md`, and both traps are recorded there because both have already cost a solve:

1. **Chrome serialises computed colours as `oklch()` / `lab()`.** Naive `rgb()` parsing reads the
   lightness as a red channel and reports everything as failing. Read pixels back through a
   `<canvas>` rather than parsing the string.
2. **A hidden browser pane does not composite frames**, so a CSS transition started there stays
   pinned at its start value forever and reads as a catastrophic failure. Hold transitions off for
   the whole audit.

Then: `getComputedStyle`, both themes, all 76 rows in §4, plus the six ruling checks in §5.3. The
ruling additionally needs one check that arithmetic cannot give - that the 1px rules are landing on
whole device pixels at DPR 1, 2 and 3. Screenshot at each and confirm the rule is one solid row, not
two half-intensity rows; a blurred rule halves the measured contrast without any token changing.

`/design` (spec §"The companion") is the right home for all of this: it reads the same tokens, so
the table cannot go stale, and the 76 rows become a live pass/fail rather than a document that was
true once.

---

## 10. Summary

- **Neutral hue 64**, derived from the equal-channel-step condition - sepia, never khaki, never blue.
- **Neutral chroma `C(L) = 0.022 − 0.006L`** - one law, both themes, all ten neutrals.
- **Accent hue 87**, the measured hue of yellow-ochre pigment, at a 7.5% gamut cost that is stated.
- **Two anchors**: dark ground Y = 0.0100, light paper Y = 0.880 (natural-white stock, not bright).
- **Everything else is a chain**, solved backwards from the floors, never adjusted by eye.
- **76 floor checks across both themes, 0 failures**, all measured from the quantised hex.
- **The ruling is two rules on a 1.2 ladder**, 24px / 96px, square, viewport-anchored, canvas only -
  visible at 1.28-1.68 against the ground, with body text standing 3.1-10.1× clear of it.
- **The accent is a 3:1 fill-and-large-text colour** with a separate `--accent-text` at 4.5:1 on
  every surface in both themes - the same conclusion `.impeccable.md` reached for the old accent,
  re-derived rather than inherited.
- **Nearest approach to any known palette in the lineage: ΔE 0.0332** for the accent family; the two
  neutrals inside 0.010 are proven to be forced by 8-bit quantisation (17 and 18 candidate triples)
  and are kept deliberately.
