import {toAtto,sameAddress} from './amounts';
import type {TenancyDraft,TransactionCall,TenancyRecord,EscrowAccount,Verdict,EvidenceImage,Claim} from './types';
import {HttpError} from './http';
export interface ActionContext {chainId:string|null;draft:TenancyDraft;creatorWallet:string;counterpartyWallet:string;userWallet:string;record:TenancyRecord|null;escrow:EscrowAccount|null;verdict:Verdict|null;contracts:{registry:`0x${string}`;court:`0x${string}`;escrow:`0x${string}`}}
export function prepareCall(context:ActionContext,action:string,images?:EvidenceImage[],claims?:Claim[],departureDate?:string):TransactionCall{
 const {chainId,draft,creatorWallet,counterpartyWallet,userWallet,record,escrow,verdict,contracts}=context;
 const tenant=draft.role==='tenant'?creatorWallet:counterpartyWallet;
 const landlord=draft.role==='landlord'?creatorWallet:counterpartyWallet;
 const role=sameAddress(userWallet,tenant)?'tenant':sameAddress(userWallet,landlord)?'landlord':null;
 if(!role)throw new HttpError(403,'Only the two people on this tenancy can change it.');
 const call=(address:`0x${string}`,functionName:string,args:(string|number)[],value='0',integerArgs?:number[])=>({address,functionName,args,value,integerArgs});
 if(action==='register'){
  if(chainId)throw new HttpError(409,'This tenancy is already registered.');
  return call(contracts.registry,'create_tenancy',[tenant,landlord,toAtto(draft.deposit),toAtto(draft.rent),draft.start,draft.end,draft.condition_clause,JSON.stringify(draft.items),'US_CA_STANDARD'],'0',[2,3]);
 }
 if(!chainId||!record)throw new HttpError(409,'Register the tenancy before this step.');
 if(action==='accept')return call(contracts.registry,'accept_terms',[chainId,record.agreement_hash]);
 if(action==='acknowledge'){
  if(!record.move_in)throw new HttpError(409,'There is no arrival record to review yet.');
  return call(contracts.registry,'acknowledge_arrival',[chainId,record.move_in.manifest_hash]);
 }
 if(action==='commit_arrival'||action==='commit_departure'){
  if(!images||images.length!==record.items.length||new Set(images.map(i=>i.item_id)).size!==record.items.length||images.some(i=>!record.items.some(item=>item.id===i.item_id)))throw new HttpError(400,'Add one photo for every item on the inventory.');
  return call(contracts.registry,'commit_evidence',[chainId,action==='commit_arrival'?'move_in':'move_out',JSON.stringify(images)]);
 }
 if(action==='fund'){
  if(role!=='tenant')throw new HttpError(403,'The tenant funds the deposit.');
  return call(contracts.escrow,'fund_deposit',[chainId],record.deposit_atto);
 }
 if(action==='reserve'){
  if(role!=='landlord')throw new HttpError(403,'The landlord funds the penalty reserve.');
  return call(contracts.escrow,'fund_reserve',[chainId],(2n*BigInt(record.deposit_atto)-BigInt(escrow?.reserve_atto||'0')).toString());
 }
 if(action==='notice'){
  if(role!=='landlord'||!claims)throw new HttpError(403,'The landlord prepares the itemised notice.');
  if(new Set(claims.map(c=>c.item_id)).size!==claims.length||claims.some(c=>!record.items.some(i=>i.id===c.item_id)||BigInt(c.claimed_atto)>BigInt(record.deposit_atto)))throw new HttpError(400,'Check the claim items and amounts.');
  return call(contracts.registry,'submit_notice',[chainId,JSON.stringify(claims)]);
 }
 if(action==='adjudicate')return call(contracts.court,'adjudicate',[chainId]);
 if(action==='bond'){
  if(!escrow||escrow.appeal_bond_atto!=='0')throw new HttpError(409,'An appeal bond is already recorded.');
  return call(contracts.escrow,'bond_appeal',[chainId],(BigInt(record.deposit_atto)/100n||1n).toString());
 }
 if(action==='rehear'){
  if(!escrow||escrow.appeal_bond_atto==='0')throw new HttpError(409,'Fund an appeal bond before requesting a review.');
  return call(contracts.court,'rehear',[chainId]);
 }
 if(action==='refund_reserve')return {...call(contracts.escrow,'refund_unused_reserve',[chainId]),expectedPayout:escrow?.reserve_atto||'0'};
 if(action==='pay_penalty'){
  if(role!=='landlord'||!escrow?.penalty_due_atto||escrow.penalty_due_atto==='0')throw new HttpError(409,'No outstanding penalty to pay.');
  return call(contracts.escrow,'pay_penalty',[chainId],escrow.penalty_due_atto);
 }
 if(action==='propose_departure'||action==='acknowledge_departure'){
  const day=departureDate||record.departure_proposal?.date;
  if(!day)throw new HttpError(400,'Choose the agreed early departure date.');
  return call(contracts.registry,action,[chainId,day]);
 }
 if(action==='settle'){
  const expired=Date.now()>=Date.parse((record.departure_date||record.end)+'T00:00:00Z')+36*86400000;
  if(!expired&&(verdict?.status!=='DECIDED'||!verdict.release_after||Date.now()<Date.parse(verdict.release_after)))throw new HttpError(409,'Wait for the appeal window or resolution deadline before release.');
  if(!expired&&escrow?.appeal_deadline&&escrow.appeal_bond_atto!=='0'&&!verdict?.appeal&&Date.now()<Date.parse(escrow.appeal_deadline))throw new HttpError(409,'Complete the rehearing or wait for its deadline.');
  return call(contracts.escrow,'settle',[chainId]);
 }
 throw new HttpError(400,'This action is not available.');
}
