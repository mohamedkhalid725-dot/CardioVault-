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
 * the actual Bed records.
 */
export function reconcileClinicalRegistry(units:Unit[],beds:Bed[],patients:Patient[]):{units:Unit[];beds:Bed[];patients:Patient[];changed:boolean}{
  const nextUnits=[...(Array.isArray(units)?units:[])];
  const known=new Set(nextUnits.map(unit=>String(unit.id)));
  let changed=false;
  const ensureUnit=(unitId:string)=>{
    const id=String(unitId||'').trim();
    if(!id)return;
    if(!known.has(id)){
      nextUnits.push({id,name:readableUnitName(id),type:'Clinical Unit',totalBeds:0});
      known.add(id);
      changed=true;
    }
  };
  for(const bed of beds||[])ensureUnit(bed.unitId);
  for(const patient of patients||[])ensureUnit(patient.unitId);
  const counts=new Map<string,number>();
  for(const bed of beds||[]){const id=String(bed.unitId||'');if(id)counts.set(id,(counts.get(id)||0)+1);}
  const normalizedUnits=nextUnits.map(unit=>{
    const actual=counts.get(String(unit.id))||0;
    if(unit.totalBeds!==actual){changed=true;return {...unit,totalBeds:actual};}
    return unit;
  });
  return {units:normalizedUnits,beds:Array.isArray(beds)?beds:[],patients:Array.isArray(patients)?patients:[],changed};
}

reconcileStoredBeds();
