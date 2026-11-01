import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import SpatialNav from "@/components/spatial-nav";

// Inter: the closest free face to Apple's SF Pro.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MAIA",
  description: "My Assistant In the Apartment",
  // Never tell the services (videos, artwork, any provider) which page asked:
  // also set as an HTTP header in next.config.ts. docs/tv/catalog.md, "Rispetto dei servizi".
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning (these two tags only, attributes only): browser
    // extensions add attributes to <html>/<body> before React loads (e.g.
    // ColorZilla's cz-shortcut-listen) and Next reported a hydration error.
    <html lang="it" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full" suppressHydrationWarning>
        <Providers>
          <SpatialNav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
