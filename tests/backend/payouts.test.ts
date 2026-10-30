import {describe,it,expect} from 'vitest';
import {payoutsCompleted,type TransferReceipt} from '../../src/lib/payouts';
const parent='0x'+'a'.repeat(64),escrow='0x'+'1'.repeat(40),tenant='0x'+'2'.repeat(40);
const child:TransferReceipt={hash:'0x'+'b'.repeat(64),status:'FINALIZED',from_address:escrow,to_address:tenant,value:'10000000000000000001',triggered_by:parent,value_credited:true};
describe('recipient payout proof',()=>{
 it('requires an exact finalized credited child transfer',()=>expect(payoutsCompleted(parent,escrow,{[tenant]:child.value as string},[child])).toBe(true));
 it.each([{status:'ACCEPTED'},{value_credited:false},{triggered_by:'0x'+'c'.repeat(64)},{from_address:tenant},{to_address:escrow},{value:'10000000000000000000'},{value:Number(child.value)},{consensus_data:{leader_receipt:[{execution_result:'ERROR'}]}}])('rejects incomplete or unrelated transfer %j',patch=>expect(payoutsCompleted(parent,escrow,{[tenant]:child.value as string},[{...child,...patch}])).toBe(false));
 it('does not count duplicate child receipts twice',()=>expect(payoutsCompleted(parent,escrow,{[tenant]:child.value as string},[child,child])).toBe(true));
 it('requires both recipient shares',()=>expect(payoutsCompleted(parent,escrow,{[tenant]:child.value as string,[escrow]:'10'},[child])).toBe(false));
 it('reconciles the live external EOA receipt format without an IC execution result',()=>{
  const external={...child,type:0,triggered_on:'finalized',consensus_data:null,value:7};
  expect(payoutsCompleted(parent,escrow,{[tenant]:'7'},[external])).toBe(true);
  expect(payoutsCompleted(parent,escrow,{[tenant]:'7'},[{...external,triggered_on:'accepted'}])).toBe(false);
 });
});
