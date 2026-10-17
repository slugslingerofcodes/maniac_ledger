import type { Metadata } from "next";
import {
  Plus_Jakarta_Sans,
  Geist_Mono,
  Shippori_Mincho,
  GFS_Didot,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ShojiDoors } from "@/components/ShojiDoors";
import { Toaster } from "@/components/ui/sonner";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { Providers } from "./providers";

// Body + UI face: Plus Jakarta Sans — warm, rounded, modern, crisp at small
// sizes. Self-hosted by next/font; `display: swap` avoids invisible text.
const sans = Plus_Jakarta_Sans({
  variable: "--font-sans-src",
  subsets: ["latin"],
  display: "swap",
});

// Display face for headings/hero.
//
// This was Sora, which is — like Jakarta — a geometric humanist sans: at UI
// sizes the two were near-indistinguishable, so the second download bought
// almost no typographic contrast. Shippori Mincho is a mincho serif with real
// stroke modulation and brush-derived terminals, so a heading now reads as a
// different voice from the body text rather than a slightly different sans.
// Latin subset only — the Japanese subset is an order of magnitude larger and
// nothing in the UI is set in kana.
const display = Shippori_Mincho({
  variable: "--font-display-src",
  weight: ["500", "700", "800"],
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// Didot-style serif for the brand wordmark. GFS Didot is the free, web-safe
// Didot on Google Fonts; the CSS stack prefers a real system "Didot" first.
const didot = GFS_Didot({
  variable: "--font-didot-src",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "anime_maniacs",
  description: "Track the anime you watch.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // No `dark` class here any more — THEME_INIT_SCRIPT puts it on before
    // first paint based on the stored choice (default: follow the OS).
    // suppressHydrationWarning because that script mutates <html> between the
    // server render and hydration, by design.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${display.variable} ${geistMono.variable} ${didot.variable} h-full antialiased`}
    >
      <head>
        {/* Must run before any painted markup, or the page flashes the wrong
            theme on every single load. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/*
          Posters are served straight from their source CDNs (see
          `images.unoptimized` in next.config.ts), so the LCP image on almost
          every page is a third-party request that can't start until DNS + TLS
          finish. Warming those connections in the head overlaps the handshake
          with HTML parsing instead of paying for it after the first <img> is
          discovered. `crossOrigin` must match how next/image fetches them, or
          the browser opens a second, unwarmed connection.
        */}
        <link rel="preconnect" href="https://cdn.myanimelist.net" crossOrigin="" />
        <link rel="preconnect" href="https://s4.anilist.co" crossOrigin="" />
        <link rel="dns-prefetch" href="https://cdn.myanimelist.net" />
        <link rel="dns-prefetch" href="https://s4.anilist.co" />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>
          {/* The shared TooltipProvider lives in the (app) and manga layouts,
              which hold every tooltip in the app. Up here it put base-ui's
              floating-positioning layer into the first-load JS of the auth
              pages, which have none. */}
          {children}
          {/* Route-change shōji doors — root level so they outlive navigation
              and can close *and* reopen across every route (anime + manga). */}
          <ShojiDoors />
          <Toaster />
          <ServiceWorkerRegister />
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
