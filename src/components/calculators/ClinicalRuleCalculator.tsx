import React, { useState } from 'react';
import { CalculatorDefinition } from '../../services/calculators';
import { Patient } from '../../types/clinical';

interface Props { definition: CalculatorDefinition; patient?: Patient; }

const Toggle: React.FC<{label:string;value:boolean;onChange:(v:boolean)=>void}> = ({label,value,onChange}) => (
  <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-sm cursor-pointer">
    <input type="checkbox" checked={value} onChange={(e)=>onChange(e.target.checked)} className="w-4 h-4 accent-cyan-500" />
    <span>{label}</span>
  </label>
);
const Num: React.FC<{label:string;value:number;onChange:(v:number)=>void;step?:string}> = ({label,value,onChange,step='1'}) => (
  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}
    <input type="number" step={step} value={Number.isFinite(value)?value:''} onChange={(e)=>onChange(Number(e.target.value))} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm" />
  </label>
);
const Result: React.FC<{score:number|string;label:string;detail?:string}> = ({score,label,detail}) => (
  <div className="mt-5 p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30">
    <div className="text-[10px] uppercase tracking-wider font-bold text-cyan-600 dark:text-cyan-400">Result</div>
    <div className="text-xl font-black mt-1 text-slate-900 dark:text-white">{label}: {score}</div>
    {detail && <p className="text-xs mt-2 text-slate-600 dark:text-slate-300">{detail}</p>}
  </div>
);

