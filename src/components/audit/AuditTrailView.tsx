import React, { useState } from 'react';
import { ShieldCheck, Lock, Search, AlertCircle, History, Clock, FileCheck } from 'lucide-react';
import { AuditTrailService, AuditEntry } from '../../services/auditTrailService';
import { ClinicalCorrection } from '../../types/clinical';

export const AuditTrailView: React.FC = () => {
  const [tab, setTab] = useState<'events' | 'corrections'>('events');
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>(() => AuditTrailService.getLogs());
  const [corrections, setCorrections] = useState<ClinicalCorrection[]>(() =>
    AuditTrailService.getCorrections()
  );
  const [search, setSearch] = useState('');

  const filteredLogs = auditLogs.filter(
    l =>
      l.userName.toLowerCase().includes(search.toLowerCase()) ||
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      (l.patientName && l.patientName.toLowerCase().includes(search.toLowerCase())) ||
      (l.reason && l.reason.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredCorrections = corrections.filter(
    c =>
      c.user.toLowerCase().includes(search.toLowerCase()) ||
      c.fieldName.toLowerCase().includes(search.toLowerCase()) ||
      c.reason.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto w-full px-3 sm:px-6 py-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-rose-500">
            Clinical Governance & Medico-Legal Security
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
            Audit Trail & Corrections Registry
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Immutable, non-repudiable audit logs of clinical actions, break-glass events, and record modifications
          </p>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold">
          <Lock className="w-3.5 h-3.5 text-emerald-500" />
          <span>Immutable Ledger</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab('events')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              tab === 'events'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            System Audit Events ({auditLogs.length})
          </button>
          <button
            onClick={() => setTab('corrections')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              tab === 'corrections'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileCheck className="w-4 h-4" />
            Clinical Corrections ({corrections.length})
          </button>
        </div>

        <div className="relative w-64 hidden sm:block">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search audit trail..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Notice */}
      <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
        <span>
          In compliance with hospital clinical governance standards, previous records are never overwritten. When errors are amended, the original entry remains preserved and the correction is registered with clinician identification, timestamp, and mandatory clinical rationale.
        </span>
      </div>

      {/* Tab Content */}
      {tab === 'events' ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredLogs.map(log => (
              <div key={log.id} className="p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                        log.action.includes('Break-Glass')
                          ? 'bg-rose-500/10 text-rose-500 border border-rose-500/30'
                          : 'bg-cyan-500/10 text-cyan-500'
                      }`}
                    >
                      {log.role.replace('_', ' ')}
                    </span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {log.userName}
                    </span>
                    <span className="text-xs text-slate-500">— {log.action}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(log.timestamp).toLocaleString()}
                  </div>
                </div>

                {(log.patientName || log.reason) && (
                  <div className="mt-2 text-xs bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60 space-y-1">
                    {log.patientName && (
                      <div className="text-slate-600 dark:text-slate-300">
                        <strong>Patient:</strong> {log.patientName} (ID: {log.patientId})
                      </div>
                    )}
                    {log.reason && (
                      <div className="text-slate-500 dark:text-slate-400">
                        <strong>Documented Rationale:</strong> {log.reason}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          {filteredCorrections.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No clinical corrections recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredCorrections.map(c => (
                <div key={c.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      Field: <span className="text-cyan-500 uppercase">{c.fieldName}</span> ({c.recordType})
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {new Date(c.timestamp).toLocaleString()}
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40">
                      <div className="text-[10px] font-bold uppercase text-rose-500">Previous Value</div>
                      <div className="text-slate-800 dark:text-slate-200 mt-0.5 line-through">
                        {String(c.originalValue)}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40">
                      <div className="text-[10px] font-bold uppercase text-emerald-500">Corrected Value</div>
                      <div className="text-slate-800 dark:text-slate-200 mt-0.5 font-semibold">
                        {String(c.correctedValue)}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    <strong>Correction by:</strong> {c.user} • <strong>Clinical Reason:</strong>{' '}
                    {c.reason}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
