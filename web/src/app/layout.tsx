import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "@rainbow-me/rainbowkit/styles.css";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { AppProviders } from "@/components/AppProviders";
import { BackingStackMark } from "@/components/BackingStackMark";
import { WalletControl } from "@/components/WalletControl";
import { publicConfig } from "@/lib/config";
import { readServerWalletState } from "@/lib/server-wallet-state";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(publicConfig.siteUrl),
  title: {
    default: "Backed By Fans | Creator-owned memberships",
    template: "%s | Backed By Fans",
  },
  description:
    "Create an onchain NFT your fans can join directly, with terms you control and membership building blocks.",
  applicationName: "Backed By Fans",
  openGraph: {
    title: "Creator-owned. Backed By Fans.",
    description:
      "Create an onchain NFT your fans can join directly, with terms you control and membership building blocks.",
    siteName: "Backed By Fans",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Creator-owned. Backed By Fans.",
    description:
      "Create an onchain NFT your fans can join directly, with terms you control and membership building blocks.",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const initialState = await readServerWalletState();

  return (
    <html className={`${GeistSans.variable} ${GeistMono.variable}`} lang="en">
      <body>
        <AppProviders initialState={initialState}>
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
              <Link href="/about">About</Link>
              <Link href="/account">My account</Link>
              <Link href="/create">For creators</Link>
              <Link href="/skill">Make art</Link>
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