export const ClinicalRuleCalculator: React.FC<Props> = ({definition,patient}) => {
  const age=patient?.age||58;
  const latest=patient?.vitalsHistory?.[0];
  const [wellsDvt,setWellsDvt]=useState<boolean[]>(Array(10).fill(false));
  const [wellsPe,setWellsPe]=useState<boolean[]>(Array(7).fill(false));
  const [perc,setPerc]=useState<boolean[]>(Array(8).fill(false));
  const [geneva,setGeneva]=useState<boolean[]>(Array(8).fill(false));
  const [pesiAge,setPesiAge]=useState(age),[pesiMale,setPesiMale]=useState(patient?.sex==='Male'),[pesiCancer,setPesiCancer]=useState(false),[pesiHF,setPesiHF]=useState(false),[pesiLung,setPesiLung]=useState(false),[pesiHR,setPesiHR]=useState(latest?.hr||80),[pesiSBP,setPesiSBP]=useState(latest?.sbp||120),[pesiRR,setPesiRR]=useState(latest?.rr||18),[pesiTemp,setPesiTemp]=useState(latest?.temp||37),[pesiMental,setPesiMental]=useState(false),[pesiSpO2,setPesiSpO2]=useState(latest?.spo2||98);
  const [spesiAge,setSpesiAge]=useState(age),[spesiCancer,setSpesiCancer]=useState(false),[spesiCardio,setSpesiCardio]=useState(false),[spesiHR,setSpesiHR]=useState(latest?.hr||80),[spesiSBP,setSpesiSBP]=useState(latest?.sbp||120),[spesiSpO2,setSpesiSpO2]=useState(latest?.spo2||98);
  const [fourTs,setFourTs]=useState<number[]>([0,0,0,0]);
  const [daptAge,setDaptAge]=useState(age),[dapt,setDapt]=useState<boolean[]>(Array(8).fill(false));

  const wellsPeScore=wellsPe.reduce((n,v,i)=>n+(v?[3,3,1.5,1.5,1.5,1,1][i]:0),0);
  const wellsDvtScore=wellsDvt.reduce((n,v,i)=>n+(v?(i===9?-2:1):0),0);
  const percScore=perc.filter(Boolean).length;
  const genevaScore=geneva.reduce((n,v,i)=>n+(v?[1,3,2,2,3,2,3,4][i]:0),0);
  const pesiScore=pesiAge+(pesiMale?10:0)+(pesiCancer?30:0)+(pesiHF?10:0)+(pesiLung?10:0)+(pesiHR>=110?20:0)+(pesiSBP<100?30:0)+(pesiRR>=30?20:0)+(pesiTemp<36?20:0)+(pesiMental?60:0)+(pesiSpO2<90?20:0);
  const spesiScore=(spesiAge>80?1:0)+(spesiCancer?1:0)+(spesiCardio?1:0)+(spesiHR>=110?1:0)+(spesiSBP<100?1:0)+(spesiSpO2<90?1:0);
  const fourTsScore=fourTs.reduce((a,b)=>a+b,0);
  const daptAgePoints=daptAge>=75?-2:daptAge>=65?-1:0;
  const daptScore=daptAgePoints+(dapt[0]?1:0)+(dapt[1]?1:0)+(dapt[2]?1:0)+(dapt[3]?1:0)+(dapt[4]?1:0)+(dapt[5]?1:0)+(dapt[6]?2:0)+(dapt[7]?2:0);

  const setAt=(setter:React.Dispatch<React.SetStateAction<boolean[]>>,index:number,value:boolean)=>setter(prev=>prev.map((v,i)=>i===index?value:v));
  const setFour=(index:number,value:number)=>setFourTs(prev=>prev.map((v,i)=>i===index?value:v));

  const render=()=>{
    switch(definition.id){
      case 'wells-pe': {
        const labels=['Clinical signs of DVT','PE is the most likely diagnosis / equally likely','Heart rate >100 bpm','Immobilization ≥3 days or surgery in previous 4 weeks','Previous objectively diagnosed DVT/PE','Hemoptysis','Malignancy with treatment within 6 months or palliative'];
        return <><div className="grid gap-2">{labels.map((l,i)=><Toggle key={l} label={l} value={wellsPe[i]} onChange={v=>setAt(setWellsPe,i,v)}/>)}</div><Result score={wellsPeScore} label="Wells PE" detail={wellsPeScore<=4?'Two-tier: PE unlikely (≤4).': 'Two-tier: PE likely (>4).'} /></>;
      }
      case 'wells-dvt': {
        const labels=['Active cancer','Bedridden >3 days or major surgery within 12 weeks','Calf swelling >3 cm','Collateral superficial veins','Entire leg swollen','Localized tenderness along deep venous system','Pitting edema confined to symptomatic leg','Paralysis/paresis/recent plaster immobilization','Previously documented DVT','Alternative diagnosis at least as likely as DVT'];
        return <><div className="grid gap-2">{labels.map((l,i)=><Toggle key={l} label={l} value={wellsDvt[i]} onChange={v=>setAt(setWellsDvt,i,v)}/>)}</div><Result score={wellsDvtScore} label="Wells DVT" detail={wellsDvtScore>=3?'DVT likely by the 3-point threshold shown in this implementation.':'DVT less likely by the 3-point threshold.'}/></>;
      }
      case 'perc-pe': {
        const labels=['Age ≥50','Heart rate ≥100','O₂ saturation on room air <95%','Unilateral leg swelling','Hemoptysis','Recent surgery/trauma ≤4 weeks requiring general anesthesia','Prior PE/DVT','Hormone use'];
        return <><p className="text-xs text-slate-500 mb-3">Use only after a patient has already been assessed as low risk for PE.</p><div className="grid gap-2">{labels.map((l,i)=><Toggle key={l} label={l} value={perc[i]} onChange={v=>setAt(setPerc,i,v)}/>)}</div><Result score={percScore} label="PERC" detail={percScore===0?'All 8 PERC criteria are negative.':'At least one PERC criterion is positive.'}/></>;
      }
      case 'revised-geneva': {
        const labels=['Age >65 years','Previous DVT/PE','Surgery under general anesthesia or lower-limb fracture within 1 month','Active malignancy','Unilateral lower-limb pain','Hemoptysis','Heart rate 75–94 bpm','Pain on lower-limb palpation + unilateral edema'];
        return <><div className="grid gap-2">{labels.map((l,i)=><Toggle key={l} label={l} value={geneva[i]} onChange={v=>setAt(setGeneva,i,v)}/>)}</div><Result score={genevaScore} label="Revised Geneva" detail={genevaScore<=3?'Low probability (0–3).':genevaScore<=10?'Intermediate probability (4–10).':'High probability (≥11).'}/></>;
      }
      case 'pesi':
        return <><div className="grid sm:grid-cols-2 gap-3"><Num label="Age" value={pesiAge} onChange={setPesiAge}/><Num label="Heart rate" value={pesiHR} onChange={setPesiHR}/><Num label="Systolic BP" value={pesiSBP} onChange={setPesiSBP}/><Num label="Respiratory rate" value={pesiRR} onChange={setPesiRR}/><Num label="Temperature °C" value={pesiTemp} onChange={setPesiTemp}/><Num label="O₂ saturation %" value={pesiSpO2} onChange={setPesiSpO2}/></div><div className="grid gap-2 mt-3"><Toggle label="Male" value={pesiMale} onChange={setPesiMale}/><Toggle label="Cancer" value={pesiCancer} onChange={setPesiCancer}/><Toggle label="Heart failure" value={pesiHF} onChange={setPesiHF}/><Toggle label="Chronic lung disease" value={pesiLung} onChange={setPesiLung}/><Toggle label="Altered mental status" value={pesiMental} onChange={setPesiMental}/></div><Result score={pesiScore} label="PESI" detail={pesiScore<=65?'Class I (≤65).':pesiScore<=85?'Class II (66–85).':pesiScore<=105?'Class III (86–105).':pesiScore<=125?'Class IV (106–125).':'Class V (>125).'}/></>;
      case 'spesi':
        return <><div className="grid sm:grid-cols-2 gap-3"><Num label="Age" value={spesiAge} onChange={setSpesiAge}/><Num label="Heart rate" value={spesiHR} onChange={setSpesiHR}/><Num label="Systolic BP" value={spesiSBP} onChange={setSpesiSBP}/><Num label="O₂ saturation %" value={spesiSpO2} onChange={setSpesiSpO2}/></div><div className="grid gap-2 mt-3"><Toggle label="Age >80" value={spesiAge>80} onChange={v=>setSpesiAge(v?81:80)}/><Toggle label="Cancer" value={spesiCancer} onChange={setSpesiCancer}/><Toggle label="Chronic cardiopulmonary disease" value={spesiCardio} onChange={setSpesiCardio}/></div><Result score={spesiScore} label="sPESI" detail={spesiScore===0?'Score 0.':`Score ≥1 (${spesiScore}).`}/></>;
      case 'four-ts': {
        const groups=[
          ['Thrombocytopenia','>50% fall and nadir ≥20','30–50% fall or nadir 10–19','<30% fall or nadir <10'],
          ['Timing','Clear onset days 5–10 or ≤1 day with recent exposure','Consistent but not clear / after day 10','<4 days without recent exposure'],
          ['Thrombosis/sequelae','New thrombosis/skin necrosis/systemic reaction','Progressive/recurrent thrombosis or suspected thrombosis','None'],
          ['Other causes','None apparent','Possible','Definite'],
        ];
        return <><div className="space-y-4">{groups.map((g,gi)=><div key={g[0]}><div className="text-xs font-bold mb-2">{g[0]}</div><div className="grid gap-2">{g.slice(1).map((label,idx)=><button key={label} onClick={()=>setFour(gi,2-idx)} className={`text-left p-3 rounded-xl border text-xs ${fourTs[gi]===2-idx?'border-cyan-500 bg-cyan-500/10':'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70'}`}>{label} <span className="float-right font-black">+{2-idx}</span></button>)}</div></div>)}</div><Result score={fourTsScore} label="4Ts" detail={fourTsScore<=3?'Low probability (0–3).':fourTsScore<=5?'Intermediate probability (4–5).':'High probability (6–8).'}/></>;
      }
      case 'dapt-score':
        return <><Num label="Age" value={daptAge} onChange={setDaptAge}/><div className="grid gap-2 mt-3">{['Smoking within 1 year','Diabetes mellitus','MI at presentation','Prior PCI or prior MI','Paclitaxel-eluting stent','Stent diameter <3 mm','CHF or LVEF <30%','Vein graft stent'].map((l,i)=><Toggle key={l} label={l} value={dapt[i]} onChange={v=>setAt(setDapt,i,v)}/>)}</div><Result score={daptScore} label="DAPT Score" detail="Age contributes −2 (≥75), −1 (65–74), or 0 (<65); the remaining criteria add their validated points." /></>;
      default:
        return <div className="p-5 rounded-2xl border border-dashed text-sm text-slate-500">This calculator is not available yet.</div>;
    }
  };

  return <div className="space-y-4"><div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-5"><div className="text-sm font-black text-slate-900 dark:text-white">{definition.name}</div><div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{definition.description}</div>{render()}</div></div>;
};
