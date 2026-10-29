// Optional workstation transport bridge. Production uses native fetch.
// Private headers and request bodies are kept in restricted temporary files,
// never arguments or log output. Enable only with THRESHOLD_CURL_TRANSPORT=1.
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const nativeFetch=globalThis.fetch;
const allowed=hostname=>hostname==='studio.genlayer.com'||hostname.endsWith('.neon.tech')||hostname.endsWith('.neon.build')||hostname==='api.privy.io'||hostname==='auth.privy.io'||hostname.endsWith('.blob.vercel-storage.com');
const quote=v=>'"'+String(v).replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\n','\\n').replaceAll('\r','\\r')+'"';
if (process.env.THRESHOLD_CURL_TRANSPORT === '1') {
 globalThis.fetch=async function(input,init={}) {
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  if(!allowed(new URL(url).hostname))return nativeFetch(input,init);
  const folder=await mkdtemp(join(tmpdir(),'threshold-http-'));
  try {
   const headers=new Headers(init.headers || (input instanceof Request?input.headers:undefined));
   const lines=['silent','show-error','max-time = 45','url = '+quote(url),'request = '+quote(init.method||(input instanceof Request?input.method:'GET'))];
   headers.forEach((v,k)=>lines.push('header = '+quote(k+': '+v)));
   const body=init.body ?? (input instanceof Request&&input.method!=='GET'?Buffer.from(await input.arrayBuffer()):undefined);
   if(body){await writeFile(join(folder,'body'),typeof body==='string'||body instanceof Uint8Array?body:String(body),{mode:0o600});lines.push('data-binary = '+quote('@'+join(folder,'body')));}
   await writeFile(join(folder,'config'),lines.join('\n'),{mode:0o600});
   const output=await new Promise((resolve,reject)=>{
    const child=spawn('curl',['--config',join(folder,'config'),'--write-out','\n%{http_code}'],{stdio:['ignore','pipe','pipe']});const parts=[];
    child.stdout.on('data',x=>parts.push(x));child.on('error',reject);child.on('close',code=>code===0?resolve(Buffer.concat(parts)):reject(new Error('Threshold network transport failed')));
   });
   const boundary=output.lastIndexOf(10);const status=Number(output.subarray(boundary+1).toString());
   return new Response([204,205,304].includes(status)?null:output.subarray(0,boundary),{status,headers:{'content-type':'application/json'}});
  } finally {await rm(folder,{recursive:true,force:true});}
 };
}
