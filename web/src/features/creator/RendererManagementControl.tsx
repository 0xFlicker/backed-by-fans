import Link from "next/link";
import type { Route } from "next";

import type { TierManagementSnapshot } from "@/contracts/types";

function shortAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export function RendererManagementControl({
  snapshot,
  canUpdate,
}: {
  snapshot: TierManagementSnapshot;
  canUpdate: boolean;
}) {
  const href =
    `/chains/${snapshot.protocolDependencies.chainId}/tiers/${snapshot.address}/manage/artwork` as Route;

  return (
    <section className="control-group renderer-management">
      <div>
        <p className="eyebrow">Artwork</p>
        <h2>Update your membership artwork</h2>
        <p>
          Reopen the full Art Studio to change the style, renderer, image, and
          placement for existing and future membership tokens.
        </p>
      </div>
      <div className="renderer-management-summary">
        <span>Current renderer</span>
        <code title={snapshot.renderer}>{shortAddress(snapshot.renderer)}</code>
      </div>
      {canUpdate ? (
        <Link className="button button-outline" href={href}>
          Edit artwork
        </Link>
      ) : (
        <p className="field-hint">
          Connect the creator wallet to edit artwork.
        </p>
      )}
    </section>
  );
}
