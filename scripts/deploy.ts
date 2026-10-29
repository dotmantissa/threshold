import './proxy.mjs';
import {config} from 'dotenv';
import {createClient,createAccount} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {TransactionStatus} from 'genlayer-js/types';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {executionSucceeded,type NetworkReceipt} from '../src/lib/receipt';
config({path:'.env.local',quiet:true});
if(!process.env.GENLAYER_PRIVATE_KEY)throw Error('GENLAYER_PRIVATE_KEY is required');
const client=createClient({chain:studionet,account:createAccount(process.env.GENLAYER_PRIVATE_KEY as `0x${string}`)});
type Entry={address?:`0x${string}`;deploy_tx?:`0x${string}`;sha256:string};
type Deployment={network:string;rpc:string;signer:string;contracts:Record<string,Entry>;wiring:Record<string,`0x${string}`>;verified_at?:string};
const path='deployment.json';
let state:Deployment=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{network:'studionet',rpc:'https://studio.genlayer.com/api',signer:client.account!.address,contracts:{},wiring:{}};
if(process.argv.includes('--fresh')&&existsSync(path)){mkdirSync('docs/deployments',{recursive:true});writeFileSync('docs/deployments/'+Date.now()+'.json',JSON.stringify(state,null,2));state={...state,contracts:{},wiring:{}}}
const save=()=>writeFileSync(path,JSON.stringify(state,null,2)+'\n');
async function wait(hash:`0x${string}`,name:string){
 const receipt=await client.waitForTransactionReceipt({hash,status:TransactionStatus.ACCEPTED,interval:5000,retries:60});
 mkdirSync('.storage/receipts',{recursive:true});writeFileSync('.storage/receipts/'+name+'.json',JSON.stringify(receipt,null,2));
 if(!executionSucceeded(receipt as NetworkReceipt))throw Error('Execution failed for '+name+'; inspect restricted local receipt');
 return receipt;
}
async function deploy(name:string,args:string[]){
 const code=readFileSync('contracts/'+name+'.py');const sha256=createHash('sha256').update(code).digest('hex');
 const entry=state.contracts[name]||{sha256};
 if(entry.sha256!==sha256)throw Error('Source changed for '+name+'; use --fresh to deploy a reviewed new version');
 state.contracts[name]=entry;
 if(!entry.deploy_tx){entry.deploy_tx=await client.deployContract({code,args});save();console.log(name,'submitted',entry.deploy_tx)}
 if(!entry.address){const receipt=await wait(entry.deploy_tx,name);entry.address=receipt.data?.contract_address as `0x${string}`;if(!entry.address)throw Error('Deployment returned no address');save()}
 const schema=await client.getContractSchema(entry.address);if(!schema)throw Error('Contract schema missing');console.log(name,'verified',entry.address);return entry.address;
}
const registry=await deploy('tenancy_registry',[]);
const court=await deploy('condition_court',[registry]);
const escrow=await deploy('deposit_escrow',[registry,court]);
async function wire(name:string,address:`0x${string}`,args:string[]){if(!state.wiring[name]){state.wiring[name]=await client.writeContract({address,functionName:'wire',args,value:0n});save()};await wait(state.wiring[name],name+'-wire');}
await wire('registry',registry,[court,escrow]);await wire('court',court,[escrow]);
for(const [name,address] of [['registry',registry],['court',court],['escrow',escrow]] as const){console.log(name,await client.readContract({address,functionName:'get_config',args:[]}))}
state.verified_at=new Date().toISOString();save();console.log('All three contracts deployed and wired successfully.');
