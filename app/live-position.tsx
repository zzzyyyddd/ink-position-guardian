'use client';
import React, { useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { Activity, RefreshCw, ShieldCheck } from 'lucide-react';
import type { LiveSnapshot } from '../lib/live-api';
const maxUint=(1n<<256n)-1n;
function amount(raw:string,decimals:number,maxDecimals=6) {
 const [whole,fraction='']=formatUnits(BigInt(raw),decimals).split('.');
 const grouped=whole.replace(/\B(?=(\d{3})+(?!\d))/g,',');
 const trimmed=fraction.slice(0,maxDecimals).replace(/0+$/,'');
 if(!trimmed && fraction && BigInt(raw)!==0n && BigInt(whole)===0n) return `<0.${'0'.repeat(maxDecimals-1)}1`;
 return grouped+(trimmed?'.'+trimmed:'');
}
function money(raw:string,baseUnit:string) {
 const value=BigInt(raw), unit=BigInt(baseUnit);
 if(unit<=0n || value<0n) throw Error('Invalid base currency amount or unit');
 const cents=value*100n/unit;
 if(value>0n && cents===0n) return '<$0.01';
 return '$'+(cents/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+(cents%100n).toString().padStart(2,'0');
}
function health(raw:string) {return BigInt(raw)===maxUint?'∞':amount(raw,18,6)}
function riskLabel(raw:string) {const h=BigInt(raw);return h===maxUint?'No debt':h<10n**18n?'Liquidatable':h<12n*10n**17n?'Critical':h<15n*10n**17n?'At risk':'Healthy';}
export function LiveSnapshotView({snapshot, now}:{snapshot:LiveSnapshot;now:number}) {
 const age=now-snapshot.blockTimestamp;
 if(age<0||age>120) return <div className="unsupported" role="alert"><div><h2>Position data is stale</h2><p>Refresh to retrieve a current verified block. Previous values are hidden.</p></div></div>;
 return <div data-mode="live"><div className="demo-banner live-banner"><Activity size={18}/><div><strong>Live Tydro position</strong><span> Read-only snapshot. Prices come from the protocol oracle; individual feed freshness is unknown.</span></div></div>
 <div className="section-head"><div><div className="eyebrow muted">INK MAINNET · LIVE SNAPSHOT</div><h2>At a glance</h2></div><span className="outline-pill">E-mode {snapshot.emode===0?'off':`category ${snapshot.emode}`}</span></div>
 <div className="stats-grid"><div className="stat"><div className="stat-label">Protocol health factor</div><strong>{health(snapshot.protocol.healthFactor)}</strong><small>{riskLabel(snapshot.protocol.healthFactor)} · liquidation below 1</small></div><div className="stat"><div className="stat-label">Collateral value</div><strong>{money(snapshot.protocol.collateral,snapshot.baseUnit)}</strong><small>Enabled collateral only</small></div><div className="stat"><div className="stat-label">Total debt</div><strong>{money(snapshot.protocol.debt,snapshot.baseUnit)}</strong><small>Protocol base currency</small></div><div className="stat"><div className="stat-label">Liquidation threshold</div><strong>{amount(snapshot.protocol.liquidationThreshold,2,2)}%</strong><small>Protocol weighted average</small></div></div>
 <section className="panel live-assets"><div className="panel-head"><div><div className="eyebrow muted">POSITION BREAKDOWN</div><h2>Supplied and borrowed assets</h2><p>Token amounts show up to six decimals and are truncated.</p></div></div>
 {snapshot.positions.length===0?<p className="live-empty">No supplied or borrowed assets were found in this Tydro market at this block.</p>:<div className="live-rows">{snapshot.positions.map(p=><div className="live-row" key={p.address}><div><strong>{p.symbol}</strong><small>{p.address}</small></div><div><span>Supplied</span><strong>{amount(p.supply,p.decimals)}</strong></div><div><span>Debt</span><strong>{amount((BigInt(p.variableDebt)+BigInt(p.stableDebt)).toString(),p.decimals)}</strong></div><div><span>Collateral</span><strong>{p.collateral?'Enabled':'Not enabled'}</strong></div></div>)}</div>}
 </section><div className="snapshot-meta"><ShieldCheck size={16}/><span>Block <a href={`https://explorer.inkonchain.com/block/${snapshot.blockNumber}`} target="_blank" rel="noreferrer">{snapshot.blockNumber}</a> · {new Date(snapshot.blockTimestamp*1000).toLocaleString()} · {age}s old</span><span>Oracle feed freshness: unknown</span></div><div className="live-limit">Stress tests, simulations, and alerts are available in synthetic demo mode only. This snapshot does not monitor your position in the background.</div></div>;
}
export default function LivePosition({address, onDemo}:{address:string;onDemo:()=>void}) {
 const [state,setState]=useState<{loading:boolean; data:LiveSnapshot|null;error:string}>({loading:true,data:null,error:''});
 const [refresh,setRefresh]=useState(0);const [now,setNow]=useState(()=>Math.floor(Date.now()/1000));
 useEffect(()=>{const timer=setInterval(()=>setNow(Math.floor(Date.now()/1000)),1000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{const controller=new AbortController();setState({loading:true,data:null,error:''});
  fetch(`/api/position?address=${encodeURIComponent(address)}`,{cache:'no-store',signal:controller.signal}).then(async response=>{const body=await response.json();if(!response.ok)throw Error(body.error||'Unable to verify this position.');if(body.mode!=='live'||body.wallet.toLowerCase()!==address.toLowerCase())throw Error('Invalid live position response.');setNow(Math.floor(Date.now()/1000));setState({loading:false,data:body,error:''});}).catch(error=>{if(!controller.signal.aborted)setState({loading:false,data:null,error:error instanceof Error?error.message:'Unable to verify this position.'});});return()=>controller.abort();},[address,refresh]);
 return <section className="live-container"><div className="live-toolbar"><span className="wallet-label">{address}</span><button className="demo-button" onClick={()=>{setState({loading:true,data:null,error:''});setRefresh(n=>n+1)}}><RefreshCw size={15}/> Refresh</button></div>
 {state.loading?<div className="unsupported" role="status"><div><h2>Reading Tydro position…</h2><p>Checking the market and reconciling account data at one block.</p></div></div>:state.error?<div className="unsupported" role="alert"><div><h2>Position unavailable</h2><p>{state.error}</p><button className="primary" onClick={onDemo}>Explore the synthetic demo</button></div></div>:state.data?<LiveSnapshotView snapshot={state.data} now={now}/>:null}</section>;
}
