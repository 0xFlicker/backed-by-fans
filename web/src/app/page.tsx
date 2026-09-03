import type { Metadata } from "next";

import { CatalogExplorer } from "@/components/CatalogExplorer";
import { readServerCatalogState } from "@/lib/server-catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explore memberships",
  description:
    "Explore creator-run membership NFTs on Robinhood Chain, with artwork and terms read directly onchain.",
  alternates: {
    canonical: "/",
  },
};

export default async function HomePage() {
  const initialCatalog = await readServerCatalogState();

  return (
    <section className="page-shell home-catalog-page">
      <header className="home-catalog-intro">
        <p className="eyebrow">Explore memberships</p>
        <h1 className="font-display">Find a membership worth joining.</h1>
        <p>
          Creator-run memberships, with artwork and terms read directly from
          Robinhood Chain.
        </p>
      </header>
      <CatalogExplorer initialState={initialCatalog} />
    </section>
  );
}
