import { describe, expect, it } from "vitest";
import { getAddress } from "viem";

import { deploymentWriteGuard } from "@/features/protocol/deployment-write-guard";
import type { ReadyDeployment } from "@/lib/config";

const deployment: ReadyDeployment = {
  status: "ready",
  chainId: 46630,
  factoryAddress: getAddress("0x1111111111111111111111111111111111111111"),
  usdgAddress: getAddress("0x2222222222222222222222222222222222222222"),
};

describe("deployment write guard", () => {
  it("uses generated deployment addresses on the matching wallet chain", () => {
    expect(
      deploymentWriteGuard({
        deployment,
        walletChainId: 46630,
        expectedChainId: 46630,
      }),
    ).toEqual({
      enabled: true,
      factory: deployment.factoryAddress,
      paymentToken: deployment.usdgAddress,
    });
  });

  it("rejects a mismatched wallet chain", () => {
    expect(
      deploymentWriteGuard({
        deployment,
        walletChainId: 4663,
        expectedChainId: 46630,
      }),
    ).toMatchObject({
      enabled: false,
      reason: expect.stringContaining("Switch"),
    });
  });
});
