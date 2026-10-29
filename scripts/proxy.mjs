// Node 20 does not automatically use the workstation HTTPS proxy.
// Limit the transport bridge to Studio RPC. Never print request bodies.
import {spawn} from 'node:child_process';
const nativeFetch=globalThis.fetch;
if (process.env.THRESHOLD_CURL_TRANSPORT === "1") {
  globalThis.fetch=async function(input,init={}) {
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    if(!url.startsWith('https://studio.genlayer.com/api')) return nativeFetch(input,init);
    const args=['--silent','--show-error','--max-time','45','--request',init.method||'GET','--header','Content-Type: application/json',url];
    if(init.body)args.push('--data-binary','@-');
    const body=await new Promise((resolve,reject)=>{
      const child=spawn('curl',args,{stdio:['pipe','pipe','pipe']});let output='';let errors='';
      child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>errors+=x);
      child.on('error',reject);child.on('close',code=>code===0?resolve(output):reject(new Error('Studio transport unavailable: '+errors)));
      child.stdin.end(init.body||'');
    });
    return new Response(body,{status:200,headers:{'content-type':'application/json'}});
  };
}
