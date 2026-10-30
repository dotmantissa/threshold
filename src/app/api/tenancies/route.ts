import {randomUUID} from 'node:crypto';
import {authenticate,counterparty} from '@/lib/auth';
import {contracts} from '@/lib/chain';
import {db} from '@/lib/db';
import {draftSchema} from '@/lib/schema';
import {json,errorResponse,readJson,assertSameOrigin,HttpError} from '@/lib/http';
import {limit} from '@/lib/limits';
import {indexTenancy,type TenancyRow} from '@/lib/tenancies';
export async function GET(request:Request){try{
 const user=await authenticate(request);const sql=db();
 const rows=await sql`SELECT * FROM threshold_tenancies WHERE creator_id=${user.id} OR counterparty_id=${user.id} ORDER BY created_at DESC LIMIT 100`;
 return json({tenancies:rows.map(row=>indexTenancy(row as TenancyRow,user.id))});
}catch(error){return errorResponse(error)}}
export async function POST(request:Request){try{
 assertSameOrigin(request);const user=await authenticate(request);await limit('create:'+user.id,5,3600);
 const draft=draftSchema.parse(await readJson(request));
 if(draft.counterparty_email===user.email)throw new HttpError(400,'Use the other person’s email address.');
 if(draft.start<new Date().toISOString().slice(0,10))throw new HttpError(400,'Start a tenancy before arrival day has passed.');
 const other=await counterparty(draft.counterparty_email);const id=randomUUID();const sql=db();
 const rows=await sql`INSERT INTO threshold_tenancies(id,label,creator_id,counterparty_id,creator_wallet,counterparty_wallet,creator_role,draft,contract_addresses) VALUES(${id},${draft.label},${user.id},${other.id},${user.wallet},${other.wallet},${draft.role},${JSON.stringify(draft)}::jsonb,${JSON.stringify(contracts)}::jsonb) RETURNING *`;
 return json({tenancy:indexTenancy(rows[0] as TenancyRow,user.id)},201);
}catch(error){return errorResponse(error)}}
