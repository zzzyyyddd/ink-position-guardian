import React from 'react';
import { formatUnits } from 'viem';
import type { LiveSnapshot } from '../lib/live-api';
import { createRiskFingerprint } from '../lib/risk-fingerprint';
import { formatHealthFactor } from '../lib/health-display';

function base(raw:bigint,unit:string) {
 const cents=raw*100n/BigInt(unit);
 if(raw>0n && cents===0n) return '<$0.01';
 return `$${(cents/100n).toLocaleString('en-US')}.${(cents%100n).toString().padStart(2,'0')}`;
}
function label(asset:{symbol:string;identity:string|null}) { return asset.identity ?? `${asset.symbol} (other reserve)`; }
function share(value:bigint|null,collateralValue:bigint) {
 if(value===null) return 'Share unavailable';
 if(value===0n && collateralValue>0n) return '<0.01% of enabled collateral';
 return `${formatUnits(value,2)}% of enabled collateral (truncated)`;
}

export default function RiskFingerprint({snapshot}:{snapshot:LiveSnapshot}) {
 let fingerprint:ReturnType<typeof createRiskFingerprint>;
 try {fingerprint=createRiskFingerprint(snapshot)} catch {return <section id="risk-fingerprint" className="panel fingerprint" aria-label="Tydro Risk Fingerprint"><h2>Tydro Risk Fingerprint</h2><p role="alert">Fingerprint unavailable: this snapshot could not be independently reconciled or contains unsupported data.</p></section>}
 const collateral=fingerprint.assets.filter(a=>a.collateral && a.supply>0n), disabled=fingerprint.assets.filter(a=>!a.collateral && a.supply>0n), debts=fingerprint.assets.filter(a=>a.debtValue>0n);
 return <section id="risk-fingerprint" className="panel fingerprint" aria-label="Tydro Risk Fingerprint">
  <div className="panel-head"><div><div className="eyebrow muted">OBSERVED · BLOCK {snapshot.blockNumber}</div><h2>Tydro Risk Fingerprint</h2><p>Values use the protocol oracle at this snapshot. Oracle feed freshness is unknown.</p></div></div>
  <div className="fingerprint-grid"><div><h3>Enabled collateral concentration</h3>
   {collateral.length===0?<p>No enabled collateral in this snapshot.</p>:collateral.map(a=><div className="fingerprint-row" key={a.address}><strong>{label(a)}</strong><small>{a.address}</small><p>{base(a.collateralValue,snapshot.baseUnit)} · {share(a.collateralShareBps,a.collateralValue)}</p><p>{fingerprint.emode===0?'E-mode off':a.emodeEligible?'E-mode eligible':'Not eligible for this E-mode'} · effective liquidation threshold {formatUnits(a.effectiveThreshold,2)}%</p></div>)}
   {disabled.length>0 && <p>Supplied but not enabled as collateral: {disabled.map(a=>`${label(a)} (${a.address})`).join(', ')}. Excluded from concentration.</p>}
  </div><div><h3>Debt exposure</h3>{debts.length===0?<p>No variable debt in this snapshot.</p>:debts.map(a=><div className="fingerprint-row" key={a.address}><strong>{label(a)}</strong><small>{a.address}</small><p>{base(a.debtValue,snapshot.baseUnit)} · protocol oracle value</p></div>)}<p>{fingerprint.emode===0?'E-mode is off.':`E-mode category ${fingerprint.emode}. Eligibility is determined by the category collateral bitmap.`}</p></div></div>
  <div className="fingerprint-scenarios"><h3>Hypothetical stablecoin oracle-price stress</h3><p>Each scenario changes one oracle price while all other snapshot inputs stay fixed. A market depeg does not automatically cause the same oracle-price change. The same asset is repriced on both collateral and debt sides.</p>
   <div className="fingerprint-grid">{fingerprint.scenarios.map(s=><div className="fingerprint-scenario" key={`${s.name}-${s.shock}`}><strong>{s.name} oracle {s.shock}%</strong>{s.status==='available'?<><p>Observed oracle: ${formatUnits(s.observedPrice,8)}<br/>Hypothetical oracle: ${formatUnits(s.hypotheticalPrice,8)}</p><p>Hypothetical health factor: <strong>{formatHealthFactor(s.healthFactor)}</strong></p></>:<p>Unavailable: {s.reason}</p>}</div>)}</div>
   <p>Static estimates exclude interest, future prices and configuration changes; they do not predict liquidations or execute transactions.</p>
  </div>
 </section>;
}
