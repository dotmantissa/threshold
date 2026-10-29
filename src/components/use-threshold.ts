'use client';
import {useCallback,useState} from 'react';
import {usePrivy,useWallets,useSignTransaction,type UnsignedTransactionRequest} from '@privy-io/react-auth';
import {createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import type {Operation,TransactionCall,EvidenceImage,Claim} from '@/lib/types';
export function useThreshold(){
 const {getAccessToken}=usePrivy();const {wallets}=useWallets();const {signTransaction}=useSignTransaction();
 const [progress,setProgress]=useState<string|null>(null);
 const api=useCallback(async <T,>(path:string,options:RequestInit={}):Promise<T>=>{
  const token=await getAccessToken();if(!token)throw Error('Sign in with your email to continue.');
  const response=await fetch(path,{...options,headers:{...options.headers,Authorization:'Bearer '+token},cache:'no-store'});
  const data=await response.json();if(!response.ok)throw Error(data.error||'We could not reach your record. Please try again.');return data;
 },[getAccessToken]);
 const confirm=useCallback(async(id:string,hash:string)=>{
  const deadline=Date.now()+240000;
  while(Date.now()<deadline){
   const result=await api<{status:string;error?:string}>('/api/operations/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tx_hash:hash})});
   if(result.status==='CONFIRMED'){localStorage.removeItem('threshold-pending-'+id);return}
   if(result.status==='FAILED'){localStorage.removeItem('threshold-pending-'+id);throw Error(result.error||'This action could not be completed.')}
   await new Promise(resolve=>setTimeout(resolve,6000));
  }
  throw Error('The network is still reviewing this action. Its receipt is saved in your activity record. You can return later.');
 },[api]);
 const act=useCallback(async(tenancyId:string,action:string,payload:{images?:EvidenceImage[];claims?:Claim[]}={})=>{
  if(progress)throw Error('Please let the current action finish.');
  const wallet=wallets.find(w=>w.walletClientType==='privy');if(!wallet)throw Error('Your account is getting ready. Please try again in a moment.');
  let operation:Operation&{call:TransactionCall}|undefined;let submitted=false;
  try{
   setProgress('Checking the record');
   const result=await api<{operation:Operation&{call:TransactionCall}}>('/api/tenancies/'+tenancyId+'/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,operation_key:crypto.randomUUID(),...payload})});operation=result.operation;
   const token=await getAccessToken();
   const rpc=async(method:string,params:unknown[])=>{
    const response=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params})});const data=await response.json();
    if(!response.ok||data.error)throw Error(data.error?.message||data.error||'The network connection was interrupted.');return data.result;
   };
   const provider={request:async({method,params}:{method:string;params?:unknown[]})=>{
    if(method==='eth_sendTransaction'){
     const tx=params?.[0] as Record<string,string>;
     const input:UnsignedTransactionRequest={to:tx.to,data:tx.data,value:tx.value||'0x0',gasLimit:tx.gas,gasPrice:tx.gasPrice||'0x0',nonce:tx.nonce,chainId:61999,type:0};
     setProgress('Saving your signed record');
     const {signature}=await signTransaction(input,{address:wallet.address,uiOptions:{showWalletUIs:false}});
     const hash=await rpc('eth_sendRawTransaction',[signature]);
     submitted=true;localStorage.setItem('threshold-pending-'+operation!.id,hash);
     return hash;
    }
    if(method==='eth_accounts'||method==='eth_requestAccounts')return [wallet.address];
    return rpc(method,params||[]);
   }};
   const network={...studionet,rpcUrls:{default:{http:[window.location.origin+'/api/rpc']}}};
   // SDK read requests need a session header. The signing provider above handles
   // wallet actions; read transport uses the server proxy through native fetch.
   // Use an endpoint proxy URL with an ephemeral cookie established below.
   await api('/api/session',{method:'POST'});
   const client=createClient({chain:network,account:wallet.address as `0x${string}`,provider});
   const call=operation.call;
   if(BigInt(call.value)>0n){
    const balance=await rpc('eth_getBalance',[wallet.address,'latest']);
    if(BigInt(balance)<BigInt(call.value)){
     setProgress('Adding Studio credits');
     await api('/api/credits',{method:'POST'});
    }
   }
   const args=call.args.map((arg,index)=>call.integerArgs?.includes(index)?BigInt(String(arg)):arg);
   const hash=await client.writeContract({address:call.address,functionName:call.functionName,args,value:BigInt(call.value)});
   submitted=true;localStorage.setItem('threshold-pending-'+operation.id,hash);
   setProgress('Waiting for the network’s receipt');await confirm(operation.id,hash);
  }catch(error){
   if(operation&&!submitted)await api('/api/operations/'+operation.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cancel:true})}).catch(()=>undefined);
   throw error;
  }finally{setProgress(null)}
 },[api,confirm,getAccessToken,progress,signTransaction,wallets]);
 const resume=useCallback(async(operation:Operation)=>{
  const hash=operation.tx_hash||localStorage.getItem('threshold-pending-'+operation.id);
  if(!hash)throw Error('This action was not submitted. You can dismiss it and start again.');
  try{setProgress('Checking the saved receipt');await confirm(operation.id,hash)}finally{setProgress(null)}
 },[confirm]);
 const dismiss=useCallback(async(operation:Operation)=>{
  if(operation.tx_hash||localStorage.getItem('threshold-pending-'+operation.id))throw Error('A saved receipt exists. Check it before dismissing this action.');
  await api('/api/operations/'+operation.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cancel:true})});
 },[api]);
 return {api,act,resume,dismiss,progress,wallet:wallets.find(w=>w.walletClientType==='privy')};
}
