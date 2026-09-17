import {Bed,Patient} from '../types/clinical';

const BEDS_KEY='cardiovault_beds_v2';
const PATIENTS_KEY='cardiovault_patients_v2';

/** Repairs beds left pointing at discharged/deleted patients by older app states. */
export function reconcileStoredBeds():void{
  try{
    const bedsRaw=localStorage.getItem(BEDS_KEY);
    const patientsRaw=localStorage.getItem(PATIENTS_KEY);
    if(!bedsRaw||!patientsRaw)return;
    const beds:Bed[]=JSON.parse(bedsRaw);
    const patients:Patient[]=JSON.parse(patientsRaw);
    if(!Array.isArray(beds)||!Array.isArray(patients))return;
    const patientMap=new Map(patients.map(patient=>[patient.id,patient]));
    let changed=false;
    const repaired=beds.map(bed=>{
      if(!bed.patientId)return bed;
      const patient=patientMap.get(bed.patientId);
      if(!patient||patient.isArchived){
        changed=true;
        return {...bed,patientId:undefined,status:'Empty' as const};
      }
      return bed;
    });
    if(changed)localStorage.setItem(BEDS_KEY,JSON.stringify(repaired));
  }catch(error){
    console.warn('CardioVault bed reconciliation failed:',error);
  }
}

reconcileStoredBeds();
