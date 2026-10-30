import {sameAddress} from './amounts';
export interface TransferReceipt {
 hash:string;status:string|number;from_address?:string;to_address?:string;value:string|number;
 triggered_by?:string|null;triggered_on?:string|null;value_credited?:boolean;type?:number;
 consensus_data?:{leader_receipt?:{execution_result?:string}[]}|null;
}
export function payoutsCompleted(parent:string,escrow:string,expected:Record<string,string>,receipts:TransferReceipt[]):boolean {
 const totals=new Map<string,bigint>();const seen=new Set<string>();
 for(const receipt of receipts){
  if(receipt.triggered_by?.toLowerCase()!==parent.toLowerCase()||!sameAddress(receipt.from_address||'',escrow)||!receipt.to_address||seen.has(receipt.hash))continue;
  if(![7,'FINALIZED'].includes(receipt.status)||receipt.value_credited!==true||receipt.consensus_data?.leader_receipt?.some(r=>r.execution_result&&r.execution_result!=='SUCCESS'))continue;
  // Studio external EOA transfers have no IC consensus receipt. Their own
  // finalized, credited record proves the value transfer after parent finality.
  if(receipt.type===0&&receipt.triggered_on!=='finalized')continue;
  if(typeof receipt.value==='number'&&!Number.isSafeInteger(receipt.value))continue;
  if(!/^\d+$/.test(String(receipt.value)))continue;
  seen.add(receipt.hash);const address=receipt.to_address.toLowerCase();totals.set(address,(totals.get(address)||0n)+BigInt(receipt.value));
 }
 return Object.entries(expected).every(([address,amount])=>(totals.get(address.toLowerCase())||0n)===BigInt(amount));
}
