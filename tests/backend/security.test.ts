import {describe,it,expect,vi} from 'vitest';
import {abi} from 'genlayer-js';
import {toAtto,fromAtto,sameAddress} from '../../src/lib/amounts';
import {assertReceiptBinding,parseNetworkJson} from '../../src/lib/receipt-binding';
import {prepareCall,type ActionContext} from '../../src/lib/actions';
import {draftSchema} from '../../src/lib/schema';
import {assertSameOrigin,readJson,errorResponse,HttpError} from '../../src/lib/http';
import type {TransactionCall,TenancyRecord} from '../../src/lib/types';
const tenant='0x1111111111111111111111111111111111111111';
const landlord='0x2222222222222222222222222222222222222222';
const outsider='0x3333333333333333333333333333333333333333';
const contracts={registry:tenant,court:landlord,escrow:outsider} as const;
const draft={label:'Oak apartment',role:'tenant' as const,counterparty_email:'OWNER@example.com',deposit:'10.000000000000000001',rent:'15',start:'2026-11-01',end:'2027-11-01',condition_clause:'Ordinary wear is expected. Only new damage may be deducted.',items:[{id:'floor',name:'Hall carpet',class:'carpet' as const,age_months:12,replacement_atto:toAtto('50'),cost_reference_url:'https://example.org/price'}]};
const record={id:'7',tenant,landlord,deposit_atto:toAtto(draft.deposit),rent_atto:toAtto(draft.rent),items:draft.items,agreement_hash:'abc',move_in:null} as unknown as TenancyRecord;
const context:ActionContext={chainId:'7',draft,creatorWallet:tenant,counterpartyWallet:landlord,userWallet:tenant,record,escrow:null,verdict:null,contracts};
function receipt(call:TransactionCall){return {from_address:tenant,to_address:call.address,value:call.value,data:{calldata:Buffer.from(abi.calldata.encode(abi.calldata.makeCalldataObject(call.functionName,call.args.map((a,i)=>call.integerArgs?.includes(i)?BigInt(a):a),undefined))).toString('base64')}}}
describe('exact amounts and receipt binding',()=>{
 it('round trips a single atto beyond JSON precision',()=>expect(fromAtto(toAtto(draft.deposit))).toBe(draft.deposit));
 it.each(['1e18','-1','01','Infinity','1.0000000000000000001'])('rejects %s',amount=>expect(()=>toAtto(amount)).toThrow());
 it('preserves actual network numeric money tokens',()=>expect(parseNetworkJson('{"value":10000000000000000001,"status":5}')).toEqual({value:'10000000000000000001',status:5}));
 it('binds payable receipts exactly',()=>{const call=prepareCall(context,'fund');expect(()=>assertReceiptBinding(receipt(call),call,tenant)).not.toThrow()});
 it('rejects one atto difference',()=>{const call=prepareCall(context,'fund');expect(()=>assertReceiptBinding({...receipt(call),value:toAtto('10')},call,tenant)).toThrow('different deposit')});
 it('rejects a receipt already rounded by a JSON decoder',()=>{const call=prepareCall(context,'fund');expect(()=>assertReceiptBinding({...receipt(call),value:Number(call.value)},call,tenant)).toThrow()});
 it('rejects a different signer',()=>{const call=prepareCall(context,'fund');expect(()=>assertReceiptBinding({...receipt(call),from_address:landlord},call,tenant)).toThrow('different account')});
 it('rejects a different target',()=>{const call=prepareCall(context,'fund');expect(()=>assertReceiptBinding({...receipt(call),to_address:landlord},call,tenant)).toThrow('match this action')});
 it('rejects altered calldata',()=>{const call=prepareCall(context,'fund');expect(()=>assertReceiptBinding(receipt({...call,args:['8']}),call,tenant)).toThrow('prepared details')});
 it('encodes registry monetary integers without rounding',()=>{const call=prepareCall({...context,chainId:null},'register');expect(call.integerArgs).toEqual([2,3]);expect(()=>assertReceiptBinding(receipt(call),call,tenant)).not.toThrow()});
});
describe('tenancy authorization and validation',()=>{
 it.each(['register','fund','adjudicate','settle'])('rejects outsiders for %s',action=>expect(()=>prepareCall({...context,userWallet:outsider},action)).toThrow('two people'));
 it('tenant cannot fund landlord reserve',()=>expect(()=>prepareCall(context,'reserve')).toThrow('landlord'));
 it('landlord cannot fund tenant deposit',()=>expect(()=>prepareCall({...context,userWallet:landlord},'fund')).toThrow('tenant'));
 it('requires all inventory photos exactly once',()=>expect(()=>prepareCall(context,'commit_arrival',[])).toThrow('every item'));
 it('rejects claims referencing unrelated inventory',()=>expect(()=>prepareCall({...context,userWallet:landlord},'notice',undefined,[{item_id:'other',claimed_atto:'1',reason:'New damage reported'}])).toThrow('claim items'));
 it('requires a closed appeal window for settlement',()=>expect(()=>prepareCall(context,'settle')).toThrow('appeal window'));
 it('lets the counterparty complete a bonded rehearing',()=>expect(prepareCall({...context,escrow:{deposit_atto:'10',reserve_atto:'0',appeal_bond_atto:'1',appellant:landlord,settled:false}},'rehear').functionName).toBe('rehear'));
 it('normalizes counterpart email',()=>expect(draftSchema.parse(draft).counterparty_email).toBe('owner@example.com'));
 it('rejects an invalid calendar date',()=>expect(draftSchema.safeParse({...draft,start:'2026-02-30'}).success).toBe(false));
 it('rejects excessive deposits',()=>expect(draftSchema.safeParse({...draft,deposit:'16'}).success).toBe(false));
 it('does not treat partial address matches as ownership',()=>expect(sameAddress('0x11',tenant)).toBe(false));
});
describe('request boundaries',()=>{
 it('rejects cross origin writes',()=>expect(()=>assertSameOrigin(new Request('https://threshold.test/api',{headers:{origin:'https://attacker.test'}}))).toThrow());
 it('allows the current app origin',()=>expect(()=>assertSameOrigin(new Request('https://threshold.test/api',{headers:{origin:'https://threshold.test'}}))).not.toThrow());
 it('enforces body size without trusting Content Length',async()=>await expect(readJson(new Request('https://threshold.test',{method:'POST',body:'"'+ 'a'.repeat(100)+'"'}),10)).rejects.toThrow('too large'));
 it('returns a useful malformed JSON response',async()=>await expect(readJson(new Request('https://threshold.test',{method:'POST',body:'{'}))).rejects.toThrow('read that request'));
 it('does not disclose provider secrets',async()=>{vi.spyOn(console,'error').mockImplementation(()=>{});const response=errorResponse(Error('private credential'));expect(await response.text()).not.toContain('private credential');expect(response.status).toBe(503);vi.restoreAllMocks()});
 it('preserves intentional user error statuses',()=>expect(errorResponse(new HttpError(403,'Not your record')).status).toBe(403));
});
