import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {authenticate} from '@/lib/auth';
import {tenancyRow} from '@/lib/tenancies';
import {db} from '@/lib/db';
import {storeImage} from '@/lib/storage';
import {limit} from '@/lib/limits';
import {json,errorResponse,assertSameOrigin,HttpError} from '@/lib/http';
export const runtime='nodejs';
export async function POST(request:Request){try{
 assertSameOrigin(request);const user=await authenticate(request);await limit('photos:'+user.id,25,3600);
 if(Number(request.headers.get('content-length')||0)>9*1024*1024)throw new HttpError(413,'Keep each photo under 8 MB.');
 const data=await request.formData();const file=data.get('photo');const tenancyId=String(data.get('tenancy_id')||'');
 const row=await tenancyRow(tenancyId,user.id);
 if(!(file instanceof File)||file.size>8*1024*1024||file.size<1000)throw new HttpError(400,'Choose a clear photo under 8 MB.');
 if(data.get('privacy_reviewed')!=='true')throw new HttpError(400,'Review the photo for faces and documents first.');
 const itemId=String(data.get('item_id')||'');if(!row.draft.items.some(i=>i.id===itemId))throw new HttpError(400,'Choose an item from this tenancy.');
 const input=Buffer.from(await file.arrayBuffer());const image=sharp(input,{limitInputPixels:40000000});
 const metadata=await image.metadata();
 if(!['jpeg','png','webp'].includes(metadata.format||'')||!metadata.width||!metadata.height||Math.min(metadata.width,metadata.height)<320)throw new HttpError(400,'Use a JPEG, PNG or WebP photo with enough detail.');
 // Re-encoding drops EXIF, location and device metadata. Final bytes are previewed
 // and rehashed by the client before the immutable manifest is signed.
 const bytes=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:90}).toBuffer();
 const sha256=createHash('sha256').update(bytes).digest('hex');const sql=db();
 const existing=await sql`SELECT public_url,storage_key FROM threshold_evidence WHERE sha256=${sha256}`;
 const stored=existing[0]?{url:String(existing[0].public_url),key:String(existing[0].storage_key)}:await storeImage(sha256,bytes);
 await sql.transaction([
  sql`INSERT INTO threshold_evidence(sha256,storage_key,public_url,byte_length,mime_type) VALUES(${sha256},${stored.key},${stored.url},${bytes.length},'image/jpeg') ON CONFLICT(sha256) DO NOTHING`,
  sql`INSERT INTO threshold_evidence_links(tenancy_id,sha256,owner_id) VALUES(${tenancyId},${sha256},${user.id}) ON CONFLICT DO NOTHING`,
 ]);
 return json({image:{item_id:itemId,sha256,url:stored.url},preview:'data:image/jpeg;base64,'+bytes.toString('base64')},201);
}catch(error){return errorResponse(error)}}
