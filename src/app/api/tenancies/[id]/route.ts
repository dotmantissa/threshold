import {authenticate} from '@/lib/auth';
import {tenancyRow,fullTenancy} from '@/lib/tenancies';
import {json,errorResponse} from '@/lib/http';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const user=await authenticate(request);const {id}=await params;
 return json({tenancy:await fullTenancy(await tenancyRow(id,user.id),user.id)});
}catch(error){return errorResponse(error)}}
