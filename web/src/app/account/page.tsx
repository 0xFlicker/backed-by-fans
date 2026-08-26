import type { Metadata } from "next";

import { AccountDiscovery } from "@/features/membership/AccountDiscovery";

export const metadata: Metadata = {
  title: "Your memberships",
  description:
    "Bounded direct-chain membership and claim discovery for Backed By Fans.",
};

export default function AccountPage() {
  return (
    <section className="page-shell account-page">
      <AccountDiscovery />
    </section>
  );
}
