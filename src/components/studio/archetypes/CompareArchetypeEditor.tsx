import React from 'react';
import { Columns } from 'lucide-react';
import { SlideData } from '../../../types.ts';

export interface CompareArchetypeEditorProps {
  currentSlide: SlideData;
  smart: {
    compareLeftTitle: string;
    compareLeftBody: string;
    compareRightTitle: string;
    compareRightBody: string;
  };
  onUpdateField: (field: keyof SlideData, value: any) => void;
}

export const CompareArchetypeEditor: React.FC<CompareArchetypeEditorProps> = ({
  currentSlide,
  smart,
  onUpdateField,
}) => {
  return (
    <div className="pt-3 border-t border-white/[0.08] animate-fade-in">
      <div className="space-y-2.5">
        <span className="text-xs font-bold text-white flex items-center gap-1.5">
          <Columns className="w-3.5 h-3.5 text-purple-400" />
          <span>Before vs After Architecture Comparison</span>
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 block">Legacy / Baseline (Left)</label>
            <input
              type="text"
              value={currentSlide.compareLeftTitle ?? smart.compareLeftTitle}
              onChange={(e) => onUpdateField('compareLeftTitle', e.target.value)}
              className="w-full bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-white mb-1"
            />
            <textarea
              rows={3}
              value={currentSlide.compareLeftBody ?? smart.compareLeftBody}
              onChange={(e) => onUpdateField('compareLeftBody', e.target.value)}
              className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-xs text-slate-300 resize-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 block">Optimized / Modern (Right)</label>
            <input
              type="text"
              value={currentSlide.compareRightTitle ?? smart.compareRightTitle}
              onChange={(e) => onUpdateField('compareRightTitle', e.target.value)}
              className="w-full bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-white mb-1"
            />
            <textarea
              rows={3}
              value={currentSlide.compareRightBody ?? smart.compareRightBody}
              onChange={(e) => onUpdateField('compareRightBody', e.target.value)}
              className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-xs text-slate-300 resize-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
