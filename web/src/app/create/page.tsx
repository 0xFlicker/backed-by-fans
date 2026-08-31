import type { Metadata } from "next";
import Link from "next/link";

import { CreateTierWizard } from "@/features/creator/CreateTierWizard";

export const metadata: Metadata = {
  title: "Create a membership",
  description: "Creator setup for Backed By Fans memberships.",
};

export default function CreatePage() {
  return (
    <section className="page-shell create-page">
      <div className="page-intro">
        <p className="eyebrow">For creators</p>
        <h1 className="font-display">
          Your work. Your membership. Your people.
        </h1>
        <p>
          Set the terms, preview the artwork, and see what becomes permanent
          before you publish.
        </p>
        <Link className="text-button" href="/account">
          Manage memberships
        </Link>
      </div>
      <CreateTierWizard />
    </section>
  );
}
