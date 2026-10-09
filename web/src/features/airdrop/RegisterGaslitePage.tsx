"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { getAccount, simulateContract } from "@wagmi/core";
import {
  useConfig,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { BaseError, parseEventLogs, type Address, type Hash } from "viem";
import { iAirdropTransferRegistryAbi } from "@/contracts";
import { getSupportedChain, type SupportedChainId } from "@/lib/chains";
import { useHydratedAccount } from "@/lib/use-hydrated-account";
import { airdropPath, inspectCollection, sameAccounts } from "./collection";
import { useAirdropCollection } from "./useAirdropCollection";
import styles from "./ERC721AirdropPage.module.css";

export function RegisterGaslitePage({
  chainId,
  collection,
  helper,
}: {
  chainId: SupportedChainId;
  collection: Address;
  helper: Address;
}) {
  const account = useHydratedAccount();
  const config = useConfig();
  const client = usePublicClient({ chainId });
  const write = useWriteContract();
  const switchChain = useSwitchChain();
  const info = useAirdropCollection(chainId, collection, helper);
  const [reviewed, setReviewed] = useState(false);
  const [message, setMessage] = useState("");
  const [receipts, setReceipts] = useState<{ label: string; hash: Hash }[]>([]);
  const chain = getSupportedChain(chainId);
  const owner = info.data?.owner;
  const registry = info.data?.registry;
  const isOwner = Boolean(
    owner && owner.toLowerCase() === account.address?.toLowerCase(),
  );
  const registered =
    registry && "whitelisted" in registry && registry.whitelisted;
  const registration = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!client || !account.address || !reviewed)
        throw new Error(
          "Connect the collection owner and review the registration.",
        );
      const sender = account.address;
      function assertWallet() {
        const current = getAccount(config);
        if (
          !current.isConnected ||
          current.address?.toLowerCase() !== sender.toLowerCase() ||
          current.chainId !== chainId
        )
          throw new Error(
            "Reconnect the collection owner on the selected network.",
          );
      }
      assertWallet();
      const initial = await inspectCollection(client, collection, helper);
      if (initial.owner?.toLowerCase() !== sender.toLowerCase())
        throw new Error(
          "Only the current collection owner can register GasliteDrop.",
        );
      if (!initial.registry?.policy)
        throw new Error(
          "This collection does not expose a supported OpenSea transfer registry.",
        );
      if (initial.registry.whitelisted) {
        setMessage("GasliteDrop is already registered.");
        return;
      }
      const address = initial.registry.address;
      const policy = initial.registry.policy;
      const sourceId = policy.operatorWhitelistId;
      const helperCode = await client.getCode({ address: helper });
      if (!helperCode || helperCode === "0x")
        throw new Error("GasliteDrop is not deployed on this network.");
      const source = await Promise.all([
        client.readContract({
          address,
          abi: iAirdropTransferRegistryAbi,
          functionName: "getWhitelistedAccountsByCollection",
          args: [collection],
        }),
        client.readContract({
          address,
          abi: iAirdropTransferRegistryAbi,
          functionName: "getBlacklistedAccountsByCollection",
          args: [collection],
        }),
        client.readContract({
          address,
          abi: iAirdropTransferRegistryAbi,
          functionName: "getAuthorizerAccountsByCollection",
          args: [collection],
        }),
      ]);
      // This checks collection configuration, not wallet transaction lifecycle.
      async function assertSource() {
        const fresh = await inspectCollection(client!, collection, helper);
        if (
          fresh.owner?.toLowerCase() !== sender.toLowerCase() ||
          fresh.registry?.address.toLowerCase() !== address.toLowerCase() ||
          fresh.registry.policy?.operatorWhitelistId !== sourceId ||
          fresh.registry.policy.transferSecurityLevel !==
            policy.transferSecurityLevel ||
          fresh.registry.policy.permittedContractReceiversId !==
            policy.permittedContractReceiversId
        )
          throw new Error(
            "The collection owner, validator or policy changed. Reload and review again.",
          );
        const lists = await Promise.all([
          client!.readContract({
            address,
            abi: iAirdropTransferRegistryAbi,
            functionName: "getWhitelistedAccountsByCollection",
            args: [collection],
          }),
          client!.readContract({
            address,
            abi: iAirdropTransferRegistryAbi,
            functionName: "getBlacklistedAccountsByCollection",
            args: [collection],
          }),
          client!.readContract({
            address,
            abi: iAirdropTransferRegistryAbi,
            functionName: "getAuthorizerAccountsByCollection",
            args: [collection],
          }),
        ]);
        if (lists.some((list, i) => !sameAccounts(list, source[i])))
          throw new Error(
            "The collection's registry list changed. Reload and review again.",
          );
        assertWallet();
      }
      await assertSource();
      setReceipts([]);
      setMessage(
        "1 of 3 · Confirm copying the current registry list in your wallet.",
      );
      const name = "Backed By Fans · GasliteDrop";
      const copy = await simulateContract(config, {
        chainId,
        account: sender,
        address,
        abi: iAirdropTransferRegistryAbi,
        functionName: "createListCopy",
        args: [name, sourceId],
      });
      assertWallet();
      const copyHash = await write.writeContractAsync(copy.request);
      const copyReceipt = await client.waitForTransactionReceipt({
        hash: copyHash,
      });
      if (copyReceipt.status !== "success")
        throw new Error("List creation reverted.");
      const created = parseEventLogs({
        abi: iAirdropTransferRegistryAbi,
        eventName: "CreatedList",
        logs: copyReceipt.logs,
      }).filter(
        (event) =>
          event.address.toLowerCase() === address.toLowerCase() &&
          event.args.name === name,
      );
      if (created.length !== 1 || created[0].args.id >= 2n ** 120n)
        throw new Error(
          "The receipt does not confirm the new registry list. Check your wallet transaction.",
        );
      const id = created[0].args.id;
      setReceipts([
        { label: "Copied registry list", hash: copyReceipt.transactionHash },
      ]);
      async function assertCopy(added: boolean) {
        const [listOwner, whitelist, blacklist, authorizers] =
          await Promise.all([
            client!.readContract({
              address,
              abi: iAirdropTransferRegistryAbi,
              functionName: "listOwners",
              args: [id],
            }),
            client!.readContract({
              address,
              abi: iAirdropTransferRegistryAbi,
              functionName: "getWhitelistedAccounts",
              args: [id],
            }),
            client!.readContract({
              address,
              abi: iAirdropTransferRegistryAbi,
              functionName: "getBlacklistedAccounts",
              args: [id],
            }),
            client!.readContract({
              address,
              abi: iAirdropTransferRegistryAbi,
              functionName: "getAuthorizerAccounts",
              args: [id],
            }),
          ]);
        const expected = added ? [...source[0], helper] : source[0];
        if (
          listOwner.toLowerCase() !== sender.toLowerCase() ||
          !sameAccounts(whitelist, expected) ||
          !sameAccounts(blacklist, source[1]) ||
          !sameAccounts(authorizers, source[2])
        )
          throw new Error(
            "The copied registry list does not match the reviewed configuration. It has not been applied.",
          );
      }
      await assertCopy(false);
      await assertSource();
      setMessage(
        "2 of 3 · Confirm adding GasliteDrop to the copied allowlist.",
      );
      const add = await simulateContract(config, {
        chainId,
        account: sender,
        address,
        abi: iAirdropTransferRegistryAbi,
        functionName: "addAccountToWhitelist",
        args: [id, helper],
      });
      assertWallet();
      const addHash = await write.writeContractAsync(add.request);
      const addReceipt = await client.waitForTransactionReceipt({
        hash: addHash,
      });
      if (addReceipt.status !== "success")
        throw new Error("Adding GasliteDrop reverted.");
      await assertCopy(true);
      setReceipts((previous) => [
        ...previous,
        { label: "Added GasliteDrop", hash: addReceipt.transactionHash },
      ]);
      await assertSource();
      setMessage(
        "3 of 3 · Confirm applying your new registry list to this collection.",
      );
      const apply = await simulateContract(config, {
        chainId,
        account: sender,
        address,
        abi: iAirdropTransferRegistryAbi,
        functionName: "applyListToCollection",
        args: [collection, id],
      });
      assertWallet();
      const applyHash = await write.writeContractAsync(apply.request);
      const applyReceipt = await client.waitForTransactionReceipt({
        hash: applyHash,
      });
      if (applyReceipt.status !== "success")
        throw new Error("Applying the list reverted.");
      const applied = parseEventLogs({
        abi: iAirdropTransferRegistryAbi,
        eventName: "AppliedListToCollection",
        logs: applyReceipt.logs,
      }).filter(
        (event) =>
          event.address.toLowerCase() === address.toLowerCase() &&
          event.args.collection.toLowerCase() === collection.toLowerCase() &&
          event.args.id === id,
      );
      if (applied.length !== 1)
        throw new Error(
          "The receipt does not confirm registration for this collection. Check your wallet transaction.",
        );
      await assertCopy(true);
      const after = await info.refetch();
      if (after.error) throw after.error;
      const final = after.data?.registry;
      if (
        final?.address.toLowerCase() !== address.toLowerCase() ||
        !final.policy ||
        final.policy.operatorWhitelistId !== id ||
        final.policy.transferSecurityLevel !== policy.transferSecurityLevel ||
        final.policy.permittedContractReceiversId !==
          policy.permittedContractReceiversId ||
        !("whitelisted" in final) ||
        !final.whitelisted
      )
        throw new Error(
          "Registration was not confirmed in the collection's current registry.",
        );
      setReceipts((previous) => [
        ...previous,
        { label: "Applied to collection", hash: applyReceipt.transactionHash },
      ]);
      setMessage(
        "GasliteDrop registered. The NFT holder can now prepare the airdrop.",
      );
    },
  });
  const error = registration.error ?? info.error ?? switchChain.error;
  return (
    <section className="page-shell">
      <header className={styles.intro}>
        <p className="eyebrow">Collection owner · {chain.name}</p>
        <h1>
          Make room
          <br />
          for your airdrop.
        </h1>
        <p>
          Register GasliteDrop with your collection&apos;s OpenSea transfer
          registry.
        </p>
      </header>
      <section className={styles.panel} aria-label="Register GasliteDrop">
        <h2>{info.data?.name ?? "NFT collection"}</h2>
        <p className={styles.address}>Collection: {collection}</p>
        <p className={styles.address}>GasliteDrop: {helper}</p>
        {owner && <p className={styles.address}>Collection owner: {owner}</p>}
        {registry && (
          <p className={styles.address}>
            Transfer registry: {registry.address}
          </p>
        )}
        {info.isFetching && (
          <p role="status">Checking collection ownership and registry…</p>
        )}
        {info.data && !registry?.policy && (
          <p>
            This collection does not expose a supported OpenSea transfer
            registry. No registration is available.
          </p>
        )}
        {registered && (
          <p role="status">
            GasliteDrop is already registered for this collection.
          </p>
        )}
        {!registered && registry?.policy && (
          <>
            <p>
              Three wallet confirmations: copy the current list, add
              GasliteDrop, then apply the copy. Existing allowlisted operators,
              blocked accounts, authorizers and security policy are preserved.
            </p>
            <p>
              The new list belongs to you. Future changes to the old shared list
              will no longer carry over. If you stop before the final
              confirmation, the collection keeps its current list.
            </p>
            {!account.isConnected ? (
              <p>
                Connect the collection owner&apos;s wallet using the button
                above.
              </p>
            ) : !isOwner ? (
              <p role="alert">
                Only the collection owner shown above can register GasliteDrop.
                Switch to that wallet.
              </p>
            ) : null}
            {account.isConnected && account.chainId !== chainId && (
              <button
                className="button button-small"
                disabled={registration.isPending || switchChain.isPending}
                onClick={() => switchChain.switchChain({ chainId })}
              >
                Switch to {chain.name}
              </button>
            )}
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={reviewed}
                disabled={registration.isPending}
                onChange={(event) => setReviewed(event.target.checked)}
              />
              <span>
                I reviewed the collection and GasliteDrop addresses and agree to
                use a new owner-controlled registry list.
              </span>
            </label>
            <button
              className="button button-dark"
              disabled={
                !reviewed ||
                !isOwner ||
                account.chainId !== chainId ||
                registration.isPending ||
                info.isFetching
              }
              onClick={() => registration.mutate()}
            >
              {registration.isPending
                ? "Confirm in your wallet…"
                : "Register GasliteDrop"}
            </button>
          </>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error instanceof BaseError ? error.shortMessage : error.message}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {receipts.length > 0 && (
          <ul className={styles.receipts}>
            {receipts.map((receipt) => (
              <li key={receipt.hash}>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`${chain.blockExplorers?.default.url}/tx/${receipt.hash}`}
                >
                  {receipt.label} · confirmed ↗
                </a>
              </li>
            ))}
          </ul>
        )}
        <p>
          <a href={airdropPath(chainId)}>Return to airdrop</a>
        </p>
      </section>
    </section>
  );
}
