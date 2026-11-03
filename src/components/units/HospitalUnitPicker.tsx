import React,{useMemo}from'react';
import{Building2}from'lucide-react';
import type{Hospital,Unit}from'../../types/clinical';

/**
 * Shared hospital -> unit scope selector.
 *
 * The app hierarchy is hospital -> unit -> member, so every screen that can be
 * narrowed to one unit first asks which hospital, then which unit inside it.
 * The caller always passes units it has already filtered by access/licensing;
 * this component never widens visibility on its own.
 */
export interface UnitScope{
  /** '' = all hospitals, UNASSIGNED_HOSPITAL = units with no known hospital. */
  hospitalId:string;
  /** '' = every unit inside the selected hospital. */
  unitId:string;
}

export const ALL_UNITS_SCOPE:UnitScope={hospitalId:'',unitId:''};
export const UNASSIGNED_HOSPITAL='__unassigned';

export const isKnownHospital=(unit:Unit,hospitals:Hospital[]):boolean=>
  !!unit.hospitalId&&hospitals.some(hospital=>hospital.id===unit.hospitalId);

/** Units that fall inside the scope. Unknown hospital references stay unassigned. */
export const unitsInScope=(units:Unit[],hospitals:Hospital[],scope:UnitScope):Unit[]=>{
  const byHospital=scope.hospitalId===''
    ? units
    : units.filter(unit=>scope.hospitalId===UNASSIGNED_HOSPITAL?!isKnownHospital(unit,hospitals):unit.hospitalId===scope.hospitalId);
  return scope.unitId?byHospital.filter(unit=>unit.id===scope.unitId):byHospital;
};

/** True when a record that carries `unitId` belongs to the current scope. */
export const inUnitScope=(unitId:string|undefined|null,units:Unit[],hospitals:Hospital[],scope:UnitScope):boolean=>{
  if(!unitId)return scope.hospitalId===''&&scope.unitId==='';
  return unitsInScope(units,hospitals,scope).some(unit=>unit.id===unitId);
};

/** "Hospital · Unit" label used as a section header, or just the unit name. */
export const unitScopeLabel=(unitId:string,units:Unit[],hospitals:Hospital[]):string=>{
  const unit=units.find(item=>item.id===unitId);
  if(!unit)return 'Unknown unit';
  const hospital=unit.hospitalId?hospitals.find(item=>item.id===unit.hospitalId):undefined;
  return hospital?`${hospital.name} · ${unit.name}`:unit.name;
};

interface HospitalUnitPickerProps{
  units:Unit[];
  hospitals:Hospital[];
  value:UnitScope;
  onChange:(next:UnitScope)=>void;
  /** Units that have no known hospital are offered under "Unassigned". */
  showUnassigned?:boolean;
  disabled?:boolean;
  className?:string;
}

export const HospitalUnitPicker:React.FC<HospitalUnitPickerProps>=({units,hospitals,value,onChange,showUnassigned=true,disabled=false,className=''})=>{
  const hospitalOptions=useMemo(()=>hospitals.filter(hospital=>units.some(unit=>unit.hospitalId===hospital.id)),[hospitals,units]);
  const hasUnassigned=useMemo(()=>units.some(unit=>!isKnownHospital(unit,hospitals)),[units,hospitals]);
  const scopedUnits=useMemo(()=>unitsInScope(units,hospitals,{...value,unitId:''}),[units,hospitals,value.hospitalId]);
  const select='text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 max-w-[46vw]';
  return <div className={`flex flex-wrap items-center gap-2 ${className}`}>
    <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
      <Building2 className="h-3.5 w-3.5 text-cyan-500"/>
      <span className="sr-only">Hospital</span>
      <select
        aria-label="Hospital"
        value={value.hospitalId}
        disabled={disabled}
        onChange={event=>onChange({hospitalId:event.target.value,unitId:''})}
        className={select}
      >
        <option value="">All hospitals</option>
        {hospitalOptions.map(hospital=><option key={hospital.id} value={hospital.id}>{hospital.name}</option>)}
        {showUnassigned&&hasUnassigned&&<option value={UNASSIGNED_HOSPITAL}>Unassigned unit</option>}
      </select>
    </label>
    <select
      aria-label="Unit"
      value={value.unitId}
      disabled={disabled||scopedUnits.length===0}
      onChange={event=>onChange({...value,unitId:event.target.value})}
      className={select}
    >
      <option value="">All units</option>
      {scopedUnits.map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}
    </select>
  </div>;
};
