import type { Metadata } from "next";
import { BuybackSettings } from "@/features/policy-review/BuybackSettings";
export const metadata: Metadata = {
  title: "Configure buybacks",
  description:
    "Calculate and save standing buyback settings across your protocol.",
};
export default function BuybacksPage() {
  return (
    <section className="page-shell protocol-page">
      <BuybackSettings />
    </section>
  );
}
