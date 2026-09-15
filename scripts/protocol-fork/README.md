# Local protocol fixtures

Fresh deployments remain in `OperatorGuarded`, including `serve` runs with
`BBF_FORK_OWNER_ADDRESS`. Seeding memberships does not authorize public buybacks.

For an intentional public-buyback demo, add `--permissionless-demo` to
`python3 scripts/protocol-fork/lifecycle.py serve --run-id YOUR_RUN_ID` with the
existing fork environment and `BBF_FORK_OWNER_ADDRESS` configured. This option
requires a fresh deployment with a launched token. It installs fixture-only
quote-derived public limits and policies using disposable Safe keys before
handing ownership to the review wallet. It cannot reconfigure a restored fork.

The seed script exposes the same explicit selection as `--permissionless`.
Public demo policies have no expiry or lifetime budget; their 20% quote tolerance
is a test setting, not a production recommendation.

## Manual operator buybacks

Open `/chains/31337/tools/buybacks` and connect the appointed operator wallet.
Choose a currency and funding source. The page shows funds ready to buy and
membership fees earned but not yet released. **Release earned fees** settles
bounded accounting work and moves those fees into the vault without purchasing.
After its receipt, enter a normal displayed currency amount or choose **Max**,
review, and submit the purchase with the operator wallet.

ETH, USDG and AMD use routes from the existing verified venue catalog. The page
quotes those pools live, including the final protocol-token purchase, without
reading stored public routes as operator policy or saving economic terms.
Unsupported currencies show that an automatic route is unavailable.

Review obtains positive per-leg minimum outputs, a two-minute chain-time
deadline, simulation and gas estimate. Submit rechecks authority and mode and
simulates the same reviewed terms before requesting a wallet signature. Edits
invalidate the review. Displayed amounts honor current scaled-token multipliers;
a changed input multiplier requires a fresh quote. Success is reconciled from
the confirmed vault burn event. Wallet submission does not provide private
transaction delivery.

Public settings remain under a separate disclosure. Editing those settings does
not activate permissionless execution; mode changes remain Safe-controlled.
