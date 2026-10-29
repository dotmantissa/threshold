import {ZodError} from 'zod';
export class HttpError extends Error {constructor(public status:number,message:string){super(message)}}
export function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store'}})}
export function errorResponse(error:unknown){
 if(error instanceof HttpError)return json({error:error.message},error.status);
 if(error instanceof ZodError)return json({error:error.issues[0]?.message||'Please check the details and try again.'},400);
 // No request bodies, connection strings, provider exceptions or tokens in logs.
 console.error('Threshold request failed',{kind:error instanceof Error?error.name:'Unknown'});
 return json({error:'Something interrupted the connection. Your record is safe. Please try again.'},503);
}
export async function readJson(request:Request,maxBytes=64000):Promise<unknown>{
 if(Number(request.headers.get('content-length')||0)>maxBytes)throw new HttpError(413,'This request is too large.');
 const text=await request.text();if(new TextEncoder().encode(text).byteLength>maxBytes)throw new HttpError(413,'This request is too large.');
 try{return JSON.parse(text)}catch{throw new HttpError(400,'We could not read that request.')}
}
export function assertSameOrigin(request:Request){
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin&&origin!==process.env.APP_URL)throw new HttpError(403,'Please use the Threshold app to make this request.');
}
