import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Search,
  Plus,
  Calendar,
  User,
  Star,
  Copy,
  Archive,
  AlertTriangle,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  ExternalLink,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  HeartPulse,
  Flame,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  ComprehensiveProtocolService,
  DetailedProtocol,
} from '../../services/comprehensiveProtocols';
import { AuditTrailService } from '../../services/auditTrailService';

type TabCategory = 'All' | 'Cardiology & ACS' | 'Critical Care & Respiratory' | 'Hemodynamics & Shock' | 'Electrolytes & Metabolic' | 'Neurological Emergencies' | 'Infection & Sepsis' | 'Procedures & Emergencies' | 'Anticoagulation / Antiplatelet' | 'Personal' | 'Favorites';\nconst protocolCategory=(p:DetailedProtocol):TabCategory=>{const t=(p.title+' '+p.content).toLowerCase();if(/stemi|nstemi|acute coronary|acs|arrhythmia|atrial fibrillation|heart failure|cardiology/.test(t))return 'Cardiology & ACS';if(/ventilat|ards|respiratory failure|niv|weaning|icu|critical care/.test(t))return 'Critical Care & Respiratory';if(/shock|vasopressor|inotrope|hemodynamic/.test(t))return 'Hemodynamics & Shock';if(/hyperkal|hypokal|hyponat|hypernat|acid-base|electrolyte/.test(t))return 'Electrolytes & Metabolic';if(/stroke|seizure|neurolog|consciousness/.test(t))return 'Neurological Emergencies';if(/sepsis|infection|antibiotic/.test(t))return 'Infection & Sepsis';if(/cpr|acls|airway|central line|arterial line|procedure/.test(t))return 'Procedures & Emergencies';if(/heparin|antiplatelet|anticoag|reversal|doac/.test(t))return 'Anticoagulation / Antiplatelet';if(p.category==='Cardiology')return 'Cardiology & ACS';if(p.category==='ICU / Critical Care')return 'Critical Care & Respiratory';return 'Procedures & Emergencies';};

