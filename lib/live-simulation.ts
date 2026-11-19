import { calculateProtocolAccount, type ProtocolAsset } from './protocol-math';
import type { LiveSnapshot } from './live-api';

export type ScenarioInput = Record<string, { shock: string; repay: string; add: string }>;

function tokenAmount(value: string, decimals: number): bigint {
 if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(value) || value.length > 80) throw Error('Enter non-negative token amounts without exponent notation.');
 const [whole, fraction = ''] = value.split('.');
 if (fraction.length > decimals) throw Error('Token amount has too many decimal places.');
 return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0');
}
export function simulateLive(snapshot: LiveSnapshot, inputs: ScenarioInput) {
 const mode = {id:snapshot.emode, collateralBitmap:BigInt(snapshot.collateralBitmap), liquidationThreshold:BigInt(snapshot.emodeLiquidationThreshold)};
 const assets: ProtocolAsset[] = snapshot.positions.map(p=>({id:p.id,decimals:p.decimals,price:BigInt(p.price),supply:BigInt(p.supply),variableDebt:BigInt(p.variableDebt),stableDebt:BigInt(p.stableDebt),collateral:p.collateral,borrowed:p.borrowed,liquidationThreshold:BigInt(p.liquidationThreshold)}));
 const baseline = calculateProtocolAccount(assets,mode);
 for(const key of ['collateral','debt','liquidationThreshold','healthFactor'] as const) if(baseline[key] !== BigInt(snapshot.protocol[key])) throw Error('Snapshot calculation does not match the Pool. Refresh the position.');
 const changed = assets.map((a,i)=>{
  const input=inputs[snapshot.positions[i].address] ?? {shock:'0',repay:'0',add:'0'};
  if(!/^-?\d{1,3}$/.test(input.shock)) throw Error('Price changes must be whole percentages from -99 to 100.');
  const shock=BigInt(input.shock);
  if(shock < -99n || shock > 100n) throw Error('Price changes must be whole percentages from -99 to 100.');
  const repay=tokenAmount(input.repay,a.decimals), add=tokenAmount(input.add,a.decimals);
  if(repay>a.variableDebt || (repay>0n && !a.borrowed)) throw Error('Repayment cannot exceed the recorded debt.');
  if(add>0n && !a.collateral) throw Error('Additions are limited to already enabled collateral.');
  const price=a.price*(100n+shock)/100n;
  if(price===0n) throw Error('The simulated price rounds to zero.');
  return {...a,price,supply:a.supply+add,variableDebt:a.variableDebt-repay};
 });
 const simulated=calculateProtocolAccount(changed,mode);
 const contributions=changed.map((a,i)=>{
  const threshold=mode.id!==0 && (mode.collateralBitmap & (1n<<BigInt(a.id)))!==0n ? mode.liquidationThreshold : a.liquidationThreshold;
  const scale=10n**BigInt(a.decimals);
  return {address:snapshot.positions[i].address,symbol:snapshot.positions[i].symbol,threshold,collateral:a.collateral ? a.supply*a.price/scale : 0n,debt:a.borrowed && a.variableDebt ? (a.variableDebt*a.price+scale-1n)/scale : 0n};
 });
 return {baseline,simulated,contributions};
}
