// @vitest-environment node
import { expect, it } from "vitest";
import { executeForkSafePayload } from "../../scripts/protocol-fork/safe-transactions";
it("rejects nonlocal endpoints before any read or signature", async () => {
  await expect(
    executeForkSafePayload({
      rpcUrl: "https://mainnet.example",
      factory: "0x1111111111111111111111111111111111111111",
      payload: {} as never,
      signerKeys: [],
      relayerKey: "0x00",
    }),
  ).rejects.toThrow("loopback");
});

import { main as checkpointMain } from "../../scripts/protocol-fork/launch-safe-checkpoint";
it("exposes the local checkpoint as an explicit harness entrypoint", () => {
  expect(typeof checkpointMain).toBe("function");
});
