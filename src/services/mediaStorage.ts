import { uploadMediaToStorage } from './webFirebase';

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

async function uploadWithRetry(file:Blob,path:string):Promise<string>{
  let last:unknown;
  for(let attempt=1;attempt<=3;attempt++){
    try{return await uploadMediaToStorage(file,path);}
    catch(error){
      last=error;
      if(attempt<3)await sleep(700*attempt);
    }
  }
  throw last instanceof Error?last:new Error('Clinical media upload failed.');
}

export async function fileToDataUrl(file:Blob):Promise<string>{
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result));
    reader.onerror=()=>reject(reader.error||new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Prepare camera/gallery images before upload.
 * Large phone photos (often 4–12 MB) are resized client-side so the
 * Firebase upload is much faster while keeping enough resolution for
 * clinical review. Small images are left untouched.
 */
export async function optimizeClinicalImage(file:File):Promise<File>{
  if(!file||file.size<=0)throw new Error('The selected image is empty.');
  if(!file.type.startsWith('image/')||file.size<=1.5*1024*1024)return file;

  const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
  try{
    const maxDimension=2560;
    const scale=Math.min(1,maxDimension/Math.max(bitmap.width,bitmap.height));
    const width=Math.max(1,Math.round(bitmap.width*scale));
    const height=Math.max(1,Math.round(bitmap.height*scale));
    const canvas=document.createElement('canvas');
    canvas.width=width;
    canvas.height=height;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Could not prepare image for upload.');
    ctx.drawImage(bitmap,0,0,width,height);

    const blob=await new Promise<Blob>((resolve,reject)=>{
      canvas.toBlob(result=>result?resolve(result):reject(new Error('Could not compress image.')),'image/jpeg',0.88);
    });

    // If compression somehow makes the file larger, keep the original.
    if(blob.size>=file.size)return file;
    return new File([blob],file.name.replace(/\.[^.]+$/i,'.jpg'),{type:'image/jpeg',lastModified:Date.now()});
  }finally{
    bitmap.close();
  }
}

/**
 * Clinical media is persisted in Firebase Storage, not as base64 in Firestore.
 * This avoids oversized patient documents and prevents cloud restore from
 * overwriting newer local media with an older document.
 */
export async function uploadClinicalMedia(file:Blob,path:string):Promise<{url:string;cloud:true}>{
  if(!file||file.size<=0)throw new Error('The selected file is empty.');
  const url=await uploadWithRetry(file,path);
  if(!url)throw new Error('Firebase Storage returned no download URL.');
  return {url,cloud:true};
}
