import React from'react';
import type {Patient}from'../../types/clinical';

export const PatientIdentityStrip:React.FC<{patient:Patient}>=({patient})=><section className="max-w-7xl mx-auto w-full px-3 sm:px-6 pt-3"><div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3"><div className="text-[10px] uppercase tracking-wider font-black text-amber-500">Previous admission identity</div><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold"><span>Name: {patient.fullName}</span><span>MRN: {patient.mrn}</span><span>Age: {patient.age}</span><span>Sex: {patient.sex}</span></div></div></section>;
