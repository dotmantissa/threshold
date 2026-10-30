import {authenticate} from '@/lib/auth';
import {db} from '@/lib/db';
import {readTenancy} from '@/lib/chain';
import {executionSucceeded,executionError,type NetworkReceipt} from '@/lib/receipt';
import {payoutsCompleted,type TransferReceipt} from '@/lib/payouts';
import {sameAddress} from '@/lib/amounts';
import {json,errorResponse,readJson,assertSameOrigin,HttpError} from '@/lib/http';
import {z} from 'zod';
import {abi} from 'genlayer-js';
import {parseNetworkJson,assertReceiptBinding,type BoundReceipt} from '@/lib/receipt-binding';
import type {TransactionCall} from '@/lib/types';
const inputSchema=z.object({tx_hash:z.string().regex(/^0x[\da-f]{64}$/i).optional(),cancel:z.boolean().optional()});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
 assertSameOrigin(request);const user=await authenticate(request);const {id}=await params;
 if(!z.uuid().safeParse(id).success)throw new HttpError(404,'This action could not be found.');
 const sql=db();const rows=await sql`SELECT o.*,t.creator_wallet,t.counterparty_wallet,t.creator_role,t.chain_id,t.contract_addresses,u.wallet AS operation_wallet FROM threshold_operations o JOIN threshold_tenancies t ON o.tenancy_id=t.id JOIN threshold_users u ON o.user_id=u.privy_id WHERE o.id=${id} AND (t.creator_id=${user.id} OR t.counterparty_id=${user.id})`;
 const op=rows[0];if(!op)throw new HttpError(404,'This action could not be found.');
 const input=inputSchema.parse(await readJson(request));
 if((input.cancel||input.tx_hash)&&op.user_id&&op.user_id!==user.id)throw new HttpError(403,'Only the action creator can submit or cancel it.');
 if(input.cancel){const changed=await sql`UPDATE threshold_operations SET status='FAILED',error='Action cancelled before submission',updated_at=now() WHERE id=${id} AND status='PREPARED' AND tx_hash IS NULL RETURNING id`;if(!changed.length)throw new HttpError(409,'A submitted action cannot be cancelled here.');return json({status:'FAILED'})}
 const hash=input.tx_hash||op.tx_hash;
 if(!hash)throw new HttpError(400,'The network receipt is missing.');
 if(op.tx_hash&&op.tx_hash!==hash)throw new HttpError(409,'This action already has a different receipt.');
 const response=await fetch('https://studio.genlayer.com/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getTransactionByHash',params:[hash]}),signal:AbortSignal.timeout(40000)});
 const rpc=parseNetworkJson(await response.text()) as {result?:NetworkReceipt&BoundReceipt&{consensus_data?:{leader_receipt?:{result?:string}[]}}};
 if(!response.ok||!rpc.result)throw new HttpError(409,'The network receipt is not available yet. Check this action again shortly.');
 const receipt=rpc.result;const network=receipt as NetworkReceipt;
 assertReceiptBinding(receipt,op.call as TransactionCall,op.operation_wallet||user.wallet);
 if(op.status==='FAILED')throw new HttpError(409,'This action has already been closed.');
 if(op.status==='COMPLETE')return json({status:'COMPLETE',chain_id:op.chain_id,tx_hash:op.tx_hash});
 const bound=await sql`UPDATE threshold_operations SET tx_hash=${hash},status=CASE WHEN status IN ('PREPARED','EXPIRED') THEN 'SUBMITTED' ELSE status END,updated_at=now() WHERE id=${id} AND status IN ('PREPARED','EXPIRED','SUBMITTED','ACCEPTED','CONFIRMED','FINALIZED','PAYOUT_PENDING') AND (tx_hash IS NULL OR tx_hash=${hash}) RETURNING id`;
 if(!bound.length)throw new HttpError(409,'This action has already changed. Refresh its activity record.');
 const finalized=[7,'FINALIZED'].includes(network.status)||op.status==='PAYOUT_PENDING'||op.status==='FINALIZED';
 const decided=finalized||[5,'ACCEPTED'].includes(network.status);
 if(!decided)return json({status:'SUBMITTED',operation_id:id,tx_hash:hash});
 if(!finalized){await sql`UPDATE threshold_operations SET status='ACCEPTED',updated_at=now() WHERE id=${id} AND status IN ('PREPARED','EXPIRED','SUBMITTED','ACCEPTED','CONFIRMED')`;return json({status:'ACCEPTED',tx_hash:hash});}
 if(!executionSucceeded(network)){
  const error=executionError(network);await sql`UPDATE threshold_operations SET status='FAILED',error=${error},updated_at=now() WHERE id=${id}`;return json({status:'FAILED',error,tx_hash:hash});
 }
 let chainId=op.chain_id as string|null;
 if(op.action==='register'){
  const returned=receipt.consensus_data?.leader_receipt?.[0]?.result;
  if(typeof returned!=='string')throw new HttpError(409,'The receipt succeeded. Your tenancy is still being indexed; refresh its activity record.');
  const resultBytes=Buffer.from(returned,'base64');
  if(resultBytes[0]!==0)throw new HttpError(409,'The network return is not ready yet.');
  const result=abi.calldata.decode(resultBytes.subarray(1));
  if(typeof result!=='string'||!/^\d+$/.test(result))throw new HttpError(409,'The network tenancy identifier is not ready yet.');
  chainId=result;
  const created=await readTenancy(chainId,op.contract_addresses||undefined);
  const tenant=op.creator_role==='tenant'?op.creator_wallet:op.counterparty_wallet;
  const landlord=op.creator_role==='landlord'?op.creator_wallet:op.counterparty_wallet;
  if(!sameAddress(created.record.tenant,tenant)||!sameAddress(created.record.landlord,landlord))throw new HttpError(400,'The registered parties do not match.');
  await sql`UPDATE threshold_tenancies SET chain_id=${chainId} WHERE id=${op.tenancy_id}`;
 }
 let status='FINALIZED';
 if(chainId){
  const live=await readTenancy(chainId,op.contract_addresses||undefined);
  if(op.action==='settle'||op.action==='pay_penalty'||op.action==='refund_reserve'){
   status='PAYOUT_PENDING';
   const expected=op.action==='settle'?{[live.record.tenant]:live.escrow.tenant_payout_atto||'0',[live.record.landlord]:live.escrow.landlord_payout_atto||'0'}:op.action==='pay_penalty'?{[live.record.tenant]:(op.call as TransactionCall).value}:{[live.record.landlord]:String((op.call as TransactionCall).expectedPayout||'0')};
   // Completion requires a final, credited child transfer tied to this exact parent.
   try{
    const transferResponse=await fetch('https://studio.genlayer.com/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:2,method:'sim_getTransactionsForAddress',params:[(op.call as TransactionCall).address]}),signal:AbortSignal.timeout(40000)});
    const transferRpc=parseNetworkJson(await transferResponse.text()) as {result?:TransferReceipt[]};
    if(Object.values(expected).some(amount=>BigInt(amount)>0n)&&transferResponse.ok&&Array.isArray(transferRpc.result)&&payoutsCompleted(hash,(op.call as TransactionCall).address,expected,transferRpc.result))status='COMPLETE';
   }catch{/* Preserve pending reconciliation for the next receipt check. */}
  }
  await sql`UPDATE threshold_tenancies SET snapshot=${JSON.stringify(live)}::jsonb WHERE id=${op.tenancy_id}`;
 }
 await sql`UPDATE threshold_operations SET status=${status},error=NULL,updated_at=now() WHERE id=${id}`;
 return json({status,chain_id:chainId,tx_hash:hash});
}catch(error){return errorResponse(error)}}
