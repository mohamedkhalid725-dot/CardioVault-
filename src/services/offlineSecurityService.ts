const CACHE_KEY='cardiovault_secure_offline_cache_v1';
const PIN_SALT_KEY='cardiovault_secure_offline_salt_v1';
const IDENTITY_KEY='cardiovault_secure_offline_identity_v1';
const ITERATIONS=120000;

type ClinicalCache={units:any[];beds:any[];patients:any[];savedAt:string;unitIds:string[]};

let activeKey:CryptoKey|null=null;
let activePinConfigured=false;

const bytesToBase64=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);};
const base64ToBytes=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));

async function deriveKey(pin:string,salt:Uint8Array):Promise<CryptoKey>{
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function encrypt(value:ClinicalCache,key:CryptoKey){const iv=crypto.getRandomValues(new Uint8Array(12));const plain=new TextEncoder().encode(JSON.stringify(value));const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));return JSON.stringify({v:1,iv:bytesToBase64(iv),data:bytesToBase64(cipher)});}
async function decrypt(payload:string,key:CryptoKey):Promise<ClinicalCache>{const parsed=JSON.parse(payload);const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(parsed.iv)},key,base64ToBytes(parsed.data));return JSON.parse(new TextDecoder().decode(plain));}

function getSalt(){try{const raw=localStorage.getItem(PIN_SALT_KEY);return raw?base64ToBytes(raw):null;}catch{return null;}}
function saveSalt(salt:Uint8Array){localStorage.setItem(PIN_SALT_KEY,bytesToBase64(salt));}

export function hasOfflineProtection(){return !!getSalt()&&!!localStorage.getItem(CACHE_KEY)&&!!localStorage.getItem(IDENTITY_KEY);}
export function getOfflineIdentity(){try{return localStorage.getItem(IDENTITY_KEY)||'';}catch{return '';}}
export function isOfflineReadOnly(){return !!localStorage.getItem('cardiovault_offline_read_only_v1');}
export function setOfflineReadOnly(value:boolean){if(value)localStorage.setItem('cardiovault_offline_read_only_v1','1');else localStorage.removeItem('cardiovault_offline_read_only_v1');}

export async function configureOfflinePin(pin:string,identity:string,cache:ClinicalCache){
  const clean=pin.replace(/\\D/g,'');
  if(!/^\\d{4,8}$/.test(clean))throw new Error('PIN must be 4–8 digits.');
  let salt=getSalt();if(!salt){salt=crypto.getRandomValues(new Uint8Array(16));saveSalt(salt);}
  activeKey=await deriveKey(clean,salt);
  activePinConfigured=true;
  localStorage.setItem(IDENTITY_KEY,identity.trim().toLowerCase());
  localStorage.setItem(CACHE_KEY,await encrypt(cache,activeKey));
}

export async function cacheClinicalData(cache:ClinicalCache){
  if(!activeKey||!activePinConfigured)return;
  try{localStorage.setItem(CACHE_KEY,await encrypt(cache,activeKey));}catch(error){console.warn('Secure offline cache update failed:',error);}
}

export async function unlockOfflineCache(pin:string):Promise<ClinicalCache|null>{
  const salt=getSalt();const payload=localStorage.getItem(CACHE_KEY);if(!salt||!payload)return null;
  try{const key=await deriveKey(pin.replace(/\\D/g,''),salt);const data=await decrypt(payload,key);activeKey=key;activePinConfigured=true;setOfflineReadOnly(true);return data;}catch{return null;}
}

export async function verifyOfflinePin(pin:string){return !!(await unlockOfflineCache(pin));}
export function clearOfflineSession(){setOfflineReadOnly(false);activeKey=null;}
export function clearOfflineCache(){localStorage.removeItem(CACHE_KEY);localStorage.removeItem(PIN_SALT_KEY);localStorage.removeItem(IDENTITY_KEY);clearOfflineSession();}
