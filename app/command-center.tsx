'use client';
import React, { useMemo } from 'react';
import { formatUnits } from 'viem';
import type { LiveSnapshot } from '../lib/live-api';
import type { PlanRow } from '../lib/risk-action-plan';
import { createLiquidationBoundaries } from '../lib/liquidation-boundary';
import { formatHealthFactor, healthRiskBand } from '../lib/health-display';
import { MAX_UINT256 } from '../lib/protocol-math';
import { useSharedPlan } from './plan-context';

export function formatSummaryAmount(value:bigint,decimals:number) {
 const [whole,fraction='']=formatUnits(value,decimals).split('.');
 const grouped=whole.replace(/\B(?=(\d{3})+(?!\d))/g,',');
 const tail=fraction.slice(0,6).replace(/0+$/,'');
 if(value>0n && whole==='0' && !tail) return '<0.000001';
 return grouped+(tail?'.'+tail:'');
}
// Compare exact token-unit oracle values, not their truncated display values.
export function lowestValueRow(rows:PlanRow[],snapshot:LiveSnapshot) {
 return rows.filter(row=>row.estimate.status==='available').reduce<PlanRow|null>((best,row)=>{
  if(!best || row.estimate.status!=='available' || best.estimate.status!=='available')return row;
  const p=snapshot.positions.find(p=>p.address===row.address)!, b=snapshot.positions.find(p=>p.address===best.address)!;
  return row.estimate.amount*BigInt(p.price)*10n**BigInt(b.decimals)<best.estimate.amount*BigInt(b.price)*10n**BigInt(p.decimals)?row:best;
 },null);
}
function Recovery({title,row,snapshot,reason}:{title:string;row:PlanRow|null;snapshot:LiveSnapshot;reason:string}) {
 if(!row || row.estimate.status!=='available')return <div className="command-recovery"><span>{title}</span><strong>Unavailable</strong><p>{reason}</p></div>;
 const p=snapshot.positions.find(p=>p.address===row.address)!;
 const cents=row.estimate.amount*BigInt(p.price)*100n/(10n**BigInt(p.decimals)*BigInt(snapshot.baseUnit));
 const value=cents===0n && row.estimate.amount>0n?'less than $0.01':`$${(cents/100n).toLocaleString('en-US')}.${String(cents%100n).padStart(2,'0')}`;
 return <div className="command-recovery"><span>{title}</span><strong>{formatSummaryAmount(row.estimate.amount,row.decimals)} {row.symbol}</strong><p>Approx. {value} at the snapshot oracle price</p><small>Token amount truncated to 6 decimals; full amount in the plan.</small></div>;
}
export default function CommandCenter({snapshot}:{snapshot:LiveSnapshot}) {
 const {plan,error,target}=useSharedPlan();
 const boundaries=useMemo(()=>{try{return createLiquidationBoundaries(snapshot)}catch{return null}},[snapshot]);
 const available=boundaries?.rows.filter(row=>row.result.status==='available') ?? [];
 const nearest=available.reduce<typeof available[number]|null>((best,row)=>{
  if(!best || row.result.status!=='available' || best.result.status!=='available')return row;
  return (row.observedPrice-row.result.price)*best.observedPrice<(best.observedPrice-best.result.price)*row.observedPrice?row:best;
 },null);
 const missing=(boundaries?.rows.length ?? 0)>available.length;
 const reason=!boundaries?'Snapshot reconciliation or supported arithmetic could not be verified.':boundaries.rows.length===0?'No enabled collateral with a balance.':boundaries.rows.length>1?'No verified boundary; see asset-level reasons.':boundaries.rows[0].result.status==='unavailable'?boundaries.rows[0].result.reason:'No verified boundary.';
 const hf=BigInt(snapshot.protocol.healthFactor),band=healthRiskBand(hf);
 const risk=hf===MAX_UINT256?'neutral':hf<=105n*10n**16n?'critical':hf<=120n*10n**16n?'warning':'normal';
 const repay=plan && !plan.alreadyReached?lowestValueRow(plan.repayments,snapshot):null;
 const add=plan && !plan.alreadyReached?lowestValueRow(plan.additions,snapshot):null;
 const recoveryReason=error || (plan?.noDebt?'No debt at this snapshot.':plan?.alreadyReached?'Target already reached at this snapshot.':'No verified single-asset estimate within solver limits.');
 return <section className={`command-center command-${risk}`} aria-labelledby="command-title">
  <div className="command-header"><div><div className="command-eyebrow">TYDRO · READ-ONLY · BLOCK {snapshot.blockNumber}</div><h2 id="command-title">Liquidation Defense Command Center</h2><p>Oracle snapshot · feed freshness unknown</p></div><span className="command-band">{band}</span></div>
  <div className="command-metrics"><div className="command-metric"><span>Observed health factor</span><strong>{formatHealthFactor(hf)}</strong><small>Pool value · informational band</small></div><div className="command-metric"><span>Nearest verified conditional boundary</span>{nearest?.result.status==='available'?<><strong>{nearest.result.distanceBps===0n?'less than 0.01':formatUnits(nearest.result.distanceBps,2)}% lower · {nearest.symbol}</strong><small>Hypothetical oracle ${formatUnits(nearest.result.price,8)} · distance truncated</small>{missing&&<small>Some assets could not be evaluated; see details.</small>}</>:<><strong>Unavailable</strong><small>{reason}</small></>}</div></div>
  <p className="command-note">Conditional oracle scenarios are not market-price predictions. Estimates do not establish execution feasibility.</p>
  <div className="command-recovery-head"><div><h3>Recovery alternatives</h3><p>{target===null?'Choose a valid target in the Risk Action Plan.':`Target HF ${formatUnits(target,18)} · independent single-asset estimates at snapshot prices`}</p></div><a href="#risk-action-plan">Change target ↗</a></div>
  <div className="command-recovery-grid"><Recovery title="Repay variable debt" row={repay} snapshot={snapshot} reason={recoveryReason}/><Recovery title="Add enabled collateral" row={add} snapshot={snapshot} reason={recoveryReason}/></div>
  <p className="command-method">Lowest oracle value among available alternatives in each category; full precision and all options are in the Risk Action Plan.</p>
  <nav className="command-links" aria-label="Position analysis"><a href="#risk-fingerprint">Risk Fingerprint →</a><a href="#liquidation-defense">Asset boundaries →</a><a href="#risk-action-plan">Risk Action Plan →</a></nav>
 </section>;
}
