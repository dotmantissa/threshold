import {localImage} from '@/lib/storage';
export async function GET(_:Request,{params}:{params:Promise<{sha256:string}>}){
 const {sha256}=await params;
 if(!/^[a-f0-9]{64}$/.test(sha256)||process.env.STORAGE_DRIVER!=='local')return new Response('Photo not found',{status:404});
 try{const data=await localImage(sha256);return new Response(new Uint8Array(data),{headers:{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}})}catch{return new Response('Photo not found',{status:404})}
}
