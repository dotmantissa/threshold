import 'server-only';
export function requiredEnv(key: string): string {
  const value=process.env[key];
  if(!value)throw new Error('Threshold configuration is missing '+key);
  return value;
}
