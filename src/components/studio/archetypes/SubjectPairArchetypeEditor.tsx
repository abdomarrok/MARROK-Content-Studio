import React from 'react';
import { ArrowRight, ArrowLeftRight, ShieldCheck, Type, Sparkles } from 'lucide-react';
import { SlideData, SubjectPairConfig } from '../../../types.ts';
import { listBundledTechIcons } from '../../../lib/bundledTechSvgs.ts';

export interface SubjectPairArchetypeEditorProps {
  currentSlide: SlideData;
  smart?: {
    subjectPair?: SubjectPairConfig;
  };
  onUpdateField: (field: keyof SlideData, value: any) => void;
}

export const SubjectPairArchetypeEditor: React.FC<SubjectPairArchetypeEditorProps> = ({
  currentSlide,
  smart,
  onUpdateField,
}) => {
  const bundledIcons = React.useMemo(() => listBundledTechIcons(), []);

  const pair: SubjectPairConfig = currentSlide.subjectPair || smart?.subjectPair || {
    beforeSystem: '',
    afterSystem: '',
    beforeLogoKey: undefined,
    afterLogoKey: undefined,
    beforeAsText: false,
    afterAsText: false,
    storyOwner: '',
    storyOwnerMode: 'text',
    beforeLabel: 'BEFORE',
    afterLabel: 'AFTER',
    colorMode: 'official',
    logoWidthPct: 11,
    creativeMotif: 'stream-flow',
    flowLabel: '',
  };

  const updatePair = (updates: Partial<SubjectPairConfig>) => {
    onUpdateField('subjectPair', {
      ...pair,
      ...updates,
    });
  };

  const isMissingRealBrands =
    !pair.beforeSystem?.trim() || !pair.afterSystem?.trim();

  return (
    <div className="pt-3 border-t border-white/[0.08] animate-fade-in space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-white flex items-center gap-1.5">
          <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400" />
          <span>Subject Pair: Migration / Before → After</span>
        </span>
        <span className="text-[10px] font-mono text-cyan-400/90 bg-cyan-950/40 border border-cyan-800/40 px-2 py-0.5 rounded-full flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" />
          Max 2 Logos · ≤14% Width
        </span>
      </div>
      {isMissingRealBrands && (
        <div className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200">
          Enter both real system names below. While empty, the canvas falls back to a topic-matched Mechanism diagram and Checks will block export.
        </div>
      )}

      {/* Story Owner text wordmark */}
      <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
            <Type className="w-3 h-3 text-cyan-400" />
            Story Owner Wordmark (Styled Text)
          </label>
          <span className="text-[10px] text-slate-400">Allocated as text to preserve 2-logo limit</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={pair.storyOwner || ''}
            onChange={(e) => updatePair({ storyOwner: e.target.value })}
            placeholder="e.g. Discord, Uber, Netflix"
            className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 font-medium"
          />
          <input
            type="text"
            value={pair.flowLabel || ''}
            onChange={(e) => updatePair({ flowLabel: e.target.value })}
            placeholder="e.g. CHAT WORKLOAD → COMPACTED SHARDS"
            className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-slate-300 placeholder-slate-500 font-mono text-[11px]"
          />
        </div>
      </div>

      {/* Before & After Systems */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* BEFORE BOX */}
        <div className="p-2.5 rounded-xl bg-slate-900/40 border border-slate-700/50 space-y-2">
          <div className="flex items-center justify-between">
            <input
              type="text"
              value={pair.beforeLabel || 'BEFORE'}
              onChange={(e) => updatePair({ beforeLabel: e.target.value.toUpperCase() })}
              className="bg-transparent text-[10px] font-mono font-bold text-slate-400 uppercase w-20 px-1 py-0.5 border border-transparent hover:border-white/10 rounded"
            />
            <label className="text-[10px] text-slate-400 flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(pair.beforeAsText)}
                onChange={(e) => updatePair({ beforeAsText: e.target.checked })}
                className="rounded border-slate-600 bg-black/60 text-cyan-500 text-[10px]"
              />
              Text Only
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 block">System Name</label>
            <input
              type="text"
              value={pair.beforeSystem || ''}
              onChange={(e) => updatePair({ beforeSystem: e.target.value })}
              placeholder="e.g. Cassandra"
              className="w-full bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-white font-medium"
            />
          </div>

          {!pair.beforeAsText && (
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 block">Official Bundled Logo</label>
              <select
                value={pair.beforeLogoKey || ''}
                onChange={(e) => updatePair({ beforeLogoKey: e.target.value || undefined })}
                className="w-full bg-black/80 border border-white/10 rounded-lg px-2 py-1 text-xs text-white"
              >
                <option value="">(None / Styled Text Fallback)</option>
                {bundledIcons.map((icon) => (
                  <option key={`before-${icon.slug}`} value={icon.slug}>
                    {icon.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* AFTER BOX */}
        <div className="p-2.5 rounded-xl bg-cyan-950/20 border border-cyan-500/30 space-y-2">
          <div className="flex items-center justify-between">
            <input
              type="text"
              value={pair.afterLabel || 'AFTER'}
              onChange={(e) => updatePair({ afterLabel: e.target.value.toUpperCase() })}
              className="bg-transparent text-[10px] font-mono font-bold text-cyan-400 uppercase w-20 px-1 py-0.5 border border-transparent hover:border-white/10 rounded"
            />
            <label className="text-[10px] text-slate-400 flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(pair.afterAsText)}
                onChange={(e) => updatePair({ afterAsText: e.target.checked })}
                className="rounded border-slate-600 bg-black/60 text-cyan-500 text-[10px]"
              />
              Text Only
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 block">Target System Name</label>
            <input
              type="text"
              value={pair.afterSystem || ''}
              onChange={(e) => updatePair({ afterSystem: e.target.value })}
              placeholder="e.g. ScyllaDB"
              className="w-full bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-white font-medium"
            />
          </div>

          {!pair.afterAsText && (
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 block">Official Bundled Logo</label>
              <select
                value={pair.afterLogoKey || ''}
                onChange={(e) => updatePair({ afterLogoKey: e.target.value || undefined })}
                className="w-full bg-black/80 border border-white/10 rounded-lg px-2 py-1 text-xs text-white"
              >
                <option value="">(None / Styled Text Fallback)</option>
                {bundledIcons.map((icon) => (
                  <option key={`after-${icon.slug}`} value={icon.slug}>
                    {icon.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Presentation Options: Color mode, creative motif, and size limit */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 block">Color Mode</label>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => updatePair({ colorMode: 'official' })}
              className={`px-2 py-1 text-[11px] font-medium rounded-lg border transition-colors ${
                (pair.colorMode ?? 'official') === 'official'
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                  : 'bg-black/40 border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              Official Color
            </button>
            <button
              type="button"
              onClick={() => updatePair({ colorMode: 'mono' })}
              className={`px-2 py-1 text-[11px] font-medium rounded-lg border transition-colors ${
                pair.colorMode === 'mono'
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                  : 'bg-black/40 border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              Mono
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 block">Creative Flow Layer</label>
          <select
            value={pair.creativeMotif ?? 'chat-to-db'}
            onChange={(e) => updatePair({ creativeMotif: e.target.value as 'chat-to-db' | 'stream-flow' })}
            className="w-full bg-black/80 border border-white/10 rounded-lg px-2 py-1 text-xs text-white"
          >
            <option value="chat-to-db">Chat Bubbles → DB Stack</option>
            <option value="stream-flow">Datastream Flow Lines</option>
          </select>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-slate-400 block">Logo Width (≤14%)</label>
            <span className="text-[10px] font-mono text-cyan-400">{pair.logoWidthPct ?? 11}%</span>
          </div>
          <input
            type="range"
            min={7}
            max={14}
            step={1}
            value={pair.logoWidthPct ?? 11}
            onChange={(e) => updatePair({ logoWidthPct: Number(e.target.value) })}
            className="w-full accent-cyan-400 h-1.5 bg-black/60 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
