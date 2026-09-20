// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { keccak256, toHex, zeroAddress, type PublicClient } from "viem";
import { readPonsModule } from "./buyback-module";

const vault = "0x1111111111111111111111111111111111111111";
const moduleAddress = "0x2222222222222222222222222222222222222222";
function fixture(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    activeModule: moduleAddress,
    moduleRevision: 3n,
    activeModuleCodeHash: keccak256("0x1234"),
    moduleId: keccak256(toHex("BBF.PonsBuyback")),
    moduleVersion: 1n,
    vault,
    ...overrides,
  };
  const client = {
    getBlockNumber: vi.fn(async () => 42n),
    getCode: vi.fn(async () => "0x1234"),
    readContract: vi.fn(
      async ({ functionName }: { functionName: string }) =>
        values[functionName],
    ),
  };
  return {
    client,
    read: () => readPonsModule(client as unknown as PublicClient, vault),
  };
}
describe("active module identity", () => {
  it("pins every identity read to the same block", async () => {
    const f = fixture();
    expect((await f.read()).revision).toBe(3n);
    for (const [call] of f.client.readContract.mock.calls)
      expect(call).toHaveProperty("blockNumber", 42n);
    expect(f.client.getCode).toHaveBeenCalledWith({
      address: moduleAddress,
      blockNumber: 42n,
    });
  });
  it.each([
    { activeModule: zeroAddress },
    { moduleVersion: 2n },
    { moduleId: keccak256(toHex("another strategy")) },
    { vault: moduleAddress },
    { activeModuleCodeHash: keccak256("0xabcd") },
  ])("rejects unsupported or changed identity %#", async (overrides) => {
    await expect(fixture(overrides).read()).rejects.toThrow();
  });
});
