import type { Metadata } from "next";
import "./globals.css";
import { Backdrop } from "@/components/Backdrop";
import { PREMISE, TITLE } from "@/lib/profile";
export const metadata: Metadata = { title: TITLE, description: PREMISE };
// Runs before first paint. Without it the light palette renders, then React hydrates and
// swaps to dark - a full-page flash on every load for anyone who prefers dark.
const themeScript = `(function(){try{var s=localStorage.getItem('lumen-theme');var d=s==='dark'||(!s&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Archivo (display), Schibsted Grotesk (body/UI), JetBrains Mono
            (data). This has to be a <link> and not the @import that globals.css used for
            Geist: Next's CSS pipeline strips a remote @import out of the emitted chunk, so
            Geist had never actually been downloading. Verified by the absence of any
            fonts.googleapis.com request and by a measured advance width identical to a
            nonexistent family. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400..800&family=Schibsted+Grotesk:ital,wght@0,400..800;1,400..700&family=JetBrains+Mono:wght@400..700&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body><Backdrop />{children}</body>
    </html>
  );
}
