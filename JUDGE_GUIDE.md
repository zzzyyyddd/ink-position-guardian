# Judge guide

1. Run `npm install`, `npm run lint`, `npm test`, and `npm run build`. Start the application with `npm run dev`.
2. The initial workspace is a clearly labeled synthetic example. Adjust its shock and repayment controls; example numbers are not onchain data.
3. Search a public Ink address or open `/?address=<address>`. The live view shows token balances, collateral status, Pool health factor, e-mode, block number and timestamp. Use the explicitly hypothetical live simulation to explore per-asset prices, existing debt repayments, and additions to enabled collateral. No action is executed; live alerts are not implemented. An empty position contains no example balances.
4. If an RPC call fails, the implementation changes, prices are missing, reconciliation fails, or a block is too old, the view reports an error or hides the stale snapshot. Feed freshness is explicitly unknown even when the block is current.
5. For end-to-end verification, follow the `npm run test:live`, local API `curl`, and browser steps in [README.md](README.md). Live adapter and API checks and a static rendering of the React view are recorded in EVIDENCE.md; interactive browser verification remains outstanding.
6. [EVIDENCE.md](EVIDENCE.md) documents official sources, arithmetic, e-mode, recorded request/response fixtures, and outstanding verification. The offline tests replay fixtures and do not claim a live browser or endpoint test.

No wallet connection or transaction is involved. Live production use remains subject to the limitations in the README, particularly oracle freshness and the outstanding interactive browser check.


7. In a fresh live position, open **Risk Action Plan** and select a target above the current HF. Repayment and addition rows are independent, hypothetical single-asset alternatives. Change the target, try an invalid custom value, and select an already-met target. Amounts use smallest token units, checked against the simulation; unavailable rows reflect search or arithmetic limits. No eligibility or wallet balance is verified. The plan expires with the snapshot and oracle source freshness remains unknown. See README for browser steps and limits.

8. In a fresh live position, inspect **Tydro Risk Fingerprint** for enabled collateral shares, debt values, E-mode eligibility and per-asset effective thresholds. USDe and USD₮0 are identified by address. The -5% and -10% examples are hypothetical oracle-price inputs, not observed market prices or predictions. Missing exposure produces an unavailable scenario. Empty and expired positions must not show fabricated fingerprint values.

9. Inspect **Liquidation Defense Planner** for conditional oracle-price boundaries and their adjacent verified price units. The linked Risk Action Plan shows independent hypothetical recovery alternatives at current snapshot prices. Other prices and balances remain fixed for each boundary; a shared collateral/debt asset may be unavailable when its full discrete search is too large or non-monotonic. No transaction feasibility or liquidation prevention is claimed.
