import {abi} from 'genlayer-js';
import {parse} from 'lossless-json';
import {sameAddress} from './amounts';
import {HttpError} from './http';
import type {TransactionCall} from './types';
export interface BoundReceipt {from_address?:string;to_address?:string;value?:string|number;data?:{calldata?:string}}
// Studio emits money as JSON numbers. Preserve the original decimal token before
// JavaScript can round it. Small status values stay numbers for SDK compatibility.
export function parseNetworkJson(text:string):unknown {
 return parse(text,undefined,value=>{
  const number=Number(value);
  return Number.isSafeInteger(number)?number:value;
 });
}
export function assertReceiptBinding(receipt:BoundReceipt,call:TransactionCall,wallet:string){
 if(!sameAddress(receipt.from_address||'',wallet))throw new HttpError(403,'This receipt belongs to a different account.');
 if(!sameAddress(receipt.to_address||'',call.address))throw new HttpError(400,'The receipt does not match this action.');
 const args=call.args.map((arg,index)=>call.integerArgs?.includes(index)?BigInt(String(arg)):arg);
 const expected=abi.calldata.encode(abi.calldata.makeCalldataObject(call.functionName,args,undefined));
 const actual=receipt.data?.calldata;
 if(typeof actual!=='string'||!Buffer.from(actual,'base64').equals(Buffer.from(expected)))throw new HttpError(400,'The receipt does not match the prepared details.');
 const value=receipt.value??0;
 if(typeof value==='number'&&!Number.isSafeInteger(value)||!/^\d+$/.test(String(value))||BigInt(value)!==BigInt(call.value))throw new HttpError(400,'The receipt contains a different deposit amount.');
}
