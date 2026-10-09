"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getAccount, readContracts, simulateContract } from "@wagmi/core";
import {
  useConfig,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import {
  BaseError,
  formatEther,
  getAddress,
  isAddress,
  parseEventLogs,
  type Address,
  type Hash,
} from "viem";
import { gasliteDropAbi, ierc721Abi } from "@/contracts";
import {
  airdropBatchSize,
  airdropCollection,
  parseAirdropList,
  type AirdropRow,
} from "@/lib/airdrop";
import { getSupportedChain, type SupportedChainId } from "@/lib/chains";
import { useHydratedAccount } from "@/lib/use-hydrated-account";
import styles from "./ERC721AirdropPage.module.css";
import { useAirdropCollection } from "./useAirdropCollection";
import { ShareRegistration } from "./ShareRegistration";

function errorText(error: unknown) {
  const message =
    error instanceof BaseError
      ? error.shortMessage
      : error instanceof Error
        ? error.message
        : "The action failed.";
  if (message.includes("0x1de5204e"))
    return "The collection's transfer validator rejected this helper. The creator must authorize the helper before distributing.";
  return message;
}

type ConfirmedBatch = { hash: Hash; count: number };

export function ERC721AirdropPage({
  chainId,
  helper,
}: {
  chainId: SupportedChainId;
  helper?: Address;
}) {
  return <AirdropForm chainId={chainId} helper={helper} />;
}

function AirdropForm({
  chainId,
  helper,
}: {
  chainId: SupportedChainId;
  helper?: Address;
}) {
  const account = useHydratedAccount();
  const config = useConfig();
  const client = usePublicClient({ chainId });
  const write = useWriteContract();
  const switchChain = useSwitchChain();
  const chain = getSupportedChain(chainId);
  const [collectionText, setCollectionText] = useState("");
  const [collectionFocused, setCollectionFocused] = useState(false);
  const [mode, setMode] = useState<"pairs" | "addresses">("pairs");
  const [firstId, setFirstId] = useState("");
  const [list, setList] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [confirmed, setConfirmed] = useState<ConfirmedBatch[]>([]);
  const [message, setMessage] = useState("");
  const [fileError, setFileError] = useState("");
  const [readingFile, setReadingFile] = useState(false);
  const collection = isAddress(collectionText)
    ? getAddress(collectionText)
    : undefined;
  const collectionInfo = useAirdropCollection(chainId, collection, helper);
  const approval = useReadContract({
    chainId,
    address: collection,
    abi: ierc721Abi,
    functionName: "isApprovedForAll",
    args: account.address && helper ? [account.address, helper] : undefined,
    query: { enabled: Boolean(collection && account.address && helper) },
  });
  const parsed = useMemo(() => {
    try {
      return { rows: parseAirdropList(list, mode, firstId), error: "" };
    } catch (error) {
      return { rows: [] as AirdropRow[], error: errorText(error) };
    }
  }, [list, mode, firstId]);
  const delivered = confirmed.reduce((sum, batch) => sum + batch.count, 0);
  const remaining = parsed.rows.slice(delivered);
  const next = remaining.slice(0, airdropBatchSize);

  function assertWallet(sender: Address) {
    const current = getAccount(config);
    if (
      !current.isConnected ||
      current.address?.toLowerCase() !== sender.toLowerCase() ||
      current.chainId !== chainId
    )
      throw new Error(
        "Wallet or network changed. Reconnect the original sender on this network.",
      );
  }

  async function checkOwnership(
    rows: readonly AirdropRow[],
    sender: Address,
    nft: Address,
  ) {
    if (!client || !helper)
      throw new Error("The airdrop helper is not deployed on this network.");
    for (let offset = 0; offset < rows.length; offset += airdropBatchSize) {
      const part = rows.slice(offset, offset + airdropBatchSize);
      const owners = await readContracts(config, {
        allowFailure: true,
        contracts: part.map((row) => ({
          chainId,
          address: nft,
          abi: ierc721Abi,
          functionName: "ownerOf" as const,
          args: [row.tokenId] as const,
        })),
      });
      part.forEach((row, index) => {
        const result = owners[index];
        if (result.status !== "success")
          throw new Error(
            `NFT #${row.tokenId} could not be read. Check that it exists.`,
          );
        if (result.result.toLowerCase() !== sender.toLowerCase())
          throw new Error(`Your wallet does not own NFT #${row.tokenId}.`);
        if (
          [sender, helper].some(
            (address) => address.toLowerCase() === row.recipient.toLowerCase(),
          )
        )
          throw new Error(
            `NFT #${row.tokenId}: choose a recipient other than the sender or helper.`,
          );
      });
    }
  }

  const readiness = useQuery({
    queryKey: [
      "erc721-airdrop",
      chainId,
      helper,
      collection,
      account.address,
      list,
      mode,
      firstId,
      delivered,
    ],
    enabled: Boolean(
      client &&
      helper &&
      collection &&
      account.address &&
      parsed.rows.length &&
      collectionInfo.isSuccess,
    ),
    retry: false,
    queryFn: async () => {
      if (!client || !helper || !collection || !account.address)
        throw new Error("Connect your wallet.");
      if (collectionInfo.data?.registry?.status === "blocked")
        throw new Error(
          "The creator must authorize this helper in the collection's transfer registry before you approve or send NFTs.",
        );
      const [helperCode, approved, gasBalance] = await Promise.all([
        client.getCode({ address: helper }),
        client.readContract({
          address: collection,
          abi: ierc721Abi,
          functionName: "isApprovedForAll",
          args: [account.address, helper],
        }),
        client.getBalance({ address: account.address }),
      ]);
      if (!helperCode || helperCode === "0x")
        throw new Error("The helper has no deployed code on this network.");
      await checkOwnership(remaining, account.address, collection);
      let estimatedFee: bigint | undefined;
      if (approved && next.length) {
        const gas = await client.estimateContractGas({
          address: helper,
          abi: gasliteDropAbi,
          functionName: "airdropERC721",
          args: [
            collection,
            next.map((row) => row.recipient),
            next.map((row) => row.tokenId),
          ],
          account: account.address,
        });
        estimatedFee = gas * (await client.getGasPrice());
      }
      return { approved, gasBalance, estimatedFee };
    },
  });

  const action = useMutation({
    retry: false,
    mutationFn: async (kind: "send" | "revoke") => {
      if (!client || !helper || !collection || !account.address)
        throw new Error("Connect your wallet and enter a valid collection.");
      const sender = account.address;
      assertWallet(sender);
      if (kind === "send") {
        if (!reviewed || !remaining.length || parsed.error)
          throw new Error("Review the recipient list first.");
        const info = await collectionInfo.refetch();
        if (info.error || !info.data)
          throw info.error ?? new Error("Could not read the collection.");
        if (info.data.registry?.status === "blocked")
          throw new Error(
            "The creator must authorize this helper before sending NFTs.",
          );
        const fresh = await readiness.refetch();
        if (fresh.error || !fresh.data)
          throw fresh.error ?? new Error("Could not validate this list.");
      }
      const approved = await client.readContract({
        address: collection,
        abi: ierc721Abi,
        functionName: "isApprovedForAll",
        args: [sender, helper],
      });
      if (kind === "revoke" || !approved) {
        setMessage(
          kind === "revoke"
            ? "Confirm approval removal in your wallet."
            : "Confirm collection approval in your wallet. The airdrop follows after approval confirms.",
        );
        const simulation = await simulateContract(config, {
          chainId,
          account: sender,
          address: collection,
          abi: ierc721Abi,
          functionName: "setApprovalForAll",
          args: [helper, kind !== "revoke"],
        });
        assertWallet(sender);
        const hash = await write.writeContractAsync(simulation.request);
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success")
          throw new Error("The approval transaction reverted.");
        const after = await client.readContract({
          address: collection,
          abi: ierc721Abi,
          functionName: "isApprovedForAll",
          args: [sender, helper],
        });
        if (after !== (kind !== "revoke"))
          throw new Error(
            "The approval change was not confirmed. Check your wallet transaction.",
          );
        await approval.refetch();
        if (kind === "revoke") {
          setMessage("Collection approval removed.");
          return;
        }
      }
      for (
        let offset = 0;
        offset < remaining.length;
        offset += airdropBatchSize
      ) {
        const rows = remaining.slice(offset, offset + airdropBatchSize);
        assertWallet(sender);
        await checkOwnership(rows, sender, collection);
        setMessage(
          `Confirm batch ${confirmed.length + Math.floor(offset / airdropBatchSize) + 1} in your wallet (${rows.length} NFTs).`,
        );
        const params = {
          chainId,
          account: sender,
          address: helper,
          abi: gasliteDropAbi,
          functionName: "airdropERC721" as const,
          args: [
            collection,
            rows.map((row) => row.recipient),
            rows.map((row) => row.tokenId),
          ] as const,
        };
        const simulation = await simulateContract(config, params);
        const gas = await client.estimateContractGas(params);
        const [gasPrice, balance] = await Promise.all([
          client.getGasPrice(),
          client.getBalance({ address: sender }),
        ]);
        if (balance < (gas * gasPrice * 120n) / 100n)
          throw new Error("Add ETH for this batch's network fee and retry.");
        assertWallet(sender);
        const hash = await write.writeContractAsync(simulation.request);
        setMessage("Batch submitted. Waiting for its receipt.");
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success")
          throw new Error("This batch reverted; its NFTs were not sent.");
        const transfers = parseEventLogs({
          abi: ierc721Abi,
          eventName: "Transfer",
          logs: receipt.logs,
        }).filter(
          (event) => event.address.toLowerCase() === collection.toLowerCase(),
        );
        const proof =
          transfers.length === rows.length &&
          transfers.every(
            (event, index) =>
              event.args.from.toLowerCase() === sender.toLowerCase() &&
              event.args.to.toLowerCase() ===
                rows[index].recipient.toLowerCase() &&
              event.args.tokenId === rows[index].tokenId,
          );
        if (!proof)
          throw new Error(
            "The receipt does not confirm this batch. Check the transaction in your wallet before retrying.",
          );
        // Progress derives only from a library-supplied receipt proving this exact batch.
        setConfirmed((previous) => [
          ...previous,
          { hash: receipt.transactionHash, count: rows.length },
        ]);
        setMessage(
          `${rows.length} NFTs confirmed. Continuing with the next batch.`,
        );
      }
      setMessage("Airdrop complete. Every batch has a confirmed receipt.");
    },
  });

  function edit(change: () => void) {
    change();
    setReviewed(false);
    setConfirmed([]);
    setMessage("");
    setFileError("");
    action.reset();
  }
  const busy = action.isPending || readingFile;
  const repeated =
    parsed.rows.length -
    new Set(parsed.rows.map((row) => row.recipient.toLowerCase())).size;

  return (
    <section className="page-shell">
      <header className={styles.intro}>
        <p className="eyebrow">Creator tools · {chain.name}</p>
        <h1>
          Send a little
          <br />
          something to everyone.
        </h1>
        <p>
          Drop NFTs straight from your wallet to your list. Review the
          assignments, then start the airdrop. No platform fee; you pay the
          network fees.
        </p>
      </header>
      <div className={styles.grid}>
        <section className={styles.panel} aria-label="Airdrop recipients">
          <h2>01 / Build your list</h2>
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            <label className={styles.field}>
              NFT collection
              <input
                value={collectionText}
                placeholder={
                  collectionFocused
                    ? ""
                    : `Gentlemen Prefer Blondes · ${airdropCollection}`
                }
                onFocus={() => setCollectionFocused(true)}
                onBlur={() => setCollectionFocused(false)}
                spellCheck={false}
                onChange={(event) =>
                  edit(() => setCollectionText(event.target.value.trim()))
                }
              />
              {collectionText && !collection && (
                <span className={styles.error}>
                  Enter a valid contract address.
                </span>
              )}
            </label>
            <label className={styles.field}>
              List format
              <select
                value={mode}
                onChange={(event) =>
                  edit(() => setMode(event.target.value as typeof mode))
                }
              >
                <option value="pairs">Wallet address + token ID</option>
                <option value="addresses">
                  Wallet addresses + consecutive token IDs
                </option>
              </select>
            </label>
            {mode === "addresses" && (
              <label className={styles.field}>
                First token ID
                <input
                  inputMode="numeric"
                  value={firstId}
                  onChange={(event) =>
                    edit(() => setFirstId(event.target.value))
                  }
                />
                <span className={styles.hint}>
                  The first address gets this ID; each following address gets
                  the next ID. Your wallet must own every one.
                </span>
              </label>
            )}
            <label className={styles.field}>
              Recipient list
              <textarea
                value={list}
                spellCheck={false}
                placeholder={
                  mode === "pairs"
                    ? "address,tokenId\n0x… ,1\n0x… ,2"
                    : "One wallet address per line"
                }
                onChange={(event) => edit(() => setList(event.target.value))}
              />
            </label>
            <label className={styles.field}>
              Or upload CSV / text
              <input
                type="file"
                accept=".csv,.txt,.tsv"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setReviewed(false);
                  if (file.size > 2_000_000) {
                    setFileError("Use a file smaller than 2 MB.");
                    return;
                  }
                  setReadingFile(true);
                  try {
                    const text = await file.text();
                    edit(() => setList(text));
                  } catch (error) {
                    setFileError(errorText(error));
                  } finally {
                    setReadingFile(false);
                  }
                }}
              />
              <span className={styles.hint}>
                Files stay in your browser. Up to 10,000 rows. CSV columns:
                address,tokenId. Repeated recipients may receive multiple NFTs.
              </span>
            </label>
          </fieldset>
          {(parsed.error || fileError) && (
            <p className={styles.error} role="alert">
              {parsed.error || fileError}
            </p>
          )}
          {parsed.rows.length > 0 && (
            <>
              <p>
                {parsed.rows.length.toLocaleString()} NFTs ·{" "}
                {new Set(
                  parsed.rows.map((row) => row.recipient),
                ).size.toLocaleString()}{" "}
                wallets
                {repeated > 0 && ` · ${repeated} repeated recipient rows`}
              </p>
              <div className={styles.review}>
                <table>
                  <caption className="sr-only">
                    NFT assignments in list order
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">NFT</th>
                      <th scope="col">Recipient</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((row, index) => (
                      <tr key={row.tokenId.toString()}>
                        <td>
                          #{row.tokenId.toString()}
                          {index < delivered ? " · Sent" : ""}
                        </td>
                        <td>{row.recipient}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
        <section className={styles.panel} aria-label="Review and send">
          <h2>02 / Review &amp; send</h2>
          <p>{collectionInfo.data?.name ?? "Your NFT collection"}</p>
          {collection && (
            <p className={styles.address}>
              <a
                href={`${chain.blockExplorers?.default.url}/address/${collection}`}
                target="_blank"
                rel="noreferrer"
              >
                {collection} ↗
              </a>
            </p>
          )}
          {collectionInfo.isFetching && (
            <p role="status">Checking collection and transfer registry…</p>
          )}
          {collectionInfo.error && (
            <p role="alert" className={styles.error}>
              {errorText(collectionInfo.error)}
            </p>
          )}
          {collection &&
            collectionInfo.data?.registry?.status === "blocked" && (
              <ShareRegistration
                key={collection}
                chainId={chainId}
                collection={collection}
                owner={collectionInfo.data.owner}
              />
            )}
          {collectionInfo.data?.registry?.status === "unsupported" && (
            <p className={styles.hint}>
              This collection uses a transfer validator that this registration
              tool does not support. Contact the collection owner if transfer
              simulation fails.
            </p>
          )}
          {helper ? (
            <p className={styles.hint}>
              GasliteDrop:{" "}
              <a
                className={styles.address}
                href={`${chain.blockExplorers?.default.url}/address/${helper}`}
                target="_blank"
                rel="noreferrer"
              >
                {helper} ↗
              </a>
            </p>
          ) : (
            <p role="status">
              The transfer helper is awaiting deployment. You can prepare and
              review your list now.
            </p>
          )}
          <dl className={styles.summary}>
            <div>
              <dt>NFTs confirmed</dt>
              <dd>
                {delivered} / {parsed.rows.length}
              </dd>
            </div>
            <div>
              <dt>Remaining batches</dt>
              <dd>{Math.ceil(remaining.length / airdropBatchSize)}</dd>
            </div>
            <div>
              <dt>Batch size</dt>
              <dd>Up to {airdropBatchSize} NFTs</dd>
            </div>
            {readiness.data && (
              <>
                <div>
                  <dt>Wallet ETH</dt>
                  <dd>
                    {Number(formatEther(readiness.data.gasBalance)).toPrecision(
                      4,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Next batch fee</dt>
                  <dd>
                    {next.length === 0
                      ? "—"
                      : readiness.data.estimatedFee === undefined
                        ? "After approval"
                        : `≈ ${Number(formatEther(readiness.data.estimatedFee)).toPrecision(3)} ETH`}
                  </dd>
                </div>
              </>
            )}
          </dl>
          <p className={styles.hint}>
            The first run may request collection approval, then one wallet
            confirmation per batch. Approval covers this collection and remains
            until you remove it. Gaslite uses standard transfers without a
            receiver check. Confirm contract wallets can retrieve these NFTs. A
            failed batch sends none of its NFTs; earlier confirmed batches
            remain sent.
          </p>
          {!account.isConnected && (
            <p>Connect the wallet holding these NFTs using the button above.</p>
          )}
          {account.isConnected && account.chainId !== chainId && (
            <button
              className="button button-dark"
              type="button"
              disabled={busy || switchChain.isPending}
              onClick={() => switchChain.switchChain({ chainId })}
            >
              Switch to {chain.name}
            </button>
          )}
          {switchChain.error && (
            <p role="alert" className={styles.error}>
              {errorText(switchChain.error)}
            </p>
          )}
          {readiness.isFetching && (
            <p role="status">Checking ownership, approval and network fees…</p>
          )}
          {readiness.error && (
            <p className={styles.error} role="alert">
              {errorText(readiness.error)}
            </p>
          )}
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={reviewed}
              disabled={busy || !parsed.rows.length}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            <span>
              I reviewed every address and token ID. Send these NFTs to these
              recipients.
            </span>
          </label>
          <div className={styles.actions}>
            <button
              className="button button-dark"
              type="button"
              disabled={
                busy ||
                !helper ||
                !collection ||
                !account.address ||
                account.chainId !== chainId ||
                !reviewed ||
                !remaining.length ||
                !collectionInfo.isSuccess ||
                collectionInfo.isFetching ||
                collectionInfo.data?.registry?.status === "blocked" ||
                !readiness.data ||
                Boolean(readiness.error) ||
                readiness.isFetching
              }
              onClick={() => action.mutate("send")}
            >
              {busy
                ? "Confirm in your wallet…"
                : !remaining.length && delivered > 0
                  ? "Airdrop complete"
                  : delivered > 0
                    ? "Continue airdrop"
                    : "Start airdrop"}
            </button>
            {approval.data && (
              <button
                className="button button-small"
                type="button"
                disabled={busy || account.chainId !== chainId}
                onClick={() => action.mutate("revoke")}
              >
                Remove approval
              </button>
            )}
          </div>
          {message && (
            <p role="status" aria-live="polite">
              {message}
            </p>
          )}
          {action.error && (
            <p className={styles.error} role="alert">
              {errorText(action.error)}
            </p>
          )}
          {confirmed.length > 0 && (
            <>
              <ol className={styles.receipts}>
                {confirmed.map((batch, index) => (
                  <li key={batch.hash}>
                    <a
                      href={`${chain.blockExplorers?.default.url}/tx/${batch.hash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Batch {index + 1} · {batch.count} NFTs · confirmed ↗
                    </a>
                  </li>
                ))}
              </ol>
              <p className={styles.hint}>
                Keep this tab open until all batches finish. After a reload,
                remove rows from confirmed transactions before starting again.
              </p>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
