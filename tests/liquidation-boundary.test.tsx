import React from 'react';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateProtocolAccount, type ProtocolAsset } from '../lib/protocol-math';
import { createLiquidationBoundaries, MAX_SHARED_PRICE_STEPS } from '../lib/liquidation-boundary';
import type { LiveSnapshot } from '../lib/live-api';
import { LiveSnapshotView } from '../app/live-position';

const WAD=10n**18n;
const coll:ProtocolAsset={id:0,decimals:0,price:100n,supply:100n,variableDebt:0n,stableDebt:0n,collateral:true,borrowed:false,liquidationThreshold:8000n};
const debt:ProtocolAsset={...coll,id:1,supply:0n,variableDebt:50n,collateral:false,borrowed:true,liquidationThreshold:0n};
function snapshot(assets:ProtocolAsset[],emode=0,bitmap=0n,threshold=0n):LiveSnapshot {
 const m=calculateProtocolAccount(assets,{id:emode,collateralBitmap:bitmap,liquidationThreshold:threshold});
 return {mode:'live',wallet:'0x0000000000000000000000000000000000000001',blockNumber:'123',blockHash:'0x1',blockTimestamp:1000,emode,collateralBitmap:String(bitmap),emodeLiquidationThreshold:String(threshold),baseUnit:'100000000',oracleFreshness:'unknown',protocol:{collateral:String(m.collateral),debt:String(m.debt),liquidationThreshold:String(m.liquidationThreshold),healthFactor:String(m.healthFactor)},positions:assets.map(a=>({...a,address:`0x${(a.id+1).toString(16).padStart(40,'0')}`,symbol:`A${a.id}`,price:String(a.price),supply:String(a.supply),variableDebt:String(a.variableDebt),stableDebt:String(a.stableDebt),liquidationThreshold:String(a.liquidationThreshold)}))};
}
function result(s:LiveSnapshot,index=0) {return createLiquidationBoundaries(s).rows[index].result;}
test('single collateral boundary and adjacent unit are exact',()=>{
 const r=result(snapshot([coll,debt]));assert.equal(r.status,'available');if(r.status!=='available')throw Error();
 assert.equal(r.price,62n);assert.equal(r.adjacentPrice,63n);assert.ok(r.healthFactor<WAD);assert.ok(r.adjacentHealthFactor>=WAD);assert.equal(r.distanceBps,3800n);
});
test('integer rounding matches exhaustive protocol math for every lower price',()=>{
 const a={...coll,decimals:2,supply:133n,price:101n};const b={...debt,decimals:2,variableDebt:50n,price:101n};const r=result(snapshot([a,b]));
 const mode={id:0,collateralBitmap:0n,liquidationThreshold:0n};const candidates=[];for(let price=1n;price<101n;price++)if(calculateProtocolAccount([{...a,price},b],mode).healthFactor<WAD)candidates.push(price);
 assert.equal(r.status,'available');if(r.status==='available'){assert.equal(r.price,candidates.at(-1));assert.equal(r.adjacentPrice,r.price+1n);assert.ok(r.healthFactor<WAD);assert.ok(r.adjacentHealthFactor>=WAD);}
});
test('multi collateral, multi debt and E-mode thresholds yield distinct conditional boundaries',()=>{
 const c2={...coll,id:2,supply:40n,liquidationThreshold:5000n};const d2={...debt,id:3,variableDebt:10n};
 const s=snapshot([coll,debt,c2,d2],5,1n,9200n);const rows=createLiquidationBoundaries(s).rows;assert.equal(rows.length,2);
 const first=rows[0].result,second=rows[1].result;assert.equal(first.status,'available');assert.equal(second.status,'unavailable');
 if(first.status==='available') {const mode={id:5,collateralBitmap:1n,liquidationThreshold:9200n};const calculate=(price:bigint)=>calculateProtocolAccount([{...coll,price},debt,c2,d2],mode).healthFactor;assert.equal(first.healthFactor,calculate(first.price));assert.equal(first.adjacentHealthFactor,calculate(first.price+1n));}
});
test('shared collateral and debt reprices both sides and verifies whole range',()=>{
 const both={...coll,variableDebt:20n,borrowed:true};const s=snapshot([both,{...debt,variableDebt:30n}]);const r=result(s);assert.equal(r.status,'available');
 if(r.status==='available'){const calculate=(price:bigint)=>calculateProtocolAccount([{...both,price},{...debt,variableDebt:30n}],{id:0,collateralBitmap:0n,liquidationThreshold:0n}).healthFactor;assert.equal(r.healthFactor,calculate(r.price));assert.equal(r.adjacentHealthFactor,calculate(r.price+1n));}
 const large=snapshot([{...both,price:MAX_SHARED_PRICE_STEPS+1n},debt]);assert.match((result(large) as {reason:string}).reason,/exceeds/);
});
test('rounding reversals in shared collateral and debt return unavailable',()=>{
 const both={...coll,decimals:1,supply:2n,variableDebt:1n,borrowed:true};const fixed={...debt,price:1n,variableDebt:1n};const r=result(snapshot([both,fixed]));assert.equal(r.status,'unavailable');if(r.status==='unavailable')assert.match(r.reason,/not monotonic/);
});
test('zero debt, already below one, and unreachable positive-price boundary',()=>{
 for(const [s,reason] of [[snapshot([coll]),/No debt/],[snapshot([coll,{...debt,variableDebt:90n}]),/already/],[snapshot([coll,{...coll,id:2},debt]),/No crossing/]] as const){const r=result(s);assert.equal(r.status,'unavailable');if(r.status==='unavailable')assert.match(r.reason,reason);}
 const exact=snapshot([coll,{...debt,variableDebt:80n}]);const r=result(exact);assert.equal(r.status,'available');if(r.status==='available'){assert.equal(r.price,99n);assert.equal(r.adjacentHealthFactor,WAD);}
});
test('unsupported debt and mismatched or invalid snapshot fail closed',()=>{
 const s=snapshot([coll,debt]);assert.throws(()=>createLiquidationBoundaries({...s,positions:s.positions.map((p,i)=>i?{...p,stableDebt:'1'}:p)}),/Unsupported debt/);
 assert.throws(()=>createLiquidationBoundaries({...s,protocol:{...s.protocol,healthFactor:'1'}}),/does not match/);
 assert.throws(()=>createLiquidationBoundaries({...s,positions:[...s.positions,s.positions[0]]}),/identity/);
});
test('defense UI links independent action plan and expires with the snapshot',()=>{
 const s=snapshot([coll,debt]);const html=renderToStaticMarkup(<LiveSnapshotView snapshot={s} now={1001}/>);
 for(const label of ['Liquidation Defense Planner','Conditional hypothetical oracle boundary','next higher price unit','Risk Action Plan','current snapshot prices','Oracle feed freshness is unknown'])assert.ok(html.includes(label),label);
 const stale=renderToStaticMarkup(<LiveSnapshotView snapshot={s} now={1121}/>);assert.doesNotMatch(stale,/Liquidation Defense Planner|Risk Action Plan/);
});
