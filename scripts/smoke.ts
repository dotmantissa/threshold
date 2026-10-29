import './proxy.mjs';
import {config} from 'dotenv';
import {createClient,createAccount,abi} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {TransactionStatus} from 'genlayer-js/types';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import deployment from '../deployment.json';
import {executionSucceeded,type NetworkReceipt} from '../src/lib/receipt';
config({path:'.env.local',quiet:true});
const keyFile='.secrets/integration-accounts.json';
const secrets=existsSync(keyFile)?JSON.parse(readFileSync(keyFile,'utf8')):{tenant:createAccount(),landlord:createAccount()};
// Store only generated private keys locally. Never serialize signer functions.
if(!existsSync(keyFile)){const {generatePrivateKey}=await import('genlayer-js');secrets.tenant=generatePrivateKey();secrets.landlord=generatePrivateKey();writeFileSync(keyFile,JSON.stringify(secrets),{mode:0o600})}
const tenant=createClient({chain:studionet,account:createAccount(secrets.tenant)});const landlord=createClient({chain:studionet,account:createAccount(secrets.landlord)});
const contracts={registry:deployment.contracts.tenancy_registry.address,court:deployment.contracts.condition_court.address,escrow:deployment.contracts.deposit_escrow.address} as Record<string,`0x${string}`>;
const path='docs/studionet-smoke.json';const state:Record<string,unknown>=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{network:'studionet',checks:[]};
const save=()=>writeFileSync(path,JSON.stringify(state,null,2)+'\n');
async function wait(hash:`0x${string}`,name:string){const r=await tenant.waitForTransactionReceipt({hash:hash as Parameters<typeof tenant.waitForTransactionReceipt>[0]['hash'],status:TransactionStatus.ACCEPTED,interval:5000,retries:45});writeFileSync('.storage/receipts/smoke-'+name+'.json',JSON.stringify(r,(_,v)=>typeof v==='bigint'?v.toString():v,2));assert(executionSucceeded(r as NetworkReceipt),'Execution failed: '+name);return r}
for(const [name,address]of Object.entries(contracts)){
 const source=await tenant.getContractCode(address);const file=name==='registry'?'tenancy_registry':name==='court'?'condition_court':'deposit_escrow';
 assert.equal(createHash('sha256').update(source).digest('hex'),createHash('sha256').update(readFileSync('contracts/'+file+'.py')).digest('hex'),'Deployed source must match '+name);
 const schema=await tenant.getContractSchema(address);assert(schema);console.log(name,'source and schema verified');
}
if(!state.funded){for(const client of [tenant,landlord])await client.request({method:'sim_fundAccount',params:[client.account!.address,1000*10**18]});state.funded=true;save();console.log('Integration accounts funded through the real Studio faucet')}
const today=new Date().toISOString().slice(0,10);const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
const item={id:'integration-carpet',name:'Integration evidence control',class:'carpet',age_months:12,replacement_atto:(50n*10n**18n).toString(),cost_reference_url:'https://www.hud.gov/sites/documents/HSG-06-01GHBGUID.PDF'};
const clause='Integration control tenancy. Ordinary wear is allowed. Test accounts accept the shared commitment and deterministic review. This record contains public reference imagery and simulated credits only.';
if(!state.register){state.register=await tenant.writeContract({address:contracts.registry,functionName:'create_tenancy',args:[tenant.account!.address,landlord.account!.address,10n*10n**18n,10n*10n**18n,today,tomorrow,clause,JSON.stringify([item]),'US_CA_STANDARD'],value:0n});save()}
await wait(state.register as `0x${string}`,'register');
const raw=await tenant.request({method:'eth_getTransactionByHash',params:[state.register as `0x${string}` & {length:66}]}) as {consensus_data:{leader_receipt:{result:string}[]}};
const returned=Buffer.from(raw.consensus_data.leader_receipt[0].result,'base64');state.tenancy_id=abi.calldata.decode(returned.subarray(1));save();const tid=String(state.tenancy_id);
async function action(name:string,client:typeof tenant,address:`0x${string}`,functionName:string,args:(string|bigint)[],value=0n){if(!state[name]){state[name]=await client.writeContract({address,functionName,args,value});save()};await wait(state[name] as `0x${string}`,name);console.log(name,'execution verified')}
let r=await tenant.readContract({address:contracts.registry,functionName:'get_tenancy',args:[tid]}) as unknown as {agreement_hash:string;move_in:{manifest_hash:string};tenant_accepted:boolean;landlord_accepted:boolean};
await action('accept',landlord,contracts.registry,'accept_terms',[tid,r.agreement_hash]);
const images=[{item_id:item.id,url:'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=640&q=80',sha256:'9859c860f4db44c5b46035bc9236e20d48c6f50415346617ec517c21f21fb1da'}];
await action('arrival',tenant,contracts.registry,'commit_evidence',[tid,'move_in',JSON.stringify(images)]);
r=await tenant.readContract({address:contracts.registry,functionName:'get_tenancy',args:[tid]}) as unknown as typeof r;
await action('acknowledge',landlord,contracts.registry,'acknowledge_arrival',[tid,r.move_in.manifest_hash]);
await action('reserve',landlord,contracts.escrow,'fund_reserve',[tid],20n*10n**18n);
await action('deposit',tenant,contracts.escrow,'fund_deposit',[tid],10n*10n**18n);
const account=await tenant.readContract({address:contracts.escrow,functionName:'get_account',args:[tid]}) as unknown as {deposit_atto:string;reserve_atto:string;settled:boolean};
assert.equal(account.deposit_atto,(10n*10n**18n).toString());assert.equal(account.reserve_atto,(20n*10n**18n).toString());assert.equal(account.settled,false);
const court=await tenant.readContract({address:contracts.court,functionName:'get_verdict',args:[tid]}) as unknown as {status:string};assert.equal(court.status,'AWAITING_EVIDENCE');
state.account=account;state.verified_at=new Date().toISOString();state.checks=['deployed source equality','contract schema','real Studio faucet','two party registration','agreement acceptance','immutable arrival commitment','other party acknowledgement','native penalty reserve','native deposit custody','wired court view'];save();console.log('StudioNet integration smoke passed. Departure and settlement are time gated; direct tests cover those paths.');
