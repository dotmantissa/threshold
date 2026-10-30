import 'server-only';
import {db} from './db';
import {HttpError} from './http';
import {readTenancy} from './chain';
import type {Tenancy,TenancyDraft,Operation,ContractAddresses} from './types';
export interface TenancyRow {id:string;label:string;creator_id:string;counterparty_id:string;creator_wallet:string;counterparty_wallet:string;creator_role:'tenant'|'landlord';chain_id:string|null;draft:TenancyDraft;created_at:string;contract_addresses?:ContractAddresses|null;snapshot?:Pick<Tenancy,'record'|'verdict'|'escrow'>|null}
export async function tenancyRow(id:string,userId:string):Promise<TenancyRow>{
 if(!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id))throw new HttpError(404,'This tenancy could not be found.');
 const sql=db();const rows=await sql`SELECT * FROM threshold_tenancies WHERE id=${id} AND (creator_id=${userId} OR counterparty_id=${userId})`;
 if(!rows[0])throw new HttpError(404,'This tenancy could not be found.');return rows[0] as TenancyRow;
}
export function indexTenancy(row:TenancyRow,userId:string):Tenancy{
 return {id:row.id,label:row.label,role:row.creator_id===userId?row.creator_role:row.creator_role==='tenant'?'landlord':'tenant',chain_id:row.chain_id,draft:row.draft,creator_wallet:row.creator_wallet,counterparty_wallet:row.counterparty_wallet,created_at:String(row.created_at),contract_addresses:row.contract_addresses,record:row.snapshot?.record||null,verdict:row.snapshot?.verdict||null,escrow:row.snapshot?.escrow||null,operations:[]};
}
export async function fullTenancy(row:TenancyRow,userId:string){
 const sql=db();
 await sql`UPDATE threshold_operations SET status='EXPIRED',error='Unsigned preparation expired',updated_at=now() WHERE tenancy_id=${row.id} AND status='PREPARED' AND tx_hash IS NULL AND created_at<now()-interval '10 minutes'`;
 const live=row.chain_id?await readTenancy(row.chain_id,row.contract_addresses||undefined):null;
 const operations=await sql`SELECT id,action,tx_hash,status,error,created_at,user_id=${userId} AS can_manage FROM threshold_operations WHERE tenancy_id=${row.id} ORDER BY created_at DESC LIMIT 20`;
 if(live)await sql`UPDATE threshold_tenancies SET snapshot=${JSON.stringify(live)}::jsonb WHERE id=${row.id}`;
 return {...indexTenancy(row,userId),...live,operations:operations as Operation[],payout_status:live?.escrow.settled?(operations.some(op=>op.action==='settle'&&op.status==='COMPLETE')?'COMPLETE':'PENDING'):undefined};
}
