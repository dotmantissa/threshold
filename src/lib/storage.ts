import 'server-only';
import {put,head} from '@vercel/blob';
import {S3Client,PutObjectCommand} from '@aws-sdk/client-s3';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {requiredEnv} from './env';
import {HttpError} from './http';
export async function storeImage(sha256:string,bytes:Buffer){
 const key='evidence/'+sha256+'.jpg';const driver=process.env.STORAGE_DRIVER||'local';
 if(driver==='vercel'){
  try{return {key,url:(await put(key,bytes,{access:'public',addRandomSuffix:false,allowOverwrite:false,contentType:'image/jpeg',cacheControlMaxAge:31536000})).url}}
  catch(error){if(typeof error==='object'&&error!==null&&'name' in error&&String(error.name).includes('BlobAlreadyExists'))return {key,url:(await head(key)).url};throw error}
 }
 if(driver==='s3'){
  const client=new S3Client({region:process.env.S3_REGION||'auto',endpoint:process.env.S3_ENDPOINT||undefined,credentials:{accessKeyId:requiredEnv('S3_ACCESS_KEY_ID'),secretAccessKey:requiredEnv('S3_SECRET_ACCESS_KEY')}});
  try{await client.send(new PutObjectCommand({Bucket:requiredEnv('S3_BUCKET'),Key:key,Body:bytes,ContentType:'image/jpeg',CacheControl:'public, max-age=31536000, immutable',IfNoneMatch:'*'}))}catch(error){if(!(typeof error==='object'&&error!==null&&'$metadata'in error&&(error.$metadata as {httpStatusCode?:number}).httpStatusCode===412))throw error}
  return {key,url:requiredEnv('S3_PUBLIC_BASE_URL').replace(/\/$/,'')+'/'+key};
 }
 const origin=requiredEnv('APP_URL');
 if(!origin.startsWith('https://'))throw new HttpError(503,'Photo commitments need a public HTTPS address. Configure persistent storage before capture.');
 const directory=join(process.cwd(),'.storage','evidence');await mkdir(directory,{recursive:true,mode:0o700});
 try{await writeFile(join(directory,sha256+'.jpg'),bytes,{flag:'wx',mode:0o600})}catch(error){if(!(typeof error==='object'&&error!==null&&'code'in error&&error.code==='EEXIST'))throw error}
 return {key,url:origin+'/api/evidence/'+sha256};
}
export async function localImage(sha256:string){return readFile(join(process.cwd(),'.storage','evidence',sha256+'.jpg'))}
