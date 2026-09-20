// @vitest-environment node
import { expect, it, vi } from "vitest";
import { keccak256, zeroAddress, type PublicClient } from "viem";
import {
  prepareModulePayload,
  MODULE_FREEZE_WARNING,
  type AdminContext,
} from "./protocol-admin";
const vault = "0x1111111111111111111111111111111111111111";
const candidate = "0x2222222222222222222222222222222222222222";
const context: AdminContext = {
  chainId: 31337,
  blockNumber: 5n,
  blockTimestamp: 1000n,
  safe: vault,
  safeNonce: 4n,
  factory: vault,
  vault,
  activeModule: candidate,
  moduleCodeHash: keccak256("0x1234"),
  protocolToken: vault,
  factoryCodeHash: keccak256("0x1234"),
  vaultCodeHash: keccak256("0x1234"),
  version: "protocol-buyback-burn-v1",
};
function fixture() {
  const client = {
    readContract: vi.fn(
      async ({ functionName }: { functionName: string }) =>
        ({
          moduleRevision: 2n,
          pendingModule: zeroAddress,
          pendingModuleCodeHash: keccak256("0x"),
          moduleActivationAt: 0n,
          freezeModule: candidate,
          freezeModuleCodeHash: keccak256("0x1234"),
          moduleFreezeAt: 604800n,
          moduleReplacementFrozen: false,
        })[functionName as "moduleRevision"],
    ),
    getBytecode: vi.fn(async () => "0x1234"),
    simulateContract: vi.fn(async () => ({})),
  };
  return client;
}
it("prepares the candidate commitment and the full economic authority warning", async () => {
  const client = fixture();
  const payload = await prepareModulePayload(
    client as unknown as PublicClient,
    context,
    "module-propose",
    { expectedSafeNonceRaw: "4", expectedModuleRevisionRaw: "2", candidate },
  );
  expect(payload.to).toBe(vault);
  expect(payload.moduleReview.candidateCodeHash).toBe(keccak256("0x1234"));
  expect(payload.moduleReview.warning).toBe(MODULE_FREEZE_WARNING);
  expect(payload.moduleReview.activation).toContain("leaves it paused");
  expect(client.simulateContract).toHaveBeenCalledOnce();
});
it("shows the irreversible consequences before preparing finalization", async () => {
  const payload = await prepareModulePayload(
    fixture() as unknown as PublicClient,
    context,
    "module-freeze-finalize",
    { expectedSafeNonceRaw: "4", expectedModuleRevisionRaw: "2" },
  );
  expect(payload.decoded.functionName).toBe("finalizeModuleReplacementFreeze");
  expect(payload.moduleReview.warning).toContain("strand buyback inventory");
  expect(payload.moduleReview.warning).toContain("remain mutable");
});
it("rejects stale module revision without simulation", async () => {
  const client = fixture();
  await expect(
    prepareModulePayload(
      client as unknown as PublicClient,
      context,
      "module-activate",
      { expectedSafeNonceRaw: "4", expectedModuleRevisionRaw: "1" },
    ),
  ).rejects.toThrow("Stale module revision");
  expect(client.simulateContract).not.toHaveBeenCalled();
});
