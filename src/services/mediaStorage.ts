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
 * Clinical media must not silently fall back to a base64 data URL.
 * Data URLs can make the patient Firestore document huge; the next cloud
 * restore can then replace the local patient with the older record, making
 * an image appear to "upload and disappear".
 *
 * Images/audio are therefore persisted in Firebase Storage and only the
 * stable download URL is stored inside the patient record.
 */
export async function uploadClinicalMedia(file:Blob,path:string):Promise<{url:string;cloud:true}>{
  if(!file||file.size<=0)throw new Error('The selected file is empty.');
  const url=await uploadWithRetry(file,path);
  if(!url)throw new Error('Firebase Storage returned no download URL.');
  return {url,cloud:true};
}
