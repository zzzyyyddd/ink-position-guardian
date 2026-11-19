import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { decodeFunctionResult, parseAbi } from 'viem';
import { calculateProtocolAccount, type ProtocolAsset } from '../lib/protocol-math';
import { simulateLive } from '../lib/live-simulation';
import type { LiveSnapshot } from '../lib/live-api';
import { formatHealthFactor } from '../lib/health-display';
const responses = JSON.parse(readFileSync('evidence/reserves-response.json','utf8')).sort((a:{id:number},b:{id:number})=>a.id-b.id);
const emodeResponses = JSON.parse(readFileSync('evidence/emode-response.json','utf8')).sort((a:{id:number},b:{id:number})=>a.id-b.id);
const walletResponses = JSON.parse(readFileSync('evidence/wallet-response.json','utf8')).sort((a:{id:number},b:{id:number})=>a.id-b.id);
const abi = parseAbi(['function getReserveConfigurationData(address) view returns (uint256,uint256,uint256,uint256,uint256,bool,bool,bool,bool,bool)','function getUserReserveData(address,address) view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint40,bool)','function getAssetPrice(address) view returns (uint256)','function getUserAccountData(address) view returns (uint256,uint256,uint256,uint256,uint256,uint256)','function getUserEMode(address) view returns (uint256)']);
test('recorded pinned mainnet borrower values reconcile at the oracle base unit',()=>{
 assert.equal(responses.length,42); assert.ok(responses.every((r:{result?:string})=>r.result));
 let collateral=0n,debt=0n,active=0; const unit=100000000n; const assets: ProtocolAsset[]=[];
 for(let i=0;i<responses.length;i+=3){
  const c=decodeFunctionResult({abi,functionName:'getReserveConfigurationData',data:responses[i].result});
  const u=decodeFunctionResult({abi,functionName:'getUserReserveData',data:responses[i+1].result});
  const price=decodeFunctionResult({abi,functionName:'getAssetPrice',data:responses[i+2].result});
  if(u[0]||u[1]||u[2]){ assets.push({id:i/3,decimals:Number(c[0]),price,supply:u[0],stableDebt:u[1],variableDebt:u[2],collateral:u[8],borrowed:u[2]>0n,liquidationThreshold:c[2]}); active++; assert.ok(price>0n); if(u[8]) collateral+=u[0]*price/(10n**c[0]); debt+=(u[1]+u[2])*price/(10n**c[0]); }
 }
 const account=decodeFunctionResult({abi,functionName:'getUserAccountData',data:walletResponses[0].result});
 const emode=decodeFunctionResult({abi,functionName:'getUserEMode',data:walletResponses[1].result});
 assert.equal(active,2);assert.equal(collateral,account[0]);assert.equal(debt+1n,account[1]);assert.equal(emode,5n);assert.equal(account[3],9200n);assert.equal(unit,100000000n);
 // Rounded effective-threshold estimate is close, but does not reproduce protocol HF bit-for-bit.
 const estimate=((collateral*account[3]+5000n)/10000n*10n**18n+account[1]/2n)/account[1];
 assert.equal(account[5]-estimate,72n);
 const emodeAbi=parseAbi(['function getEModeCategoryCollateralConfig(uint8) view returns ((uint16 ltv,uint16 liquidationThreshold,uint16 liquidationBonus))','function getEModeCategoryCollateralBitmap(uint8) view returns (uint128)']);
 const category=decodeFunctionResult({abi:emodeAbi,functionName:'getEModeCategoryCollateralConfig',data:emodeResponses[0].result}); const bitmap=decodeFunctionResult({abi:emodeAbi,functionName:'getEModeCategoryCollateralBitmap',data:emodeResponses[1].result}); assert.equal(category.liquidationThreshold,9200);assert.equal(bitmap,1536n);
 const exact=calculateProtocolAccount(assets,{id:5,collateralBitmap:bitmap,liquidationThreshold:BigInt(category.liquidationThreshold)}); assert.equal(exact.collateral,account[0]);assert.equal(exact.debt,account[1]);assert.equal(exact.liquidationThreshold,account[3]);assert.equal(exact.healthFactor,account[5]);
 const snapshot:LiveSnapshot={mode:'live',wallet:'recorded',blockNumber:'61559318',blockHash:'recorded',blockTimestamp:0,emode:5,collateralBitmap:String(bitmap),emodeLiquidationThreshold:String(category.liquidationThreshold),baseUnit:String(unit),oracleFreshness:'unknown',protocol:{collateral:String(account[0]),debt:String(account[1]),liquidationThreshold:String(account[3]),healthFactor:String(account[5])},positions:assets.map(a=>({id:a.id,address:String(a.id),symbol:String(a.id),decimals:a.decimals,supply:String(a.supply),variableDebt:String(a.variableDebt),stableDebt:String(a.stableDebt),collateral:a.collateral,borrowed:a.borrowed,liquidationThreshold:String(a.liquidationThreshold),price:String(a.price)}))};
 const zero=simulateLive(snapshot,{});
 assert.equal(zero.simulated.healthFactor,account[5]);
 assert.equal(formatHealthFactor(zero.simulated.healthFactor),'1.022705');
});
