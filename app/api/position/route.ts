import { lookupPosition } from '../../../lib/live-api';
import { createInkClient, readTydroPosition } from '../../../lib/tydro';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) {
 const address=new URL(request.url).searchParams.get('address');
 const result=await lookupPosition(address, wallet=>readTydroPosition(createInkClient(process.env.INK_RPC_URL || 'https://rpc-gel.inkonchain.com'),wallet));
 return Response.json(result.body,{status:result.status,headers:{'Cache-Control':'no-store'}});
}
