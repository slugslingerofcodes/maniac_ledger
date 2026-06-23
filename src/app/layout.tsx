import type { Metadata } from "next";
import { Geist, Geist_Mono, GFS_Didot } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Didot-style serif for the brand wordmark. GFS Didot is the free, web-safe
// Didot on Google Fonts; the CSS stack prefers a real system "Didot" first.
const didot = GFS_Didot({
  variable: "--font-didot-src",
  weight: "400",
  subsets: ["latin"],
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
      className={`dark ${geistSans.variable} ${geistMono.variable} ${didot.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          {children}
          <Toaster />
          <ServiceWorkerRegister />
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
