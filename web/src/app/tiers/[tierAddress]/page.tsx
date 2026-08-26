import type { Metadata } from "next";

import { ReadStateView } from "@/components/ReadState";
import { TierReadPanel } from "@/components/TierReadPanel";
import { validateTierRouteParam } from "@/lib/direct-read";

type TierPageProps = {
  params: Promise<{ tierAddress: string }>;
};

export async function generateMetadata({
  params,
}: TierPageProps): Promise<Metadata> {
  const { tierAddress } = await params;
  return {
    title: validateTierRouteParam(tierAddress)
      ? "Membership"
      : "Invalid membership address",
    description:
      "A direct, factory-verified Backed By Fans membership contract view.",
  };
}

export default async function TierPage({ params }: TierPageProps) {
  const { tierAddress } = await params;
  const address = validateTierRouteParam(tierAddress);

  return (
    <section className="page-shell tier-page">
      {!address ? (
        <ReadStateView
          state={{
            status: "invalid-address",
            value: tierAddress,
            label:
              "This URL does not contain a valid EVM address. Check the shared link and try again.",
          }}
        />
      ) : (
        <TierReadPanel tierAddress={address} />
      )}
    </section>
  );
}
