# Judge guide

1. Run `npm install`, `npm run lint`, `npm test`, and `npm run build`. Start the application with `npm run dev`.
2. The initial workspace is a clearly labeled synthetic example. Adjust its shock and repayment controls; example numbers are not onchain data.
3. Search a public Ink address or open `/?address=<address>`. The live view shows token balances, collateral status, Pool health factor, e-mode, block number and timestamp. It has no live simulations or alerts. An empty position contains no example balances.
4. If an RPC call fails, the implementation changes, prices are missing, reconciliation fails, or a block is too old, the view reports an error or hides the stale snapshot. Feed freshness is explicitly unknown even when the block is current.
5. For end-to-end WSL verification, follow the `npm run test:live`, local API `curl`, and browser steps in [README.md](README.md). The previously reported successful `verify-tydro.mjs` run verified market configuration, not this dashboard endpoint.
6. [EVIDENCE.md](EVIDENCE.md) documents official sources, arithmetic, e-mode, recorded request/response fixtures, and outstanding verification. The offline tests replay fixtures and do not claim a live browser or endpoint test.

No wallet connection or transaction is involved. Live production use remains subject to the limitations in the README, particularly oracle freshness and the outstanding end-to-end and multi-collateral checks.
