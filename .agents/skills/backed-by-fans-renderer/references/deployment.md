# Browser-wallet deployment and operator boundary

Read this only after the creator has approved the exact canonical-RPC example set or when a public
deployment prerequisite is blocked. Renderer deployment and protocol deployment are different
operations with separate authority.

## Creator renderer deployment

The agent may prepare the package and explain the browser screen. It may not hold or use deployment
authority.

Before deployment is offered, require all of the following:

- the creator approved every representative browser result for the current candidate;
- the page identifies Robinhood testnet and chain ID `46630` with no chain selector or fallback;
- the imported package passed independent browser validation;
- complete final initcode includes every constructor argument;
- raw `salt || initcode` is below Robinhood Nitro's `95,000`-byte public transaction limit;
- the displayed salt and predicted CREATE2 address match the package;
- the canonical CREATE2 deployer has the expected code and the predicted address is unoccupied;
- the creator explicitly asks to deploy and then clicks Deploy.

Local Forge, Anvil, a predicted address, a package, or creator approval does not satisfy the last
step. Nitro may reject a transaction that a permissive local node accepted, so preserve the
complete-payload preflight and surface any canonical-chain rejection plainly.

After the click, the established browser wallet lifecycle owns the write:

1. Wagmi/viem switches or validates the chain and simulates the canonical CREATE2 call.
2. Pass the exact request returned by simulation to the connected browser wallet action.
3. Wagmi/viem owns signature prompts, submission, pending state, receipts, confirmations,
   replacement, cancellation, and revert reporting.
4. After a library-supplied successful receipt, check that code is visible at the predicted address.
5. Show the predicted address as the reusable direct renderer address.

Do not use `cast send`, an agent-held account, a backend signer, a private key, mnemonic, exported
wallet material, keystore password, password file, environment secret, local transaction journal,
custom receipt poller, nonce inference, or recovery loop. The loopback capability cannot request a
wallet prompt or authorize any write. Follow the repository's
[wallet guardrails](../../../../web/AGENTS.md) rather than reimplementing wagmi/viem.

## Plain-language completion

On success, lead with:

> Renderer deployed on Robinhood testnet (chain 46630): `0x…`
>
> Copy this address to use or share the renderer.

Keep transaction hash, payload measurements, and generated artifact details behind technical
disclosure. Normal creator-facing completion does not require receipt interpretation, source
verification, deployment journals, or code-identity proof.

On failure, say:

> Renderer not deployed. [Actionable wallet or canonical-chain reason]. No renderer address was
> published by this attempt.

Also state the strongest completed prerequisite, such as local tests passing or canonical-RPC
examples being approved. Do not turn that prerequisite into a deployment claim.

## Separate direct-renderer protocol deployment

The new immutable direct-renderer protocol must exist on Robinhood testnet before the public feature
can use its generated factory and preview-harness addresses. Deploying it is an operator procedure,
not part of ordinary creator renderer deployment and not authorized by renderer approval.

After all local and Anvil checks pass:

1. Stop before broadcast.
2. State that the pending action deploys a new immutable protocol version to Robinhood testnet, not
   merely the creator's renderer.
3. Request separate explicit operator approval for that public write.
4. Only after approval, let the operator run the existing guarded procedure from `contracts/`:

   ```sh
   ./scripts/deploy-protocol.sh testnet broadcast
   ```

5. The operator enters the encrypted deployment password directly into Cast's interactive terminal
   prompt.

Never ask the operator to paste a password, private key, mnemonic, or keystore material into an
agent prompt, command argument, environment variable, generated file, package, or log. Never export
a key to make the workflow noninteractive. If interactive entry is unavailable, stop; do not add a
fallback signer. Follow the maintained
[deployment runbook](../../../../docs/runbooks/deployment.md) for protocol-specific checks and
recovery.

Protocol deployment approval does not authorize mainnet, and Robinhood mainnet is out of scope.
