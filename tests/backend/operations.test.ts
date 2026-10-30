import {describe,it,expect,vi,beforeEach} from 'vitest';
const state=vi.hoisted(()=>({sql:vi.fn(),read:vi.fn(),receipt:null as unknown,user:{id:'user-a',wallet:'0x1111111111111111111111111111111111111111',email:'tenant@example.com'}}));
vi.mock('../../src/lib/auth',()=>({authenticate:async()=>state.user}));
vi.mock('../../src/lib/db',()=>({db:()=>state.sql}));
vi.mock('../../src/lib/chain',()=>({readTenancy:state.read}));
import {POST} from '../../src/app/api/operations/[id]/route';
import {abi} from 'genlayer-js';
const id='8b7d0cb2-bf40-443b-bbad-1e9fddf03147';const hash='0x'+'a'.repeat(64);
const call={address:'0x2222222222222222222222222222222222222222',functionName:'fund_deposit',args:['7'],value:'10000000000000000001'};
const op={id,status:'PREPARED',tx_hash:null,action:'fund',tenancy_id:id,chain_id:'7',call};
const request=(body:object)=>new Request('https://threshold.test/api/operations/'+id,{method:'POST',headers:{origin:'https://threshold.test','Content-Type':'application/json'},body:JSON.stringify(body)});
const params={params:Promise.resolve({id})};
beforeEach(()=>{state.sql.mockReset();state.read.mockReset();vi.restoreAllMocks()});
function network(status=5,prepared=call){return '{"result":{"status":'+status+',"from_address":"'+state.user.wallet+'","to_address":"'+prepared.address+'","value":'+prepared.value+',"data":{"calldata":"'+Buffer.from(abi.calldata.encode(abi.calldata.makeCalldataObject(prepared.functionName,prepared.args,undefined))).toString('base64')+'"},"consensus_data":{"leader_receipt":[{"execution_result":"SUCCESS"}]}}}'}
describe('persistent operation recovery',()=>{
 it('keeps accepted execution distinct from finality and continues polling',async()=>{
 state.sql.mockResolvedValueOnce([op]).mockResolvedValueOnce([{id}]).mockResolvedValue([]);vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(network(5)));
 const response=await POST(request({tx_hash:hash}),params);expect(await response.json()).toMatchObject({status:'ACCEPTED'});expect(state.read).not.toHaveBeenCalled();
 });
 it('keeps a submitted receipt pending until network acceptance',async()=>{
  state.sql.mockResolvedValueOnce([op]).mockResolvedValueOnce([{id}]);vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(network(3)));
  const response=await POST(request({tx_hash:hash}),params);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({status:'SUBMITTED',tx_hash:hash});expect(state.read).not.toHaveBeenCalled();
 });
 it('reconciles exact receipt and authoritative snapshot after finality',async()=>{
  state.sql.mockResolvedValueOnce([op]).mockResolvedValueOnce([{id}]).mockResolvedValue([]);state.read.mockResolvedValue({record:{id:'7'},verdict:{status:'AWAITING_EVIDENCE'},escrow:{deposit_atto:call.value}});vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(network(7)));
  const response=await POST(request({tx_hash:hash}),params);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({status:'FINALIZED',chain_id:'7'});expect(state.read).toHaveBeenCalledWith('7',undefined);
 });
 it('cannot overwrite an already bound hash',async()=>{
  state.sql.mockResolvedValueOnce([{...op,tx_hash:'0x'+'b'.repeat(64)}]);const fetch=vi.spyOn(globalThis,'fetch');const response=await POST(request({tx_hash:hash}),params);expect(response.status).toBe(409);expect(fetch).not.toHaveBeenCalled();
 });
 it('does not claim cancellation if submission won the race',async()=>{
  state.sql.mockResolvedValueOnce([op]).mockResolvedValueOnce([]);const response=await POST(request({cancel:true}),params);expect(response.status).toBe(409);
 });
 it('cancels only a prepared action without a receipt',async()=>{
  state.sql.mockResolvedValueOnce([op]).mockResolvedValueOnce([{id}]);const response=await POST(request({cancel:true}),params);expect(response.status).toBe(200);expect(await response.json()).toEqual({status:'FAILED'});
 });
 it('does not confirm an action cancelled during receipt checking',async()=>{
  state.sql.mockResolvedValueOnce([op]).mockResolvedValueOnce([]);vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(network()));const response=await POST(request({tx_hash:hash}),params);expect(response.status).toBe(409);expect(state.read).not.toHaveBeenCalled();
 });
 it('hides another user’s operation',async()=>{
  state.sql.mockResolvedValueOnce([]);const response=await POST(request({tx_hash:hash}),params);expect(response.status).toBe(404);
 });
 it.each([false,true])('reconciles recipient credit independently from finalized settlement (credited=%s)',async credited=>{
  const tenant=state.user.wallet,landlord='0x'+'3'.repeat(40);
  const prepared={...call,functionName:'settle',value:'0'};
  state.sql.mockResolvedValueOnce([{...op,action:'settle',call:prepared,user_id:'other-participant',operation_wallet:tenant,tx_hash:hash}]).mockResolvedValueOnce([{id}]).mockResolvedValue([]);
  state.read.mockResolvedValue({record:{id:'7',tenant,landlord},escrow:{settled:true,tenant_payout_atto:'1000',landlord_payout_atto:'2000'}});
  const transfers=[tenant,landlord].map((address,index)=>({hash:'0x'+String(index+4).repeat(64),status:'FINALIZED',type:0,from_address:prepared.address,to_address:address,value:index===0?1000:2000,triggered_by:hash,triggered_on:'finalized',value_credited:credited,consensus_data:null}));
  vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(network(7,prepared))).mockResolvedValueOnce(new Response(JSON.stringify({result:transfers})));
  const response=await POST(request({}),params);
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({status:credited?'COMPLETE':'PAYOUT_PENDING'});
 });
});
