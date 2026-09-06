/**
 * The Lumen mark, inlined so it paints with the first frame instead of arriving as a
 * second request. app/icon.svg is the source of truth — it is what the favicon, the
 * Apple icon and the link-preview card are all rasterised from by
 * scripts/build-icons.mjs. If the path below changes, change it there too and re-run
 * that script, or the tab icon and the header will drift apart.
 */
export function LogoMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Lumen"
      focusable="false"
    >
      <rect width="32" height="32" rx="12" fill="var(--primary)" />
      <path d="M6 8 H18 V10 Q14 10 14 13 V20 H24 V24 H10 V13 Q10 10 6 10 Z" fill="var(--surface)" />
    </svg>
  );
}
