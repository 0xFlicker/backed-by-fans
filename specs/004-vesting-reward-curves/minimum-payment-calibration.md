# Initial currency minimums — 2026-09-10

These are fixed raw-token amounts targeting approximately $1 using the dated references below. They are not a live USD floor. Admin updates apply to future tiers only. Fixed prices meet the floor per period; PWYW is zero or at least the floor. The contract has no price oracle. A creator reviews the raw minimum and publication rejects a changed registry value.

| Token | Minimum token amount | Raw minimum | Reference USD price (2026-09-09) |
| --- | ---: | ---: | ---: |
| USDG | 1 | 1000000 | 1 nominal |
| WETH | 0.00041 | 410000000000000 | 2465.43 |
| AMD | 0.002 | 2000000000000000 | 521.10 |
| NFLX | 0.014 | 14000000000000000 | 76.03 |
| PLTR | 0.006 | 6000000000000000 | 169.53 |
| AMZN | 0.004 | 4000000000000000 | 252.40 |
| TSLA | 0.0028 | 2800000000000000 | 367.81 |

USDG uses six decimals; the others use eighteen. Stock calculations assume the documented 1e18 UI multiplier. Deployment preflight rejects a changed current multiplier and requires recalibration. Mainnet configuration remains inspection-only; this work does not authorize or validate public onboarding. The pinned authentic mainnet preflight separately observes AMD's multiplier as 1e18; that is a historical fork observation, not a current public price guarantee.

The stock references are [AMD](https://stockanalysis.com/stocks/amd/history/), [NFLX](https://stockanalysis.com/stocks/nflx/history/), [PLTR](https://stockanalysis.com/stocks/pltr/history/), [AMZN](https://stockanalysis.com/stocks/amzn/history/) and [TSLA](https://stockanalysis.com/stocks/tsla/history/). WETH uses the dated [ETH historical reference](https://myfin.us/cryptocurrencies/ethereum/historical-data). JSON deployment configuration retains reference dates, prices and URLs.

Mainnet's existing configured set is USDG, AMD and WETH. Testnet configures USDG, AMD, NFLX, PLTR, AMZN and TSLA; WETH is not in its current initial list. A synthetic newly launched protocol token in fork acceptance uses a fixture-only minimum of one raw unit; this is not an approved public token calibration.

The floor discourages low-value funded checkpoints. It does not prevent free tier registry spam or guarantee that processing a checkpoint costs less than the protocol allocation. Explicit registered-tier selection remains the recovery path when automatic discovery is crowded.
