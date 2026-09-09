# No-token testnet deployment candidate

Prepared 2026-09-09. **Not broadcast.** Existing testnet contracts and website
remain active. Deployment source and manifest commit: `c4754ea`.

- Chain: Robinhood Chain Testnet, 46630.
- Protocol token: zero; fees accrue and can be collected, with no purchases/burns.
- Safe: `0xeAA4B38A99f766117C1D493a21012fec25f70505`, 1-of-1 owner
  `0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027`.
- Deployer: same owner wallet; observed balance 11.3671 testnet ETH.
- Initial payment tokens: USDG, AMD, NFLX, PLTR, AMZN and TSLA.

| Component | Predicted address |
| --- | --- |
| mediaStoreFactory | `0x94d79131c69bD41Da715D9C9DEaA851588b7174c` |
| renderer | `0xc21aDdA35ED9565E808fdd2a254c51831D90330a` |
| previewHarness | `0x369d13442eEb924105879Eb0EF0b39b619A1DF70` |
| membershipFactory | `0x72681c494302092cE571ae10A27fC59a1E4AF206` |

Validation: 19 deployment Solidity tests passed; zero-token release parity passed.
The deployment wrapper regression suite passed, including explicit zero-token
preparation, recovery and signing guards.
Live testnet chain, Safe and payment-token validation passed. All four raw CREATE2
transactions deployed successfully on an isolated chain-46630 fork; post-deployment
validation passed. No signing key was loaded and no public transaction was submitted.
Logs: `artifacts/testnet-no-token/prepare.log` and `dry-run.log`.

After public deployment approval, run from `contracts/` in a clean committed checkout:

```sh
ACCOUNT=backed-by-fans-testnet ./scripts/deploy-protocol.sh testnet broadcast
```

The wrapper repeats its local rehearsal, requests the encrypted account password
in the terminal, journals submissions, verifies sources and promotes bindings.
The website deployment/cutover remains a separate step. New memberships use the new
factory; existing memberships retain their existing contracts.

Later token binding requires a valid Pons launch on this chain. This candidate
provides no testnet Pons installation and does not promise testnet burn activation.
