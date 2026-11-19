import { isAddress } from 'viem';
import type { readTydroPosition } from './tydro';

export type PositionResult = Awaited<ReturnType<typeof readTydroPosition>>;
export type LiveSnapshot = {
 mode: 'live'; wallet: string; blockNumber: string; blockHash: string; blockTimestamp: number;
 emode: number; baseUnit: string; oracleFreshness: 'unknown';
 protocol: { collateral: string; debt: string; liquidationThreshold: string; healthFactor: string };
 positions: { address: string; symbol: string; decimals: number; supply: string; variableDebt: string; stableDebt: string; collateral: boolean; price: string }[];
};
export function toLiveSnapshot(position: PositionResult): LiveSnapshot {
 return {mode:'live',wallet:position.wallet,blockNumber:String(position.blockNumber),blockHash:position.blockHash,blockTimestamp:Number(position.blockTimestamp),emode:position.emode,baseUnit:String(position.baseUnit),oracleFreshness:'unknown',protocol:{collateral:String(position.protocol.collateral),debt:String(position.protocol.debt),liquidationThreshold:String(position.protocol.liquidationThreshold),healthFactor:String(position.protocol.healthFactor)},positions:position.positions.filter(p=>p.supply>0n||p.variableDebt>0n||p.stableDebt>0n).map(p=>({address:p.address,symbol:p.symbol,decimals:p.decimals,supply:String(p.supply),variableDebt:String(p.variableDebt),stableDebt:String(p.stableDebt),collateral:p.collateral,price:String(p.price)}))};
}
export async function lookupPosition(address: string | null, read:(address:string)=>Promise<PositionResult>): Promise<{status:number;body:LiveSnapshot | {error:string}}> {
 if(!address || !isAddress(address)) return {status:400,body:{error:'Enter a valid wallet address.'}};
 try { return {status:200,body:toLiveSnapshot(await read(address))}; }
 catch { return {status:503,body:{error:'Unable to verify this position. The RPC, deployment, price data, or account calculation may be unavailable. Please try again.'}}; }
}
