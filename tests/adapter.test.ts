import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { decodeFunctionResult, parseAbi, type PublicClient } from 'viem';
import { CONTRACTS, readTydroPosition } from '../lib/tydro';
import { toLiveSnapshot } from '../lib/live-api';
import { createLiquidationBoundaries } from '../lib/liquidation-boundary';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiveSnapshotView } from '../app/live-position';
const json=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const responses=json('evidence/reserves-response.json').sort((a:{id:number},b:{id:number})=>a.id-b.id);
const requests=json('evidence/reserves-request.json');
const wallet=json('evidence/wallet-response.json').sort((a:{id:number},b:{id:number})=>a.id-b.id);
const emode=json('evidence/emode-response.json').sort((a:{id:number},b:{id:number})=>a.id-b.id);
const abi=parseAbi(['function getReserveConfigurationData(address) view returns (uint256,uint256,uint256,uint256,uint256,bool,bool,bool,bool,bool)','function getUserReserveData(address,address) view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint40,bool)','function getAssetPrice(address) view returns (uint256)','function getUserAccountData(address) view returns (uint256,uint256,uint256,uint256,uint256,uint256)','function getUserEMode(address) view returns (uint256)','function getReserveAddressById(uint16) view returns (address)']);
const names=['getReserveConfigurationData','getUserReserveData','getAssetPrice'] as const;
const assets=Array.from({length:14},(_,i)=>decodeFunctionResult({abi,functionName:'getReserveAddressById',data:emode[5+i].result}));
// Recorded responses are replayed through the adapter, including its provider and reconciliation gates.
function fixture(mismatch=false, timestamp=1000n, onConfirm?:()=>void) {
 return {
  getChainId:async()=>57073, getBlock:async (args:{blockNumber?:bigint})=>{if(args.blockNumber!==undefined)onConfirm?.();return {number:61559318n,hash:'0x'+'a'.repeat(64),timestamp}},
  getStorageAt:async()=>`0x${'0'.repeat(24)}${CONTRACTS.implementation.slice(2).toLowerCase()}`,
  readContract:async ({functionName,args=[]}:{functionName:string,args?:string[]})=>{
   if(functionName==='getPool')return CONTRACTS.pool;if(functionName==='getPriceOracle')return CONTRACTS.oracle;if(functionName==='getPoolDataProvider')return CONTRACTS.data;
   if(functionName==='BASE_CURRENCY')return '0x0000000000000000000000000000000000000000';if(functionName==='BASE_CURRENCY_UNIT')return 100000000n;
   if(functionName==='getReservesList')return assets;if(functionName==='getAllReservesTokens')return assets.map((tokenAddress,i)=>({symbol:`asset${i}`,tokenAddress}));
   if(functionName==='getUserAccountData'){const a=decodeFunctionResult({abi,functionName:'getUserAccountData',data:wallet[0].result});return mismatch?[a[0],a[1],a[2],a[3],a[4],a[5]+1n]:a;}
   if(functionName==='getUserEMode')return 5n;if(functionName==='getUserConfiguration')return {data:2097168n};
   if(functionName==='getEModeCategoryCollateralConfig')return {ltv:9000,liquidationThreshold:9200,liquidationBonus:10400};if(functionName==='getEModeCategoryCollateralBitmap')return 1536n;
   const i=assets.findIndex(a=>a.toLowerCase()===args[0]?.toLowerCase());if(i<0)throw Error('unknown asset');
   if(functionName==='getReserveData')return {id:i};
   const n=names.indexOf(functionName as typeof names[number]);if(n<0)throw Error(`unexpected ${functionName}`);
   assert.equal(requests[i*3+n].params[0].data.slice(34,74).toLowerCase(),assets[i].slice(2).toLowerCase());
   return decodeFunctionResult({abi,functionName:names[n],data:responses[i*3+n].result});
  },
 } as unknown as PublicClient;
}
const user='0xc468315a2df54f9c076bd5cfe5002ba211f74ca6';
test('adapter reconciles pinned recorded borrower data',async()=>{const r=await readTydroPosition(fixture(),user,1000);assert.equal(r.emode,5);assert.equal(r.computed.healthFactor,1022705031985276228n);assert.equal(r.positions.filter(p=>p.supply||p.variableDebt).length,2)});
test('boundary calculation reconciles the recorded E-mode borrower through the adapter',async()=>{
 const snapshot=toLiveSnapshot(await readTydroPosition(fixture(),user,1000));const data=createLiquidationBoundaries(snapshot);
 assert.equal(data.baseline,1022705031985276228n);assert.equal(data.rows.length,1);const result=data.rows[0].result;
 assert.equal(result.status,'available');if(result.status==='available'){assert.ok(result.healthFactor<10n**18n);assert.ok(result.adjacentHealthFactor>=10n**18n);assert.equal(result.adjacentPrice,result.price+1n);}
});
test('command center displays the recorded E-mode USDe and USD₮0 snapshot',async()=>{
 const snapshot=toLiveSnapshot(await readTydroPosition(fixture(),user,1000));
 const html=renderToStaticMarkup(React.createElement(LiveSnapshotView,{snapshot,now:1001}));
 assert.match(html,/Liquidation Defense Command Center/);assert.match(html,/1\.022705/);assert.match(html,/Nearest verified conditional boundary/);assert.match(html,/Repay variable debt/);assert.match(html,/Add enabled collateral/);
});
test('adapter rejects a mismatch and stale block',async()=>{await assert.rejects(readTydroPosition(fixture(true),user,1000),/does not match/);await assert.rejects(readTydroPosition(fixture(),user,1121),/stale/)});
test('adapter enforces future skew and block age limits',async()=>{
 for(const [timestamp,passes] of [[1010n,true],[1030n,true],[1031n,false],[881n,true],[880n,true],[879n,false]] as const){
  const read=readTydroPosition(fixture(false,timestamp),user,1000);
  if(passes) await read; else await assert.rejects(read,/stale or has an invalid timestamp/);
 }
});
test('adapter applies both timestamp limits again at the end of a read',async(t)=>{
 let clock=1000000;
 t.mock.method(Date,'now',()=>clock);
 await assert.rejects(readTydroPosition(fixture(false,1000n,()=>{clock+=121000}),user,1000),/during position read/);
 clock=1000000;
 await assert.rejects(readTydroPosition(fixture(false,1030n,()=>{clock-=1000}),user,1000),/during position read/);
});
