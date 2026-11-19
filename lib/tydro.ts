import { createPublicClient, http, isAddress, getAddress, parseAbi, type Address, type PublicClient } from 'viem';
import { calculateProtocolAccount, type ProtocolAsset } from './protocol-math';

// Source: https://docs.tydro.com/vii.-developers/developer-overview/smart-contracts/contract-addresses
export const CONTRACTS = {
 provider:'0x4172E6aAEC070ACB31aaCE343A58c93E4C70f44D', pool:'0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA',
 data:'0x96086C25d13943C80Ff9a19791a40Df6aFC08328', oracle:'0x4758213271BFdC72224A7a8742dC865fC97756e1',
 implementation:'0x6a056dA055C616cd89dBcd0dC4b3f4E0F6162eb6',
} as const;
const SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const providerAbi=parseAbi(['function getPool() view returns (address)','function getPriceOracle() view returns (address)','function getPoolDataProvider() view returns (address)']);
const poolAbi=parseAbi([
 'function getReservesList() view returns (address[])',
 'function getReserveData(address) view returns (((uint256 data) configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))',
 'function getUserAccountData(address) view returns (uint256,uint256,uint256,uint256,uint256,uint256)',
 'function getUserConfiguration(address) view returns ((uint256 data))', 'function getUserEMode(address) view returns (uint256)',
 'function getEModeCategoryCollateralConfig(uint8) view returns ((uint16 ltv,uint16 liquidationThreshold,uint16 liquidationBonus))',
 'function getEModeCategoryCollateralBitmap(uint8) view returns (uint128)',
]);
const dataAbi=parseAbi(['function getAllReservesTokens() view returns ((string symbol,address tokenAddress)[])','function getReserveConfigurationData(address) view returns (uint256,uint256,uint256,uint256,uint256,bool,bool,bool,bool,bool)','function getUserReserveData(address,address) view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint40,bool)']);
const oracleAbi=parseAbi(['function BASE_CURRENCY() view returns (address)','function BASE_CURRENCY_UNIT() view returns (uint256)','function getAssetPrice(address) view returns (uint256)']);
export function createInkClient(url: string) { return createPublicClient({transport:http(url,{timeout:15000,retryCount:2})}); }
function isFreshBlockTimestamp(timestamp: bigint, now: bigint) {
 const age=now-timestamp;
 return age>=-30n && age<=120n;
}
/** Experimental, read-only. Fail closed on upgrade, stale block, missing prices, or any reconciliation error. */
export async function readTydroPosition(client: PublicClient, wallet: string, nowSeconds = Math.floor(Date.now()/1000)) {
 if(!isAddress(wallet)) throw Error('Invalid wallet address');
 const user=getAddress(wallet);
 const startedAt=Date.now();
 if(await client.getChainId()!==57073) throw Error('RPC is not Ink Mainnet');
 const block=await client.getBlock({blockTag:'latest'});
 if(block.number===null || block.hash===null || !isFreshBlockTimestamp(block.timestamp,BigInt(nowSeconds))) throw Error('RPC block is stale or has an invalid timestamp');
 const blockNumber=block.number;
 const [pool,oracle,data,slot]=await Promise.all([
  client.readContract({address:CONTRACTS.provider,abi:providerAbi,functionName:'getPool',blockNumber}),
  client.readContract({address:CONTRACTS.provider,abi:providerAbi,functionName:'getPriceOracle',blockNumber}),
  client.readContract({address:CONTRACTS.provider,abi:providerAbi,functionName:'getPoolDataProvider',blockNumber}),
  client.getStorageAt({address:CONTRACTS.pool,slot:SLOT,blockNumber}),
 ]);
 if(getAddress(pool)!==CONTRACTS.pool || getAddress(oracle)!==CONTRACTS.oracle || getAddress(data)!==CONTRACTS.data || !slot || getAddress(`0x${slot.slice(-40)}`)!==CONTRACTS.implementation) throw Error('Tydro deployment changed; integration requires review');
 const [list,tokens,base,unit,account,config,category]=await Promise.all([
  client.readContract({address:pool,abi:poolAbi,functionName:'getReservesList',blockNumber}),
  client.readContract({address:data,abi:dataAbi,functionName:'getAllReservesTokens',blockNumber}),
  client.readContract({address:oracle,abi:oracleAbi,functionName:'BASE_CURRENCY',blockNumber}),
  client.readContract({address:oracle,abi:oracleAbi,functionName:'BASE_CURRENCY_UNIT',blockNumber}),
  client.readContract({address:pool,abi:poolAbi,functionName:'getUserAccountData',args:[user],blockNumber}),
  client.readContract({address:pool,abi:poolAbi,functionName:'getUserConfiguration',args:[user],blockNumber}),
  client.readContract({address:pool,abi:poolAbi,functionName:'getUserEMode',args:[user],blockNumber}),
 ]);
 if(base!=='0x0000000000000000000000000000000000000000' || unit!==100000000n || category>255n || list.length>128) throw Error('Unsupported market configuration');
 const emodeId=Number(category);
 const [emodeConfig,bitmap]=emodeId ? await Promise.all([
  client.readContract({address:pool,abi:poolAbi,functionName:'getEModeCategoryCollateralConfig',args:[emodeId],blockNumber}),
  client.readContract({address:pool,abi:poolAbi,functionName:'getEModeCategoryCollateralBitmap',args:[emodeId],blockNumber}),
 ]) : [{ltv:0,liquidationThreshold:0,liquidationBonus:0},0n] as const;
 const positions=await Promise.all(list.map(async (asset:Address)=>{
  const [reserve,cfg,balance,price]=await Promise.all([
   client.readContract({address:pool,abi:poolAbi,functionName:'getReserveData',args:[asset],blockNumber}),
   client.readContract({address:data,abi:dataAbi,functionName:'getReserveConfigurationData',args:[asset],blockNumber}),
   client.readContract({address:data,abi:dataAbi,functionName:'getUserReserveData',args:[asset,user],blockNumber}),
   client.readContract({address:oracle,abi:oracleAbi,functionName:'getAssetPrice',args:[asset],blockNumber}),
  ]);
  const id=reserve.id, flags=config.data >> BigInt(id*2);
  const item:ProtocolAsset={id,decimals:Number(cfg[0]),price,supply:balance[0],stableDebt:balance[1],variableDebt:balance[2],borrowed:(flags&1n)!==0n,collateral:(flags&2n)!==0n,liquidationThreshold:cfg[2]};
  if((item.supply>0n || item.variableDebt>0n || item.stableDebt>0n) && price===0n) throw Error('Missing price for position asset');
  if(item.collateral!==balance[8]) throw Error('Collateral flag mismatch');
  return {...item,address:asset,symbol:tokens.find(t=>t.tokenAddress.toLowerCase()===asset.toLowerCase())?.symbol ?? asset};
 }));
 const computed=calculateProtocolAccount(positions,{id:emodeId,collateralBitmap:bitmap,liquidationThreshold:BigInt(emodeConfig.liquidationThreshold)});
 if(computed.collateral!==account[0] || computed.debt!==account[1] || computed.liquidationThreshold!==account[3] || computed.healthFactor!==account[5]) throw Error('Calculated position does not match protocol account data');
 const confirmedBlock=await client.getBlock({blockNumber});
 if(confirmedBlock.hash!==block.hash) throw Error('RPC block changed during position read');
 if(!isFreshBlockTimestamp(block.timestamp,BigInt(nowSeconds)+BigInt(Math.floor((Date.now()-startedAt)/1000)))) throw Error('RPC block became stale or has an invalid timestamp during position read');
 return {wallet:user,blockNumber,blockHash:block.hash,blockTimestamp:block.timestamp,baseCurrency:base,baseUnit:unit,emode:emodeId,collateralBitmap:bitmap,emodeLiquidationThreshold:BigInt(emodeConfig.liquidationThreshold),protocol:{collateral:account[0],debt:account[1],liquidationThreshold:account[3],healthFactor:account[5]},positions,computed,oracleFreshness:'unknown' as const};
}
