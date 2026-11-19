import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { calculateProtocolAccount, MAX_UINT256, type ProtocolAsset } from '../lib/protocol-math';
const base: ProtocolAsset={id:0,decimals:6,price:100000000n,supply:1000000n,variableDebt:0n,stableDebt:0n,collateral:true,borrowed:false,liquidationThreshold:8000n};
test('zero debt, bitmap eligibility, weighted thresholds and ceiling debt',()=>{
 const r=calculateProtocolAccount([base,{...base,id:1,price:1n,supply:0n,variableDebt:1n,collateral:false,borrowed:true}],{id:5,collateralBitmap:1n,liquidationThreshold:9200n});
 assert.equal(r.collateral,100000000n);assert.equal(r.debt,1n);assert.equal(r.liquidationThreshold,9200n);assert.equal(r.healthFactor,92000000000000000000000000n);
 assert.equal(calculateProtocolAccount([base],{id:0,collateralBitmap:0n,liquidationThreshold:0n}).healthFactor,MAX_UINT256);
 const multi=calculateProtocolAccount([base,{...base,id:1}],{id:5,collateralBitmap:1n,liquidationThreshold:9200n});assert.equal(multi.liquidationThreshold,8600n);
});
test('active missing prices and stable debt fail closed',()=>{assert.throws(()=>calculateProtocolAccount([{...base,price:0n}],{id:0,collateralBitmap:0n,liquidationThreshold:0n}));assert.throws(()=>calculateProtocolAccount([{...base,stableDebt:1n}],{id:0,collateralBitmap:0n,liquidationThreshold:0n}));});
