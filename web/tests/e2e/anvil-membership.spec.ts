import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const rpcUrl = process.env.BBF_ANVIL_RPC_URL;
const tierAddress = process.env.BBF_ANVIL_TIER_ADDRESS;
const memberAddress = process.env.BBF_ANVIL_MEMBER_ADDRESS;
const usdgAddress = process.env.NEXT_PUBLIC_USDG_ADDRESS;
const enabled = Boolean(rpcUrl && tierAddress && memberAddress && usdgAddress);

async function rpcRequest<T>(method: string, params: readonly unknown[] = []) {
  if (!rpcUrl) throw new Error("BBF_ANVIL_RPC_URL is required.");
  const response = await fetch(rpcUrl, {
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = (await response.json()) as {
    result?: T;
    error?: { message: string };
  };
  if (payload.error) throw new Error(payload.error.message);
  if (payload.result === undefined) {
    throw new Error(`${method} returned no result.`);
  }
  return payload.result;
}

async function currentAllowance() {
  const encodedOwner = memberAddress!.slice(2).padStart(64, "0");
  const encodedSpender = tierAddress!.slice(2).padStart(64, "0");
  const result = await rpcRequest<string>("eth_call", [
    {
      data: `0xdd62ed3e${encodedOwner}${encodedSpender}`,
      to: usdgAddress,
    },
    "latest",
  ]);
  return BigInt(result);
}

async function installAnvilWallet(page: import("@playwright/test").Page) {
  await page.addInitScript(
    ({ account, endpoint }) => {
      type Listener = (...args: unknown[]) => void;
      const listeners = new Map<string, Set<Listener>>();
      let requestId = 0;
      const provider = {
        isConnected: () => true,
        on(event: string, listener: Listener) {
          const eventListeners = listeners.get(event) ?? new Set<Listener>();
          eventListeners.add(listener);
          listeners.set(event, eventListeners);
          return provider;
        },
        removeListener(event: string, listener: Listener) {
          listeners.get(event)?.delete(listener);
          return provider;
        },
        async request({
          method,
          params = [],
        }: {
          method: string;
          params?: readonly unknown[];
        }) {
          if (method === "eth_accounts" || method === "eth_requestAccounts") {
            return [account];
          }
          if (method === "wallet_switchEthereumChain") {
            for (const listener of listeners.get("chainChanged") ?? []) {
              listener("0x1237");
            }
            return null;
          }
          if (method === "wallet_addEthereumChain") return null;

          const response = await fetch(endpoint, {
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: ++requestId,
              method,
              params,
            }),
            headers: { "content-type": "application/json" },
            method: "POST",
          });
          const payload = (await response.json()) as {
            result?: unknown;
            error?: { code: number; message: string; data?: unknown };
          };
          if (payload.error) {
            const error = new Error(payload.error.message) as Error & {
              code?: number;
              data?: unknown;
            };
            error.code = payload.error.code;
            error.data = payload.error.data;
            throw error;
          }
          return payload.result;
        },
      };
      Object.defineProperty(window, "ethereum", {
        configurable: false,
        value: provider,
      });
      const detail = Object.freeze({
        info: {
          icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%2311131a'/><path d='M8 22 16 8l8 14h-4l-4-7-4 7Z' fill='%23ff6a4d'/></svg>",
          name: "Local Anvil Wallet",
          rdns: "dev.backedbyfans.anvil",
          uuid: "d15ea5e0-43c0-4ac7-99f7-5b9f1079d1ab",
        },
        provider,
      });
      const announce = () =>
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", { detail }),
        );
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    { account: memberAddress!, endpoint: rpcUrl! },
  );
}

test.describe("configured local Anvil membership", () => {
  test.skip(!enabled, "Run through scripts/test-web-anvil.sh.");

  test("renders a verified direct tier accessibly at every supported viewport", async ({
    page,
  }) => {
    await page.goto(`/tiers/${tierAddress}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "Local Creator Circle" }),
    ).toBeVisible();
    await expect(page.getByText("Factory-registered membership")).toBeVisible();
    await expect(page.getByText("Onchain state unavailable")).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Clear from check to reconciliation",
      }),
    ).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("renders RPC loss as unavailable and never as a zero-value membership", async ({
    page,
  }) => {
    await page.route(`${rpcUrl}/`, (route) => route.abort("connectionfailed"));
    await page.goto(`/tiers/${tierAddress}`);

    await expect(page.getByText("Onchain state unavailable")).toBeVisible();
    await expect(page.getByText(/0 USDG/i)).toHaveCount(0);
    await expect(
      page.getByText(/complete and reconciled onchain/i),
    ).toHaveCount(0);
  });

  test("connects an unlocked wallet and reconciles an exact-approval purchase", async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    test.skip(
      testInfo.project.name !== "desktop",
      "One mutation is sufficient.",
    );
    const snapshot = await rpcRequest<string>("evm_snapshot");
    try {
      await installAnvilWallet(page);
      await page.goto(`/tiers/${tierAddress}`);

      const connect = page
        .getByRole("banner")
        .getByRole("button", { name: "Connect wallet" });
      if (await connect.isVisible()) {
        await connect.click();
        await page.getByRole("button", { name: /local anvil wallet/i }).click();
      }
      await expect(
        page.getByRole("banner").getByRole("button", { name: /0x70.*79c8/i }),
      ).toBeVisible();
      await expect(
        page.getByText("Current allowance").locator(".."),
      ).toContainText("0 USDG");
      const readiness = page.getByRole("region", {
        name: "Fund before signing",
      });
      await expect(
        readiness.getByText("ETH for gas").locator(".."),
      ).toContainText("10000.00000");
      await expect(
        readiness.getByText("USDG balance").locator(".."),
      ).toContainText("1000");

      await page.getByRole("radio", { name: "Explicitly no referrer" }).check();
      const join = page.getByRole("button", { name: "Join this membership" });
      await expect(join).toBeEnabled();
      await join.click();

      await expect(
        page.getByText("Complete and reconciled onchain."),
      ).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        page
          .getByRole("region", { name: "Current membership status" })
          .getByRole("heading", { level: 2, name: "Renew active membership" }),
      ).toBeVisible();
      await expect(page.getByText("0.5 USDG · token owner only")).toBeVisible();
      await expect(
        readiness.getByText("USDG balance").locator(".."),
      ).toContainText("990");
      await expect(
        page.getByText("Current allowance").locator(".."),
      ).toContainText("0 USDG");
      expect(await currentAllowance()).toBe(0n);

      const transactionFlow = page.locator(".transaction-flow");
      await expect(transactionFlow).toHaveAttribute(
        "aria-labelledby",
        "transaction-title",
      );
      expect(
        await transactionFlow
          .locator(".transaction-message")
          .getAttribute("role"),
      ).toBe("status");

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    } finally {
      expect(await rpcRequest<boolean>("evm_revert", [snapshot])).toBe(true);
    }
  });
});
