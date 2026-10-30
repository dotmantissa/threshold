export type ItemClass = 'carpet' | 'refrigerator' | 'range' | 'water_heater' | 'air_conditioner' | 'paint_flat' | 'paint_enamel' | 'linoleum' | 'blinds';
export const itemClasses: {value:ItemClass;label:string;months:number}[] = [
  {value:'carpet',label:'Carpet',months:60},{value:'refrigerator',label:'Refrigerator',months:120},
  {value:'range',label:'Cooker',months:240},{value:'water_heater',label:'Water heater',months:120},
  {value:'air_conditioner',label:'Air conditioning',months:120},{value:'paint_flat',label:'Wall paint',months:36},
  {value:'paint_enamel',label:'Enamel paint',months:60},{value:'linoleum',label:'Linoleum floor',months:60},
  {value:'blinds',label:'Blinds',months:36},
];
export interface InventoryItem {id:string;name:string;class:ItemClass;age_months:number;replacement_atto:string;cost_reference_url:string;cost_reference_text?:string;cost_reference_sha256?:string;lifespan_months?:number}
export interface EvidenceImage {item_id:string;sha256:string;url:string}
export interface EvidenceSet {images:EvidenceImage[];manifest_hash:string;committed_at:string;submitted_by:'tenant'|'landlord';acknowledged:boolean}
export interface TenancyRecord {id:string;tenant:string;landlord:string;deposit_atto:string;rent_atto:string;start:string;end:string;jurisdiction:string;condition_clause:string;agreement_hash:string;items:InventoryItem[];created_at:string;tenant_accepted:boolean;landlord_accepted:boolean;move_in:EvidenceSet|null;move_out:EvidenceSet|null;departure_evidence?:Partial<Record<'tenant'|'landlord',EvidenceSet>>;departure_date?:string;departure_proposal?:{date:string;submitted_by:'tenant'|'landlord'}|null;notice:{claims:Claim[];submitted_at:string}|null}
export interface Claim {item_id:string;claimed_atto:string;reason:string;expenditure_atto?:string;expenditure_reference_url?:string}
export interface Finding {item_id:string;classification:'NEW_DAMAGE'|'PRE_EXISTING'|'NORMAL_WEAR'|'UNDETERMINED'|'NO_CLAIM';band:'NONE'|'LOW'|'MEDIUM'|'HIGH';reason:string;bad_faith:boolean;deduction_atto:string;band_lower_atto:string;band_upper_atto:string;depreciated_atto:string}
export interface Verdict {status:'AWAITING_EVIDENCE'|'DECIDED'|'UNDETERMINED';items?:Finding[];deduction_atto?:string;new_damage_count?:number;procedure?:{deadline:string;notice_registered:boolean;notice_timely:boolean;deposit_within_limit:boolean;arrival_acknowledged:boolean;statute_url:string};appeal?:boolean;appeal_upheld?:boolean;penalty_multiplier?:number;release_after?:string;recovery_after?:string;procedure_only?:boolean;decided_at?:string;bad_faith?:boolean}
export interface EscrowAccount {deposit_atto:string;reserve_atto:string;appeal_bond_atto:string;appellant:string;settled:boolean;appeal_deadline?:string;penalty_due_atto?:string;penalty_paid_atto?:string;tenant_payout_atto?:string;landlord_payout_atto?:string;penalty_atto?:string;transfers?:string}
export interface Tenancy {id:string;label:string;role:'tenant'|'landlord';chain_id:string|null;draft:TenancyDraft;creator_wallet:string;counterparty_wallet:string;created_at:string;record:TenancyRecord|null;verdict:Verdict|null;escrow:EscrowAccount|null;operations:Operation[];rehearing?:Verdict;contract_addresses?:ContractAddresses|null;payout_status?:'PENDING'|'COMPLETE'|'UNKNOWN'}
export interface TenancyDraft {label:string;role:'tenant'|'landlord';counterparty_email:string;deposit:string;rent:string;start:string;end:string;condition_clause:string;items:InventoryItem[]}
export interface Operation {id:string;action:string;tx_hash:string|null;status:'PREPARED'|'SUBMITTED'|'ACCEPTED'|'FINALIZED'|'PAYOUT_PENDING'|'COMPLETE'|'CONFIRMED'|'EXPIRED'|'FAILED';error:string|null;created_at:string;can_manage?:boolean;call?:TransactionCall}
export interface TransactionCall {address:`0x${string}`;functionName:string;args:(string|number|bigint)[];value:string;integerArgs?:number[];expectedPayout?:string}

export interface ContractAddresses {registry:`0x${string}`;court:`0x${string}`;escrow:`0x${string}`}
