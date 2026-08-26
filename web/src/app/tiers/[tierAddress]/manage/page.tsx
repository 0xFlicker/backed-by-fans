import type { Metadata } from "next";

import { ReadStateView } from "@/components/ReadState";
import { TierManagement } from "@/features/creator/TierManagement";
import { validateTierRouteParam } from "@/lib/direct-read";

type ManagePageProps = {
  params: Promise<{ tierAddress: string }>;
};

export const metadata: Metadata = {
  title: "Manage membership",
  description:
    "Direct creator controls for a registered Backed By Fans membership.",
};

export default async function ManagePage({ params }: ManagePageProps) {
  const { tierAddress } = await params;
  const address = validateTierRouteParam(tierAddress);

  return (
    <section className="page-shell manage-page">
      {!address ? (
        <ReadStateView
          state={{
            status: "invalid-address",
            value: tierAddress,
            label: "This management URL does not contain a valid EVM address.",
          }}
        />
      ) : (
        <TierManagement tierAddress={address} />
      )}
    </section>
  );
}
