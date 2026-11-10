import React from 'react';
import { Sparkles, Tag, Layers, Plus, Trash2 } from 'lucide-react';
import { SlideData, ThemePalette } from '../../../types.ts';
import { IconThumbnail, getIconDisplayName } from '../IconThumbnail.tsx';

export interface HubArchetypeEditorProps {
  currentSlide: SlideData;
  theme: ThemePalette;
  smart: {
    centerIcon: string;
    centerTag: string;
    satIcons: string[];
    satLabels: string[];
  };
  onUpdateField: (field: keyof SlideData, value: any) => void;
  onUpdateSatLabel: (index: number, value: string) => void;
  onUpdateSatIcon?: (index: number, iconName: string) => void;
  onUpdateCenterIcon?: (iconName: string) => void;
  onUpdateCenterTag?: (tag: string) => void;
  onAddSatNode?: () => void;
  onDeleteSatNode?: (index: number) => void;
  onRequestIconPicker: (config: {
    title: string;
    currentIcon: string;
    onSelect: (icon: string) => void;
  }) => void;
}

export const HubArchetypeEditor: React.FC<HubArchetypeEditorProps> = ({
  currentSlide,
  theme,
  smart,
  onUpdateField,
  onUpdateSatLabel,
  onUpdateSatIcon,
  onUpdateCenterIcon,
  onUpdateCenterTag,
  onAddSatNode,
  onDeleteSatNode,
  onRequestIconPicker,
}) => {
  const centerIconName = currentSlide.centerIcon || smart.centerIcon || 'cpu';
  const centerIconDisplayName = getIconDisplayName(centerIconName);

  const satIcons =
    currentSlide.satIcons && currentSlide.satIcons.length > 0
      ? currentSlide.satIcons
      : smart.satIcons;

  const satLabels =
    currentSlide.satLabels && currentSlide.satLabels.length > 0
      ? currentSlide.satLabels
      : smart.satLabels;

  return (
    <div className="pt-3 border-t border-white/[0.08] space-y-4 animate-fade-in">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" style={{ color: theme.accent }} />
            <span>Central Hub Hero Component</span>
          </label>
          <span className="text-[10px] text-slate-400 font-mono">Orbital Core</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <span className="text-[10px] text-slate-400 font-medium block mb-1">Center Hero Icon</span>
            <button
              type="button"
              onClick={() =>
                onRequestIconPicker({
                  title: 'Select Center Hub Hero Icon',
                  currentIcon: centerIconName,
                  onSelect: (icon) => {
                    if (onUpdateCenterIcon) onUpdateCenterIcon(icon);
                    else onUpdateField('centerIcon', icon);
                  },
                })
              }
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/15 hover:border-white/30 hover:bg-white/[0.07] text-left transition-all cursor-pointer group"
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center p-1 border shrink-0 transition-all group-hover:scale-105"
                style={{
                  borderColor: `${theme.accent}40`,
                  backgroundColor: `${theme.accent}15`,
                }}
              >
                <IconThumbnail icon={centerIconName} theme={theme} className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white truncate">
                  {centerIconDisplayName}
                </div>
                <div className="text-[10px] text-slate-400">Click to change icon</div>
              </div>
            </button>
          </div>

          <div>
            <span className="text-[10px] text-slate-400 font-medium block mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Tag className="w-3 h-3 text-slate-400" />
                <span>Center Tag Label</span>
              </span>
            </span>
            <input
              type="text"
              value={currentSlide.centerTag ?? smart.centerTag}
              onChange={(e) => {
                if (onUpdateCenterTag) onUpdateCenterTag(e.target.value);
                else onUpdateField('centerTag', e.target.value);
              }}
              placeholder={smart.centerTag}
              className="w-full bg-white/[0.03] border border-white/15 focus:border-white/40 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* Orbital Satellite Nodes (2 to 6 nodes) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" style={{ color: theme.accent }} />
              <span>
                Orbital Satellite Nodes ({satLabels.length}/6)
              </span>
            </label>
            <p className="text-[10px] text-slate-400">
              Smart-extracted from slide copy • Click any icon or label to customize
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onAddSatNode}
              disabled={satLabels.length >= 6}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/10 text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-all cursor-pointer"
              title="Add Orbital Node (Max 6)"
            >
              <Plus className="w-3 h-3" style={{ color: theme.accent }} />
              <span>Add Node</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {satLabels.map((label, idx, arr) => {
            const nodeIconKey = satIcons[idx % satIcons.length] || 'cpu';
            const nodeIconLabel = getIconDisplayName(nodeIconKey);

            return (
              <div
                key={idx}
                className="group relative flex items-center bg-black/60 border border-white/15 focus-within:border-white/40 rounded-xl overflow-hidden pl-2 pr-1.5 py-1.5 transition-all gap-1.5"
              >
                <button
                  type="button"
                  onClick={() =>
                    onRequestIconPicker({
                      title: `Select Node #${idx + 1} Icon`,
                      currentIcon: nodeIconKey,
                      onSelect: (icon) => {
                        if (onUpdateSatIcon) {
                          onUpdateSatIcon(idx, icon);
                        } else {
                          const nextIcons = [...satIcons];
                          nextIcons[idx] = icon;
                          onUpdateField('satIcons', nextIcons);
                        }
                      },
                    })
                  }
                  className="w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 transition-transform hover:scale-110 cursor-pointer"
                  style={{
                    borderColor: `${theme.accent}30`,
                    backgroundColor: `${theme.accent}10`,
                  }}
                  title={`Change icon for Node #${idx + 1} (${nodeIconLabel})`}
                >
                  <IconThumbnail icon={nodeIconKey} theme={theme} className="w-4 h-4" />
                </button>

                <span className="text-[10px] font-mono text-slate-500 font-bold shrink-0">
                  #{idx + 1}
                </span>

                <input
                  type="text"
                  value={label}
                  onChange={(e) => onUpdateSatLabel(idx, e.target.value)}
                  placeholder={`Node ${idx + 1}`}
                  className="w-full bg-transparent text-xs text-white font-medium focus:outline-none min-w-0"
                />

                {arr.length > 2 && onDeleteSatNode && (
                  <button
                    type="button"
                    onClick={() => onDeleteSatNode(idx)}
                    className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-70 group-hover:opacity-100 shrink-0 cursor-pointer"
                    title={`Delete Node #${idx + 1}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
          <span>Minimum 2 nodes • Maximum 6 nodes</span>
          <span>Orbital layout auto-balances angles on canvas</span>
        </div>
      </div>
    </div>
  );
};
