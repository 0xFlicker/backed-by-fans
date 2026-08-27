import { expect, type Page } from "@playwright/test";
import {
  createPublicClient,
  encodeFunctionData,
  getAddress,
  http,
  type Abi,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { foundry } from "viem/chains";

export const anvilEnvironment = {
  rpcUrl: process.env.BBF_ANVIL_RPC_URL,
  factory: process.env.NEXT_PUBLIC_ANVIL_FACTORY_ADDRESS,
  tier: process.env.BBF_ANVIL_TIER_ADDRESS,
  creator: process.env.BBF_ANVIL_CREATOR_ADDRESS,
  member: process.env.BBF_ANVIL_MEMBER_ADDRESS,
  giftRecipient: process.env.BBF_ANVIL_GIFT_RECIPIENT_ADDRESS,
  newOwner: process.env.BBF_ANVIL_NEW_OWNER_ADDRESS,
  usdg: process.env.NEXT_PUBLIC_ANVIL_USDG_ADDRESS,
} as const;

export const anvilEnabled = Object.values(anvilEnvironment).every(Boolean);

export function requiredAnvilAddress(
  key: Exclude<keyof typeof anvilEnvironment, "rpcUrl">,
) {
  const value = anvilEnvironment[key];
  if (!value) throw new Error(`${key} is required for configured Anvil tests.`);
  return getAddress(value);
}

export function requiredAnvilRpc() {
  if (!anvilEnvironment.rpcUrl) {
    throw new Error(
      "BBF_ANVIL_RPC_URL is required for configured Anvil tests.",
    );
  }
  return anvilEnvironment.rpcUrl;
}

export async function rpcRequest<T>(
  method: string,
  params: readonly unknown[] = [],
) {
  const response = await fetch(requiredAnvilRpc(), {
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

export async function snapshotAnvil() {
  return rpcRequest<string>("evm_snapshot");
}

export async function revertAnvil(snapshot: string) {
  expect(await rpcRequest<boolean>("evm_revert", [snapshot])).toBe(true);
}

export function anvilPublicClient() {
  return createPublicClient({
    chain: foundry,
    transport: http(requiredAnvilRpc()),
  });
}

export async function sendContract(input: {
  account: Address;
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}) {
  const data = encodeFunctionData({
    abi: input.abi,
    functionName: input.functionName,
    args: input.args ?? [],
  });
  const hash = await rpcRequest<Hash>("eth_sendTransaction", [
    { from: input.account, to: input.address, data },
  ]);
  return anvilPublicClient().waitForTransactionReceipt({ hash });
}

export function expectSuccessfulReceipt(receipt: TransactionReceipt) {
  expect(receipt.status).toBe("success");
}

export async function installAnvilWallet(page: Page, initialAccount: Address) {
  await page.addInitScript(
    ({ account, endpoint }) => {
      type Listener = (...args: unknown[]) => void;
      const listeners = new Map<string, Set<Listener>>();
      let activeAccount: string = account;
      let requestId = 0;

      async function forwardRpc(method: string, params: readonly unknown[]) {
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
      }

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
            return [activeAccount];
          }
          if (method === "wallet_switchEthereumChain") {
            for (const listener of listeners.get("chainChanged") ?? []) {
              listener("0x7a69");
            }
            return null;
          }
          if (method === "wallet_addEthereumChain") return null;

          let forwardedParams = params;
          const transaction = params[0];
          if (
            method === "eth_sendTransaction" &&
            typeof transaction === "object" &&
            transaction !== null &&
            !Array.isArray(transaction) &&
            !("gas" in transaction)
          ) {
            // Model the safety margin browser wallets apply. Anvil otherwise
            // uses its exact same-block estimate, which can be too low when a
            // time checkpoint changes the mined transaction's storage path.
            const estimate = await forwardRpc("eth_estimateGas", params);
            const bufferedGas = (BigInt(String(estimate)) * 12n + 9n) / 10n;
            forwardedParams = [
              { ...transaction, gas: `0x${bufferedGas.toString(16)}` },
            ];
          }
          return forwardRpc(method, forwardedParams);
        },
      };
      const walletWindow = window as typeof window & {
        __bbfSetAnvilAccount?: (nextAccount: string) => void;
      };
      walletWindow.__bbfSetAnvilAccount = (nextAccount) => {
        activeAccount = nextAccount;
        for (const listener of listeners.get("accountsChanged") ?? []) {
          listener([activeAccount]);
        }
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
    { account: initialAccount, endpoint: requiredAnvilRpc() },
  );
}

function accountPattern(account: Address) {
  return new RegExp(`${account.slice(0, 4)}.*${account.slice(-4)}`, "i");
}

export async function connectAnvilWallet(page: Page, account: Address) {
  const banner = page.getByRole("banner");
  const connect = banner.getByRole("button", { name: "Connect wallet" });
  if (await connect.isVisible()) {
    await connect.click();
    await page.getByRole("button", { name: /local anvil wallet/i }).click();
  }
  await expect(
    banner.getByRole("button", { name: accountPattern(account) }),
  ).toBeVisible();
}

export async function switchAnvilAccount(page: Page, account: Address) {
  await page.evaluate((nextAccount) => {
    const walletWindow = window as typeof window & {
      __bbfSetAnvilAccount?: (value: string) => void;
    };
    if (!walletWindow.__bbfSetAnvilAccount) {
      throw new Error("The configured Anvil wallet is unavailable.");
    }
    walletWindow.__bbfSetAnvilAccount(nextAccount);
  }, account);
  await expect(
    page.getByRole("banner").getByRole("button", {
      name: accountPattern(account),
    }),
  ).toBeVisible();
}

export async function expectReconciled(page: Page, preparedAction?: string) {
  if (preparedAction) {
    await expect(
      page.getByText(`Prepared action · ${preparedAction}`, { exact: true }),
    ).toBeVisible();
  }
  await expect(page.locator(".transaction-phase-label")).toHaveText(
    "confirmed",
    { timeout: 30_000 },
  );
  await expect(page.getByText("Complete and reconciled onchain.")).toBeVisible({
    timeout: 30_000,
  });
}
