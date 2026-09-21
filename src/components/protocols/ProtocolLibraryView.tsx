import React, { useState } from 'react';
import { BookOpen, Search, Plus, Calendar, User, FileText, ChevronRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ClinicalWorkflowService } from '../../services/clinicalWorkflowService';
import { ClinicalProtocol } from '../../types/clinical';

export const ProtocolLibraryView: React.FC = () => {
  const { currentUser, showToast } = useApp();
  const [protocols, setProtocols] = useState<ClinicalProtocol[]>(() =>
    ClinicalWorkflowService.getProtocols()
  );
  const [search, setSearch] = useState('');
  const [selectedProtocol, setSelectedProtocol] = useState<ClinicalProtocol | null>(
    protocols[0] || null
  );
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Cardiology');
  const [newContent, setNewContent] = useState('');

  const filtered = protocols.filter(
    p =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()) ||
      p.content.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddProtocol = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    const newP: ClinicalProtocol = {
      id: `proto-${Date.now()}`,
      title: newTitle.trim(),
      category: newCategory.trim(),
      content: newContent.trim(),
      version: '1.0',
      author: currentUser.name,
      lastUpdated: new Date().toISOString().split('T')[0],
      departmentId: 'dept-cardiology',
    };

    const updated = [newP, ...protocols];
    setProtocols(updated);
    ClinicalWorkflowService.saveProtocols(updated);
    setSelectedProtocol(newP);
    setIsNewModalOpen(false);
    setNewTitle('');
    setNewContent('');
    showToast('Protocol added to library', 'success');
  };

  return (
    <div className="max-w-6xl mx-auto w-full px-3 sm:px-6 py-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-cyan-500">
            Clinical Governance Library
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
            Cardiology Protocol Library
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Department-approved acute pathways, drug titration rules, and clinical guidelines
          </p>
        </div>

        {currentUser.role !== 'viewer' && currentUser.role !== 'nurse' && (
          <button
            onClick={() => setIsNewModalOpen(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition shadow-md shadow-cyan-500/20"
          >
            <Plus className="w-4 h-4" />
            New Protocol
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clinical protocols by title, diagnosis, or medication..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* List */}
        <div className="space-y-2 lg:col-span-1">
          {filtered.map(p => {
            const active = selectedProtocol?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedProtocol(p)}
                className={`w-full text-left p-3.5 rounded-2xl border transition ${
                  active
                    ? 'border-cyan-500 bg-cyan-500/5'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-cyan-500">
                    {p.category}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">v{p.version}</span>
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-white mt-1">
                  {p.title}
                </div>
                <div className="text-[10px] text-slate-400 mt-2 flex items-center justify-between">
                  <span>Updated {p.lastUpdated}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Content Viewer */}
        <div className="lg:col-span-2">
          {selectedProtocol ? (
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-cyan-500/10 text-cyan-500">
                    {selectedProtocol.category}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    Version {selectedProtocol.version}
                  </span>
                </div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white mt-2">
                  {selectedProtocol.title}
                </h2>
                <div className="text-xs text-slate-400 mt-1 flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5" /> {selectedProtocol.author}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> Effective: {selectedProtocol.lastUpdated}
                  </span>
                </div>
              </div>

              <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line font-sans">
                {selectedProtocol.content}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              Select a protocol to view guidelines.
            </div>
          )}
        </div>
      </div>

      {/* New Protocol Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Add Clinical Protocol</h3>
            <form onSubmit={handleAddProtocol} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Protocol Title *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="e.g. Cardiorenal Syndrome Management"
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  required
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Protocol Content & Pathway Steps *
                </label>
                <textarea
                  rows={8}
                  required
                  value={newContent}
                  onChange={e => setNewContent(e.target.value)}
                  placeholder="1. Step one..."
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-cyan-500 text-slate-950 rounded-xl hover:bg-cyan-400 shadow-md shadow-cyan-500/20"
                >
                  Publish Protocol
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
