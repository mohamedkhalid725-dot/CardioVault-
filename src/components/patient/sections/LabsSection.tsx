import React, { useState } from 'react';
import {
  FlaskConical,
  Plus,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Filter,
} from 'lucide-react';
import { Patient, LabResult } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';

interface LabsSectionProps {
  patient: Patient;
}

export const LabsSection: React.FC<LabsSectionProps> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showAddModal, setShowAddModal] = useState(false);

  // New Lab state
  const [panelName, setPanelName] = useState('CBC');
  const [testName, setTestName] = useState('Hemoglobin');
  const [testValue, setTestValue] = useState(13.8);
  const [testUnit, setTestUnit] = useState('g/dL');
  const [refMin, setRefMin] = useState(13.0);
  const [refMax, setRefMax] = useState(17.5);

  const labs = patient.labResults || [];

  const categories = ['All', 'CBC', 'Chemistry', 'Coagulation', 'Inflammatory', 'Cardiac'];

  const filteredLabs =
    selectedCategory === 'All'
      ? labs
      : labs.filter((l) => l.panel.toLowerCase() === selectedCategory.toLowerCase());

  const handleAddLab = (e: React.FormEvent) => {
    e.preventDefault();
    let flag: LabResult['flag'] = 'Normal';
    if (testValue > refMax) flag = 'High';
    if (testValue < refMin) flag = 'Low';

    const newLab: LabResult = {
      id: `lab-${Date.now()}`,
      panel: panelName,
      testName,
      value: testValue,
      unit: testUnit,
      referenceRange: `${refMin} - ${refMax}`,
      flag,
      timestamp: `${new Date().toISOString().split('T')[0]} ${new Date().toTimeString().slice(0, 5)}`,
    };

    updatePatient(patient.id, { labResults: [newLab, ...labs] });
    setShowAddModal(false);
    showToast('Lab result logged', 'success');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-cyan-500" /> Laboratory Diagnostics & Serial Panels
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            CBC, Comprehensive Metabolic Panel (BMP/CMP), Coagulation profile, & Inflammatory biomarkers
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Log Lab Result
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Labs Table */}
      <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/70 text-slate-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Panel</th>
                <th className="py-2.5 px-3">Test Name</th>
                <th className="py-2.5 px-3">Result</th>
                <th className="py-2.5 px-3">Ref Range</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLabs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 font-mono text-slate-400">{l.timestamp}</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-semibold text-[10px] text-slate-600 dark:text-slate-300">
                      {l.panel}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                    {l.testName}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`font-extrabold text-sm ${
                        l.flag === 'High'
                          ? 'text-rose-500'
                          : l.flag === 'Low'
                          ? 'text-sky-500'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {l.value} {l.unit}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 font-mono">
                    {l.referenceRange} {l.unit}
                  </td>
                  <td className="py-2.5 px-3">
                    {l.flag === 'High' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-500 border border-rose-500/30">
                        ▲ HIGH
                      </span>
                    ) : l.flag === 'Low' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-500 border border-sky-500/30">
                        ▼ LOW
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500">
                        NORMAL
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Lab Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Log Laboratory Result
            </h3>

            <form onSubmit={handleAddLab} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Panel
                  </label>
                  <select
                    value={panelName}
                    onChange={(e) => setPanelName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  >
                    <option value="CBC">Complete Blood Count (CBC)</option>
                    <option value="Chemistry">Chemistry (BMP/CMP)</option>
                    <option value="Coagulation">Coagulation Profile</option>
                    <option value="Inflammatory">Inflammatory Markers</option>
                    <option value="Cardiac">Cardiac Biomarkers</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Test Name
                  </label>
                  <input
                    type="text"
                    required
                    value={testName}
                    onChange={(e) => setTestName(e.target.value)}
                    placeholder="e.g. Creatinine, Troponin"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Observed Value
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={testValue}
                    onChange={(e) => setTestValue(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    required
                    value={testUnit}
                    onChange={(e) => setTestUnit(e.target.value)}
                    placeholder="e.g. mg/dL, mmol/L"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Ref Range Min
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={refMin}
                    onChange={(e) => setRefMin(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Ref Range Max
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={refMax}
                    onChange={(e) => setRefMax(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition-colors"
                >
                  Save Result
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
