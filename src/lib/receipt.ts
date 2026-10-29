export interface NetworkReceipt {
  status: string|number; statusName?:string; from_address?:string; to_address?:string;
  data?:{contract_address?:string;calldata?:{readable?:string}};
  consensus_data?:{leader_receipt?:{execution_result?:string;genvm_result?:{stderr?:string;stdout?:string;error_description?:string}}[];votes?:Record<string,string>};
}
export function executionSucceeded(receipt: NetworkReceipt): boolean {
  const latest=receipt.consensus_data?.leader_receipt?.[0];
  return latest?.execution_result==='SUCCESS';
}
export function executionError(receipt: NetworkReceipt): string {
  const result=receipt.consensus_data?.leader_receipt?.[0]?.genvm_result;
  const raw=result?.error_description||result?.stderr||'The network could not complete this action. Your previous record is safe.';
  const expected=raw.match(/\[EXPECTED\]\s*([^\n'"]+)/);
  return expected?expected[1].trim():'The network could not complete this action. Open the activity record for its receipt.';
}
