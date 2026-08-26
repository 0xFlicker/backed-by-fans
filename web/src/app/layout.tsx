import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "@rainbow-me/rainbowkit/styles.css";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { AppProviders } from "@/components/AppProviders";
import { BackingStackMark } from "@/components/BackingStackMark";
import { WalletControl } from "@/components/WalletControl";
import { publicConfig } from "@/lib/config";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(publicConfig.siteUrl),
  title: {
    default: "Backed By Fans — Creator-owned memberships",
    template: "%s | Backed By Fans",
  },
  description:
    "Creator-owned memberships for the people who make the work possible.",
  applicationName: "Backed By Fans",
  openGraph: {
    title: "Creator-owned. Backed By Fans.",
    description:
      "Create a membership your fans can join directly, with terms you control and a membership record they keep.",
    siteName: "Backed By Fans",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Creator-owned. Backed By Fans.",
    description:
      "Creator-owned memberships for the people who make the work possible.",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html className={`${GeistSans.variable} ${GeistMono.variable}`} lang="en">
      <body>
        <AppProviders>
          <a className="skip-link" href="#main-content">
            Skip to content
          </a>
          <header className="site-header">
            <Link
              aria-label="Backed By Fans home"
              className="brand-lockup"
              href="/"
            >
              <BackingStackMark className="brand-mark" />
              <span>Backed By Fans</span>
            </Link>
            <nav aria-label="Primary navigation" className="primary-nav">
              <Link href="/memberships">Explore</Link>
              <Link href="/#how-it-works">How it works</Link>
              <Link href="/create">For creators</Link>
            </nav>
            <WalletControl />
          </header>
          <main id="main-content" tabIndex={-1}>
            {children}
          </main>
          <footer className="site-footer">
            <div>
              <BackingStackMark className="footer-mark" />
              <p>Creator-owned. Backed By Fans.</p>
            </div>
            <p>
              Working brand direction. Professional name and asset clearance
              remain open before public launch.
            </p>
          </footer>
        </AppProviders>
      </body>
    </html>
  );
}
