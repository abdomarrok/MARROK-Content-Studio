import React from 'react';
import { Code } from 'lucide-react';
import { SlideData } from '../../../types.ts';

export interface CodeArchetypeEditorProps {
  currentSlide: SlideData;
  smart: {
    codeFileName: string;
    codeLanguage: string;
    codeSnippet: string;
  };
  onUpdateField: (field: keyof SlideData, value: any) => void;
}

export const CodeArchetypeEditor: React.FC<CodeArchetypeEditorProps> = ({
  currentSlide,
  smart,
  onUpdateField,
}) => {
  return (
    <div className="pt-3 border-t border-white/[0.08] animate-fade-in">
      <div className="space-y-2.5">
        <span className="text-xs font-bold text-white flex items-center gap-1.5">
          <Code className="w-3.5 h-3.5 text-cyan-400" />
          <span>Code Diff & Terminal Controls</span>
        </span>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">File Name</label>
            <input
              type="text"
              value={currentSlide.codeFileName ?? smart.codeFileName}
              onChange={(e) => onUpdateField('codeFileName', e.target.value)}
              className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Language</label>
            <input
              type="text"
              value={currentSlide.codeLanguage ?? smart.codeLanguage}
              onChange={(e) => onUpdateField('codeLanguage', e.target.value)}
              className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white font-mono"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-slate-400 block mb-1">Code Snippet (+ / - diff)</label>
          <textarea
            rows={4}
            value={currentSlide.codeSnippet ?? smart.codeSnippet}
            onChange={(e) => onUpdateField('codeSnippet', e.target.value)}
            className="w-full bg-black/60 border border-white/10 rounded-lg p-2.5 text-xs text-slate-200 font-mono focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
};
