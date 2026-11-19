import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { calculateProtocolAccount, MAX_UINT256, type ProtocolAsset } from '../lib/protocol-math';
import { createRiskActionPlan, MAX_PLAN_AMOUNT, parseTarget } from '../lib/risk-action-plan';
import { simulateLive } from '../lib/live-simulation';
import type { LiveSnapshot } from '../lib/live-api';
import { formatUnits } from 'viem';

const WAD=10n**18n;
const a:ProtocolAsset={id:0,decimals:0,price:100n,supply:100n,variableDebt:0n,stableDebt:0n,collateral:true,borrowed:false,liquidationThreshold:8000n};
const b:ProtocolAsset={...a,id:1,supply:0n,variableDebt:100n,collateral:false,borrowed:true,liquidationThreshold:0n};
function snapshot(assets:ProtocolAsset[]=[a,b],emode=0,bitmap=0n,threshold=0n):LiveSnapshot {
 const x=calculateProtocolAccount(assets,{id:emode,collateralBitmap:bitmap,liquidationThreshold:threshold});
 return {mode:'live',wallet:'x',blockNumber:'1',blockHash:'x',blockTimestamp:1000,emode,collateralBitmap:String(bitmap),emodeLiquidationThreshold:String(threshold),baseUnit:'100',oracleFreshness:'unknown',protocol:{collateral:String(x.collateral),debt:String(x.debt),liquidationThreshold:String(x.liquidationThreshold),healthFactor:String(x.healthFactor)},positions:assets.map(p=>({id:p.id,address:String(p.id),symbol:`A${p.id}`,decimals:p.decimals,supply:String(p.supply),variableDebt:String(p.variableDebt),stableDebt:String(p.stableDebt),collateral:p.collateral,borrowed:p.borrowed,liquidationThreshold:String(p.liquidationThreshold),price:String(p.price)}))};
}
function value(s:LiveSnapshot,id:string,kind:'repay'|'add',n:bigint) {const p=s.positions.find(x=>x.address===id)!;return simulateLive(s,{[id]:{shock:'0',repay:kind==='repay'?formatUnits(n,p.decimals):'0',add:kind==='add'?formatUnits(n,p.decimals):'0'}}).simulated.healthFactor;}
test('minimum repayment and addition exactly reach target, one token unit below fails',()=>{
 const s=snapshot(), plan=createRiskActionPlan(s,WAD), repay=plan.repayments[0].estimate, add=plan.additions[0].estimate;
 assert.equal(repay.status,'available');assert.equal(add.status,'available');
 if(repay.status!=='available'||add.status!=='available') throw Error('unavailable');
 assert.equal(repay.amount,20n);assert.equal(add.amount,25n);assert.equal(repay.healthFactor,WAD);assert.equal(add.healthFactor,WAD);
 assert.ok(value(s,'1','repay',repay.amount-1n)<WAD);assert.ok(value(s,'0','add',add.amount-1n)<WAD);
});
test('category 5 bitmap applies e-mode to eligible collateral and solves discrete rounding',()=>{
 const s=snapshot([a,b],5,1n,9200n), plan=createRiskActionPlan(s,WAD),r=plan.repayments[0].estimate,c=plan.additions[0].estimate;
 assert.equal(r.status,'available');assert.equal(c.status,'available');if(r.status!=='available'||c.status!=='available') throw Error('unavailable');
 assert.equal(r.amount,8n);assert.equal(c.amount,9n);assert.ok(value(s,'0','add',8n)<WAD);assert.ok(c.healthFactor>=WAD);
});
test('multiple debt and collateral assets, including asset on both sides, are independent alternatives',()=>{
 const both={...a,variableDebt:30n,borrowed:true};const c={...a,id:2,supply:20n,liquidationThreshold:5000n};const d={...b,variableDebt:100n};
 const s=snapshot([both,d,c]), plan=createRiskActionPlan(s,WAD);
 assert.equal(plan.repayments.length,2);assert.equal(plan.additions.length,2);
 for(const row of [...plan.repayments,...plan.additions]) {if(row.estimate.status==='available') {const kind=plan.repayments.includes(row)?'repay':'add';assert.ok(value(s,row.address,kind,row.estimate.amount)>=WAD);assert.ok(value(s,row.address,kind,row.estimate.amount-1n)<WAD);}}
 assert.equal(plan.repayments[0].estimate.status,'unavailable');
});
test('zero debt and already reached targets do not suggest changes',()=>{
 const s=snapshot([a]);assert.equal(createRiskActionPlan(s,2n*WAD).noDebt,true);assert.equal(createRiskActionPlan(s,2n*WAD).baseline,MAX_UINT256);
 const plan=createRiskActionPlan(snapshot(),WAD*8n/10n);assert.equal(plan.alreadyReached,true);assert.deepEqual(plan.repayments,[]);
});
test('rejects invalid targets, missing prices, baseline mismatches and arithmetic overflow',()=>{
 for(const v of ['','0','-1','1e2','1000.1','1.0000000000000000001','01']) assert.equal(parseTarget(v),null);
 assert.equal(parseTarget('1.000000000000000001'),WAD+1n);assert.equal(parseTarget('1000'),1000n*WAD);
 const s=snapshot();assert.throws(()=>createRiskActionPlan(s,0n));assert.throws(()=>createRiskActionPlan({...s,emode:256},WAD));assert.throws(()=>createRiskActionPlan({...s,collateralBitmap:String(1n<<128n)},WAD));assert.throws(()=>createRiskActionPlan({...s,protocol:{...s.protocol,healthFactor:'1'}},WAD));
 assert.throws(()=>createRiskActionPlan({...s,positions:s.positions.map((p,i)=>i?{...p,price:'0'}:p)},WAD));
 assert.throws(()=>createRiskActionPlan({...s,positions:s.positions.map((p,i)=>i?{...p,price:String(MAX_UINT256)}:p)},WAD));
});
test('zero threshold, impossible single debt and solver cap are unavailable',()=>{
 const c={...a,liquidationThreshold:0n};let plan=createRiskActionPlan(snapshot([c,b]),WAD);assert.equal(plan.additions[0].estimate.status,'unavailable');
 const enormous={...b,variableDebt:MAX_PLAN_AMOUNT+1n};plan=createRiskActionPlan(snapshot([{...a,supply:1n},enormous]),1000n*WAD);assert.equal(plan.repayments[0].estimate.status,'unavailable');assert.equal(plan.additions[0].estimate.status,'unavailable');
 const s=snapshot([a,{...b,variableDebt:10n},{...b,id:2,variableDebt:1000n}]);plan=createRiskActionPlan(s,WAD);assert.equal(plan.repayments[0].estimate.status,'unavailable');
});
test('token decimal normalization and price rounding preserve the smallest-unit minimum',()=>{
 const collateral={...a,decimals:2,supply:100n,price:101n};
 const debt={...b,decimals:2,variableDebt:100n,price:101n};
 const s=snapshot([collateral,debt]), plan=createRiskActionPlan(s,WAD);
 for(const [row,kind] of [[plan.repayments[0],'repay'],[plan.additions[0],'add']] as const) {
  assert.equal(row.estimate.status,'available');if(row.estimate.status!=='available') throw Error('unavailable');
  assert.ok(value(s,row.address,kind,row.estimate.amount)>=WAD);
  assert.ok(value(s,row.address,kind,row.estimate.amount-1n)<WAD);
 }
});
