'use client';
import React, { useMemo, useState } from 'react';
import { formatUnits } from 'viem';
import type { LiveSnapshot } from '../lib/live-api';
import { createRiskActionPlan, parseTarget, type PlanRow } from '../lib/risk-action-plan';
import { formatHealthDelta, formatHealthFactor } from '../lib/health-display';
import { MAX_UINT256 } from '../lib/protocol-math';

function approximateValue(row:PlanRow, snapshot:LiveSnapshot) {
 if(row.estimate.status!=='available') return '';
 const p=snapshot.positions.find(item=>item.address===row.address)!;
 const cents=row.estimate.amount*BigInt(p.price)*100n/(10n**BigInt(p.decimals)*BigInt(snapshot.baseUnit));
 return cents===0n && row.estimate.amount>0n?'less than $0.01':`$${(cents/100n).toLocaleString('en-US')}.${String(cents%100n).padStart(2,'0')}`;
}
function Rows({rows,snapshot,baseline,empty}:{rows:PlanRow[];snapshot:LiveSnapshot;baseline:bigint;empty:string}) {
 if(rows.length===0) return <p>{empty}</p>;
 return <div className="plan-rows">{rows.map(row=><div className="plan-row" key={row.address}><div><strong>{row.symbol}</strong><small>{row.address}</small></div>{row.estimate.status==='unavailable'?<p>Unavailable: {row.estimate.reason}</p>:<div><strong>{formatUnits(row.estimate.amount,row.decimals)} {row.symbol}</strong><p>Approx. {approximateValue(row,snapshot)} at the snapshot oracle price (truncated). Hypothetical HF: {row.estimate.healthFactor===MAX_UINT256?'∞ (no debt)':formatUnits(row.estimate.healthFactor,18)} · delta: {formatHealthDelta(baseline,row.estimate.healthFactor)}</p></div>}</div>)}</div>;
}
export default function RiskActionPlan({snapshot}:{snapshot:LiveSnapshot}) {
 const [choice,setChoice]=useState('1.20');
 const [custom,setCustom]=useState('');
 const raw=choice==='custom'?custom:choice;
 const target=parseTarget(raw);
 const state=useMemo(()=>{
  if(target===null)return {plan:null,error:'Enter a target above 0 and at most 1000, with up to 18 decimal places.'};
  try{return {plan:createRiskActionPlan(snapshot,target),error:''};}catch{return {plan:null,error:'Unable to verify this snapshot or calculate an action plan. Refresh and try again.'};}
 },[snapshot,target]);
 const plan=state.plan;
 return <section id="risk-action-plan" className="panel action-plan"><div className="eyebrow muted">HYPOTHETICAL · READ-ONLY · NO TRANSACTIONS</div><h2>Risk Action Plan</h2><p>Estimate one change to this live snapshot. Repayment and collateral addition are alternatives; nothing is executed.</p>
 <label className="plan-target">Target health factor <select value={choice} onChange={e=>setChoice(e.target.value)}><option value="1.10">1.10</option><option value="1.20">1.20</option><option value="1.50">1.50</option><option value="2.00">2.00</option><option value="custom">Custom</option></select></label>{choice==='custom'&&<label className="plan-target">Custom target <input inputMode="decimal" value={custom} onChange={e=>setCustom(e.target.value)} placeholder="e.g. 1.35"/></label>}
 {state.error?<p className="error" role="alert">{state.error}</p>:plan&&<><div className="plan-summary"><div>Current Pool HF <strong>{formatHealthFactor(plan.baseline)}{plan.noDebt?' (no debt)':''}</strong></div><div>Target HF <strong>{formatUnits(plan.target,18)}</strong></div><div>{plan.alreadyReached?'Target already reached at this snapshot.':'Target not yet reached at this snapshot.'}</div></div>{!plan.alreadyReached&&<div className="plan-columns"><div><h3>Alternative 1: repay one debt asset</h3><p>Each amount repays only the named existing variable debt.</p><Rows rows={plan.repayments} snapshot={snapshot} baseline={plan.baseline} empty="No eligible variable debt assets."/></div><div><h3>Alternative 2: add one enabled collateral asset</h3><p>Each amount adds only the named already-enabled collateral.</p><Rows rows={plan.additions} snapshot={snapshot} baseline={plan.baseline} empty="No enabled collateral assets."/></div></div>}</>}
 <p className="scenario-assumptions">Targets and risk bands are informational, not official Tydro safety guarantees. Estimates use this single reconciled block and fixed oracle prices, existing E-mode and liquidation thresholds; the calculator verifies the minimum in token units within its search bounds. Different prices, decimals, thresholds and existing debts lead to different amounts. Balances, supply eligibility, caps, liquidity, interest, fees, liquidation and changing conditions are not checked. Oracle feed freshness is unknown. Estimates do not establish that an action can be executed or that a position is safe.</p><a className="plan-link" href="https://app.tydro.com/" target="_blank" rel="noreferrer">Open the official Tydro app ↗</a></section>;
}
