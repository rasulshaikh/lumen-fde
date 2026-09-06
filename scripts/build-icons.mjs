/**
 * Rasterise the Lumen mark into every icon artifact the app serves.
 *
 * app/icon.svg is the single source of truth — edit that, re-run this, commit the
 * output. Everything else here is derived, so the mark can never drift between the
 * browser tab, the iOS home screen and a shared link.
 *
 *   node scripts/build-icons.mjs
 *
 * Produces:
 *   app/favicon.ico          16 + 32 + 48, real ICO container (kills the /favicon.ico 404)
 *   app/apple-icon.png       180x180, opaque — iOS ignores alpha and composites on black
 *   app/opengraph-image.png  1200x630 link-preview card
 *
 * Next's App Router picks all three up by filename and emits the <link>/<meta> tags.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(ROOT, "app");

const CREAM = "#f4efe9";
const INK = "#1c1b22";
const ACCENT = "#6a4c88";
const STONE = "#5a5862";

const source = readFileSync(join(APP, "icon.svg"));

const render = (size, { background } = {}) => {
  let pipe = sharp(source, { density: 384 }).resize(size, size, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (background) pipe = pipe.flatten({ background });
  return pipe.png({ compressionLevel: 9 }).toBuffer();
};

/**
 * Assemble a real ICO. sharp has no .ico encoder, so build the container by hand:
 * a 6-byte ICONDIR, one 16-byte ICONDIRENTRY per size, then the PNG payloads.
 * PNG-compressed entries are valid ICO and are what every current browser reads.
 */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // 0 encodes 256
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette count
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const escapeXml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * 1200x630 link preview. Manrope is a webfont and is not installed locally, so the
 * rasteriser falls back to Helvetica here — a near neighbour, and only this static card
 * is affected. The app itself loads the real Manrope.
 *
 * The headline is split across two lines by hand rather than set on one: at a size
 * large enough to carry the card, "Build proof, not just knowledge." runs past 1200px
 * and collides with the mark. SVG has no text wrapping, so the break is explicit.
 */
function ogCard(markPng) {
  const lines = ["Build proof,", "not just knowledge."];
  const sub = "916 hours · 119 topics · 13 months";
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="${CREAM}"/>
  <rect x="0" y="0" width="1200" height="10" fill="${ACCENT}"/>
  <image x="96" y="86" width="88" height="88" href="data:image/png;base64,${markPng.toString("base64")}"/>
  <text x="208" y="143" font-family="Helvetica,Arial,sans-serif" font-size="26" font-weight="700" letter-spacing="5" fill="${ACCENT}">LUMEN</text>
  <text x="96" y="316" font-family="Manrope,Helvetica,Arial,sans-serif" font-size="72" font-weight="700" fill="${INK}">${escapeXml(lines[0])}</text>
  <text x="96" y="398" font-family="Manrope,Helvetica,Arial,sans-serif" font-size="72" font-weight="700" fill="${INK}">${escapeXml(lines[1])}</text>
  <rect x="96" y="446" width="120" height="4" fill="${ACCENT}"/>
  <text x="96" y="512" font-family="Helvetica,Arial,sans-serif" font-size="30" fill="${STONE}">${escapeXml(sub)}</text>
</svg>`);
}

const [i16, i32, i48, apple, ogMark] = await Promise.all([
  render(16),
  render(32),
  render(48),
  render(180, { background: CREAM }),
  render(180),
]);

writeFileSync(
  join(APP, "favicon.ico"),
  ico([
    { size: 16, data: i16 },
    { size: 32, data: i32 },
    { size: 48, data: i48 },
  ]),
);
writeFileSync(join(APP, "apple-icon.png"), apple);
writeFileSync(
  join(APP, "opengraph-image.png"),
  await sharp(ogCard(ogMark)).png({ compressionLevel: 9 }).toBuffer(),
);

console.log("favicon.ico        16+32+48");
console.log("apple-icon.png     180x180 on cream");
console.log("opengraph-image    1200x630");
