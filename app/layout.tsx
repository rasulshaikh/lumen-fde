import type { Metadata } from "next";
import "./globals.css";
import { Backdrop } from "@/components/Backdrop";
import { PREMISE, TITLE } from "@/lib/profile";
export const metadata: Metadata = { title: TITLE, description: PREMISE };
// Runs before first paint. Default is light (matches landing/login). Dark only when the
// user explicitly chose it via the toggle (localStorage). Ignores prefers-color-scheme so
// the app does not open on the old notebook umber for system-dark users.
const themeScript = `(function(){try{var s=localStorage.getItem('lumen-theme');document.documentElement.dataset.theme=s==='dark'?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Host Grotesk (landing), Archivo (dashboard display), Schibsted Grotesk
            (dashboard body), JetBrains Mono (data). Must be a <link>, not @import:
            Next's CSS pipeline strips remote @import from the emitted chunk. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400..800&family=Host+Grotesk:wght@300;400;500;600;700&family=Schibsted+Grotesk:ital,wght@0,400..800;1,400..700&family=JetBrains+Mono:wght@400..700&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body><Backdrop />{children}</body>
    </html>
  );
}
