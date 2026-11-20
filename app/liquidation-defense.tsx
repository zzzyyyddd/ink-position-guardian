import React from 'react';
import { formatUnits } from 'viem';
import type { LiveSnapshot } from '../lib/live-api';
import { createLiquidationBoundaries } from '../lib/liquidation-boundary';
import { formatHealthFactor } from '../lib/health-display';

export default function LiquidationDefense({snapshot}:{snapshot:LiveSnapshot}) {
 let data:ReturnType<typeof createLiquidationBoundaries>;
 try {data=createLiquidationBoundaries(snapshot)} catch {return <section id="liquidation-defense" className="panel defense"><h2>Liquidation Defense Planner</h2><p role="alert">Unavailable: snapshot reconciliation or supported arithmetic could not be verified.</p></section>}
 return <section id="liquidation-defense" className="panel defense"><div className="eyebrow muted">EXPERIMENTAL · READ-ONLY · BLOCK {snapshot.blockNumber}</div><h2>Liquidation Defense Planner</h2>
  <p>Current Pool health factor: <strong>{formatHealthFactor(data.baseline)}</strong>. Oracle feed freshness is unknown.</p>
  <p>For each enabled collateral asset, only its oracle price falls; other prices, balances, E-mode and reserve configuration remain fixed. If that asset is also debt, both sides are repriced. A market-price move does not imply the same oracle change.</p>
  {data.rows.length===0?<p>No enabled collateral with a balance in this snapshot.</p>:<div className="defense-rows">{data.rows.map(row=><div className="defense-row" key={row.address}><strong>{row.symbol}</strong><small>{row.address}</small>{row.result.status==='unavailable'?<p>Unavailable: {row.result.reason}</p>:<><p>Observed oracle price: ${formatUnits(row.observedPrice,8)} · Conditional hypothetical oracle boundary: <strong>${formatUnits(row.result.price,8)}</strong></p><p>Downward distance: {row.result.distanceBps===0n?'less than 0.01':formatUnits(row.result.distanceBps,2)}% (truncated). At the boundary HF {formatHealthFactor(row.result.healthFactor)} is below 1; at the next higher price unit (${formatUnits(row.result.adjacentPrice,8)}) HF is {formatHealthFactor(row.result.adjacentHealthFactor)}.</p></>}</div>)}</div>}
  <p>These are conditional mathematical estimates, not guaranteed liquidation prices or forecasts. Interest, future price paths, liquidations and protocol changes are excluded.</p><p>Compare independent repayment and additional-collateral estimates in the <a className="plan-link" href="#risk-action-plan">Risk Action Plan below</a>. Those alternatives use the current snapshot prices, not the hypothetical boundary, and do not establish execution feasibility.</p>
 </section>;
}
