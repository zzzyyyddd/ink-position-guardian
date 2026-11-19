# Ink Position Guardian

A read-only Tydro position dashboard for Ink Mainnet. Enter a public wallet address to query supplied and borrowed tokens, collateral flags, the Pool-reported health factor, weighted liquidation threshold, e-mode category, and the snapshot block. The URL retains the address and can be shared. No wallet connection, signing, transaction, approval, custody, or background monitoring is implemented.

**Experimental software:** This project is provided as-is, may be inaccurate or unavailable, and has not been presented as a security-audited product. It is not financial advice and must not be relied on to manage funds or prevent liquidation. Independently verify positions and prices with authoritative sources.

The live dashboard is implemented but has **not been verified end to end against live RPC in this execution environment**. The protocol's returned oracle price does not contain a feed update timestamp; individual source freshness and fallback behavior are **unknown**. The interface explicitly states this limitation. Do not treat the snapshot as a guarantee that an oracle price is current or as financial advice.

## Run locally

Use Node.js 20.9+ and npm:

```sh
cp .env.example .env.local
npm ci
npm run lint
npm test
npm run build
npm run dev
```

Open http://localhost:3000. The server defaults to Ink's public `https://rpc-gel.inkonchain.com`. Optionally set server-side `INK_RPC_URL` to a trusted Ink Mainnet HTTPS endpoint; see `.env.example`. The address in a shareable URL is public, and the RPC provider receives the queried address. Public RPC endpoints may impose rate limits.

Start in the labeled synthetic demo, or submit a valid Ethereum address for live mode. Demo data and simulations are fictional and never used as live data. Stress tests, repayment and collateral simulations, and session-only demo alerts are disabled in live mode. Live mode shows token amounts truncated to six decimals; values come from one block. An empty wallet is shown as empty, not populated with examples.

## Live verification and safety checks

The server uses `lib/tydro.ts` to read from the official Tydro market. It checks the chain, provider pointers, the known Pool proxy implementation, oracle base unit, user configuration, e-mode collateral bitmap, and price presence for active positions. All reads are pinned to a single block. The block must be no more than 120 seconds old, retain the same hash, and the reconstructed collateral, debt, liquidation threshold, and health factor must exactly match the Pool. Errors fail closed; the UI hides data rather than retaining an old or partial position. Displayed snapshots are also hidden once their block exceeds 120 seconds of age according to the browser's clock. An upgrade to the pinned implementation will make lookups unavailable until reviewed.

These checks do **not** establish source-level oracle freshness. `getAssetPrice` does not supply a source timestamp. Stale upstream feed values, fallback behavior, RPC integrity, rollup sequencer conditions, and rapid market moves are not fully detected. A fresh block is not proof of fresh prices. Do not make liquidation decisions based only on this dashboard.

The health-factor implementation uses integer token decimals and oracle base units. It applies each collateral asset's reserve threshold or, when its reserve-ID bit is in the user's category collateral bitmap, the e-mode threshold. It floors collateral value, ceilings debt value, and follows the verified implementation's health-factor division order. See [EVIDENCE.md](EVIDENCE.md) for source and recorded snapshot details.

## WSL live verification

After installing dependencies on a network-enabled WSL system, use a known public address:

```sh
node scripts/verify-tydro.mjs
WALLET_ADDRESS=0xc468315a2df54f9c076bd5cfe5002ba211f74ca6 npm run test:live
npm run dev
```

In another WSL terminal, query the actual UI endpoint:

```sh
curl -fsS 'http://localhost:3000/api/position?address=0xc468315a2df54f9c076bd5cfe5002ba211f74ca6'
```

Open `http://localhost:3000/?address=0xc468315a2df54f9c076bd5cfe5002ba211f74ca6`, compare the displayed Pool health factor and block to the endpoint and official Tydro interface, and check a wallet with no position. This public account was observed previously and its position can change or close; use another known public borrower if needed. To test the failure state, stop the dev server and restart it with `INK_RPC_URL=https://127.0.0.1:1 npm run dev`; a lookup must report unavailable and must not show old or demo values. Remove that override afterward.

`npm test` uses recorded mainnet fixtures and simulated error cases; it is not an end-to-end live network test. `npm run test:live` checks the adapter directly; the local endpoint and browser checks verify the dashboard path. Repeat live checks with an e-mode account and a real multi-collateral account before any release.

## Deployment

No deployment or push has been performed. Vercel must support a Node.js server route and have access to a reliable Ink RPC. After explicit approval, connect a GitHub repository in Vercel, use the Next.js preset and `npm run build`, optionally configure `INK_RPC_URL` server-side, and validate the preview with real accounts, failure states, rate limits, and oracle freshness policies before production. This version is not yet recommended for production deployment as a risk dashboard.
