import React from 'react';
import { Hash, RotateCcw } from 'lucide-react';
import { SlideData, ThemePalette } from '../../../types.ts';
import { IconThumbnail, getIconDisplayName } from '../IconThumbnail.tsx';

export interface NumberArchetypeEditorProps {
  currentSlide: SlideData;
  currentSlideIndex?: number;
  theme: ThemePalette;
  smart: {
    stepNumber: string;
    stepLabel: string;
    centerIcon: string;
  };
  onUpdateField: (field: keyof SlideData, value: any) => void;
  onUpdateCenterIcon?: (iconName: string) => void;
  onRequestIconPicker: (config: {
    title: string;
    currentIcon: string;
    onSelect: (icon: string) => void;
  }) => void;
}

export const NumberArchetypeEditor: React.FC<NumberArchetypeEditorProps> = ({
  currentSlide,
  currentSlideIndex = 0,
  theme,
  smart,
  onUpdateField,
  onUpdateCenterIcon,
  onRequestIconPicker,
}) => {
  const autoStepNum = currentSlideIndex + 1;
  const autoStepStr = autoStepNum < 10 ? `0${autoStepNum}` : `${autoStepNum}`;
  const currentStepNumber = currentSlide.stepNumber ?? smart.stepNumber;
  const currentStepLabel = currentSlide.stepLabel ?? smart.stepLabel;

  const numberIconName = currentSlide.centerIcon || smart.centerIcon || '';
  const numberIconDisplayName = numberIconName ? getIconDisplayName(numberIconName) : 'Emblem Icon';

  return (
    <div className="pt-3 border-t border-white/[0.08] space-y-3.5 animate-fade-in">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5" style={{ color: theme.accent }} />
            <span>Step Counter & Accent Numeral</span>
          </span>
          <button
            type="button"
            onClick={() => {
              onUpdateField('stepNumber', autoStepStr);
              onUpdateField('stepLabel', smart.stepLabel.replace(/^STEP\s*\d+/i, `STEP ${autoStepStr}`));
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/10 border border-white/10 text-[10px] font-mono text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Sync numeral to current slide position"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Sync Slide #{currentSlideIndex + 1}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Giant Accent Numeral */}
          <div>
            <label className="text-[10px] text-slate-400 font-medium block mb-1">
              Big Accent Numeral
            </label>
            <input
              type="text"
              value={currentStepNumber}
              onChange={(e) => onUpdateField('stepNumber', e.target.value)}
              placeholder="01"
              maxLength={6}
              className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-xl px-3 py-2 text-sm text-white font-mono font-bold tabular-nums focus:outline-none"
            />
          </div>

          {/* Top Kicker Badge */}
          <div>
            <label className="text-[10px] text-slate-400 font-medium block mb-1">
              Top Kicker Label
            </label>
            <input
              type="text"
              value={currentStepLabel}
              onChange={(e) => onUpdateField('stepLabel', e.target.value)}
              placeholder="STEP 01"
              className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-xl px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none"
            />
          </div>

          {/* Optional Divider Emblem Icon */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-400 font-medium">Divider Icon Badge</span>
              {numberIconName && (
                <button
                  type="button"
                  onClick={() => {
                    if (onUpdateCenterIcon) onUpdateCenterIcon('');
                    else onUpdateField('centerIcon', '');
                  }}
                  className="text-[9px] font-mono text-slate-400 hover:text-rose-300 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() =>
                onRequestIconPicker({
                  title: 'Select Step Divider Emblem Icon',
                  currentIcon: numberIconName || 'cpu',
                  onSelect: (icon) => {
                    if (onUpdateCenterIcon) onUpdateCenterIcon(icon);
                    else onUpdateField('centerIcon', icon);
                  },
                })
              }
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/[0.03] border border-white/15 hover:border-white/30 hover:bg-white/[0.07] text-left transition-all cursor-pointer"
            >
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center p-1 border shrink-0"
                style={{
                  borderColor: `${theme.accent}40`,
                  backgroundColor: `${theme.accent}15`,
                }}
              >
                <IconThumbnail icon={numberIconName || 'cpu'} theme={theme} className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white truncate">
                  {numberIconDisplayName}
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Quick Step Presets */}
        <div className="flex items-center gap-1.5 pt-1">
          <span className="text-[10px] font-mono text-slate-400 mr-1">Quick Step:</span>
          {['01', '02', '03', '04', '05', '06'].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => {
                onUpdateField('stepNumber', num);
                if (/^STEP\s*\d+/i.test(currentStepLabel.trim())) {
                  onUpdateField(
                    'stepLabel',
                    currentStepLabel.trim().replace(/^STEP\s*\d+/i, `STEP ${num}`)
                  );
                }
              }}
              className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold transition-colors cursor-pointer tabular-nums ${
                currentStepNumber === num
                  ? 'bg-white/20 text-white border border-white/30'
                  : 'bg-white/[0.03] text-slate-400 hover:text-white border border-white/10'
              }`}
              style={currentStepNumber === num ? { color: theme.accent } : undefined}
            >
              {num}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
