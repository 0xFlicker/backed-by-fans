# Standing buyback execution settings

This replaces the earlier expiring-policy ABI. Redeploy the immutable protocol;
there is no migration or backward-compatible policy endpoint.

`ExecutionLimits` contains `minInput` and `maxInput` (`uint128`, raw input units)
and `minInterval` (`uint64`, seconds). The Safe configures each canonical currency
with `setLimits`, and global spacing with `setGlobalMinInterval`. The combined
`setExecutionLimits(globalInterval, assets, limits)` atomically updates up to 32
unique canonical currencies. Settings never expire and contain no cumulative
budget, price rate, reference hash or signature authority.

`processingStatus(asset, bucket)` returns status, revision, available inventory,
maximum eligible input, minimum input and next eligible timestamp. Statuses:
Ready, NoInventory, Paused, NoRoute, NoLimits, BelowMinimum, Cooldown,
LaunchPenalty, GraduationPending.

Anyone calls `process(asset, bucket, amountIn, expectedRevision, deadline)`.
The vault enforces batch bounds, global and currency cooldowns, supported typed
routes, exact settlement and actual holder burn with supply reconciliation.
Settings and route revisions invalidate stale transaction inputs; they do not
reset clocks. A revert changes no inventory, clock or settlement sequence.

ETH and the fixed canonical WETH address share settings, pause state, route,
revision, clocks and inventory getters. WETH received as fees or synchronized
donations is unwrapped and booked as ETH. Calling both getters does not represent
two balances. Membership and donation accounting remain distinct and share the
same currency cooldown. Conversions create no new revenue.

A successful purchase advances the global and canonical-input clocks. An unwrap
is not a purchase. A partial curve purchase refunds remaining assets to accounted
inventory. Actual input spent must meet the minimum, except when the authentic
closing bonding purchase moves to graduation pending. Direct burns of existing
protocol-token inventory bypass purchase settings and clocks.

These controls govern size and timing, not a fair-price guarantee. Quotes and gas
preferences in the admin calculator/runner are execution aids, not permissions
required from public callers. See [local operations](local-policy-tools.md).
