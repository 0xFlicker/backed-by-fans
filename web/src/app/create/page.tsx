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
          Build the terms in plain language, see how support is split, and know
          exactly which choices become permanent before your wallet signs.
        </p>
        <Link className="text-button" href="/account">
          Manage existing memberships
        </Link>
      </div>
      <CreateTierWizard />
    </section>
  );
}
