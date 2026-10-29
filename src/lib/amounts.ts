const SCALE = 10n ** 18n;
export function toAtto(value: string): string {
  if (!/^(0|[1-9]\d{0,17})(\.\d{1,18})?$/.test(value)) throw new Error('Enter a positive amount with at most 18 decimal places.');
  const [whole, fraction=''] = value.split('.');
  return (BigInt(whole)*SCALE+BigInt(fraction.padEnd(18,'0'))).toString();
}
export function fromAtto(value: string): string {
  const amount=BigInt(value); const whole=amount/SCALE;const fraction=(amount%SCALE).toString().padStart(18,'0').replace(/0+$/,'');
  return whole.toString()+(fraction?'.'+fraction:'');
}
export function formatCredits(value: string): string {
  const exact=fromAtto(value);const [whole,fraction='']=exact.split('.');
  return BigInt(whole).toLocaleString('en-US')+(fraction?'.'+fraction.slice(0,4):'');
}
export function sameAddress(a:string,b:string):boolean {return /^0x[\da-f]{40}$/i.test(a)&&a.toLowerCase()===b.toLowerCase()}
