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
