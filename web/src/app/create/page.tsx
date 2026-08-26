import type { Metadata } from "next";

import { ReadStateView } from "@/components/ReadState";
import { publicConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "Create a membership",
  description: "Creator setup for Backed By Fans memberships.",
};

export default function CreatePage() {
  const detail =
    publicConfig.deployment.status === "ready"
      ? "Creator setup is not available in this foundation release. No contract action has been prepared."
      : publicConfig.deployment.detail;

  return (
    <section className="page-shell narrow-page">
      <div className="page-intro">
        <p className="eyebrow">For creators</p>
        <h1 className="font-display">
          Your work. Your membership. Your people.
        </h1>
        <p>
          Membership economics become permanent when a tier is deployed. The
          complete setup and review flow will make those terms explicit before
          any wallet signature.
        </p>
      </div>
      <ReadStateView
        state={{
          status: "unavailable",
          reason: "not-deployed",
          label: detail,
        }}
      />
    </section>
  );
}
