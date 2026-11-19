import { createInkClient, readTydroPosition } from '../lib/tydro';
async function main() {
 const rpc=process.env.INK_RPC_URL || 'https://rpc-gel.inkonchain.com';
 const wallet=process.env.WALLET_ADDRESS;
 if(!wallet) throw Error('Set WALLET_ADDRESS to a public Ink address');
 const result=await readTydroPosition(createInkClient(rpc),wallet);
 console.log(JSON.stringify(result,(_,value)=>typeof value==='bigint'?value.toString():value,2));
}
main().catch(error=>{console.error(error);process.exitCode=1});
