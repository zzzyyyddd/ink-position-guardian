import { formatUnits } from 'viem';
import type { LiveSnapshot } from './live-api';
import { simulateLive, type ScenarioInput } from './live-simulation';
import { MAX_UINT256 } from './protocol-math';

const WAD = 10n ** 18n;
// A bounded range limits both browser work and unsupported extreme hypothetical amounts.
export const MAX_PLAN_AMOUNT = (1n << 120n) - 1n;
const MAX_ITERATIONS = 121;
const MAX_TARGET = 1000n * WAD;

type Position = LiveSnapshot['positions'][number];
export type Estimate = { status:'available'; amount:bigint; valueBase:bigint; healthFactor:bigint } | { status:'unavailable'; reason:string };
export type PlanRow = { address:string; symbol:string; decimals:number; estimate:Estimate };

export function parseTarget(value:string):bigint | null {
 if (!/^(0|[1-9]\d{0,3})(\.\d{1,18})?$/.test(value)) return null;
 const [whole,fraction='']=value.split('.');
 const result=BigInt(whole)*WAD+BigInt((fraction+'0'.repeat(18)).slice(0,18));
 return result>0n && result<=MAX_TARGET ? result : null;
}

// Conservative uint256 checks for protocol-style intermediates; no alternative HF formula.
function validateArithmetic(snapshot:LiveSnapshot, changedAddress:string, kind:'repay'|'add', amount:bigint) {
 let collateral=0n, debt=0n, weighted=0n;
 const checked=(v:bigint)=>{if(v<0n || v>MAX_UINT256) throw Error('Arithmetic exceeds supported uint256 bounds'); return v;};
 const bitmap=checked(BigInt(snapshot.collateralBitmap));
 for(const p of snapshot.positions) {
  if(!Number.isInteger(p.id)||p.id<0||p.id>127||!Number.isInteger(p.decimals)||p.decimals<0||p.decimals>36) throw Error('Unsupported reserve');
  const scale=10n**BigInt(p.decimals), price=checked(BigInt(p.price));
  let supply=checked(BigInt(p.supply)), borrowed=checked(BigInt(p.variableDebt));
  checked(BigInt(p.stableDebt));
  if(p.address===changedAddress) {if(kind==='add') supply=checked(supply+amount); else borrowed=checked(borrowed-amount);}
  if(price===0n) throw Error('Missing price');
  const reserveThreshold=checked(BigInt(p.liquidationThreshold));
  const threshold=snapshot.emode!==0 && (bitmap&(1n<<BigInt(p.id)))!==0n ? checked(BigInt(snapshot.emodeLiquidationThreshold)) : reserveThreshold;
  if(threshold>10000n || reserveThreshold>10000n) throw Error('Unsupported threshold');
  if(p.collateral) {const v=checked(supply*price)/scale; collateral=checked(collateral+v);weighted=checked(weighted+checked(v*threshold));}
  if(p.borrowed && borrowed>0n) debt=checked(debt+checked(checked(borrowed*price)+scale-1n)/scale);
 }
 if(debt) checked(checked(weighted*WAD)+debt/2n);
 return {collateral,debt};
}

function solve(snapshot:LiveSnapshot,p:Position,kind:'repay'|'add',target:bigint):Estimate {
 try {
  if(BigInt(p.price)<=0n) throw Error('Price unavailable');
  if(kind==='add') {
   const eligible=snapshot.emode!==0 && (BigInt(snapshot.collateralBitmap)&(1n<<BigInt(p.id)))!==0n;
   if(BigInt(eligible?snapshot.emodeLiquidationThreshold:p.liquidationThreshold)===0n) return {status:'unavailable',reason:'Effective liquidation threshold is zero.'};
  }
  const rawDebt=BigInt(p.variableDebt);
  const limit=kind==='repay' && rawDebt<MAX_PLAN_AMOUNT ? rawDebt : MAX_PLAN_AMOUNT;
  if(limit<=0n) return {status:'unavailable',reason:'No eligible amount to search.'};
  const evaluate=(amount:bigint)=>{
   validateArithmetic(snapshot,p.address,kind,amount);
   const entry={shock:'0',repay:kind==='repay'?formatUnits(amount,p.decimals):'0',add:kind==='add'?formatUnits(amount,p.decimals):'0'};
   const input:ScenarioInput={[p.address]:entry};
   return simulateLive(snapshot,input).simulated.healthFactor;
  };
  let high=kind==='repay'?limit:1n;
  if(kind==='add') {
   let steps=0;
   while(evaluate(high)<target && high<limit) {if(++steps>MAX_ITERATIONS) throw Error('Search limit exceeded'); high=high>limit/2n?limit:high*2n;}
  }
  if(evaluate(high)<target) return {status:'unavailable',reason:kind==='repay' && limit===rawDebt?'Target cannot be reached with this debt asset alone.':'Target not reached within the solver amount limit.'};
  let low=0n, steps=0;
  while(low+1n<high) {
   if(++steps>MAX_ITERATIONS) throw Error('Search limit exceeded');
   const mid=(low+high)/2n;
   if(evaluate(mid)>=target) high=mid; else low=mid;
  }
  const hf=evaluate(high);
  if(hf<target || evaluate(high-1n)>=target) throw Error('Could not verify minimum');
  const price=BigInt(p.price), scale=10n**BigInt(p.decimals);
  if(high*price>MAX_UINT256) throw Error('Value exceeds supported uint256 bounds');
  const valueBase=high*price/scale;
  return {status:'available',amount:high,valueBase,healthFactor:hf};
 } catch {return {status:'unavailable',reason:'Cannot verify a solution within supported arithmetic and search limits.'};}
}

export function createRiskActionPlan(snapshot:LiveSnapshot,target:bigint) {
 if(target<=0n || target>MAX_TARGET) throw Error('Enter a target above 0 and at most 1000, with up to 18 decimal places.');
 if(!Number.isInteger(snapshot.emode)||snapshot.emode<0||snapshot.emode>255 || BigInt(snapshot.collateralBitmap)<0n || BigInt(snapshot.collateralBitmap)>=(1n<<128n) || BigInt(snapshot.emodeLiquidationThreshold)<0n || BigInt(snapshot.emodeLiquidationThreshold)>10000n) throw Error('Unsupported e-mode configuration.');
 if(!Array.isArray(snapshot.positions)||snapshot.positions.length>128||new Set(snapshot.positions.map(p=>p.address.toLowerCase())).size!==snapshot.positions.length||new Set(snapshot.positions.map(p=>p.id)).size!==snapshot.positions.length) throw Error('Unsupported snapshot assets.');
 validateArithmetic(snapshot,'','add',0n);
 const baseline=simulateLive(snapshot,{}).baseline;
 if(BigInt(snapshot.baseUnit)<=0n || BigInt(snapshot.baseUnit)>MAX_UINT256) throw Error('Unsupported base currency unit.');
 const alreadyReached=baseline.healthFactor>=target;
 const row=(p:Position,kind:'repay'|'add'):PlanRow=>({address:p.address,symbol:p.symbol,decimals:p.decimals,estimate:solve(snapshot,p,kind,target)});
 return {baseline:baseline.healthFactor,target,alreadyReached,noDebt:baseline.healthFactor===MAX_UINT256,repayments:alreadyReached?[]:snapshot.positions.filter(p=>p.borrowed&&BigInt(p.variableDebt)>0n).map(p=>row(p,'repay')),additions:alreadyReached?[]:snapshot.positions.filter(p=>p.collateral).map(p=>row(p,'add'))};
}
