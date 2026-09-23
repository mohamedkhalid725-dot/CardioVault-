import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const CHANNELS={full:'clinical-updates',vibrate:'clinical-updates-vibrate',sound:'clinical-updates-sound',silent:'clinical-updates-silent'} as const;
const SETTINGS_KEY='cardiovault_notification_settings_v1';
export type NotificationSettings={enabled:boolean;vibration:boolean;sound:boolean;clinicalAlerts:boolean};
const defaults:NotificationSettings={enabled:true,vibration:true,sound:true,clinicalAlerts:true};
let initialized=false;let permissionGranted=false;let actionListenerInstalled=false;

export const getClinicalNotificationSettings=():NotificationSettings=>{try{return {...defaults,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}}catch{return defaults}};
export const setClinicalNotificationSettings=(patch:Partial<NotificationSettings>):NotificationSettings=>{const next={...getClinicalNotificationSettings(),...patch};try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(next));}catch{}return next};
const channelFor=(s:NotificationSettings)=>s.sound&&s.vibration?CHANNELS.full:s.vibration?CHANNELS.vibrate:s.sound?CHANNELS.sound:CHANNELS.silent;

export async function initializeClinicalNotifications():Promise<boolean>{
 if(!Capacitor.isNativePlatform()){
  permissionGranted=typeof Notification==='undefined'||Notification.permission==='granted';
  if(typeof Notification!=='undefined'&&Notification.permission==='default'){try{permissionGranted=(await Notification.requestPermission())==='granted';}catch{permissionGranted=false;}}
  initialized=true;return permissionGranted;
 }
 if(initialized)return permissionGranted;
 try{
  const permission=await LocalNotifications.requestPermissions();
  permissionGranted=permission.display==='granted';
  if(permissionGranted&&Capacitor.getPlatform()==='android'){
   await Promise.all([
    LocalNotifications.createChannel({id:CHANNELS.full,name:'Clinical Updates',description:'CardioVault clinical updates with sound and vibration.',importance:4,visibility:1,sound:'default',vibration:true}),
    LocalNotifications.createChannel({id:CHANNELS.vibrate,name:'Clinical Updates • Vibration',description:'CardioVault clinical updates with vibration only.',importance:4,visibility:1,vibration:true}),
    LocalNotifications.createChannel({id:CHANNELS.sound,name:'Clinical Updates • Sound',description:'CardioVault clinical updates with sound only.',importance:4,visibility:1,sound:'default',vibration:false}),
    LocalNotifications.createChannel({id:CHANNELS.silent,name:'Clinical Updates • Silent',description:'CardioVault clinical updates without sound or vibration.',importance:4,visibility:1,vibration:false})
   ]);
  }
  initialized=true;return permissionGranted;
 }catch(error){console.warn('Clinical notifications initialization failed:',error);initialized=true;return false;}
}

export async function notifyClinicalData(message:string,title='CardioVault',extra?:{patientId?:string;section?:string;unitId?:string;type?:string;critical?:boolean}):Promise<void>{
 const settings=getClinicalNotificationSettings();
 if(!settings.enabled||((extra?.critical||extra?.type==='clinical-alert')&&!settings.clinicalAlerts))return;
 try{
  const ready=await initializeClinicalNotifications();if(!ready)return;
  if(!Capacitor.isNativePlatform()){
   if(typeof Notification!=='undefined'&&Notification.permission==='granted'){
    const n=new Notification(title,{body:message,tag:`cardiovault-${extra?.patientId||'clinical'}`});
    n.onclick=()=>{window.focus();window.dispatchEvent(new CustomEvent('cardiovault-notification-action',{detail:extra||{}}));};
   }
   return;
  }
  await LocalNotifications.schedule({notifications:[{id:Math.floor(Date.now()%2147483647),title,body:message,channelId:channelFor(settings),schedule:{at:new Date(Date.now()+250)},extra:{type:extra?.type||'clinical-data-update',patientId:extra?.patientId,section:extra?.section,unitId:extra?.unitId,critical:extra?.critical===true}}]});
 }catch(error){console.warn('Clinical notification failed:',error);}
}

export async function installClinicalNotificationActionHandler(handler:(extra:any)=>void):Promise<void>{
 if(actionListenerInstalled)return;
 actionListenerInstalled=true;
 try{
  if(Capacitor.isNativePlatform())await LocalNotifications.addListener('localNotificationActionPerformed',event=>handler(event.notification?.extra||{}));
  else window.addEventListener('cardiovault-notification-action',(event:any)=>handler(event.detail||{}));
 }catch(error){console.warn('Clinical notification action handler failed:',error);}
}
