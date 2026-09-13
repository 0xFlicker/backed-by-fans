# Deployment resource evidence — T065

Local only: disposable Anvil chain 31337, mock payment currency, local unlocked owner and unbound protocol token. No public transaction, new active network deployment or authentic fork proof.

Commands: `bash contracts/scripts/build-linked-protocol.sh`; in `contracts`, `FOUNDRY_PROFILE=robinhood forge test --libraries "$(jq -r .mapping out/vesting-leaf/link-manifest.json)" --match-path test/deployment/VestingLinking.t.sol -vv`; then fresh `anvil --host 127.0.0.1 --port 19858 --chain-id 31337 --code-size-limit 98304 --gas-limit 100000000 --silent` and `bun scripts/rehearse-split-deployment.ts http://127.0.0.1:19858`.

The linked deployment tests passed 2/2 with intended-profile settings and **no test-harness size/gas overrides**. Exact canonical CREATE2 library/runtime checks passed; leaf creation 26,880 bytes, runtime 26,828 bytes. The rehearsal checked every graph binding, code-store chunk, source/runtime match and creator tier configuration. All transaction payloads remain below 95,000 bytes, initcode below 196,608 bytes and runtimes below 98,304 bytes. Block/transaction ceiling is 100,000,000 gas.

| Local transaction | Payload bytes | Gas used |
|---|---:|---:|
| fixture payment token | 2,461 | 533,689 |
| vesting ledger | 26,912 | 5,867,609 |
| media store factory | 10,029 | 2,213,465 |
| renderer | 52,459 | 11,411,670 |
| preview harness | 882 | 231,938 |
| tier code A | 24,251 | 5,221,810 |
| tier code B | 24,251 | 5,221,270 |
| factory | 58,428 | 12,016,399 |
| creator tier creation | 1,572 | 8,768,426 |

Created tier runtime: 41,171 bytes. The creator-creation regression/rehearsal budget is now 10,000,000 gas because the previous 7,500,000 limit is below measured lifecycle creation cost. The chain ceiling was not raised. Large Solidity test fixture overrides (1,000,000 code bytes / 1,000,000,000 gas) are separate and do not establish deployment feasibility.

Logs: `/tmp/bbf-linking-profile.log`, `/tmp/bbf-rehearsal-final.log`. Rehearsal retains exact transaction receipts, graph and source snapshot under ignored `contracts/deployments/split-rehearsal/`. The new ABI has no active factory deployment: the obsolete `broadcast/DeployDirectProtocol.s.sol/46630/run-latest.json` pointer was removed; its matching timestamped historical record remains.
