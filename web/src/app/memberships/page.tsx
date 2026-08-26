import type { Metadata } from "next";

import { CatalogExplorer } from "@/components/CatalogExplorer";

export const metadata: Metadata = {
  title: "Explore memberships",
  description:
    "Browse factory-registered Backed By Fans memberships at one captured onchain block.",
};

export default function MembershipsPage() {
  return (
    <section className="page-shell catalog-page">
      <div className="page-intro">
        <p className="eyebrow">Explore memberships</p>
        <h1 className="font-display">
          Find the creators you want to keep showing up for.
        </h1>
        <p>
          This bounded catalog is read directly from the configured factory at
          one captured block. Missing or partial RPC data is never shown as
          zero.
        </p>
      </div>
      <CatalogExplorer />
    </section>
  );
}
