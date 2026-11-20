# Mainnet research evidence

Research date: 2026-11-19. The address book and chain state can change; verify again at deployment.

## Network and market identity

[Ink official network information](https://docs.inkonchain.com/general/network-information) lists chain ID 57073, public RPC `https://rpc-gel.inkonchain.com`, and explorer `https://explorer.inkonchain.com`. A read-only `eth_chainId` returned `0xdef1` (57073).

[Tydro's official address book](https://docs.tydro.com/vii.-developers/developer-overview/smart-contracts/contract-addresses) and [Aave DAO's Ink whitelabel address book](https://github.com/aave-dao/aave-address-book/blob/main/src/AaveV3InkWhitelabel.sol) agree on:

| Contract | Address |
| --- | --- |
| PoolAddressesProvider | `0x4172E6aAEC070ACB31aaCE343A58c93E4C70f44D` |
| Pool proxy | `0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA` |
| ProtocolDataProvider | `0x96086C25d13943C80Ff9a19791a40Df6aFC08328` |
| PriceOracle | `0x4758213271BFdC72224A7a8742dC865fC97756e1` |

Read-only `eth_call` to the provider returned exactly those Pool, oracle and data provider addresses. These discovery calls used `latest`, so they are not a single pinned snapshot. Pool `getReservesList()` returned 14 addresses. Oracle `BASE_CURRENCY_UNIT()` returned 100000000. The block number returned in the same RPC batch was `0x3ab5216` (61559318), but the `latest` calls are not guaranteed to have used that block.

The [Ink explorer provider API](https://explorer.inkonchain.com/api/v2/smart-contracts/0x4172E6aAEC070ACB31aaCE343A58c93E4C70f44D) returned a partially verified PoolAddressesProvider and ABI. The [Pool proxy API](https://explorer.inkonchain.com/api/v2/smart-contracts/0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA) reported an EIP-1967 proxy with implementation `0x6a056dA055C616cd89dBcd0dC4b3f4E0F6162eb6`, agreeing with Aave's address book but differing from the L2PoolInstance listed in Tydro's address book. Explorer reports are mutable; bytecode/implementation and ABI must be checked at the block used. We have not completed that check for every contract.

[Tydro's contract documentation](https://docs.tydro.com/vii.-developers/developer-overview/smart-contracts) points to Aave V3 origin and describes the Pool, oracle, and provider. Its [view contract documentation](https://docs.tydro.com/vii.-developers/developer-overview/smart-contracts/view-contracts) gives signatures and return fields used by the probe. These facts establish Aave V3 lineage and selected working read interfaces, not universal compatibility with every version or standard deployment. Stable debt, e-mode, rounding, upgrades, and oracle handling must not be assumed identical.

## Reproducible recorded borrower snapshot

At **block 61559318**, an observed public Borrow event identified `0xc468315a2df54f9c076bd5cfe5002ba211f74ca6`. The event search covered the preceding 20,000 blocks in 1,000-block windows. This is public onchain data, included as a verification fixture, not a representative user or fabricated position.

The `evidence/wallet-request.json` and `evidence/reserves-request.json` files contain the exact read-only JSON-RPC requests, all pinned to `0x3ab5216`; corresponding `*-response.json` files contain the returned payloads. Re-run each request with `curl -H 'content-type: application/json' --data-binary @evidence/wallet-request.json https://rpc-gel.inkonchain.com` (and similarly for reserves). A node must retain historical state for the requested block. These fixtures contain no credentials. `npm test` independently ABI-decodes them.

The Pool returned total collateral **6690279291869557**, total debt **6018408784565955** in 1e8 base units, effective liquidation threshold **9200 bps**, health factor **1.022705031985276228**, and e-mode category **5**. The data provider reported USDe supply `66983535.542273583240756873` (18 decimals) enabled as collateral and USDT0 variable debt `60256721.900806` (6 decimals); both returned a price of `99879459` in oracle base units. Plain floor normalization matches the collateral total, but is **one base unit below** protocol debt. The previous estimate was 72 wei below the Pool result because it rounded the weighted collateral before division. The calculation below now reproduces the Pool result exactly for the recorded snapshot. In particular the USDe reserve's ordinary threshold is 0 while the account's effective threshold is 9200: e-mode matters.

## Implementation, rounding, and e-mode verification

The explorer's [implementation record](https://explorer.inkonchain.com/api/v2/smart-contracts/0x6a056dA055C616cd89dBcd0dC4b3f4E0F6162eb6) reports `L2PoolInstance`, Solidity 0.8.27, verified with `is_partially_verified: true`; do not interpret this as full bytecode verification. At block 61559318 the Pool's EIP-1967 implementation slot returned this same address. The explorer-supplied GenericLogic.sol source has SHA-256 `4b18019505e4fbfab2624f371f28946557588c22f5c51e331fd2595613ba516d`. The returned source computes collateral values by floor division, debt values by ceiling division, and uses the unrounded sum `Σ(collateralBase × effectiveThresholdBps)` to calculate `wadDiv(sum, debt) / 10000`. `wadDiv` rounds half up; only after computing health does the contract divide the sum by total collateral to report an average threshold. This ordering resolves the 72 wei difference. The oracle price is in market base units; token values use each reserve's configured decimals. The base address was zero and the base unit was 1e8 at the pinned block. A block timestamp is not a price-feed freshness guarantee: `getAssetPrice` supplies no timestamp, and a positive result alone does not establish freshness or show whether a fallback was used.

Recorded pinned e-mode calls are in `evidence/emode-request.json` and `evidence/emode-response.json`. Category 5 has LTV 9000 bps, liquidation threshold 9200 bps, collateral bitmap 1536 (reserve IDs 9 and 10), and borrowable bitmap 4 (reserve ID 2). The original borrower had reserve ID 10 (USDe) as collateral and ID 2 (USDT0) as debt. The Pool uses the category threshold only for collateral reserves whose ID bit is set; the borrowable bitmap is a borrow eligibility setting, not a health-factor threshold. Pinned `getReserveData` calls for IDs 10 and 2 are in `evidence/reserve-id-*.json`. The explorer records for the [data provider](https://explorer.inkonchain.com/api/v2/smart-contracts/0x96086C25d13943C80Ff9a19791a40Df6aFC08328) and [oracle](https://explorer.inkonchain.com/api/v2/smart-contracts/0x4758213271BFdC72224A7a8742dC865fC97756e1) report partially verified contracts; selected ABI return layouts match the recorded successful calls, not a blanket compatibility guarantee.

Additional public onchain snapshots at block 61559318 are recorded in `evidence/wallets-request.json` and `evidence/wallets-response.json`. Exact calculations matched collateral, debt, effective threshold, and health factor for these and the original borrower:

| Address | E-mode | Protocol health factor | Position |
| --- | --- | --- | --- |
| `0xc468315a2df54f9c076bd5cfe5002ba211f74ca6` | 5 | 1.022705031985276228 | Borrower |
| `0x1be45fef92c4e2538fecd150757ed62b7b3757d7` | 5 | 1.022679195368482199 | Borrower |
| `0x5967c5080b0cea77d6bfc133f3d926753b471501` | 0 | 8.139209916292034806 | Borrower |
| `0xb143f6ca55358fac056eca7ac1a228a1f018b048` | 0 | 1.106289018663443176 | Borrower |
| `0x0000000000000000000000000000000000000000` | 0 | max uint256 (no debt) | Empty account |

No multi-collateral mainnet position has yet been independently tested; multi-collateral arithmetic is covered by a synthetic unit test. Request/response replay is an offline integration test, not a current live RPC test. `npm test` runs these tests. `WALLET_ADDRESS=<public-address> npm run test:live` exercises the experimental viem adapter against the current RPC, compares every calculated account metric to the Pool, and fails closed on a mismatch. Set `INK_RPC_URL` to another trusted Ink RPC if necessary. The adapter pins calls to one block, checks chain ID, provider pointers, implementation, block time, same-block hash, price presence, and reconciliation. It does not prove feed freshness.

## Remaining blockers

The application now implements live lookups through `/api/position`, but this new endpoint has not been tested live in the Codex sandbox. This sandbox reports `CODEX_SANDBOX_NETWORK_DISABLED=1`; Node 22 DNS resolution of the public RPC returns `EAI_AGAIN` using `/etc/resolv.conf`'s WSL resolver. The explicitly allowed curl calls above worked, while `npm run test:live` failed on the first viem `eth_chainId` request. No proxy variables were supplied, and TLS verification was not weakened. The environment network policy/resolver must permit normal Node HTTPS access before an actual end-to-end live-adapter test can pass. A permitted HTTPS RPC endpoint and an ordinary network-enabled environment are required; do not change the system resolver or bypass the sandbox as a production fix.

Oracle source freshness/fallback validation, live adapter behavior on a network-enabled runtime, a real multi-collateral account, and production RPC rate/reliability behavior remain unverified. Proxy implementation or provider changes intentionally make the adapter fail closed pending review. The live dashboard is now connected to the adapter; synthetic simulations remain separate. Oracle freshness is disclosed as unknown, and a fresh block does not establish fresh source prices.


## User-reported WSL verification and dashboard integration

The user reported that `node scripts/verify-tydro.mjs` succeeded from WSL with viem 2.58.1 at block 61561368, returning chain 57073, market ID `Aave V3 Ink Whitelabel Market`, the four addresses in the table above, base unit 100000000, and 14 reserves. This is a user-reported market probe result, not independently reproduced here and not a live test of the newly added `/api/position` route or browser view.

The route now invokes the reconciled viem adapter and serializes only live results; failures return no position. The UI shows block timestamp and age, removes the snapshot after 120 seconds, and labels oracle feed freshness unknown. Recorded fixtures test mode separation, stale display, and errors offline. The pinned provider and implementation safeguards can cause a deliberate outage after an upgrade. The new dashboard integration and real multi-collateral positions still require the WSL checks in [README.md](README.md).


## Live simulation implementation

The simulator reuses the same `calculateProtocolAccount` arithmetic and first checks that the serialized active positions reproduce all four Pool account metrics. It then applies hypothetical token amounts and price changes to the snapshot, holding the E-mode category, collateral flags, and thresholds fixed. Deterministic tests cover multiple collateral and debt assets, E-mode eligibility, integer rounding, shocks and zero debt. Existing recorded Pool fixture tests remain the evidence for baseline reconciliation; the multi-asset scenario is synthetic, not an independently observed mainnet account or an onchain execution. No source timestamp is supplied by the protocol price call.

The official [Tydro terms](https://tydro.com/terms-of-service) identify [app.tydro.com](https://app.tydro.com/) as its interface. Guardian links only to the app home and does not construct transaction links. No analytics are collected; the README records a proposed measurement plan, not results.

## Live adapter verification on 2026-11-19

A read-only `npm run test:live` run against Ink RPC for the public recorded account succeeded at block **61580078**. The Pool and adapter both returned collateral `8293205876251266`, debt `7461313754214362`, weighted threshold `9200` bps, and health factor `1022574530100904211` (18 decimals), with E-mode category 5. This checks the adapter at that block, not the browser or API route end to end, a multi-collateral position, or oracle feed freshness. These values are a historical observation and will change.


## Risk Action Plan evidence and boundaries

The action plan uses the existing live simulation as its only HF calculation, and checks baseline reconciliation before searching. Binary search operates on integer token units, with repayment bounded by recorded variable debt and all searches capped at `2^120 − 1` units. A result is evaluated again, as is one unit below it, and it is withheld if either check fails. A conservative uint256 intermediate check and bounded search can exclude extreme scenarios. The recorded category 5 fixture tests the plan against the Pool-reconciled baseline; hypothetical action outcomes are calculations, not observed or executed onchain transactions. Synthetic tests cover E-mode eligibility, multiple collateral and debt assets, shared collateral/debt, decimal rounding, impossible targets, no debt, bounds, missing prices and mismatches. They do not verify actual supply or repayment execution, caps, liquidity, wallet balances or oracle source freshness.

## Live verification foundation — 2026-11-20

The following are read-only observations, not guarantees about later blocks. The market probe returned chain ID 57073 at block 61658084, the provider, Pool, oracle and data provider listed above, base unit 1e8 and 14 active reserves. The adapter checks the Pool EIP-1967 implementation against `0x6a056dA055C616cd89dBcd0dC4b3f4E0F6162eb6` at each position's block and completed successfully for all four positions below. USDe is reserve ID 10, `0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34`, 18 decimals, ordinary threshold 0 bps; USD₮0 is ID 2, `0x0200C29006150606B650577BBE7B6248F58470c1`, 6 decimals, ordinary threshold 7800 bps. Both were active at the probe block.

In each row the adapter's reconstructed collateral, debt, weighted threshold and health factor matched the Pool exactly. Collateral and debt are raw 1e8 base units; health factor is raw 1e18 except the empty account's max-uint sentinel.

| Public wallet | Block | Position | Collateral | Debt | Threshold bps | Health factor raw |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| `0xc468315a2df54f9c076bd5cfe5002ba211f74ca6` | 61658011 | E-mode 5; USDe collateral, USD₮0 debt | 9042844921099045 | 8131839443865816 | 9200 | 1023067091380758037 |
| `0x0000000000000000000000000000000000000000` | 61658142 | Empty | 0 | 0 | 0 | `2^256 - 1` |
| `0x77fff1b6566774Bb265F9498bE3db2A46ACEBbF1` | 61658727 | kBTC collateral; kBTC, USD₮0, USDG, USDC and USDe variable debt | 32712242043 | 10921740394 | 8700 | 2605779807130801135 |
| `0xAfAd92a267e871a90A3bB0BB0E46dCbA65f34357` | 61659310 | WETH and kBTC collateral; USDC variable debt | 278826657060 | 127788148103 | 8353 | 1822584181831587615 |

The category 5 collateral bitmap was 1536 (IDs 9 and 10) and the category threshold was 9200 bps at block 61658011. The two multi-asset accounts were discovered by scanning recent public Borrow and Supply events and reading current user configuration; their positions may change. This is live observation, not a persisted request/response fixture or an exhaustive protocol test. Stable debt remains unsupported and fails closed.

The local API returned 200 for the E-mode borrower at block 61658154 and the empty account at block 61658481, and returned 400 for an invalid address. A production server configured with an unreachable RPC returned 503 with an error and no position data. A React static render of a live multi-debt API response displayed the live position and unknown-freshness label; when rendered with an age of 121 seconds it hid the balances and showed the stale message. Existing tests cover mocked RPC failure and error masking. The page returned HTTP 200, but no interactive browser was available, so browser fetch, timer, refresh and visual behavior were not independently exercised end to end. Intermittent sandbox DNS failures were encountered; permitted network-enabled read-only runs succeeded.

At block 61658467, `getSourceOfAsset` returned the same source, `0x00F5c1A7470b0aF87ca03F9633E5b54b20B9e244`, for USDe and USD₮0; the fallback oracle address was zero. The [explorer's source record](https://explorer.inkonchain.com/api/v2/smart-contracts/0x00F5c1A7470b0aF87ca03F9633E5b54b20B9e244) identifies `PriceCapAdapterStable`, whose `latestAnswer` reads an underlying aggregator and caps its answer. At block 61658869 the underlying aggregator was `0x5aF168556BaA3Bd5c232261F7D7C662a2Ed0Db85`, described as USDT / USD; cap was 104000000 and answer 99885458. Its `latestRoundData` returned updatedAt 1795133821, while the block timestamp was 1795157280. The capped adapter does not expose `latestRoundData`; the app does not validate the upstream round, heartbeat, sequencer status or feed freshness. This observed timestamp is not a freshness guarantee and the shared oracle value does not imply USDe and USD₮0 market prices move identically.

On this run `npm run lint`, `npm test` (nine test files), and `npm run build -- --webpack` passed. No transactions or signatures were used.

## Risk Fingerprint implementation

The fingerprint derives its baseline from the serialized live snapshot and re-runs the existing simulator's four-metric Pool reconciliation before displaying results. Known USDe and USD₮0 identities use the addresses recorded in the live verification above. Collateral values and debt values use the existing protocol arithmetic; shares are truncated to basis points after division by enabled collateral. E-mode eligibility comes from the snapshot collateral bitmap. Presets apply separate -5% and -10% hypothetical oracle shocks using the existing live simulation. No observed market price or feed-freshness claim is inferred from these scenarios. The original Mission 01 live observations above remain historical; the fingerprint itself has not been validated in an interactive browser against live RPC.

## Conditional liquidation boundary implementation

The planner first reconciles the existing snapshot through `simulateLive`, then searches positive integer oracle-price units with `calculateProtocolAccount`. With unchanged debt, weighted collateral and health factor are nondecreasing as the selected collateral price rises, so binary search is valid. An asset used as both collateral and debt can have rounding-induced reversals: its full price range is enumerated only up to 4096 raw units, and results are withheld on any reversal or a larger range. The reported unit must yield HF below 1 and the adjacent higher unit HF at least 1; uint256 intermediate checks reject unsupported arithmetic. Tests include a replay of the recorded E-mode borrower through the adapter, synthetic multi-asset positions, discrete rounding and shared-asset reversals. These are conditional arithmetic tests, not observed onchain liquidations or a live interactive browser test. Recovery alternatives retain the existing snapshot-price Risk Action Plan; they are not evaluated at the boundary.

## Controlled-release preflight — 2026-11-20

At local commit `e2c124a862c83dcbaaccf0db69c9db32964d249a`, the working tree was clean and two commits were ahead of the locally recorded `origin/main`. `npm run lint`, `npm test` (11 test files) and `npm run build -- --webpack` passed. A targeted high-signal scan of added lines found no credential patterns; this is not a guarantee that every possible secret was detected. The read-only adapter and error handling were inspected, and offline tests cover unsupported stable debt and reconciliation failures.

The local production API returned live, reconciled snapshots for the empty, multi-collateral and multi-debt public addresses above at block 61660903. An initial concurrent request for the E-mode borrower returned an unavailable error; a subsequent individual request returned a reconciled category 5 snapshot at block 61660919. The cause of the initial failure was not determined. An invalid address returned HTTP 400. These API checks are not browser tests.

No installed Playwright or Puppeteer driver was available in this workspace. Interactive desktop and mobile browser checks, including expiry, refresh and error behavior, were not performed. The controlled release is blocked pending those checks; no push or deployment was performed in this preflight. Oracle source freshness remains unknown.

### Owner-reported Chrome checks

After that preflight, the project owner reported that Chrome refresh passed; after approximately three minutes, expired snapshot data was hidden and Refresh remained available; and the mobile responsive layout passed. The owner also reported visually inspecting the main E-mode borrower dashboard, Risk Fingerprint, Liquidation Defense Planner, Risk Action Plan and simulator. These are owner reports, not independently reproduced or automated browser results. The report does not establish the results of the other manual checks in the preflight checklist, including API error handling or the empty, multi-collateral and multi-debt browser views. The owner authorized a controlled beta release. Oracle feed freshness remains unknown.

## Command Center implementation

The summary reuses the existing boundary engine and a shared instance of the Risk Action Plan, including its target selection. It ranks supported boundaries by exact relative oracle-price distance and available recovery rows by exact snapshot-oracle value before formatting; excluded boundaries are disclosed. Summary amounts are truncated for display only. Tests cover recorded E-mode adapter data, synthetic multi-collateral and multi-debt positions, unavailable and expired states, and large-number formatting. A local production build was viewed in headless Chrome with the live public E-mode borrower at 1440px and an emulated 390px viewport; the 390px document width was 390px. A scripted change to the detailed plan's target updated the summary target. This is a point-in-time check, not verification of every interaction, wallet, or future RPC response. The earlier owner-reported Chrome checks above concern the preceding beta.
