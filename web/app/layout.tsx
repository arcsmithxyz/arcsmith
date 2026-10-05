import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { NetworkNotice } from "@/components/NetworkNotice";
import { APP_NAME, SITE_URL } from "@/lib/config";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"], weight: ["400", "500", "600"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], weight: ["400", "500"] });
// Reading text, labels and buttons, paired with Geist headings as in the reference.
const sourceSerif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${APP_NAME} — Uniswap v4 hooks from blocks, on Arc`, template: `%s · ${APP_NAME}` },
  description:
    "Compose Uniswap v4 hook rules from on-chain blocks, preview their fees, and launch a token or open a market on Arc. Read any v4 hook on Arc.",
  // Large preview cards when links are shared. The image is app/opengraph-image.jpg (rendered
  // by video/src/posts/ShareCard.tsx); pool pages bring their own. There's deliberately no
  // twitter-image: X falls back to og:image, and a site-wide twitter:image would override the
  // pool cards on X.
  openGraph: { siteName: APP_NAME, type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${sourceSerif.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:left-4 focus-visible:z-[60] focus-visible:rounded-xl focus-visible:bg-ink focus-visible:px-4 focus-visible:py-2 focus-visible:text-on-ink"
        >
          Skip to content
        </a>
        <Providers>
          <SiteHeader />
          <main id="main" className="flex-1 pt-(--header-space)">
            {children}
          </main>
          <SiteFooter />
          <NetworkNotice />
        </Providers>
      </body>
    </html>
  );
}
