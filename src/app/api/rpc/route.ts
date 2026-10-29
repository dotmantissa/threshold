import {z} from 'zod';
import {parseTransaction,recoverTransactionAddress,type TransactionSerialized} from 'viem';
import {authenticate} from '@/lib/auth';
import {limit} from '@/lib/limits';
import {sameAddress} from '@/lib/amounts';
import {json,errorResponse,readJson,assertSameOrigin,HttpError} from '@/lib/http';
const schema=z.object({jsonrpc:z.literal('2.0'),id:z.union([z.number(),z.string()]),method:z.string(),params:z.array(z.unknown()).default([])});
const reads=new Set(['eth_getTransactionCount','eth_gasPrice','eth_estimateGas','eth_getBalance','eth_chainId','eth_getTransactionByHash','gen_call','gen_getContractSchema','gen_getContractCode','gen_getTransactionQueuePosition']);
export async function POST(request:Request){try{
 assertSameOrigin(request);const user=await authenticate(request);await limit('rpc:'+user.id,50);
 const input=schema.parse(await readJson(request,120000));
 if(input.method==='eth_sendRawTransaction'){
  const serialized=z.string().regex(/^0x[\da-f]+$/i).max(200000).parse(input.params[0]) as `0x${string}`;
  const transaction=serialized as TransactionSerialized;
  const parsed=parseTransaction(transaction);const signer=await recoverTransactionAddress({serializedTransaction:transaction});
  if(!sameAddress(signer,user.wallet)||parsed.chainId!==61999)throw new HttpError(403,'This signature does not belong to your Threshold account.');
 }else if(!reads.has(input.method))throw new HttpError(403,'This network method is not available here.');
 const response=await fetch('https://studio.genlayer.com/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(40000)});
 const data=await response.json();return json(data,response.ok?200:502);
}catch(error){return errorResponse(error)}}
