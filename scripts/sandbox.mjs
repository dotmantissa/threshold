import './proxy.mjs';
import {config} from 'dotenv';
import {createClient,createAccount} from 'genlayer-js';
import {TransactionStatus} from 'genlayer-js/types';
import {studionet} from 'genlayer-js/chains';
import fs from 'node:fs';
config({path:'.env.local',quiet:true});
const c=createClient({chain:studionet,account:createAccount(process.env.GENLAYER_PRIVATE_KEY)});
const path='docs/sandbox-probe.json';const r=fs.existsSync(path)?JSON.parse(fs.readFileSync(path,'utf8')):{};
const save=()=>fs.writeFileSync(path,JSON.stringify(r,null,2)+'\n');
if(!r.deploy_tx){r.deploy_tx=await c.deployContract({code:fs.readFileSync('contracts/probes/sandbox_probe.py'),args:[]});save()}
const receipt=await c.waitForTransactionReceipt({hash:r.deploy_tx,status:TransactionStatus.ACCEPTED,interval:5000,retries:40});
if(receipt.consensus_data?.leader_receipt?.[0]?.execution_result!=='SUCCESS')throw Error('Sandbox deployment execution failed');
r.address=receipt.data.contract_address;save();
if(!r.check_tx){r.check_tx=await c.writeContract({address:r.address,functionName:'check',args:['2026-10-29'],value:0n});save()}
const check=await c.waitForTransactionReceipt({hash:r.check_tx,status:TransactionStatus.ACCEPTED,interval:5000,retries:40});fs.writeFileSync('.storage/receipts/sandbox-check.json',JSON.stringify(check,null,2));
if(check.consensus_data?.leader_receipt?.[0]?.execution_result!=='SUCCESS')throw Error('Sandbox execution failed');
r.deadline=await c.readContract({address:r.address,functionName:'get_deadline',args:[]});r.verified_at=new Date().toISOString();save();console.log(r);
