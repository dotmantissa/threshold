import {authenticate} from '@/lib/auth';
import {tenancyRow} from '@/lib/tenancies';
import {readTenancy,contracts} from '@/lib/chain';
import {prepareCall} from '@/lib/actions';
import {actionSchema} from '@/lib/schema';
import {db} from '@/lib/db';
import {limit} from '@/lib/limits';
import {json,errorResponse,readJson,assertSameOrigin,HttpError} from '@/lib/http';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
 assertSameOrigin(request);const user=await authenticate(request);await limit('actions:'+user.id,15);
 const {id}=await params;const row=await tenancyRow(id,user.id);const input=actionSchema.parse(await readJson(request));const sql=db();
 const existing=await sql`SELECT * FROM threshold_operations WHERE id=${input.operation_key} AND user_id=${user.id} AND tenancy_id=${id}`;
 if(existing[0])return json({operation:existing[0]});
 await sql`UPDATE threshold_operations SET status='EXPIRED',error='Unsigned preparation expired',updated_at=now() WHERE tenancy_id=${id} AND status='PREPARED' AND tx_hash IS NULL AND created_at < now()-interval '10 minutes'`;
 const live=row.chain_id?await readTenancy(row.chain_id,row.contract_addresses||contracts):null;
 const call=prepareCall({chainId:row.chain_id,draft:row.draft,creatorWallet:row.creator_wallet,counterpartyWallet:row.counterparty_wallet,userWallet:user.wallet,record:live?.record||null,escrow:live?.escrow||null,verdict:live?.verdict||null,contracts:row.contract_addresses||contracts},input.action,input.images,input.claims,input.departure_date);
 if(input.images){for(const image of input.images){
  const authorized=await sql`SELECT e.public_url FROM threshold_evidence e JOIN threshold_evidence_links l ON e.sha256=l.sha256 WHERE e.sha256=${image.sha256} AND l.tenancy_id=${id} AND l.owner_id=${user.id}`;
  if(authorized[0]?.public_url!==image.url)throw new HttpError(403,'Use the photos uploaded to this tenancy.');
 }}
 const rows=await sql`INSERT INTO threshold_operations(id,tenancy_id,user_id,action,call,status) VALUES(${input.operation_key},${id},${user.id},${input.action},${JSON.stringify(call)}::jsonb,'PREPARED') RETURNING *`;
 return json({operation:rows[0]},201);
}catch(error){if(typeof error==='object'&&error!==null&&'code' in error&&error.code==='23505')return errorResponse(new HttpError(409,'An action is already pending. Open activity to check or dismiss it.'));return errorResponse(error)}}
