import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono, Sora, GFS_Didot } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ShojiDoors } from "@/components/ShojiDoors";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "./providers";

// Body + UI face: Plus Jakarta Sans — warm, rounded, modern, crisp at small
// sizes. Self-hosted by next/font; `display: swap` avoids invisible text.
const sans = Plus_Jakarta_Sans({
  variable: "--font-sans-src",
  subsets: ["latin"],
  display: "swap",
});

// Display face for headings/hero: Sora pairs cleanly with Jakarta and gives
// section titles real personality.
const display = Sora({
  variable: "--font-display-src",
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
    <html
      lang="en"
      className={`dark ${sans.variable} ${display.variable} ${geistMono.variable} ${didot.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
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
