import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
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
  freshWallet: process.env.BBF_ANVIL_FRESH_WALLET_ADDRESS,
  paymentToken: process.env.BBF_ANVIL_PAYMENT_TOKEN_ADDRESS,
  scaledPaymentToken: process.env.BBF_ANVIL_SCALED_PAYMENT_TOKEN_ADDRESS,
  replacementRenderer: process.env.BBF_ANVIL_REPLACEMENT_RENDERER_ADDRESS,
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
  const url = new URL(anvilEnvironment.rpcUrl);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error(
      "Anvil tests require an uncredentialed loopback RPC endpoint",
    );
  return anvilEnvironment.rpcUrl;
}

export async function rpcRequest<T>(
  method: string,
  params: readonly unknown[] = [],
) {
  if (
    /^(?:eth_send|evm_|anvil_)/.test(method) &&
    (await rpcRequest<string>("eth_chainId")) !== "0x7a69"
  )
    throw new Error("Anvil test writes require execution chain 31337");
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

const scenarioSnapshots = new Map<string, bigint>();
export async function snapshotAnvil() {
  const block = await anvilPublicClient().getBlockNumber({ cacheTime: 0 });
  const snapshot = await rpcRequest<string>("evm_snapshot");
  scenarioSnapshots.set(snapshot, block);
  return snapshot;
}

export async function revertAnvil(snapshot: string) {
  try {
    const directory = process.env.BBF_FORK_BROWSER_EVIDENCE;
    const first = scenarioSnapshots.get(snapshot);
    if (
      directory &&
      first !== undefined &&
      process.env.BBF_PROTOCOL_FORK_AUTHENTIC === "1"
    ) {
      const client = anvilPublicClient();
      const last = await client.getBlockNumber({ cacheTime: 0 });
      if (last - first > 10000n)
        throw new Error(
          "Scenario receipt export exceeded its bounded block window",
        );
      const transactions = [];
      for (let blockNumber = first + 1n; blockNumber <= last; blockNumber++) {
        const block = await client.getBlock({
          blockNumber,
          includeTransactions: true,
        });
        for (const transaction of block.transactions) {
          // Export already mined transactions. This is test evidence collection,
          // never application receipt recovery or submitted-intent inference.
          transactions.push({
            transaction,
            receipt: await client.getTransactionReceipt({
              hash: transaction.hash,
            }),
            timestamp: block.timestamp,
          });
        }
      }
      const info = test.info();
      const target = resolve(directory, "branches");
      await mkdir(target, { recursive: true });
      await writeFile(
        resolve(target, `${info.testId}-${snapshot}.json`),
        JSON.stringify(
          {
            testId: info.testId,
            title: info.title,
            project: info.project.name,
            executionChainId: 31337,
            snapshot,
            firstBlock: first,
            lastBlock: last,
            revertedAfterExport: true,
            transactions,
          },
          (_, v) => (typeof v === "bigint" ? String(v) : v),
          2,
        ) + "\n",
      );
    }
  } finally {
    scenarioSnapshots.delete(snapshot);
    expect(await rpcRequest<boolean>("evm_revert", [snapshot])).toBe(true);
  }
}

export function anvilPublicClient() {
  return createPublicClient({
    chain: foundry,
    pollingInterval: 200,
    transport: http(requiredAnvilRpc()),
  });
}

export async function sendContract(input: {
  account: Address;
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  gas?: bigint;
}) {
  const data = encodeFunctionData({
    abi: input.abi,
    functionName: input.functionName,
    args: input.args ?? [],
  });
  const client = anvilPublicClient();
  // Fixture writes also cross clock boundaries; Anvil's exact estimate has no
  // wallet safety margin. Explicit gas budgets remain untouched.
  const estimated = input.gas ?? (await client.estimateContractGas(input));
  const gas = input.gas ?? (estimated * 12n + 9n) / 10n + 100_000n;
  const hash = await rpcRequest<Hash>("eth_sendTransaction", [
    {
      from: input.account,
      to: input.address,
      data,
      gas: `0x${gas.toString(16)}`,
    },
  ]);
  return anvilPublicClient().waitForTransactionReceipt({ hash });
}

export function expectSuccessfulReceipt(receipt: TransactionReceipt) {
  expect(receipt.status).toBe("success");
}

export async function installAnvilWallet(
  page: Page,
  initialAccount: Address,
  options: { rejectNextWrite?: boolean; initialChainId?: number } = {},
) {
  await page.addInitScript(
    ({ account, endpoint, options }) => {
      type Listener = (...args: unknown[]) => void;
      const listeners = new Map<string, Set<Listener>>();
      let activeAccount: string = account;
      let requestId = 0;
      let activeChainId = options.initialChainId ?? 31337;
      let rejectNextWrite = options.rejectNextWrite ?? false;

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
          if (method === "eth_chainId")
            return `0x${activeChainId.toString(16)}`;
          if (method === "wallet_switchEthereumChain") {
            const requested = (params[0] as { chainId?: string })?.chainId;
            if (requested !== "0x7a69")
              throw Object.assign(
                new Error("This test wallet only executes on the local fork"),
                { code: 4902 },
              );
            activeChainId = 31337;
            for (const listener of listeners.get("chainChanged") ?? []) {
              listener("0x7a69");
            }
            return null;
          }
          if (method === "wallet_addEthereumChain") return null;
          if (method === "eth_sendTransaction") {
            if (activeChainId !== 31337)
              throw Object.assign(new Error("Wrong test wallet chain"), {
                code: 4901,
              });
            if (rejectNextWrite) {
              rejectNextWrite = false;
              throw Object.assign(new Error("User rejected the request."), {
                code: 4001,
              });
            }
          }

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
    { account: initialAccount, endpoint: requiredAnvilRpc(), options },
  );
}

function accountPattern(account: Address) {
  return new RegExp(`${account.slice(0, 4)}.*${account.slice(-4)}`, "i");
}

export async function connectAnvilWallet(page: Page, account: Address) {
  const banner = page.getByRole("banner");
  const connected = banner.getByRole("button", {
    name: accountPattern(account),
  });
  const connect = banner.getByRole("button", { name: "Connect wallet" });
  if (await connect.isVisible()) {
    try {
      await connect.click({ timeout: 2_000 });
    } catch (error) {
      if (await connected.isVisible()) return;
      throw error;
    }
    await page.getByRole("button", { name: /local anvil wallet/i }).click();
  }
  await expect(connected).toBeVisible();
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
      page
        .getByText(`Prepared action · ${preparedAction}`, { exact: true })
        .or(
          page
            .locator(".membership-transaction")
            .filter({ hasText: preparedAction }),
        ),
    ).toBeVisible();
  }
  await expect(
    page
      .locator(".membership-transaction.transaction-confirmed")
      .or(page.locator(".transaction-message.transaction-confirmed"))
      .or(
        page.locator(".transaction-phase-label", {
          hasText: /^Complete$/i,
        }),
      )
      .first(),
  ).toBeVisible({ timeout: 30_000 });
}
