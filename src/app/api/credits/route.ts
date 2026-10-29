import {authenticate} from '@/lib/auth';
import {chain} from '@/lib/chain';
import {limit} from '@/lib/limits';
import {json,errorResponse,assertSameOrigin} from '@/lib/http';
export async function POST(request:Request){try{
 assertSameOrigin(request);const user=await authenticate(request);await limit('credits:'+user.id,1,86400);
 const result=await chain().request({method:'sim_fundAccount',params:[user.wallet as `0x${string}`,1000*10**18]});
 return json({transaction:result,credits:'1000',network:'studionet'});
}catch(error){return errorResponse(error)}}
