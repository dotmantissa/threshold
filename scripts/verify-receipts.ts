import './proxy.mjs';
import {config} from 'dotenv';
import {readFileSync} from 'node:fs';
import {parseNetworkJson,assertReceiptBinding} from '../src/lib/receipt-binding';
import {abi} from 'genlayer-js';
import type {TransactionCall} from '../src/lib/types';
config({path:'.env.local',quiet:true});
const smoke=JSON.parse(readFileSync('docs/studionet-smoke.json','utf8'));
for(const [name,hash] of [['deposit',smoke.deposit],['reserve',smoke.reserve],['register',smoke.register]]){
 const response=await fetch('https://studio.genlayer.com/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getTransactionByHash',params:[hash]})});
 const {result}=parseNetworkJson(await response.text()) as {result:{from_address:string;to_address:`0x${string}`;value:string;data:{calldata:string}}};
 const bytes=Buffer.from(result.data.calldata,'base64');const data=abi.calldata.decode(bytes) as Map<string,unknown>;
 const call:TransactionCall={address:result.to_address,functionName:data.get('method') as string,args:data.get('args') as (string|bigint)[],value:result.value};
 assertReceiptBinding(result,call,result.from_address);
 console.log(name,'live receipt byte and exact amount verification passed');
}
