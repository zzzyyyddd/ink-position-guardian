import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { decodeFunctionResult, parseAbi } from 'viem';
import { calculateProtocolAccount, type ProtocolAsset } from '../lib/protocol-math';
const load=(p:string)=>JSON.parse(readFileSync(p,'utf8')).sort((a:{id:number},b:{id:number})=>a.id-b.id);
const reserves=load('evidence/reserves-response.json'),wallets=load('evidence/wallets-response.json');
const abi=parseAbi(['function getReserveConfigurationData(address) view returns (uint256,uint256,uint256,uint256,uint256,bool,bool,bool,bool,bool)','function getAssetPrice(address) view returns (uint256)','function getUserAccountData(address) view returns (uint256,uint256,uint256,uint256,uint256,uint256)','function getUserEMode(address) view returns (uint256)','function getUserConfiguration(address) view returns ((uint256 data))','function getUserReserveData(address,address) view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint40,bool)']);
test('four independent mainnet snapshots match protocol totals and health factor exactly',()=>{
 for(let w=0;w<4;w++){
  const k=w*17, account=decodeFunctionResult({abi,functionName:'getUserAccountData',data:wallets[k].result}), mode=decodeFunctionResult({abi,functionName:'getUserEMode',data:wallets[k+1].result}), config=decodeFunctionResult({abi,functionName:'getUserConfiguration',data:wallets[k+2].result});
  const assets:ProtocolAsset[]=[];
  for(let i=0;i<14;i++){
   const c=decodeFunctionResult({abi,functionName:'getReserveConfigurationData',data:reserves[3*i].result});
   const price=decodeFunctionResult({abi,functionName:'getAssetPrice',data:reserves[3*i+2].result});
   const u=decodeFunctionResult({abi,functionName:'getUserReserveData',data:wallets[k+3+i].result});
   const flags=config.data >> BigInt(i*2);
   assets.push({id:i,decimals:Number(c[0]),price,supply:u[0],stableDebt:u[1],variableDebt:u[2],borrowed:(flags&1n)!==0n,collateral:(flags&2n)!==0n,liquidationThreshold:c[2]});
  }
  assert.ok(mode===0n || mode===5n);
  const result=calculateProtocolAccount(assets,{id:Number(mode),collateralBitmap:mode===5n?1536n:0n,liquidationThreshold:mode===5n?9200n:0n});
  assert.equal(result.collateral,account[0]);assert.equal(result.debt,account[1]);assert.equal(result.liquidationThreshold,account[3]);assert.equal(result.healthFactor,account[5]);
 }
});
