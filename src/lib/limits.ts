import 'server-only';
import {db} from './db';
import {HttpError} from './http';
export async function limit(subject:string,max:number,windowSeconds=60){
 const bucket=Math.floor(Date.now()/1000/windowSeconds);const sql=db();
 const rows=await sql`INSERT INTO threshold_limits(subject,bucket,count) VALUES(${subject},${bucket},1) ON CONFLICT(subject,bucket) DO UPDATE SET count=threshold_limits.count+1 RETURNING count`;
 if(Number(rows[0].count)>max)throw new HttpError(429,'A little breather, please. Try again shortly.');
}
