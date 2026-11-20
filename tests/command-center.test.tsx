import React from 'react';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiveSnapshotView } from '../app/live-position';
import { formatSummaryAmount, lowestValueRow } from '../app/command-center';
import { calculateProtocolAccount, type ProtocolAsset } from '../lib/protocol-math';
import { createLiquidationBoundaries } from '../lib/liquidation-boundary';
import type { LiveSnapshot } from '../lib/live-api';
import type { PlanRow } from '../lib/risk-action-plan';

const collateral:ProtocolAsset={id:0,decimals:0,price:100000000n,supply:100n,variableDebt:0n,stableDebt:0n,collateral:true,borrowed:false,liquidationThreshold:8000n};
const debt:ProtocolAsset={...collateral,id:1,supply:0n,variableDebt:70n,collateral:false,borrowed:true,liquidationThreshold:0n};
function snap(assets:ProtocolAsset[],emode=0,bitmap=0n):LiveSnapshot {
 const account=calculateProtocolAccount(assets,{id:emode,collateralBitmap:bitmap,liquidationThreshold:9200n});
 return {mode:'live',wallet:'0x0000000000000000000000000000000000000001',blockNumber:'123',blockHash:'0xabc',blockTimestamp:1000,emode,collateralBitmap:String(bitmap),emodeLiquidationThreshold:'9200',baseUnit:'100000000',oracleFreshness:'unknown',protocol:{collateral:String(account.collateral),debt:String(account.debt),liquidationThreshold:String(account.liquidationThreshold),healthFactor:String(account.healthFactor)},positions:assets.map(a=>({...a,address:`0x${(a.id+1).toString(16).padStart(40,'0')}`,symbol:`ASSET${a.id}`,price:String(a.price),supply:String(a.supply),variableDebt:String(a.variableDebt),stableDebt:String(a.stableDebt),liquidationThreshold:String(a.liquidationThreshold)}))};
}
test('E-mode summary displays shared target, verified boundary, recovery alternatives and section links',()=>{
 const s=snap([collateral,debt],5,1n), html=renderToStaticMarkup(<LiveSnapshotView snapshot={s} now={1001}/>);
 for(const text of ['Liquidation Defense Command Center','Observed health factor','Nearest verified conditional boundary','Target HF 1.2','Repay variable debt','Add enabled collateral','Risk Action Plan','not market-price predictions','href="#risk-fingerprint"','href="#liquidation-defense"','href="#risk-action-plan"','id="risk-fingerprint"','id="liquidation-defense"','id="risk-action-plan"']) assert.ok(html.includes(text),text);
 assert.match(html,/ASSET0/);assert.match(html,/ASSET1/);assert.match(html,/Target already reached at this snapshot/);
});
test('multi-collateral selects nearest boundary using exact price ratios and flags excluded assets',()=>{
 const c2={...collateral,id:2,supply:50n}, shared={...collateral,id:3,supply:10n,variableDebt:1n,borrowed:true};
 const s=snap([collateral,c2,shared,{...debt,variableDebt:100n}]);const boundaries=createLiquidationBoundaries(s);const valid=boundaries.rows.filter(r=>r.result.status==='available');assert.equal(valid.length,2);
 const html=renderToStaticMarkup(<LiveSnapshotView snapshot={s} now={1001}/>);assert.match(html,/Some assets could not be evaluated/);
 assert.match(html,/Nearest verified conditional boundary[\s\S]*?lower · ASSET0/);
});
test('summary shows verified recovery amounts when target is not yet reached',()=>{
 const s=snap([collateral,debt]);const html=renderToStaticMarkup(<LiveSnapshotView snapshot={s} now={1001}/>);
 assert.match(html,/Repay variable debt<\/span><strong>4 ASSET1/);assert.match(html,/Add enabled collateral<\/span><strong>5 ASSET0/);
 assert.match(html,/Approx\. \$4\.00/);assert.match(html,/Approx\. \$5\.00/);
});
test('empty, already-liquidatable, unsupported and expired states do not invent a boundary',()=>{
 const empty=renderToStaticMarkup(<LiveSnapshotView snapshot={snap([])} now={1001}/>);assert.match(empty,/No enabled collateral with a balance/);assert.match(empty,/No debt at this snapshot/);
 const s=snap([collateral,{...debt,variableDebt:90n}]);const critical=renderToStaticMarkup(<LiveSnapshotView snapshot={s} now={1001}/>);assert.match(critical,/already below 1/);assert.match(critical,/Liquidation threshold crossed/);
 const unsupported={...s,positions:s.positions.map((p,i)=>i?{...p,stableDebt:'1'}:p)};assert.match(renderToStaticMarkup(<LiveSnapshotView snapshot={unsupported} now={1001}/>),/Snapshot reconciliation or supported arithmetic could not be verified/);
 assert.doesNotMatch(renderToStaticMarkup(<LiveSnapshotView snapshot={s} now={1121}/>),/Liquidation Defense Command Center/);
});
test('multi-debt alternatives choose exact oracle value across different decimals',()=>{
 const s=snap([collateral,debt,{...debt,id:2,decimals:2}]);const row=(address:string,decimals:number,amount:bigint):PlanRow=>({address,symbol:'X',decimals,estimate:{status:'available',amount,valueBase:0n,healthFactor:1n}});
 const rows=[row(s.positions[1].address,0,2n),row(s.positions[2].address,2,199n)];assert.equal(lowestValueRow(rows,s),rows[1]);
 assert.equal(formatSummaryAmount(1234567890123456789012345n,6),'1,234,567,890,123,456,789.012345');assert.equal(formatSummaryAmount(1n,18),'<0.000001');
});
