import { DetailedAuditLog, ClinicalCorrection } from '../types/clinical';
import { Capacitor } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import { webDoc, webCollection, getDocs as webGetDocs, setDoc as webSetDoc } from './webFirebase';
import { getStoredWorkspaceAccess, MASTER_WORKSPACE_ID } from './workspaceAccess';

export type AuditEntry = DetailedAuditLog;

const AUDIT_STORAGE_KEY = 'cardiovault_immutable_audit_logs_v2';
const CORRECTIONS_STORAGE_KEY = 'cardiovault_clinical_corrections_v2';

const localRead = <T,>(key:string, fallback:T):T => {
  try { const raw=localStorage.getItem(key); const parsed=raw?JSON.parse(raw):fallback; return parsed as T; } catch { return fallback; }
};
const localWrite = (key:string,value:any) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

const unitIds = ():string[] => {
  const access=getStoredWorkspaceAccess();
  return Array.from(new Set((Array.isArray(access?.unitIds)?access.unitIds:[access?.unitId]).filter(Boolean).map(String)));
};
const auditPath = (unitId:string|null) => unitId
  ? `workspaces/${MASTER_WORKSPACE_ID}/units/${unitId}/auditLogs`
  : `workspaces/${MASTER_WORKSPACE_ID}/auditLogs`;
const correctionPath = (unitId:string|null) => unitId
  ? `workspaces/${MASTER_WORKSPACE_ID}/units/${unitId}/clinicalCorrections`
  : `workspaces/${MASTER_WORKSPACE_ID}/clinicalCorrections`;

async function cloudSet(path:string,id:string,data:any):Promise<void>{
  const reference=`${path}/${id}`;
  if(Capacitor.isNativePlatform()) await FirebaseFirestore.setDocument({reference,data,merge:false});
  else await webSetDoc(webDoc(reference),data,{merge:false});
}
async function cloudRead(path:string):Promise<any[]>{
  try{
    if(Capacitor.isNativePlatform()){
      const result:any=await FirebaseFirestore.getCollection({reference:path});
      return (result?.snapshots||[]).map((s:any)=>typeof s?.data==='function'?s.data():s?.data).filter(Boolean);
    }
    const snap=await webGetDocs(webCollection(path));
    return snap.docs.map(d=>d.data());
  }catch(error){ console.warn('Audit cloud read failed:',path,error); return []; }
}
async function publishAudit(entry:DetailedAuditLog){
  const access=getStoredWorkspaceAccess();
  const unitId=entry.unitId||access?.unitId||null;
  const payload={...entry,unitId:unitId||undefined,cloudImmutable:true};
  try{ await cloudSet(auditPath(unitId),entry.id,payload); }catch(error){ console.warn('Audit cloud write failed:',error); }
}
async function publishCorrection(entry:ClinicalCorrection){
  const access=getStoredWorkspaceAccess();
  const unitId=entry.unitId||access?.unitId||null;
  const payload={...entry,unitId:unitId||undefined,cloudImmutable:true};
  try{ await cloudSet(correctionPath(unitId),entry.id,payload); }catch(error){ console.warn('Correction cloud write failed:',error); }
}

export const AuditTrailService = {
  getLogs(): DetailedAuditLog[] { return localRead(AUDIT_STORAGE_KEY, []); },

  async hydrate(): Promise<{logs:DetailedAuditLog[];corrections:ClinicalCorrection[]}> {
    const access=getStoredWorkspaceAccess();
    const ids=unitIds();
    const paths=ids.length?ids:[null];
    const [logs, corrections] = await Promise.all([
      Promise.all(paths.map(id=>cloudRead(auditPath(id)))),
      Promise.all(paths.map(id=>cloudRead(correctionPath(id)))),
    ]);
    const mergedLogs=new Map<string,DetailedAuditLog>();
    this.getLogs().forEach(x=>mergedLogs.set(x.id,x));
    logs.flat().forEach((x:any)=>{if(x?.id)mergedLogs.set(String(x.id),x as DetailedAuditLog);});
    const mergedCorrections=new Map<string,ClinicalCorrection>();
    this.getCorrections().forEach(x=>mergedCorrections.set(x.id,x));
    corrections.flat().forEach((x:any)=>{if(x?.id)mergedCorrections.set(String(x.id),x as ClinicalCorrection);});
    const nextLogs=Array.from(mergedLogs.values()).sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp))).slice(0,1000);
    const nextCorrections=Array.from(mergedCorrections.values()).sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)));
    localWrite(AUDIT_STORAGE_KEY,nextLogs); localWrite(CORRECTIONS_STORAGE_KEY,nextCorrections);
    return {logs:nextLogs,corrections:nextCorrections};
  },

  logAction(entry: Omit<DetailedAuditLog,'id'|'timestamp'|'deviceSession'> & {id?:string;timestamp?:string}): DetailedAuditLog {
    const logs=this.getLogs();
    const access=getStoredWorkspaceAccess();
    const newLog:DetailedAuditLog={
      id:entry.id||`audit-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      timestamp:entry.timestamp||new Date().toISOString(),
      deviceSession:`session-${Date.now().toString(36)}`,
      ...entry,
      unitId:entry.unitId||access?.unitId||undefined,
    };
    localWrite(AUDIT_STORAGE_KEY,[newLog,...logs].slice(0,1000));
    void publishAudit(newLog);
    return newLog;
  },

  getCorrections(patientId?:string): ClinicalCorrection[] {
    const all=localRead<ClinicalCorrection[]>(CORRECTIONS_STORAGE_KEY,[]);
    return patientId?all.filter(c=>c.patientId===patientId):all;
  },

  logCorrection(correction:Omit<ClinicalCorrection,'id'|'timestamp'>): ClinicalCorrection {
    const access=getStoredWorkspaceAccess();
    const newCorrection:ClinicalCorrection={
      id:`corr-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      timestamp:new Date().toISOString(),
      ...correction,
      unitId:correction.unitId||access?.unitId||undefined,
    };
    const corrections=this.getCorrections();
    localWrite(CORRECTIONS_STORAGE_KEY,[newCorrection,...corrections]);
    void publishCorrection(newCorrection);
    this.logAction({
      userId:correction.user,
      userName:correction.user,
      role:correction.userRole,
      action:`Clinical Correction: ${correction.recordType} - ${correction.fieldName}`,
      patientId:correction.patientId,
      previousValue:correction.originalValue,
      newValue:correction.correctedValue,
      reason:correction.reason,
      unitId:newCorrection.unitId,
    });
    return newCorrection;
  },
};
