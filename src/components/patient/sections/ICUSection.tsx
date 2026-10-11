import { formatAbgTimestamp, sortAbgRecords, parseExplicitNumber } from '../../../services/abgHistory';
import React, { useEffect, useState } from 'react';
import { Wind, Plus, Activity, Gauge, Edit2, Loader2 } from 'lucide-react';
import { Patient, ABGRecord, RespiratorySupportType, VentilatorRecord } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';
import { useIsPreviousViewer } from '../PreviousAdmissionViewer';
import { MedicalCalculators } from '../../../services/calculators';

interface ICUSectionProps { patient: Patient; }

const MODES = ['AC/VC', 'AC/PC', 'SIMV-VC', 'SIMV-PC', 'PSV', 'CPAP', 'BiPAP', 'PRVC', 'APRV'];
const OXYGEN_DEVICES = ['Nasal Cannula', 'Simple Face Mask', 'Venturi Mask', 'NRBM', 'HFNC'];
const SUPPORT_TYPES: readonly RespiratorySupportType[] = ['Room Air', 'Oxygen Therapy', 'Mechanical Ventilation'];
const ventChipCls = (selected: boolean): string => 'px-2 py-1 rounded-full text-[10px] font-bold border transition-all ' + (selected ? 'bg-cyan-500 border-cyan-500 text-slate-950' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300');

export const ICUSection: React.FC<ICUSectionProps> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const isPreviousViewer = useIsPreviousViewer();
  const vent = patient.ventilator;
  const abgs = sortAbgRecords(vent.abgHistory || []);
  const history = vent.history || [];
  const latestABG = abgs[0];

  const [activeTab, setActiveTab] = useState<'vent' | 'abg'>('vent');
  const [showAddABGModal, setShowAddABGModal] = useState(false);
  const [isEditingVent, setIsEditingVent] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [savingVent, setSavingVent] = useState(false);
  const [savingABG, setSavingABG] = useState(false);

  const [supportType, setSupportType] = useState<RespiratorySupportType>(vent.supportType || (vent.mode ? 'Mechanical Ventilation' : 'Room Air'));
  const [oxygenDevice, setOxygenDevice] = useState(vent.oxygenDevice || '');
  const [oxygenFlow, setOxygenFlow] = useState<number | undefined>(vent.oxygenFlow);
  const [mode, setMode] = useState(vent.mode || '');
  const [tidalVolume, setTidalVolume] = useState<number | undefined>(vent.tidalVolume);
  const [rate, setRate] = useState<number | undefined>(vent.respiratoryRate ?? vent.rr);
  const [peep, setPeep] = useState<number | undefined>(vent.peep);
  const [fio2, setFio2] = useState<number | undefined>(vent.fio2);
  const [ppeak, setPpeak] = useState<number | undefined>(vent.peakPressure);
  const [pplat, setPplat] = useState<number | undefined>(vent.plateauPressure);
  const [pressureSupport, setPressureSupport] = useState<number | undefined>(vent.pressureSupport);
  const [inspiratoryPressure, setInspiratoryPressure] = useState<number | undefined>(vent.inspiratoryPressure);
  const [ieRatio, setIeRatio] = useState(vent.ieRatio || '');

  const [newPh, setNewPh] = useState('');
  const [newPaco2, setNewPaco2] = useState('');
  const [newPao2, setNewPao2] = useState('');
  const [newHco3, setNewHco3] = useState('');
  const [newBe, setNewBe] = useState('');
  const [newLactate, setNewLactate] = useState('');
  const [newFio2, setNewFio2] = useState('');

  const drivingPressure = pplat !== undefined && peep !== undefined ? pplat - peep : undefined;
  const staticCompliance = tidalVolume !== undefined && drivingPressure !== undefined && drivingPressure !== 0 ? Math.round(tidalVolume / drivingPressure) : undefined;
  const rsbi = rate !== undefined && tidalVolume !== undefined ? Math.round(rate / Math.max(0.1, tidalVolume / 1000)) : undefined;

  useEffect(() => {
    setSupportType(vent.supportType || (vent.mode ? 'Mechanical Ventilation' : 'Room Air'));
    setOxygenDevice(vent.oxygenDevice || '');
    setOxygenFlow(vent.oxygenFlow);
    setMode(vent.mode || '');
    setTidalVolume(vent.tidalVolume);
    setRate(vent.respiratoryRate ?? vent.rr);
    setPeep(vent.peep);
    setFio2(vent.fio2);
    setPpeak(vent.peakPressure);
    setPplat(vent.plateauPressure);
    setPressureSupport(vent.pressureSupport);
    setInspiratoryPressure(vent.inspiratoryPressure);
    setIeRatio(vent.ieRatio || '');
  }, [patient.id, vent.supportType, vent.oxygenDevice, vent.oxygenFlow, vent.mode, vent.tidalVolume, vent.respiratoryRate, vent.rr, vent.peep, vent.fio2, vent.peakPressure, vent.plateauPressure, vent.pressureSupport, vent.inspiratoryPressure, vent.ieRatio]);

  const beginNewVentRecord = () => {
    if (isPreviousViewer) return;
    setEditingRecordId(null);
    setOxygenDevice('');
    setOxygenFlow(undefined);
    setMode('');
    setTidalVolume(undefined);
    setRate(undefined);
    setPeep(undefined);
    setFio2(undefined);
    setPpeak(undefined);
    setPplat(undefined);
    setPressureSupport(undefined);
    setInspiratoryPressure(undefined);
    setIeRatio('');
    setIsEditingVent(true);
  };

  const editVentRecord = (record: VentilatorRecord) => {
    if (isPreviousViewer) return;
    setEditingRecordId(record.id);
    setSupportType(record.supportType);
    setOxygenDevice(record.oxygenDevice || '');
    setOxygenFlow(record.oxygenFlow);
    setMode(record.mode || '');
    setTidalVolume(record.tidalVolume);
    setRate(record.respiratoryRate);
    setPeep(record.peep);
    setFio2(record.fio2);
    setPpeak(record.peakPressure);
    setPplat(record.plateauPressure);
    setPressureSupport(record.pressureSupport);
    setInspiratoryPressure(record.inspiratoryPressure);
    setIeRatio(record.ieRatio || '');
    setIsEditingVent(true);
    setActiveTab('vent');
  };

  const handleSaveVent = () => {
    if (savingVent || isPreviousViewer) return;
    if (supportType === 'Mechanical Ventilation' && !mode) { showToast('Select a ventilator mode before saving.', 'error'); return; }
    if (supportType === 'Oxygen Therapy' && !oxygenDevice) { showToast('Select an oxygen device before saving.', 'error'); return; }
    setSavingVent(true);
    try {
      const timestamp = new Date().toISOString();
      const nextRecord: VentilatorRecord = {
        id: editingRecordId || `vent-${Date.now()}`,
        timestamp,
        supportType,
        oxygenDevice: supportType === 'Oxygen Therapy' ? oxygenDevice : undefined,
        oxygenFlow: supportType === 'Oxygen Therapy' ? oxygenFlow : undefined,
        mode: supportType === 'Mechanical Ventilation' ? mode : undefined,
        fio2: supportType === 'Room Air' ? undefined : fio2,
        peep: supportType === 'Mechanical Ventilation' ? peep : undefined,
        tidalVolume: supportType === 'Mechanical Ventilation' ? tidalVolume : undefined,
        respiratoryRate: supportType === 'Mechanical Ventilation' ? rate : undefined,
        pressureSupport: supportType === 'Mechanical Ventilation' ? pressureSupport : undefined,
        inspiratoryPressure: supportType === 'Mechanical Ventilation' ? inspiratoryPressure : undefined,
        ieRatio: supportType === 'Mechanical Ventilation' ? ieRatio : undefined,
        peakPressure: supportType === 'Mechanical Ventilation' ? ppeak : undefined,
        plateauPressure: supportType === 'Mechanical Ventilation' ? pplat : undefined,
        compliance: supportType === 'Mechanical Ventilation' ? staticCompliance : undefined,
      };
      const nextHistory = editingRecordId
        ? history.map((record) => record.id === editingRecordId ? nextRecord : record)
        : [nextRecord, ...history];

      updatePatient(patient.id, {
        ventilator: {
          ...vent,
          supportType,
          oxygenDevice: supportType === 'Oxygen Therapy' ? oxygenDevice : undefined,
          oxygenFlow: supportType === 'Oxygen Therapy' ? oxygenFlow : undefined,
          mode: supportType === 'Mechanical Ventilation' ? (mode || undefined) : undefined,
          fio2: supportType === 'Room Air' ? undefined : fio2,
          peep: supportType === 'Mechanical Ventilation' ? peep : undefined,
          tidalVolume: supportType === 'Mechanical Ventilation' ? tidalVolume : undefined,
          rr: supportType === 'Mechanical Ventilation' ? rate : undefined,
          respiratoryRate: supportType === 'Mechanical Ventilation' ? rate : undefined,
          pressureSupport: supportType === 'Mechanical Ventilation' ? pressureSupport : undefined,
          inspiratoryPressure: supportType === 'Mechanical Ventilation' ? inspiratoryPressure : undefined,
          ieRatio: supportType === 'Mechanical Ventilation' ? (ieRatio || undefined) : undefined,
          peakPressure: supportType === 'Mechanical Ventilation' ? ppeak : undefined,
          plateauPressure: supportType === 'Mechanical Ventilation' ? pplat : undefined,
          compliance: supportType === 'Mechanical Ventilation' ? staticCompliance : undefined,
          history: nextHistory,
        },
      });
      setEditingRecordId(null);
      setIsEditingVent(false);
      showToast(editingRecordId ? 'Ventilator record updated.' : 'Respiratory support record saved.', 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Ventilator record could not be saved.'), 'error');
    } finally {
      setSavingVent(false);
    }
  };

  const handleAddABG = (e: React.FormEvent) => {
    e.preventDefault();
    if (savingABG || isPreviousViewer) return;
    setSavingABG(true);
    try {
      const ph = parseExplicitNumber(newPh);
      const paco2 = parseExplicitNumber(newPaco2);
      const pao2 = parseExplicitNumber(newPao2);
      const hco3 = parseExplicitNumber(newHco3);
      const abgFio2 = parseExplicitNumber(newFio2);
      const be = parseExplicitNumber(newBe);
      const lactate = parseExplicitNumber(newLactate);
      if (ph === undefined || paco2 === undefined || pao2 === undefined || hco3 === undefined || abgFio2 === undefined) {
        showToast('Enter pH, PaCO2, PaO2, HCO3 and FiO2 before saving the ABG.', 'error');
        return;
      }
      const abgAnalysis = MedicalCalculators.calculateABG(ph, paco2, hco3, pao2, abgFio2);
      const newRecord: ABGRecord = {
        id: `abg-${Date.now()}`,
        timestamp: new Date().toISOString(),
        ph, paco2, pao2, hco3, fio2: abgFio2, pfRatio: abgAnalysis.pfRatio,
      };
      if (be !== undefined) newRecord.be = be;
      if (lactate !== undefined) newRecord.lactate = lactate;
      updatePatient(patient.id, { ventilator: { ...vent, abgHistory: [newRecord, ...abgs] } });
      setShowAddABGModal(false);
      showToast('New ABG panel recorded.', 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'ABG could not be saved.'), 'error');
    } finally {
      setSavingABG(false);
    }
  };

  const supportLabel = supportType === 'Room Air' ? 'Room Air' : supportType === 'Oxygen Therapy' ? `O₂ • ${oxygenDevice || 'Not documented'} ${oxygenFlow ?? '—'} L/min` : `Mechanical Ventilation • ${mode || 'Not documented'}`;

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><Wind className="w-5 h-5 text-sky-500" /> Respiratory Support & ABG</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Room air, oxygen therapy, mechanical ventilation and longitudinal ABG documentation.</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'vent' ? (
            <button onClick={() => isEditingVent ? handleSaveVent() : beginNewVentRecord()} disabled={savingVent || isPreviousViewer} className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center gap-1.5">
              {savingVent && <Loader2 className="w-4 h-4 animate-spin" />}{isEditingVent ? (editingRecordId ? 'Update Record' : 'Save Record') : 'Add Record'}
            </button>
          ) : (
            <button disabled={isPreviousViewer} onClick={() => { setNewPh(''); setNewPaco2(''); setNewPao2(''); setNewHco3(''); setNewFio2(''); setNewBe(''); setNewLactate(''); setShowAddABGModal(true); }} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"><Plus className="w-4 h-4" /> Log New ABG</button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto">
        <button onClick={() => setActiveTab('vent')} className={`px-4 py-2 rounded-xl text-xs font-bold ${activeTab === 'vent' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>Respiratory Support ({history.length})</button>
        <button onClick={() => setActiveTab('abg')} className={`px-4 py-2 rounded-xl text-xs font-bold ${activeTab === 'abg' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>Arterial Blood Gas Panels ({abgs.length})</button>
      </div>

      {activeTab === 'vent' && (
        <div className="space-y-5">
          {isEditingVent && (
            <div className="bg-white dark:bg-[#111C2E] border border-cyan-500/30 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Respiratory Support
                  <div className="flex flex-wrap gap-1 mt-1 mb-1">{SUPPORT_TYPES.map((s) => <button key={s} type="button" disabled={isPreviousViewer} onClick={() => setSupportType(s)} className={ventChipCls(supportType === s)}>{s}</button>)}</div><select value={supportType} onChange={(e) => setSupportType(e.target.value as RespiratorySupportType)} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm">
                    <option>Room Air</option><option>Oxygen Therapy</option><option>Mechanical Ventilation</option>
                  </select>
                </label>
                {supportType === 'Oxygen Therapy' && (
                  <>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Oxygen Device
                      <div className="flex flex-wrap gap-1 mt-1 mb-1">{OXYGEN_DEVICES.map((d) => <button key={d} type="button" disabled={isPreviousViewer} onClick={() => setOxygenDevice(oxygenDevice === d ? '' : d)} className={ventChipCls(oxygenDevice === d)}>{d}</button>)}</div><select value={oxygenDevice} onChange={(e) => setOxygenDevice(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"><option value="">Select device</option>{OXYGEN_DEVICES.map((device) => <option key={device}>{device}</option>)}</select>
                    </label>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">O₂ Flow (L/min)
                      <input type="number" min="0" step="0.5" value={oxygenFlow ?? ''} onChange={(e) => setOxygenFlow(parseExplicitNumber(e.target.value))} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm" />
                    </label>
                  </>
                )}
                {supportType === 'Mechanical Ventilation' && (
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Ventilator Mode
                    <div className="flex flex-wrap gap-1 mt-1 mb-1">{MODES.map((m) => <button key={m} type="button" disabled={isPreviousViewer} onClick={() => setMode(mode === m ? '' : m)} className={ventChipCls(mode === m)}>{m}</button>)}</div><select value={mode} onChange={(e) => setMode(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"><option value="">Select mode</option>{MODES.map((item) => <option key={item}>{item}</option>)}</select>
                  </label>
                )}
              </div>

              {supportType === 'Mechanical Ventilation' && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      ['Tidal Volume (mL)', tidalVolume, setTidalVolume],
                      ['RR (/min)', rate, setRate],
                      ['PEEP (cmH₂O)', peep, setPeep],
                      ['FiO₂ (%)', fio2, setFio2],
                      ['Pressure Support', pressureSupport, setPressureSupport],
                      ['Inspiratory Pressure', inspiratoryPressure, setInspiratoryPressure],
                      ['Ppeak', ppeak, setPpeak],
                      ['Pplat', pplat, setPplat],
                    ].map(([label, value, setter]) => (
                      <label key={String(label)} className="text-xs font-semibold text-slate-600 dark:text-slate-300">{String(label)}
                        <input type="number" value={(value as number | undefined) ?? ''} onChange={(e) => (setter as (value: number | undefined) => void)(parseExplicitNumber(e.target.value))} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm" />
                      </label>
                    ))}
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">I:E Ratio
                      <input value={ieRatio} onChange={(e) => setIeRatio(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm" />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20"><span className="text-[10px] text-slate-400 block">Driving Pressure</span><b className="text-sm">{drivingPressure ?? '—'} cmH₂O</b></div>
                    <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20"><span className="text-[10px] text-slate-400 block">Static Compliance</span><b className="text-sm">{staticCompliance ?? '—'} mL/cmH₂O</b></div>
                    <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20"><span className="text-[10px] text-slate-400 block">RSBI</span><b className="text-sm">{rsbi ?? '—'}</b></div>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div><h3 className="text-sm font-bold">Current Respiratory Support</h3><p className="text-xs text-slate-400 mt-1">{history.length ? supportLabel : 'Not documented'}</p></div>
              {history.length>0&&<span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/30">{supportType === 'Mechanical Ventilation' ? mode : supportType}</span>}
            </div>
            {history.length===0 ? <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 p-4 text-sm font-bold text-slate-500 dark:text-slate-400">Not documented</div> : <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60"><span className="text-[10px] text-slate-400 block">FiO₂</span><b>{vent.fio2 !== undefined ? `${vent.fio2}%` : '—'}</b></div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60"><span className="text-[10px] text-slate-400 block">PEEP</span><b>{vent.peep !== undefined ? vent.peep : '—'}</b></div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60"><span className="text-[10px] text-slate-400 block">Tidal Volume</span><b>{vent.tidalVolume !== undefined ? vent.tidalVolume : '—'}</b></div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60"><span className="text-[10px] text-slate-400 block">RR</span><b>{vent.respiratoryRate ?? vent.rr ?? '—'}</b></div>
            </div>}
          </div>

          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3"><h3 className="text-sm font-bold">Respiratory Support History</h3><span className="text-[10px] text-slate-400">{history.length} records</span></div>
            {history.length ? <div className="space-y-2">{history.map((record) => (
              <div key={record.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                <div className="min-w-0"><div className="text-xs font-bold text-slate-900 dark:text-white">{record.supportType}{record.mode ? ` • ${record.mode}` : ''}</div><div className="text-[10px] text-slate-400 mt-1">{new Date(record.timestamp).toLocaleString()} {record.oxygenDevice ? `• ${record.oxygenDevice} ${record.oxygenFlow || ''} L/min` : ''}</div></div>
                <button type="button" disabled={isPreviousViewer} onClick={() => editVentRecord(record)} className="shrink-0 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-cyan-600" title="Edit record"><Edit2 className="w-4 h-4" /></button>
              </div>
            ))}</div> : <div className="text-xs text-slate-400 border border-dashed rounded-xl p-5 text-center">No respiratory support records yet. Add the first record above.</div>}
          </div>
        </div>
      )}

      {activeTab === 'abg' && (
        <div className="space-y-4">
          {latestABG && <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm"><div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800"><span className="text-xs font-bold">Latest ABG ({formatAbgTimestamp(latestABG.timestamp)})</span><span className="text-xs font-bold px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-500 border border-cyan-500/30">P/F Ratio: {latestABG.pfRatio ?? '—'}</span></div></div>}
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm"><div className="overflow-x-auto"><table className="w-full text-left text-xs text-slate-700 dark:text-slate-300"><thead className="bg-slate-50 dark:bg-slate-900/70 text-slate-400 uppercase text-[10px] tracking-wider"><tr>{['Time','pH','PaCO₂','PaO₂','HCO₃⁻','BE','Lactate','FiO₂','P/F Ratio'].map((h)=><th key={h} className="py-2.5 px-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{abgs.map((a)=><tr key={a.id}><td className="py-2.5 px-3 font-mono">{formatAbgTimestamp(a.timestamp)}</td><td className="py-2.5 px-3 font-bold">{a.ph ?? '—'}</td><td className="py-2.5 px-3">{a.paco2 ?? '—'}</td><td className="py-2.5 px-3">{a.pao2 ?? '—'}</td><td className="py-2.5 px-3">{a.hco3 ?? '—'}</td><td className="py-2.5 px-3">{a.be ?? a.baseExcess ?? '—'}</td><td className="py-2.5 px-3">{a.lactate ?? '—'}</td><td className="py-2.5 px-3">{a.fio2 ? `${a.fio2}%` : '—'}</td><td className="py-2.5 px-3 font-bold">{a.pfRatio ?? '—'}</td></tr>)}</tbody></table></div></div>
        </div>
      )}

      {showAddABGModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold">Log Arterial Blood Gas (ABG)</h3>
            <form onSubmit={handleAddABG} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['pH', newPh, setNewPh, '0.01'],
                  ['PaCO₂ (mmHg)', newPaco2, setNewPaco2, '1'],
                  ['PaO₂ (mmHg)', newPao2, setNewPao2, '1'],
                  ['HCO₃⁻ (mEq/L)', newHco3, setNewHco3, '1'],
                  ['FiO₂ (%)', newFio2, setNewFio2, '1'],
                  ['Base Excess', newBe, setNewBe, '1'],
                  ['Lactate (mmol/L)', newLactate, setNewLactate, '0.1'],
                ].map(([label,value,setter,step]) => <label key={String(label)} className="text-xs font-semibold text-slate-700 dark:text-slate-300">{String(label)}<input type="number" step={String(step)} value={String(value)} onChange={(e)=>(setter as (s:string)=>void)(e.target.value)} placeholder="—" className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" /></label>)}
              </div>
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowAddABGModal(false)} className="px-4 py-2 text-xs text-slate-500">Cancel</button><button type="submit" disabled={savingABG} className="px-5 py-2 rounded-xl bg-cyan-500 disabled:opacity-40 text-slate-950 text-xs font-bold flex items-center gap-2">{savingABG && <Loader2 className="w-4 h-4 animate-spin" />} {savingABG ? 'Saving…' : 'Save ABG'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
