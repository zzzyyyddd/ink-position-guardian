import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { calculateProtocolAccount, MAX_UINT256, type ProtocolAsset } from '../lib/protocol-math';
import { simulateLive, type ScenarioInput } from '../lib/live-simulation';
import type { LiveSnapshot } from '../lib/live-api';

const assets:ProtocolAsset[]=[
 {id:0,decimals:2,price:100n,supply:10000n,variableDebt:0n,stableDebt:0n,collateral:true,borrowed:false,liquidationThreshold:8000n},
 {id:1,decimals:2,price:200n,supply:5000n,variableDebt:1000n,stableDebt:0n,collateral:true,borrowed:true,liquidationThreshold:6000n},
 {id:2,decimals:2,price:101n,supply:0n,variableDebt:3001n,stableDebt:0n,collateral:false,borrowed:true,liquidationThreshold:0n},
];
const mode={id:5,collateralBitmap:1n,liquidationThreshold:9200n};
function snapshot():LiveSnapshot {
 const protocol=calculateProtocolAccount(assets,mode);
 return {mode:'live',wallet:'0x1',blockNumber:'1',blockHash:'0x1',blockTimestamp:1000,emode:5,collateralBitmap:'1',emodeLiquidationThreshold:'9200',baseUnit:'100',oracleFreshness:'unknown',protocol:{collateral:String(protocol.collateral),debt:String(protocol.debt),liquidationThreshold:String(protocol.liquidationThreshold),healthFactor:String(protocol.healthFactor)},positions:assets.map((a,i)=>({id:a.id,address:String(i),symbol:String(i),decimals:a.decimals,price:String(a.price),supply:String(a.supply),variableDebt:String(a.variableDebt),stableDebt:'0',collateral:a.collateral,borrowed:a.borrowed,liquidationThreshold:String(a.liquidationThreshold)}))};
}
test('multiple collateral and debt assets use e-mode bitmap and protocol rounding',()=>{
 const r=simulateLive(snapshot(),{});
 assert.equal(r.simulated.healthFactor, BigInt(snapshot().protocol.healthFactor));
 assert.equal(r.baseline.collateral,20000n);assert.equal(r.baseline.debt,5032n);assert.equal(r.baseline.liquidationThreshold,7600n);
 assert.equal(r.contributions[0].threshold,9200n);assert.equal(r.contributions[1].threshold,6000n);
 assert.equal(r.contributions[2].debt,3032n);
});
test('price shock reprices both sides, additions and repayments use token units',()=>{
 const r=simulateLive(snapshot(),{'1':{shock:'-50',repay:'5',add:'10'},'2':{shock:'0',repay:'30.01',add:'0'}});
 assert.equal(r.simulated.collateral,16000n);assert.equal(r.simulated.debt,500n);
 assert.equal(r.simulated.healthFactor,25600000000000000000n);
});
test('full repayment yields no debt and mismatches and invalid scenarios fail closed',()=>{
 const s=snapshot();const r=simulateLive(s,{'1':{shock:'0',repay:'10',add:'0'},'2':{shock:'0',repay:'30.01',add:'0'}});assert.equal(r.simulated.healthFactor,MAX_UINT256);
 for(const inputs of ([{'1':{shock:'-100',repay:'0',add:'0'}},{'1':{shock:'0',repay:'10.01',add:'0'}},{'2':{shock:'0',repay:'0',add:'1'}},{'0':{shock:'0',repay:'0',add:'0.001'}}] as ScenarioInput[])) assert.throws(()=>simulateLive(s,inputs));
 assert.throws(()=>simulateLive({...s,protocol:{...s.protocol,healthFactor:'1'}},{}),/does not match/);
});
