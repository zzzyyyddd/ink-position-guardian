import { isAddress } from 'viem';
import type { LiveSnapshot } from './live-api';
import { simulateLive } from './live-simulation';

// Tydro Ink reserve addresses observed in the Mission 01 pinned market probe.
export const TYDRO_STABLES = [
 { name:'USDe', address:'0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34' },
 { name:'USD₮0', address:'0x0200c29006150606b650577bbe7b6248f58470c1' },
] as const;

export function createRiskFingerprint(snapshot:LiveSnapshot) {
 const bitmap=BigInt(snapshot.collateralBitmap), emodeThreshold=BigInt(snapshot.emodeLiquidationThreshold);
 if(snapshot.mode!=='live' || BigInt(snapshot.baseUnit)!==100000000n || !Number.isInteger(snapshot.emode) || snapshot.emode<0 || snapshot.emode>255 || bitmap<0n || bitmap>=1n<<128n || emodeThreshold<0n || emodeThreshold>10000n || snapshot.positions.length>128) throw Error('Unsupported snapshot configuration');
 const ids=new Set<number>(), addresses=new Set<string>();
 for(const p of snapshot.positions) {
  const address=p.address.toLowerCase();
  if(!isAddress(p.address) || addresses.has(address) || ids.has(p.id) || !Number.isInteger(p.id) || p.id<0 || p.id>127 || !Number.isInteger(p.decimals) || p.decimals<0 || p.decimals>36) throw Error('Unsupported reserve identity');
  if(BigInt(p.stableDebt)!==0n || (BigInt(p.variableDebt)>0n && !p.borrowed)) throw Error('Unsupported debt');
  addresses.add(address);ids.add(p.id);
 }
 // This independently rechecks all four Pool account metrics before deriving anything.
 const {baseline,contributions}=simulateLive(snapshot,{});
 const assets=snapshot.positions.map((p,i)=>{
  const item=contributions[i];
  const identity=TYDRO_STABLES.find(s=>s.address===p.address.toLowerCase())?.name ?? null;
  return {address:p.address,symbol:p.symbol,identity,collateral:p.collateral,supply:BigInt(p.supply),
   collateralValue:item.collateral,debtValue:item.debt,oraclePrice:BigInt(p.price),
   collateralShareBps:baseline.collateral>0n && p.collateral ? item.collateral*10000n/baseline.collateral : null,
   emodeEligible:snapshot.emode!==0 && (bitmap & (1n<<BigInt(p.id)))!==0n,
   effectiveThreshold:item.threshold};
 });
 const scenarios=TYDRO_STABLES.flatMap(stable=>[-5,-10].map(shock=>{
  const position=snapshot.positions.find(p=>p.address.toLowerCase()===stable.address);
  if(!position || (!position.collateral && (!position.borrowed || BigInt(position.variableDebt)===0n))) return {name:stable.name,shock,status:'unavailable' as const,reason:'No enabled collateral or debt exposure in this snapshot.'};
  try {
   const observedPrice=BigInt(position.price), hypotheticalPrice=observedPrice*BigInt(100+shock)/100n;
   const result=simulateLive(snapshot,{[position.address]:{shock:String(shock),repay:'0',add:'0'}});
   return {name:stable.name,shock,status:'available' as const,observedPrice,hypotheticalPrice,healthFactor:result.simulated.healthFactor};
  } catch {return {name:stable.name,shock,status:'unavailable' as const,reason:'Scenario could not be verified.'};}
 }));
 return {assets,scenarios,collateral:baseline.collateral,debt:baseline.debt,healthFactor:baseline.healthFactor,emode:snapshot.emode};
}
