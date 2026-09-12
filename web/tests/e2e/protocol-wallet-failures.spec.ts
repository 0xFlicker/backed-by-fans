import { hasLiveOwnedPosition } from "./helpers/membership-positions";
import {} from "./helpers/membership-positions";
import { expect, test } from "@playwright/test";
import { erc20Abi, type Hash } from "viem";
import { membershipTierAbi } from "../../src/contracts";
import { forkContext } from "./helpers/protocol-fork";
import {
  requiredAnvilAddress,
  requiredAnvilRpc,
  snapshotAnvil,
  revertAnvil,
  rpcRequest,
  installAnvilWallet,
  connectAnvilWallet,
  expectReconciled,
} from "./helpers/anvil";

test("@protocol-fork wrong-network membership writes stay disabled until the wallet switches", async ({
  page,
}, info) => {
  test.skip(
    process.env.BBF_PROTOCOL_FORK_AUTHENTIC !== "1" ||
      info.project.name !== "desktop",
    "One connected wrong-network case",
  );
  const snapshot = await snapshotAnvil();
  try {
    const member = requiredAnvilAddress("member"),
      tier = requiredAnvilAddress("tier");
    await installAnvilWallet(page, member, { initialChainId: 4663 });
    // Connect on an unbound route so RainbowKit preserves the reported chain.
    await page.goto("/account");
    await connectAnvilWallet(page, member);
    await page
      .getByRole("banner")
      .getByRole("link", { name: "Backed By Fans home" })
      .click();
    await page.goto(`/chains/31337/tiers/${tier}`);
    await connectAnvilWallet(page, member);
    const switchNetwork = page.getByRole("button", {
      name: "Switch wallet network",
    });
    await expect(switchNetwork).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New membership" }),
    ).toBeDisabled();
    await switchNetwork.click();
    await expect(switchNetwork).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "New membership" }),
    ).toBeEnabled();
  } finally {
    await revertAnvil(snapshot);
  }
});

for (const failure of [
  "rejected wallet request",
  "insufficient asset",
  "insufficient gas",
  "repriced transaction",
] as const)
  test(`@protocol-fork membership handles ${failure} through wagmi and viem`, async ({
    page,
  }, info) => {
    test.skip(
      process.env.BBF_PROTOCOL_FORK_AUTHENTIC !== "1" ||
        info.project.name !== "desktop",
      "One library-boundary failure per wallet case",
    );
    test.setTimeout(120000);
    const snapshot = await snapshotAnvil();
    try {
      const f = await forkContext(),
        member = requiredAnvilAddress("member"),
        asset = requiredAnvilAddress("paymentToken"),
        tier = requiredAnvilAddress("tier");
      if (failure === "insufficient asset") {
        const balance = await f.client.readContract({
          address: asset,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [member],
        });
        await f.write(member, asset, erc20Abi, "transfer", [
          requiredAnvilAddress("creator"),
          balance,
        ]);
      }
      if (failure === "insufficient gas")
        await f.testClient.setBalance({ address: member, value: 0n });
      if (failure === "repriced transaction") {
        await f.write(member, asset, erc20Abi, "approve", [tier, 10000000n]);
        await rpcRequest("anvil_setIntervalMining", [0]);
        await rpcRequest("anvil_setAutomine", [false]);
        let submitted: Hash | undefined;
        let transactionInput: Record<string, unknown> | undefined;
        let replaced = false;
        await page.route(`${requiredAnvilRpc()}/`, async (route) => {
          const request = route.request().postDataJSON();
          if (Array.isArray(request)) {
            await route.continue();
            return;
          }
          if (!submitted && request.method === "eth_sendTransaction") {
            const response = await route.fetch(),
              payload = await response.json();
            if (!payload.error) {
              submitted = payload.result;
              transactionInput = request.params[0];
            }
            await route.fulfill({ response, json: payload });
            return;
          }
          if (
            replaced ||
            !submitted ||
            !transactionInput ||
            request.method !== "eth_getTransactionByHash" ||
            request.params[0] !== submitted
          ) {
            await route.continue();
            return;
          }
          // Reprice only after viem has observed the still-pending original.
          // This models a user speeding up an already submitted wallet action.
          const response = await route.fetch(),
            payload = await response.json();
          await route.fulfill({ response, json: payload });
          if (!payload.result) return;
          replaced = true;
          const original = payload.result;
          const transaction: Record<string, unknown> = {
            ...transactionInput,
            nonce: original.nonce,
          };
          if (original.maxFeePerGas) {
            delete transaction.gasPrice;
            transaction.maxFeePerGas = `0x${(BigInt(original.maxFeePerGas) * 2n + 1000000000n).toString(16)}`;
            transaction.maxPriorityFeePerGas = `0x${(BigInt(original.maxPriorityFeePerGas ?? "0x0") * 2n + 1000000000n).toString(16)}`;
          } else
            transaction.gasPrice = `0x${(BigInt(original.gasPrice ?? "0x77359400") * 2n).toString(16)}`;
          const replacement = await rpcRequest<Hash>("eth_sendTransaction", [
            transaction,
          ]);
          f.receipts.push({
            kind: "wallet-repricing-injection",
            original: submitted,
            replacement,
          });
          await rpcRequest("anvil_setAutomine", [true]);
          await rpcRequest("anvil_setIntervalMining", [1]);
          await f.testClient.mine({ blocks: 1 });
        });
      }

      await installAnvilWallet(page, member, {
        rejectNextWrite: failure === "rejected wallet request",
      });
      await page.goto(`/chains/31337/tiers/${tier}`);
      await connectAnvilWallet(page, member);
      const join = page.getByRole("button", { name: "New membership" });
      if (failure === "insufficient asset" || failure === "insufficient gas") {
        await expect(join).toBeDisabled();
        await expect(
          page.getByText(
            failure === "insufficient asset"
              ? /Your balance is/
              : /Add a small amount of ETH/,
          ),
        ).toBeVisible();
        expect(
          await f.client.readContract({
            address: tier,
            abi: membershipTierAbi,
            functionName: "balanceOf",
            args: [member],
          }),
        ).toBe(0n);
      } else {
        await join.click();
        if (failure === "rejected wallet request") {
          await expect(
            page.locator(".membership-transaction.transaction-retry"),
          ).toBeVisible();
          expect(
            await f.client.readContract({
              address: tier,
              abi: membershipTierAbi,
              functionName: "balanceOf",
              args: [member],
            }),
          ).toBe(0n);
          await join.click();
        }
        await expectReconciled(page, "New membership");
        expect(await hasLiveOwnedPosition(f.client, tier, member)).toBe(true);
      }
      await f.retain(`wallet-${failure.replaceAll(" ", "-")}`, {
        failure,
        tier,
        member,
        evidenceClass: "browser",
        injection:
          "Test wallet or local funding only; product lifecycle uses unchanged wagmi/viem",
      });
    } finally {
      await rpcRequest("anvil_setAutomine", [true]);
      await rpcRequest("anvil_setIntervalMining", [1]);
      await revertAnvil(snapshot);
    }
  });
