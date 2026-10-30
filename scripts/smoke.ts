import './proxy.mjs';
import {config} from 'dotenv';
import {createClient,createAccount,generatePrivateKey,abi} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {TransactionStatus,TransactionHashVariant} from 'genlayer-js/types';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import deployment from '../deployment.json';
import {executionSucceeded,type NetworkReceipt} from '../src/lib/receipt';
import {payoutsCompleted,type TransferReceipt} from '../src/lib/payouts';
import type {TenancyRecord,EscrowAccount,Verdict} from '../src/lib/types';
config({path:'.env.local',quiet:true});
const keyFile='.secrets/integration-accounts.json';
if(!existsSync(keyFile))writeFileSync(keyFile,JSON.stringify({tenant:generatePrivateKey(),landlord:generatePrivateKey()}),{mode:0o600});
const keys=JSON.parse(readFileSync(keyFile,'utf8'));
const tenant=createClient({chain:studionet,account:createAccount(keys.tenant)}),landlord=createClient({chain:studionet,account:createAccount(keys.landlord)});
const contracts={registry:deployment.contracts.tenancy_registry.address,court:deployment.contracts.condition_court.address,escrow:deployment.contracts.deposit_escrow.address} as Record<string,`0x${string}`>;
const path='docs/studionet-smoke.json';const old=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null;
const state=old?.contracts?.escrow===contracts.escrow?old:{network:'studionet',contracts,previous:old?[old]:[],checks:[]};
const save=()=>writeFileSync(path,JSON.stringify(state,null,2)+'\n');
async function wait(hash:`0x${string}`,name:string,transfer=false){
 const succeeded=(receipt:NetworkReceipt&{value_credited?:boolean})=>transfer?receipt.value_credited===true:executionSucceeded(receipt);
 const receiptPath='.storage/receipts/smoke-'+name+'.json';
 if(existsSync(receiptPath)){const cached=JSON.parse(readFileSync(receiptPath,'utf8'));if(cached.hash===hash&&[7,'FINALIZED'].includes(cached.status)&&succeeded(cached))return cached;}
 const receipt=await tenant.waitForTransactionReceipt({hash:hash as Parameters<typeof tenant.waitForTransactionReceipt>[0]['hash'],status:TransactionStatus.FINALIZED,interval:5000,retries:90});
 writeFileSync('.storage/receipts/smoke-'+name+'.json',JSON.stringify(receipt,(_,v)=>typeof v==='bigint'?v.toString():v,2));
 assert(succeeded(receipt as NetworkReceipt),'Execution or transfer failed: '+name);return receipt;
}
for(const [name,address] of Object.entries(contracts)){
 const source=await tenant.getContractCode(address);const file=name==='registry'?'tenancy_registry':name==='court'?'condition_court':'deposit_escrow';
 assert.equal(createHash('sha256').update(source).digest('hex'),createHash('sha256').update(readFileSync('contracts/'+file+'.py')).digest('hex'));
 assert(await tenant.getContractSchema(address));console.log(name,'live source and schema match');
}
if(!state.funded){for(const client of [tenant,landlord])await client.request({method:'sim_fundAccount',params:[client.account!.address,1000*10**18]});state.funded=true;save();}
const today=new Date().toISOString().slice(0,10),tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
const item={id:'integration-carpet',name:'Integration evidence control',class:'carpet',age_months:12,replacement_atto:'1000',cost_reference_url:'https://example.com'};
const read=async<T,>(name:string,method:string)=>await tenant.readContract({address:contracts[name],functionName:method,args:[String(state.tenancy_id)],transactionHashVariant:TransactionHashVariant.LATEST_FINAL}) as unknown as T;
async function action(name:string,client:typeof tenant,address:`0x${string}`,functionName:string,args:(string|bigint)[],value=0n){
 if(!state[name]){state[name]=await client.writeContract({address,functionName,args,value});save();console.log(name,'submitted',state[name]);}
 await wait(state[name],name);console.log(name,'finalized execution verified');
}
await action('register',tenant,contracts.registry,'create_tenancy',[tenant.account!.address,landlord.account!.address,1000n,1000n,today,tomorrow,'Integration control tenancy. Ordinary wear is allowed. Parties agree to fixed recovery deadlines and independent evidence sets.',JSON.stringify([item]),'US_CA_STANDARD']);
const raw=await tenant.request({method:'eth_getTransactionByHash',params:[state.register]}) as {consensus_data:{leader_receipt:{result:string}[]}};
state.tenancy_id=abi.calldata.decode(Buffer.from(raw.consensus_data.leader_receipt[0].result,'base64').subarray(1));save();const tid=String(state.tenancy_id);
let record=await read<TenancyRecord>('registry','get_tenancy');
assert(record.items[0].cost_reference_sha256&&record.items[0].cost_reference_text);
await action('accept',landlord,contracts.registry,'accept_terms',[tid,record.agreement_hash]);
const images=[{item_id:item.id,url:'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=640&q=80',sha256:'9859c860f4db44c5b46035bc9236e20d48c6f50415346617ec517c21f21fb1da'}];
await action('arrival',tenant,contracts.registry,'commit_evidence',[tid,'move_in',JSON.stringify(images)]);
record=await read<TenancyRecord>('registry','get_tenancy');
await action('acknowledge',landlord,contracts.registry,'acknowledge_arrival',[tid,record.move_in!.manifest_hash]);
await action('deposit',tenant,contracts.escrow,'fund_deposit',[tid],1000n);
await action('reserve',landlord,contracts.escrow,'fund_reserve',[tid],2000n);
// Mutually agreed same-day early termination permits a real complete flow.
record=await read<TenancyRecord>('registry','get_tenancy');
const early=state.departure_date||today;state.departure_date=early;save();
await action('early_proposal',tenant,contracts.registry,'propose_departure',[tid,early]);
await action('early_acknowledgement',landlord,contracts.registry,'acknowledge_departure',[tid,early]);
await action('departure_tenant',tenant,contracts.registry,'commit_evidence',[tid,'move_out',JSON.stringify(images)]);
// An invalid landlord set must not prevent deterministic zero-claim settlement.
await action('departure_landlord_invalid',landlord,contracts.registry,'commit_evidence',[tid,'move_out',JSON.stringify([{...images[0],sha256:'a'.repeat(64)}])]);
await action('notice',landlord,contracts.registry,'submit_notice',[tid,'[]']);
await action('adjudicate',tenant,contracts.court,'adjudicate',[tid]);
const verdict=await read<Verdict>('court','get_verdict');assert.equal(verdict.status,'DECIDED');assert.equal(verdict.deduction_atto,'0');assert.equal(verdict.procedure_only,true);
if(!state.balances_before){state.balances_before={tenant:(await tenant.getBalance({address:tenant.account!.address})).toString(),landlord:(await landlord.getBalance({address:landlord.account!.address})).toString(),escrow:(await tenant.getBalance({address:contracts.escrow})).toString()};save();}
await action('settle',tenant,contracts.escrow,'settle',[tid]);
const account=await read<EscrowAccount>('escrow','get_account');assert(account.settled);assert.equal(account.tenant_payout_atto,'1000');assert.equal(account.landlord_payout_atto,'2000');
let receipts=await tenant.request({method:'sim_getTransactionsForAddress',params:[contracts.escrow]}) as unknown as TransferReceipt[];
for(const child of receipts.filter(receipt=>receipt.triggered_by===state.settle)){await wait(child.hash as `0x${string}`,'transfer-'+child.hash,true);}
receipts=await tenant.request({method:'sim_getTransactionsForAddress',params:[contracts.escrow]}) as unknown as TransferReceipt[];
writeFileSync('.storage/receipts/smoke-transfers.json',JSON.stringify(receipts,(_,v)=>typeof v==='bigint'?v.toString():v,2));
assert(payoutsCompleted(state.settle,contracts.escrow,{[tenant.account!.address]:'1000',[landlord.account!.address]:'2000'},receipts),'Exact finalized child recipient transfers required');
state.balances_after={tenant:(await tenant.getBalance({address:tenant.account!.address})).toString(),landlord:(await landlord.getBalance({address:landlord.account!.address})).toString(),escrow:(await tenant.getBalance({address:contracts.escrow})).toString()};
assert.equal(BigInt(state.balances_after.tenant)-BigInt(state.balances_before.tenant),1000n);assert.equal(BigInt(state.balances_after.landlord)-BigInt(state.balances_before.landlord),2000n);assert.equal(BigInt(state.balances_before.escrow)-BigInt(state.balances_after.escrow),3000n);
state.account=account;state.verdict=verdict;state.transfers=receipts.filter(r=>r.triggered_by===state.settle).map(r=>({hash:r.hash,sender:r.from_address,recipient:r.to_address,amount:r.value,type:r.type,status:r.status,triggered_by:r.triggered_by,triggered_on:r.triggered_on,value_credited:r.value_credited}));
state.verified_at=new Date().toISOString();state.checks=['live source equality and SDK schema','finalized successful registration and wiring','immutable replacement reference snapshot','complete agreement acceptance','arrival acknowledgement','native deposit and reserve custody','mutually agreed early departure','independent competing departure sets','invalid opposing photo cannot block zero-claim verdict','deterministic decided verdict without evidence fetch','finalized settlement','exact finalized credited child transfers','tenant and landlord balance increases','escrow balance decreases by complete payout'];save();console.log('Complete live settlement and recipient balance changes verified.');
