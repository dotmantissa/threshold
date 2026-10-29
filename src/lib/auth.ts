import 'server-only';
import {PrivyClient} from '@privy-io/node';
type User = Awaited<ReturnType<ReturnType<PrivyClient['users']>['_get']>>;
import {requiredEnv} from './env';
import {db} from './db';
import {HttpError} from './http';
export function privy(){return new PrivyClient({appId:requiredEnv('PRIVY_APP_ID'),appSecret:requiredEnv('PRIVY_APP_SECRET')})}
export function userIdentity(user: User){
 const email=user.linked_accounts.find(a=>a.type==='email');
 const wallet=user.linked_accounts.find(a=>a.type==='wallet'&&a.chain_type==='ethereum'&&a.wallet_client_type==='privy');
 if(!email||email.type!=='email'||!wallet||wallet.type!=='wallet')throw new HttpError(409,'Your account is still getting ready. Please try again in a moment.');
 return {id:user.id,email:email.address.toLowerCase(),wallet:wallet.address};
}
export async function saveUser(user:User){
 const identity=userIdentity(user);const sql=db();
 await sql`INSERT INTO threshold_users(privy_id,email,wallet) VALUES(${identity.id},${identity.email},${identity.wallet}) ON CONFLICT(privy_id) DO UPDATE SET email=EXCLUDED.email,wallet=EXCLUDED.wallet`;
 return identity;
}
export async function authenticate(request:Request){
 const session=request.headers.get('cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith('threshold-session='))?.slice('threshold-session='.length);
 const header=request.headers.get('authorization')||(session?'Bearer '+session:null);
 if(!header?.startsWith('Bearer '))throw new HttpError(401,'Sign in with your email to continue.');
 const client=privy();let userId:string;
 try{const claims=await client.utils().auth().verifyAccessToken(header.slice(7));userId=claims.user_id;}catch{throw new HttpError(401,'Your session has ended. Please sign in again.');}
 const user=await client.users()._get(userId);return saveUser(user);
}
export async function counterparty(email:string){
 const client=privy();let user:User;
 try{user=await client.users().getByEmailAddress({address:email})}catch(error){
  if(typeof error!=='object'||error===null||!('status' in error)||error.status!==404)throw error;
  try{user=await client.users().create({linked_accounts:[{type:'email',address:email}],wallets:[{chain_type:'ethereum'}]})}catch(race){
   if(typeof race!=='object'||race===null||!('status'in race)||![409,422].includes(Number(race.status)))throw race;
   user=await client.users().getByEmailAddress({address:email});
  }
 }
 if(!user.linked_accounts.some(a=>a.type==='wallet'&&a.chain_type==='ethereum'&&a.wallet_client_type==='privy'))user=await client.users().pregenerateWallets(user.id,{wallets:[{chain_type:'ethereum'}]});
 return saveUser(user);
}
