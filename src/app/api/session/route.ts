import {authenticate} from '@/lib/auth';
import {assertSameOrigin,errorResponse,json} from '@/lib/http';
export async function POST(request:Request){try{
 assertSameOrigin(request);await authenticate(request);
 const token=request.headers.get('authorization')!.slice(7);
 const response=json({ready:true});
 response.headers.set('Set-Cookie','threshold-session='+token+'; HttpOnly; SameSite=Strict; Path=/api/rpc; Max-Age=900'+(new URL(request.url).protocol==='https:'?'; Secure':''));return response;
}catch(error){return errorResponse(error)}}
