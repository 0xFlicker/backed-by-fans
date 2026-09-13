# Feature 005 testnet release preparation

Prepared 2026-09-13 UTC from feature source `d83c922`, with preparation source committed as `529abc5`. Guarded manifest preparation passed; exact-candidate rehearsal follows the manifest commit. This is preparation evidence, not a public deployment record. The existing fork on port 18557 and webpage on port 3110 remain running.

## Release configuration

| Setting | Reviewed value |
| --- | --- |
| Network | Robinhood testnet, chain 46630 |
| Signing account | `backed-by-fans-testnet` (encrypted keystore exists; not unlocked) |
| Deployer | `0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027` |
| Protocol owner Safe | `0xeAA4B38A99f766117C1D493a21012fec25f70505` |
| Safe ownership | Deployer above is the sole owner; threshold 1 |
| Payment tokens | Existing reviewed USDG, AMD, NFLX, PLTR, AMZN, TSLA list |
| Protocol token | Zero address, preserving the existing pre-token testnet plan |
| Explorer | <https://explorer.testnet.chain.robinhood.com> |

At block 118525193 the deployer held 11.3659907512291296 testnet ETH and RPC gas price was 0.01 gwei. These are a snapshot, not a cost estimate. Public deployment rechecks funding and gas. The local fork's new 0.1 gwei launch default does not override public testnet gas.

Live read-only checks validated chain identity, all six payment-token runtime hashes and symbols, the canonical CREATE2 deployer runtime, and Safe owners/threshold. Solidity `DeployProtocol.validateInputs()` also passed against testnet. No signer was unlocked and no public transaction or verification submission was made.

Keeping the protocol token unset allows membership deployment and payment accrual. Buybacks require a later validated protocol-token binding; this release does not activate that token or invent a testnet token address.

## Candidate deployment graph

The six ordered CREATE2 components are VestingLedger, media-store factory, renderer, preview harness, locked MembershipTier implementation, and MembershipFactory. Factory construction also creates its buyback vault and burn router. Tiers use fixed-target ERC-1167 clones initialized atomically by the factory.

Read-only Solidity predictions from the source above:

| Component | Predicted address |
| --- | --- |
| VestingLedger | `0xeC7004f51b7dA735a595ADDEAB68e7A339474429` |
| Media-store factory | `0x871396021051a27Bd67e6f8Ab73b5071f6aB0B80` |
| Renderer | `0x94DC932dFdde3a394F59271f97603B62530d28c8` |
| Preview harness | `0x1BF436A67b71Ab6153f9B84507D7cC0c83c1F297` |
| MembershipTier implementation | `0x47c1E3a745cE309963c22F0399d738eC1c838EEe` |
| MembershipFactory | `0xE0a9f373cF1B2e56825f68c7050b3E6d81131B59` |

Guarded `prepare` regenerated these same addresses from committed source and validated testnet state. They are now the prepared operational manifest, not publicly deployed or promoted addresses. The obsolete A/B fields were removed; the old completed journal was verified and archived byte-for-byte as `candidate-d792d793d357-promoted.json`. Historical broadcasts remain intact.

The preparation fix removes obsolete A/B code-store, tier-deployer and tier-creation-code fields from the operational manifest. The schema-9 deployment journal's `tierCreationCode` still intentionally records implementation initcode metadata.

## Finish preparation

From `/Users/user/Development/backed-by-fans`:

1. Review and commit the two deployment-script changes, updated runbook, this document and public preparation evidence. `contracts/scripts/deploy-protocol.sh:653` requires all source committed before `prepare`; do not bypass that guard.
2. Generate the official candidate without a signing account:

   ```sh
   cd /Users/user/Development/backed-by-fans/contracts
   PROTOCOL_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000 \
     ./scripts/deploy-protocol.sh testnet prepare
   git diff -- config/operational-state/46630.json
   ```

3. Confirm the owner, token list, zero protocol token, six component addresses and exact runtime hashes. Confirm obsolete A/B fields are absent. Review and commit the generated manifest.
4. Rehearse the exact candidate:

   ```sh
   ./scripts/deploy-protocol.sh testnet dry-run
   ```

   Expected: exact chain-46630 raw CREATE2 preflight passes in a separate temporary Anvil instance; component code, factory dependencies, Safe ownership and native Robinhood limits match. No public submission or active web-binding promotion occurs. This rehearsal is still pending the commits above.

## Public deployment and explorer acceptance

Public broadcast requires separate authorization after the committed candidate and rehearsal are reviewed:

```sh
ACCOUNT=backed-by-fans-testnet ./scripts/deploy-protocol.sh testnet broadcast
```

The wrapper verifies all six directly deployed components through Blockscout and records verification before promoting generated addresses. If deployment succeeds but verification stops, use `testnet resume-verify` against the recorded source and journal; do not redeploy blindly.

Membership implementation verification uses Solidity `0.8.36+commit.8a079791`, optimizer 200 runs, Cancun, `viaIR=false`, IPFS metadata, and the exact VestingLedger library mapping. The local standard JSON input was generated successfully; its settings and SHA-256 are recorded in the evidence directory. The implementation has 44,465-byte initcode and 44,251-byte runtime, within Robinhood's 196,608/98,304-byte limits.

After authorized deployment:

1. Confirm the implementation source/ABI is verified on the explorer. Confirm the implementation is initialized/locked and the factory binds that exact implementation address.
2. Create a representative tier through the factory. Verify its 45-byte runtime embeds the implementation address, its initialized terms match creation inputs, and reinitialization fails.
3. Open the tier's subtle **View contract ↗** link. Confirm the correct chain/address and explorer recognition of the clone and verified implementation. Save the page/API evidence and transaction receipt. Bytecode identity alone does not prove explorer recognition.
4. Create a second independent tier after implementation verification. Confirm the explorer recognizes the same verified implementation without another Solidity source upload. This is the acceptance test for “verify once.” If recognition needs a proxy association request, record that explicitly instead of claiming automatic recognition.
5. Check the factory-created vault and burn router explorer pages separately. The current wrapper's six-component source-verification loop does not independently submit these constructor-created contracts; report their actual verification state, and verify them with their constructor arguments if Blockscout has not matched them.

Blockscout documents contract metadata and proxy association separately: [contract API](https://docs.blockscout.com/api-reference/get-smart-contract), [proxy verification API](https://docs.blockscout.com/devs/apis/rpc/contract). Explorer recognition is a live acceptance gate, not something the local build proves.

Only promote the testnet website after reviewing the deployment and explorer results. No testnet website cutover, sample membership purchase, or public signing is included in the preparation performed here.

## Evidence

Public preflight snapshots, preliminary predictions and compiler settings are in `artifacts/testnet-release-005/`. Validation results are recorded in `validation.md` in that directory. Existing feature-005 implementation, fork, wallet and deployment evidence is preserved; it does not substitute for the new testnet explorer acceptance steps above.
