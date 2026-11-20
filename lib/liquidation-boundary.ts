import { isAddress } from 'viem';
import type { LiveSnapshot } from './live-api';
import { calculateProtocolAccount, MAX_UINT256, type ProtocolAsset } from './protocol-math';
import { simulateLive } from './live-simulation';

const WAD=10n**18n;
// Shared collateral/debt can have rounding-induced reversals; inspect every price or abstain.
export const MAX_SHARED_PRICE_STEPS=4096n;
type Result = {status:'available'; price:bigint; adjacentPrice:bigint; healthFactor:bigint; adjacentHealthFactor:bigint; distanceBps:bigint} | {status:'unavailable';reason:string};
type Row = {address:string;symbol:string;observedPrice:bigint;result:Result};

export function createLiquidationBoundaries(snapshot:LiveSnapshot):{baseline:bigint;rows:Row[]} {
 const bitmap=BigInt(snapshot.collateralBitmap), emodeThreshold=BigInt(snapshot.emodeLiquidationThreshold);
 if(snapshot.mode!=='live' || BigInt(snapshot.baseUnit)!==100000000n || !Number.isInteger(snapshot.emode) || snapshot.emode<0 || snapshot.emode>255 || bitmap<0n || bitmap>=1n<<128n || emodeThreshold<0n || emodeThreshold>10000n || !Array.isArray(snapshot.positions) || snapshot.positions.length>128) throw Error('Unsupported snapshot configuration');
 const ids=new Set<number>(), addresses=new Set<string>();
 const assets:ProtocolAsset[]=snapshot.positions.map(p=>{
  const addr=p.address.toLowerCase();
  if(!isAddress(p.address)||addresses.has(addr)||ids.has(p.id)||!Number.isInteger(p.id)||p.id<0||p.id>127||!Number.isInteger(p.decimals)||p.decimals<0||p.decimals>36) throw Error('Unsupported reserve identity');
  if(BigInt(p.stableDebt)!==0n || (BigInt(p.variableDebt)>0n&&!p.borrowed)) throw Error('Unsupported debt');
  ids.add(p.id);addresses.add(addr);
  return {id:p.id,decimals:p.decimals,price:BigInt(p.price),supply:BigInt(p.supply),variableDebt:BigInt(p.variableDebt),stableDebt:BigInt(p.stableDebt),collateral:p.collateral,borrowed:p.borrowed,liquidationThreshold:BigInt(p.liquidationThreshold)};
 });
 const mode={id:snapshot.emode,collateralBitmap:bitmap,liquidationThreshold:emodeThreshold};
 const checked=(v:bigint)=>{if(v<0n||v>MAX_UINT256)throw Error('Unsupported uint256 arithmetic');return v;};
 // Reject intermediates that a uint256 calculation cannot represent before using BigInt math.
 const evaluate=(items:ProtocolAsset[])=>{
  let collateral=0n,weighted=0n,debt=0n;
  for(const a of items) {
   const price=checked(a.price),supply=checked(a.supply),borrow=checked(a.variableDebt),scale=10n**BigInt(a.decimals),reserveThreshold=checked(a.liquidationThreshold);
   if(reserveThreshold>10000n || price===0n) throw Error('Unsupported reserve');
   const threshold=mode.id!==0 && (bitmap & (1n<<BigInt(a.id)))!==0n ? emodeThreshold : reserveThreshold;
   if(a.collateral) {const value=checked(supply*price)/scale;collateral=checked(collateral+value);weighted=checked(weighted+checked(value*threshold));}
   if(a.borrowed && borrow>0n) debt=checked(debt+checked(checked(borrow*price)+scale-1n)/scale);
  }
  if(debt>0n) checked(checked(weighted*WAD)+debt/2n);
  return calculateProtocolAccount(items,mode).healthFactor;
 };
 const baseline=simulateLive(snapshot,{}).baseline;
 if(evaluate(assets)!==baseline.healthFactor) throw Error('Baseline mismatch');
 const rows:Row[]=snapshot.positions.flatMap((p,index)=>{
  const asset=assets[index]; if(!asset.collateral || asset.supply===0n) return [];
  const observedPrice=asset.price;
  const unavailable=(reason:string):Row=>({address:p.address,symbol:p.symbol,observedPrice,result:{status:'unavailable',reason}});
  if(baseline.debt===0n) return [unavailable('No debt at this snapshot.')];
  if(baseline.healthFactor<WAD) return [unavailable('The current health factor is already below 1.')];
  if(observedPrice<=1n) return [unavailable('No lower positive oracle-price unit is available.')];
  try {
   const at=(price:bigint)=>evaluate(assets.map((a,i)=>i===index?{...a,price}:a));
   let low=1n, high=observedPrice;
   if(asset.borrowed && asset.variableDebt>0n) {
    if(observedPrice>MAX_SHARED_PRICE_STEPS) return [unavailable('Shared collateral and debt may be non-monotonic; the exact search range exceeds the supported limit.')];
    let previous=at(1n), crossing=previous<WAD?1n:0n;
    for(let price=2n;price<=observedPrice;price++) {
     const hf=at(price);
     if(hf<previous) return [unavailable('Shared collateral and debt is not monotonic across discrete oracle prices.')];
     if(hf<WAD) crossing=price;
     previous=hf;
    }
    if(crossing===0n) return [unavailable('No crossing at any lower positive oracle-price unit.')];
    low=crossing;high=crossing+1n;
   } else {
    // With unchanged debt, collateral floor-value and HF are nondecreasing in price.
    if(at(low)>=WAD) return [unavailable('No crossing at any lower positive oracle-price unit.')];
    while(low+1n<high) {const mid=(low+high)/2n;if(at(mid)<WAD)low=mid;else high=mid;}
   }
   const healthFactor=at(low),adjacentHealthFactor=at(high);
   if(high!==low+1n || healthFactor>=WAD || adjacentHealthFactor<WAD) throw Error('Boundary verification failed');
   return [{address:p.address,symbol:p.symbol,observedPrice,result:{status:'available',price:low,adjacentPrice:high,healthFactor,adjacentHealthFactor,distanceBps:(observedPrice-low)*10000n/observedPrice}}];
  } catch {return [unavailable('A boundary could not be verified within supported arithmetic.')];}
 });
 return {baseline:baseline.healthFactor,rows};
}
