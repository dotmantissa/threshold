import {it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {TenancyView} from '../../src/components/tenancy-view';
import type {Tenancy} from '../../src/lib/types';
const noop=async()=>{};
const tenancy:Tenancy={id:'7',label:'Recovery home',role:'tenant',chain_id:'7',creator_wallet:'0x'+'1'.repeat(40),counterparty_wallet:'0x'+'2'.repeat(40),created_at:'2026-01-01',draft:{label:'Recovery home',role:'tenant',counterparty_email:'owner@example.com',deposit:'1',rent:'1',start:'2026-01-01',end:'2026-01-02',condition_clause:'Ordinary wear is allowed.',items:[]},record:{id:'7',tenant:'0x'+'1'.repeat(40),landlord:'0x'+'2'.repeat(40),deposit_atto:'1000',rent_atto:'1000',start:'2026-01-01',end:'2026-01-02',departure_date:'2026-01-02',jurisdiction:'US_CA_STANDARD',condition_clause:'Ordinary wear is allowed.',agreement_hash:'hash',items:[],created_at:'2026-01-01',tenant_accepted:true,landlord_accepted:true,move_in:{acknowledged:true,images:[],manifest_hash:'hash',committed_at:'2026-01-01',submitted_by:'tenant'},move_out:null,notice:null,departure_evidence:{}},escrow:{deposit_atto:'1000',reserve_atto:'0',appeal_bond_atto:'0',appellant:'',settled:false},verdict:{status:'AWAITING_EVIDENCE'},operations:[]};
function render(value:Tenancy){return renderToStaticMarkup(<TenancyView tenancy={value} wallet={value.creator_wallet} busy={false} onAction={noop} onCapture={()=>{}} onNotice={()=>{}} onResume={noop} onDismiss={noop}/>)}
it('offers expiry settlement even when nobody submitted departure evidence or a verdict',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-03-01'));
 expect(render(tenancy)).toContain('Release the deposit');
 vi.useRealTimers();
});
it('never labels emitted but unconfirmed recipient transfers as released',()=>{
 const html=render({...tenancy,escrow:{...tenancy.escrow!,settled:true},payout_status:'PENDING'});
 expect(html).toContain('Payouts awaiting confirmation');expect(html).not.toContain('Deposit released');
});
it('lets the opposing participant complete a still-active appeal',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-01-03'));
 const html=render({...tenancy,record:{...tenancy.record!,move_out:tenancy.record!.move_in,notice:{claims:[],submitted_at:'2026-01-02'}},escrow:{...tenancy.escrow!,appeal_bond_atto:'10',appellant:tenancy.counterparty_wallet,appeal_deadline:'2026-01-05'},verdict:{status:'DECIDED',appeal:false,release_after:'2026-01-04'}});
 expect(html).toContain('Review the evidence again');vi.useRealTimers();
});
