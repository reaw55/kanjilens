import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { SmoothScroll } from "@/components/smooth-scroll";

const inter = Inter({ subsets: ["latin"] });

// Material Symbols (Rounded) icon font, bundled at build time from the `material-symbols`
// package so pages make no runtime requests to Google Fonts. It is the full variable font
// (FILL/wght/GRAD/opsz axes) because icons are picked by ligature name.
const materialSymbols = localFont({
  src: "../../node_modules/material-symbols/material-symbols-rounded.woff2",
  variable: "--font-material-symbols",
  weight: "100 700",
  style: "normal",
  display: "block",
  adjustFontFallback: false,
  fallback: [],
});

export const metadata: Metadata = {
  title: "KanjiLens",
  description: "Review kanji by matching them to their readings and meanings.",
};

export const viewport: Viewport = {
  themeColor: "#18181b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${materialSymbols.variable}`} suppressHydrationWarning>
      <body className={`${inter.className} bg-zinc-900 text-zinc-50 antialiased`}>
        <SmoothScroll>
          {children}
        </SmoothScroll>
      </body>
    </html>
  );
}
