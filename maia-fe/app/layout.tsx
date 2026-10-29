import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import SpatialNav from "@/components/spatial-nav";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MAIA",
  description: "My Assistant In the Apartment",
};

export const viewport: Viewport = {
  themeColor: "#120f1c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${bricolage.variable} ${figtree.variable} h-full`}>
      <body className="min-h-full">
        <Providers>
          <SpatialNav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
