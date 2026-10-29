let detectorPromise:Promise<import('@mediapipe/tasks-vision').FaceDetector>|undefined;
async function detector(){
 if(!detectorPromise)detectorPromise=(async()=>{
  const {FaceDetector,FilesetResolver}=await import('@mediapipe/tasks-vision');
  return FaceDetector.createFromOptions(await FilesetResolver.forVisionTasks('/vision'),{baseOptions:{modelAssetPath:'/vision/face.tflite'},runningMode:'IMAGE',minDetectionConfidence:0.45});
 })().catch(error=>{detectorPromise=undefined;throw error});
 return detectorPromise;
}
export async function preparePhoto(file:File):Promise<{blob:Blob;preview:string;sha256:string}>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('Choose a JPEG, PNG or WebP photo under 8 MB.');
 const bitmap=await createImageBitmap(file);
 try{
  if(Math.min(bitmap.width,bitmap.height)<320)throw Error('This photo is a little too small. Take one with more detail.');
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  const context=canvas.getContext('2d');if(!context)throw Error('This browser could not prepare the photo. Please try another browser.');
  context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  let detections;
  try{detections=(await detector()).detect(canvas).detections}catch{throw Error('The face check could not load. Please try again before sharing this photo.');}
  if(detections.length)throw Error('Someone’s face is in this photo. Retake it with just the item in the frame.');
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('The photo could not be saved.')),'image/jpeg',0.92));
  const bytes=await blob.arrayBuffer();const hash=await crypto.subtle.digest('SHA-256',bytes);
  return {blob,preview:URL.createObjectURL(blob),sha256:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')};
 }finally{bitmap.close()}
}
export async function verifyPreview(dataUrl:string,sha256:string){
 const bytes=Uint8Array.from(atob(dataUrl.split(',')[1]),c=>c.charCodeAt(0));
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 const actual=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 if(actual!==sha256)throw Error('The photo fingerprint did not match. Please upload it again.');
}
