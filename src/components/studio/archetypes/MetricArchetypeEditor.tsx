import React from 'react';
import { Gauge } from 'lucide-react';
import { SlideData, ThemePalette } from '../../../types.ts';
import { IconThumbnail, getIconDisplayName } from '../IconThumbnail.tsx';

export interface MetricArchetypeEditorProps {
  currentSlide: SlideData;
  theme: ThemePalette;
  smart: {
    metricIcon: string;
    metricValue: string;
    metricLabel: string;
    metricDiff: string;
  };
  onUpdateField: (field: keyof SlideData, value: any) => void;
  onRequestIconPicker: (config: {
    title: string;
    currentIcon: string;
    onSelect: (icon: string) => void;
  }) => void;
}

export const MetricArchetypeEditor: React.FC<MetricArchetypeEditorProps> = ({
  currentSlide,
  theme,
  smart,
  onUpdateField,
  onRequestIconPicker,
}) => {
  const metricIconName = currentSlide.metricIcon || smart.metricIcon || 'gauge';
  const metricIconDisplayName = getIconDisplayName(metricIconName);

  return (
    <div className="pt-3 border-t border-white/[0.08] animate-fade-in">
      <div className="space-y-3">
        <span className="text-xs font-bold text-white flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5 text-amber-400" />
          <span>Metric Benchmark Card</span>
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Badge Icon</label>
            <button
              type="button"
              onClick={() =>
                onRequestIconPicker({
                  title: 'Select Metric Badge Icon',
                  currentIcon: metricIconName,
                  onSelect: (icon) => onUpdateField('metricIcon', icon),
                })
              }
              className="w-full flex items-center gap-2 px-2.5 py-1 rounded-lg bg-black/60 border border-white/10 hover:border-white/30 text-left transition-all cursor-pointer"
            >
              <IconThumbnail icon={metricIconName} theme={theme} className="w-4 h-4 shrink-0" />
              <span className="text-xs text-white truncate">{metricIconDisplayName}</span>
            </button>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Metric Value</label>
            <input
              type="text"
              value={currentSlide.metricValue ?? smart.metricValue}
              onChange={(e) => onUpdateField('metricValue', e.target.value)}
              className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white font-mono font-bold tabular-nums"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Label</label>
            <input
              type="text"
              value={currentSlide.metricLabel ?? smart.metricLabel}
              onChange={(e) => onUpdateField('metricLabel', e.target.value)}
              className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Delta / Diff</label>
            <input
              type="text"
              value={currentSlide.metricDiff ?? smart.metricDiff}
              onChange={(e) => onUpdateField('metricDiff', e.target.value)}
              className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-emerald-400 font-mono"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
