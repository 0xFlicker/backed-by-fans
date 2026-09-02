import type { Metadata } from "next";

import { CatalogExplorer } from "@/components/CatalogExplorer";
import { readServerCatalogState } from "@/lib/server-catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explore memberships",
  description:
    "Browse factory-registered Backed By Fans memberships at one captured onchain block.",
};

export default async function MembershipsPage() {
  const initialCatalog = await readServerCatalogState();

  return (
    <section className="page-shell catalog-page">
      <div className="page-intro">
        <p className="eyebrow">Explore memberships</p>
        <h1 className="font-display">
          Find the creators you want to keep showing up for.
        </h1>
      </div>
      <CatalogExplorer initialState={initialCatalog} />
    </section>
  );
}
