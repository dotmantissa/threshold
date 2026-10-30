import {it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({queries:[] as string[],wallet:'0x'+'1'.repeat(40)}));
vi.mock('../../src/lib/auth',()=>({authenticate:async()=>({id:'tenant',wallet:state.wallet})}));
vi.mock('../../src/lib/limits',()=>({limit:async()=>{}}));
vi.mock('../../src/lib/tenancies',()=>({tenancyRow:async()=>({chain_id:'7',creator_wallet:state.wallet,counterparty_wallet:'0x'+'2'.repeat(40),draft:{role:'tenant'}})}));
vi.mock('../../src/lib/chain',()=>({contracts:{registry:'0x'+'3'.repeat(40),court:'0x'+'4'.repeat(40),escrow:'0x'+'5'.repeat(40)},readTenancy:async()=>({record:{agreement_hash:'hash'},escrow:null,verdict:null})}));
vi.mock('../../src/lib/db',()=>({db:()=>async(parts:TemplateStringsArray)=>{const query=parts.join('?');state.queries.push(query);return query.includes('INSERT')?[{id:'new',status:'PREPARED'}]:[]}}));
import {POST} from '../../src/app/api/tenancies/[id]/actions/route';
it('preparing an action never acquires or checks a tenancy-wide lock',async()=>{
 const id='8b7d0cb2-bf40-443b-bbad-1e9fddf03147';
 const response=await POST(new Request('https://threshold.test/api',{method:'POST',headers:{origin:'https://threshold.test','Content-Type':'application/json'},body:JSON.stringify({action:'accept',operation_key:id})}),{params:Promise.resolve({id})});
 expect(response.status).toBe(201);
 expect(state.queries.some(q=>q.includes("interval '10 minutes'"))).toBe(true);
 expect(state.queries.some(q=>q.includes('SELECT id FROM threshold_operations'))).toBe(false);
 expect(state.queries.some(q=>q.includes('INSERT INTO threshold_operations'))).toBe(true);
});
