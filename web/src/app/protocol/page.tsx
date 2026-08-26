import type { Metadata } from "next";

import { ProtocolAdministration } from "@/features/protocol/ProtocolAdministration";

export const metadata: Metadata = {
  title: "Protocol operations",
  description:
    "Verified direct-chain protocol controls for the Backed By Fans factory.",
};

export default function ProtocolPage() {
  return (
    <section className="page-shell protocol-page">
      <ProtocolAdministration />
    </section>
  );
}
