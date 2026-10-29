import 'server-only';
import {createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import deployment from '../../deployment.json';
import type {EscrowAccount,TenancyRecord,Verdict} from './types';
import {HttpError} from './http';
export const contracts={registry:deployment.contracts.tenancy_registry?.address as `0x${string}`,court:deployment.contracts.condition_court?.address as `0x${string}`,escrow:deployment.contracts.deposit_escrow?.address as `0x${string}`};
export function chain(){return createClient({chain:studionet})}
export async function readTenancy(id:string){
 if(!contracts.registry||!contracts.court||!contracts.escrow)throw new HttpError(503,'The network connection is being prepared. Please try again shortly.');
 const client=chain();
 const [record,verdict,escrow]=await Promise.all([
  client.readContract({address:contracts.registry,functionName:'get_tenancy',args:[id]}),
  client.readContract({address:contracts.court,functionName:'get_verdict',args:[id]}),
  client.readContract({address:contracts.escrow,functionName:'get_account',args:[id]}),
 ]);
 return {record:record as unknown as TenancyRecord,verdict:verdict as unknown as Verdict,escrow:escrow as unknown as EscrowAccount};
}