export const ProtocolLibraryView: React.FC = () => {
  const { currentUser, showToast } = useApp();

  const [activeTab, setActiveTab] = useState<TabCategory>('All');
  const [search, setSearch] = useState('');
  const [officialProtocols, setOfficialProtocols] = useState<DetailedProtocol[]>([]);
  const [personalProtocols, setPersonalProtocols] = useState<DetailedProtocol[]>([]);
  const [selectedProtocol, setSelectedProtocol] = useState<DetailedProtocol | null>(null);

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Form states for personal protocols
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<'Cardiology' | 'ICU / Critical Care' | 'Emergency'>('Cardiology');
  const [formGuideline, setFormGuideline] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formKeySteps, setFormKeySteps] = useState('');
  const [formSafetyNotes, setFormSafetyNotes] = useState('');
  const [formContraindications, setFormContraindications] = useState('');
  const [formEscalation, setFormEscalation] = useState('');

  const loadData = () => {
    const off = ComprehensiveProtocolService.getOfficialProtocols();
    const pers = ComprehensiveProtocolService.getPersonalProtocols();
    setOfficialProtocols(off);
    setPersonalProtocols(pers);
    if (!selectedProtocol && off.length > 0) {
      setSelectedProtocol(off[0]);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const allProtocols = [...officialProtocols, ...personalProtocols];

  const filtered = allProtocols.filter(p => {
    if (activeTab === 'Personal' && !p.isPersonal) return false;
    if (activeTab === 'Favorites' && !ComprehensiveProtocolService.isFavorite(p.id)) return false;
    if (activeTab !== 'All' && activeTab !== 'Personal' && activeTab !== 'Favorites' && protocolCategory(p) !== activeTab) {
      return false;
    }

    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      p.title.toLowerCase().includes(query) ||
      (p.category+' '+protocolCategory(p)).toLowerCase().includes(query) ||
      p.content.toLowerCase().includes(query) ||
      p.sourceGuideline.toLowerCase().includes(query) ||
      p.keySteps.some(s => s.toLowerCase().includes(query))
    );
  });

  const handleCreatePersonal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showToast('Please specify a protocol title.', 'warning');
      return;
    }

    const steps = formKeySteps.split('\n').map(s => s.trim()).filter(Boolean);
    const safety = formSafetyNotes.split('\n').map(s => s.trim()).filter(Boolean);
    const contra = formContraindications.split('\n').map(s => s.trim()).filter(Boolean);
    const esc = formEscalation.split('\n').map(s => s.trim()).filter(Boolean);

    const created = ComprehensiveProtocolService.addPersonalProtocol({
      title: formTitle.trim(),
      category: formCategory,
      version: '1.0',
      author: currentUser.name,
      lastUpdated: new Date().toISOString().split('T')[0],
      departmentId: currentUser.departmentId,
      content: formContent.trim() || formTitle.trim(),
      sourceGuideline: formGuideline.trim() || 'Personal Clinical Practice Notes',
      keySteps: steps.length ? steps : ['Step 1: Clinical assessment'],
      safetyNotes: safety,
      contraindications: contra,
      escalationCriteria: esc,
      references: ['CardioVault Personal Protocol'],
      isFavorite: false,
      isArchived: false,
    });

    loadData();
    setSelectedProtocol(created);
    setIsNewModalOpen(false);
    resetForm();
    showToast('Personal clinical protocol created.', 'success');

    AuditTrailService.logAction({
      userId: currentUser.userId,
      userName: currentUser.name,
      role: currentUser.role,
      action: `Created Personal Protocol: ${created.title}`,
      departmentId: currentUser.departmentId,
    });
  };

  const handleDuplicate = (proto: DetailedProtocol) => {
    const copy = ComprehensiveProtocolService.duplicateAsPersonal(proto, currentUser.name);
    loadData();
    setSelectedProtocol(copy);
    showToast(`Created personal copy of "${proto.title}".`, 'success');
  };

  const handleToggleFav = (id: string) => {
    ComprehensiveProtocolService.toggleFavorite(id);
    loadData();
    if (selectedProtocol && selectedProtocol.id === id) {
      setSelectedProtocol({ ...selectedProtocol, isFavorite: !ComprehensiveProtocolService.isFavorite(id) });
    }
  };

  const handleDeletePersonal = (id: string) => {
    if (confirm('Delete this personal protocol?')) {
      ComprehensiveProtocolService.deletePersonalProtocol(id);
      loadData();
      if (selectedProtocol?.id === id) {
        setSelectedProtocol(officialProtocols[0] || null);
      }
      showToast('Personal protocol deleted.', 'info');
    }
  };

  const resetForm = () => {
    setFormTitle('');
    setFormCategory('Cardiology');
    setFormGuideline('');
    setFormContent('');
    setFormKeySteps('');
    setFormSafetyNotes('');
    setFormContraindications('');
    setFormEscalation('');
  };

  return (
    <div className="max-w-6xl mx-auto w-full px-3 sm:px-6 py-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-cyan-500 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            Clinical Governance & Practice Library
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
            Protocol & Pathway Library
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Hospital-approved acute cardiology, ICU, and resuscitation guidelines
          </p>
        </div>

        <button
          onClick={() => {
            resetForm();
            setIsNewModalOpen(true);
          }}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition shadow-md shadow-cyan-500/20 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Create Personal Protocol
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2">
        {(['All', 'Cardiology & ACS', 'Critical Care & Respiratory', 'Hemodynamics & Shock', 'Electrolytes & Metabolic', 'Neurological Emergencies', 'Infection & Sepsis', 'Procedures & Emergencies', 'Anticoagulation / Antiplatelet', 'Personal', 'Favorites'] as TabCategory[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === tab
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            {tab === 'Cardiology' && <HeartPulse className="w-3.5 h-3.5" />}
            {tab === 'ICU / Critical Care' && <Flame className="w-3.5 h-3.5" />}
            {tab === 'Emergency' && <Zap className="w-3.5 h-3.5" />}
            {tab === 'Personal' && <User className="w-3.5 h-3.5" />}
            {tab === 'Favorites' && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
            <span>{tab}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search protocols by diagnosis, guidelines, medications, or key steps..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-cyan-500"
        />
      </div>

      {/* Main Grid: List & Selected Detail */}
      <div className="grid lg:grid-cols-12 gap-5">
        {/* Left List */}
        <div className="lg:col-span-5 space-y-2 max-h-[75vh] overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              No clinical protocols match your filter criteria.
            </div>
          ) : (
            filtered.map(p => {
              const active = selectedProtocol?.id === p.id;
              const isFav = ComprehensiveProtocolService.isFavorite(p.id);

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProtocol(p)}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition relative group ${
                    active
                      ? 'border-cyan-500 bg-cyan-500/10 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {p.isPersonal ? (
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-500 border border-amber-500/30">
                          Personal Protocol
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
                          Official Department Policy
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 font-mono">v{p.version}</span>
                    </div>

                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleToggleFav(p.id);
                      }}
                      className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                    >
                      <Star className={`w-3.5 h-3.5 ${isFav ? 'text-amber-400 fill-amber-400' : ''}`} />
                    </button>
                  </div>

                  <div className="text-xs font-bold text-slate-900 dark:text-white mt-1.5">
                    {p.title}
                  </div>

                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                    {p.sourceGuideline}
                  </div>

                  <div className="text-[10px] text-slate-400 mt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-1.5">
                    <span>Reviewed: {p.lastUpdated}</span>
                    <span className="text-cyan-500 flex items-center gap-0.5 font-bold">
                      View details <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Detail Panel */}
        <div className="lg:col-span-7">
          {selectedProtocol ? (
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              {/* Detail Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    {selectedProtocol.isPersonal ? (
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-500 border border-amber-500/40">
                        PERSONAL CLINICAL PROTOCOL (Not Official Policy)
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-500 border border-emerald-500/40 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        OFFICIAL DEPARTMENT PROTOCOL
                      </span>
                    )}
                    <span className="text-xs font-mono text-slate-400">v{selectedProtocol.version}</span>
                  </div>

                  <h2 className="text-lg font-black text-slate-900 dark:text-white">
                    {selectedProtocol.title}
                  </h2>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Guideline / Source: <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedProtocol.sourceGuideline}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDuplicate(selectedProtocol)}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1"
                    title="Duplicate as Personal Protocol"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span className="text-[11px] hidden sm:inline">Duplicate</span>
                  </button>

                  {selectedProtocol.isPersonal && (
                    <button
                      onClick={() => handleDeletePersonal(selectedProtocol.id)}
                      className="p-2 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 text-xs font-semibold"
                      title="Delete Personal Protocol"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Metadata row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Category</div>
                  <div className="font-bold text-slate-800 dark:text-slate-200">{protocolCategory(selectedProtocol)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Author / Governance</div>
                  <div className="font-semibold text-slate-700 dark:text-slate-300 truncate">{selectedProtocol.author}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Last Reviewed</div>
                  <div className="text-slate-700 dark:text-slate-300">{selectedProtocol.lastUpdated}</div>
                </div>
              </div>

              {/* Key Steps */}
              {selectedProtocol.keySteps && selectedProtocol.keySteps.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-black uppercase tracking-wider text-cyan-500 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Standard Protocol Steps & Actions
                  </div>
                  <div className="space-y-1.5">
                    {selectedProtocol.keySteps.map((step, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 flex items-start gap-2"
                      >
                        <span className="w-5 h-5 rounded-md bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="leading-relaxed">{step}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Safety Notes */}
              {selectedProtocol.safetyNotes && selectedProtocol.safetyNotes.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Safety Notes & Precautions
                  </div>
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-300 space-y-1">
                    {selectedProtocol.safetyNotes.map((note, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-amber-500 font-bold">•</span>
                        <span>{note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Contraindications */}
              {selectedProtocol.contraindications && selectedProtocol.contraindications.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-black uppercase tracking-wider text-rose-500 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Contraindications
                  </div>
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-900 dark:text-rose-300 space-y-1">
                    {selectedProtocol.contraindications.map((c, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-rose-500 font-bold">•</span>
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Escalation Criteria */}
              {selectedProtocol.escalationCriteria && selectedProtocol.escalationCriteria.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-black uppercase tracking-wider text-indigo-500 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" />
                    Escalation Criteria & Rescue Strategies
                  </div>
                  <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-900 dark:text-indigo-300 space-y-1">
                    {selectedProtocol.escalationCriteria.map((esc, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-indigo-500 font-bold">•</span>
                        <span>{esc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* References */}
              {selectedProtocol.references && selectedProtocol.references.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
                  <span className="font-bold">References: </span>
                  {selectedProtocol.references.join('; ')}
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              Select a protocol to view full clinical details.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create Personal Protocol */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Create Personal Clinical Protocol
                </h3>
                <p className="text-[11px] text-amber-500 font-semibold">
                  Personal protocols are clearly marked as personal practice guides.
                </p>
              </div>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePersonal} className="p-4 space-y-3 overflow-y-auto flex-1 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Protocol Title *
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="e.g. Bedside Post-Arrest Targeted Temperature Protocol"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-cyan-500"
                  >
                    <option value="Cardiology">Cardiology</option>
                    <option value="ICU / Critical Care">ICU / Critical Care</option>
                    <option value="Emergency">Emergency</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Source Guideline / Basis
                  </label>
                  <input
                    type="text"
                    value={formGuideline}
                    onChange={e => setFormGuideline(e.target.value)}
                    placeholder="e.g. AHA 2024 / Personal Practice"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Key Steps (One step per line)
                </label>
                <textarea
                  rows={4}
                  value={formKeySteps}
                  onChange={e => setFormKeySteps(e.target.value)}
                  placeholder="Step 1: Check baseline vitals...&#10;Step 2: Administer bolus...&#10;Step 3: Monitor telemetry..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Safety Notes & Warnings (One per line)
                </label>
                <textarea
                  rows={2}
                  value={formSafetyNotes}
                  onChange={e => setFormSafetyNotes(e.target.value)}
                  placeholder="Check serum potassium before infusing..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Escalation Criteria
                </label>
                <textarea
                  rows={2}
                  value={formEscalation}
                  onChange={e => setFormEscalation(e.target.value)}
                  placeholder="Call critical care fellow if SBP < 90 despite..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold"
                >
                  Save Personal Protocol
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
