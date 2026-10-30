import {config} from 'dotenv';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
config({path:'.env.local',quiet:true});
const origin='https://threshold-peace.vercel.app';
const deployment=JSON.parse(fs.readFileSync('deployment.json','utf8'));
async function request(path,token){
 const filename='.secrets/hosting-request.config';const target='.secrets/hosting-response.json';
 // The public edge address is used only for workstation DNS reachability.
 const lines=['silent','show-error','max-time = 35','url = "'+origin+path+'"','resolve = "threshold-peace.vercel.app:443:76.76.21.21"'];
 if(token)lines.push('header = "Authorization: Bearer '+token+'"');
 fs.writeFileSync(filename,lines.join('\n'),{mode:0o600});
 const result=await new Promise((resolve,reject)=>{const p=spawn('curl',['--config',filename,'--output',target,'--write-out','%{http_code}'],{stdio:['ignore','pipe','pipe']});let text='';p.stdout.on('data',d=>text+=d);p.on('error',reject);p.on('close',code=>code===0?resolve(Number(text)):reject(Error('Hosting request failed')))});
 fs.rmSync(filename);fs.chmodSync(target,0o600);return {status:result,body:JSON.parse(fs.readFileSync(target,'utf8'))};
}
const network=await request('/api/network?release='+Date.now());
if(network.status!==200||network.body.storage!=='vercel')throw Error('Public persistent storage check failed');console.log('Public network and persistent storage verified');
for(const [name,entry] of Object.entries(deployment.contracts))if(network.body.contracts?.[name]?.address!==entry.address||network.body.contracts?.[name]?.sha256!==entry.sha256)throw Error('Published contract does not match finalized deployment: '+name);
if(network.body.verified_at!==deployment.verified_at)throw Error('Published deployment verification timestamp is stale');console.log('All published contract addresses and source fingerprints match finalized deployment');
const anonymous=await request('/api/tenancies');if(anonymous.status!==401)throw Error('Anonymous access must be denied');console.log('Anonymous account access rejected');
const auth=JSON.parse(fs.readFileSync('.secrets/auth-response.json'));
const account=await request('/api/tenancies',auth.token);if(account.status!==200||!Array.isArray(account.body.tenancies))throw Error('Authenticated production account failed');console.log('Real authenticated production tenancy API verified');
const unrelated=await request('/api/tenancies/00000000-0000-4000-8000-000000000001',auth.token);if(unrelated.status!==404)throw Error('Unrelated tenancy must be hidden');console.log('Unrelated tenancy access rejected');
fs.writeFileSync('docs/hosting.json',JSON.stringify({origin,network:'studionet',storage:'vercel',contracts:network.body.contracts,deployment_verified_at:deployment.verified_at,checks:['public application access','finalized deployed contract addresses and source fingerprints','persistent object storage configuration','anonymous access rejected','real authenticated account API','unrelated tenancy hidden'],verified_at:new Date().toISOString()},null,2)+'\n');
