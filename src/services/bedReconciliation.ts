import {Bed,Patient,Unit} from '../types/clinical';

const BEDS_KEY='cardiovault_beds_v2';
const PATIENTS_KEY='cardiovault_patients_v2';
const UNITS_KEY='cardiovault_units_v2';

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

const readableUnitName=(unitId:string)=>{
  const raw=String(unitId||'').replace(/^unit[-_]?/i,'').replace(/[-_]+/g,' ').trim();
  if(!raw)return 'Recovered Unit';
  return raw.split(' ').map(word=>word?word.charAt(0).toUpperCase()+word.slice(1):word).join(' ');
};

/**
 * Keeps the Unit registry and Bed registry consistent after cloud restore/import.
 * Older versions could restore a larger bed set while the corresponding Unit
 * documents were missing. We never discard those beds; instead we recreate the
 * missing Unit records from each bed/patient unitId and derive totalBeds from
 * the actual Bed records. A unit that already exists keeps the capacity the
 * doctor declared: its totalBeds is his own number, not a count of whatever
 * bed documents happen to be in the cloud at that moment.
 */
export function reconcileClinicalRegistry(units:Unit[],beds:Bed[],patients:Patient[]):{units:Unit[];beds:Bed[];patients:Patient[];changed:boolean}{
  const nextUnits=[...(Array.isArray(units)?units:[])];
  const known=new Set(nextUnits.map(unit=>String(unit.id)));
  // Units that had to be RECOVERED from their beds. They never had a declared
  // capacity, so theirs is derived from the bed records.
  const recovered=new Set<string>();
  let changed=false;
  const ensureUnit=(unitId:string)=>{
    const id=String(unitId||'').trim();
    if(!id)return;
    if(!known.has(id)){
      nextUnits.push({id,name:readableUnitName(id),type:'Clinical Unit',totalBeds:0});
      known.add(id);
      recovered.add(id);
      changed=true;
    }
  };
  for(const bed of beds||[])ensureUnit(bed.unitId);
  // A shared clinical file keeps the unit where the patient physically is, and
  // that unit can be one the reader is not a member of (the file is only shared
  // for reading). Inventing that unit here would put a unit in front of the
  // reader that he does not belong to, so a shared file never creates a unit.
  for(const patient of patients||[]){const shared=Array.isArray((patient as any).unitIds)&&((patient as any).unitIds as any[]).length>0;if(!shared)ensureUnit(patient.unitId);}
  const counts=new Map<string,number>();
  for(const bed of beds||[]){const id=String(bed.unitId||'');if(id)counts.set(id,(counts.get(id)||0)+1);}
  const normalizedUnits=nextUnits.map(unit=>{
    const id=String(unit.id);
    if(!recovered.has(id)){
      // `totalBeds` is the capacity the doctor declared when the unit was
      // created, and addBed/removeBed keep it in step with the bed records.
      // It must NOT be rewritten from the number of bed documents that happen
      // to be in the cloud: a restore that landed between the unit write and
      // the bed writes used to turn a six-bed unit into a zero-bed unit, and
      // the next sync wrote that zero back for good. The declared capacity
      // stays as the doctor set it.
      return unit;
    }
    const actual=counts.get(id)||0;
    if(unit.totalBeds!==actual){changed=true;return {...unit,totalBeds:actual};}
    return unit;
  });
  return {units:normalizedUnits,beds:Array.isArray(beds)?beds:[],patients:Array.isArray(patients)?patients:[],changed};
}

reconcileStoredBeds();
