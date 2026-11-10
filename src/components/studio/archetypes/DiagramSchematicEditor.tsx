import React from 'react';
import { Cpu } from 'lucide-react';
import {
  SlideData,
  ThemePalette,
  DiagramVariant,
  DiagramNode,
} from '../../../types.ts';
import { IconThumbnail, getIconDisplayName } from '../IconThumbnail.tsx';

export const DIAGRAM_VARIANTS: { id: DiagramVariant; label: string }[] = [
  { id: 'topology', label: 'Topology Flow' },
  { id: 'stack', label: 'Layered Stack' },
  { id: 'isolation', label: 'Isolation Grid' },
  { id: 'takeaway', label: 'Key Takeaway' },
  { id: 'scatter', label: 'Vector Scatter' },
  { id: 'graph', label: 'HNSW Skip-Graph' },
  { id: 'clusters', label: 'IVF Clusters' },
  { id: 'split', label: 'Hot/Cold Split' },
  { id: 'features', label: '3 Feature Cards' },
];

export interface DiagramSchematicEditorProps {
  currentSlide: SlideData;
  theme: ThemePalette;
  activeDiagramVariant: DiagramVariant;
  recommendedVariant: DiagramVariant;
  smart: {
    diagramNodes: DiagramNode[];
    diagramEdges: string[];
    diagramFooter: string;
  };
  onSelectVariant: (variantId: DiagramVariant) => void;
  onUpdateField: (field: keyof SlideData, value: any) => void;
  onUpdateDiagramNode: (nodeIndex: number, field: keyof DiagramNode, value: string) => void;
  onUpdateDiagramEdge: (edgeIndex: number, value: string) => void;
  onRequestIconPicker: (config: {
    title: string;
    currentIcon: string;
    onSelect: (icon: string) => void;
  }) => void;
}

export const DiagramSchematicEditor: React.FC<DiagramSchematicEditorProps> = ({
  currentSlide,
  theme,
  activeDiagramVariant,
  recommendedVariant,
  smart,
  onSelectVariant,
  onUpdateField,
  onUpdateDiagramNode,
  onUpdateDiagramEdge,
  onRequestIconPicker,
}) => {
  return (
    <div className="pt-3 border-t border-white/[0.08] space-y-3.5 animate-fade-in">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5" style={{ color: theme.accent }} />
            <span>Schematic Engine (9 Variants)</span>
          </label>
          <span className="text-[10px] text-slate-400 font-mono">
            Best Fit: <strong className="text-white uppercase">{recommendedVariant}</strong>
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 bg-black/60 p-1.5 rounded-xl border border-white/10">
          {DIAGRAM_VARIANTS.map((variant) => {
            const isSelected = activeDiagramVariant === variant.id;
            const isSuggested = recommendedVariant === variant.id && !isSelected;
            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => onSelectVariant(variant.id)}
                className={`flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-white/20 text-white shadow-sm border border-white/30'
                    : isSuggested
                    ? 'bg-white/[0.05] text-slate-200 border border-cyan-500/35 hover:bg-white/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
                }`}
                style={isSelected ? { color: theme.accent } : undefined}
              >
                <span className="truncate">{variant.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3 Diagram Nodes */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
            <span>Schematic Nodes (3 Components)</span>
          </label>
          <span className="text-[10px] text-slate-400 font-mono">Icon · Status · Label · Spec</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, nIdx) => {
            const smartNode = smart.diagramNodes[nIdx];
            const node = currentSlide.diagramNodes?.[nIdx] || smartNode;
            const nodeIconKey = node?.icon || smartNode?.icon || 'cpu';
            const nodeIconLabel = getIconDisplayName(nodeIconKey);

            return (
              <div key={nIdx} className="bg-black/50 border border-white/10 rounded-xl p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onRequestIconPicker({
                          title: `Select Node #${nIdx + 1} Icon`,
                          currentIcon: nodeIconKey,
                          onSelect: (icon) => onUpdateDiagramNode(nIdx, 'icon', icon),
                        })
                      }
                      className="w-6 h-6 rounded-lg flex items-center justify-center border shrink-0 transition-transform hover:scale-110 cursor-pointer"
                      style={{
                        borderColor: `${theme.accent}30`,
                        backgroundColor: `${theme.accent}10`,
                      }}
                      title={`Change icon for Node #${nIdx + 1} (${nodeIconLabel})`}
                    >
                      <IconThumbnail icon={nodeIconKey} theme={theme} className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] font-bold font-mono text-slate-400">
                      Node #{nIdx + 1}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={node?.status || smartNode?.status || ''}
                    onChange={(e) => onUpdateDiagramNode(nIdx, 'status', e.target.value)}
                    placeholder="STATUS"
                    className="w-20 text-right bg-transparent border-b border-white/15 focus:border-white/40 text-[9px] font-mono text-emerald-400 uppercase focus:outline-none"
                    title="Status Badge (e.g. ACTIVE, VERIFIED, ISOLATED)"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={node?.label ?? smartNode?.label ?? ''}
                    onChange={(e) => onUpdateDiagramNode(nIdx, 'label', e.target.value)}
                    placeholder="Primary Label"
                    className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-lg px-2 py-1 text-xs text-white font-semibold focus:outline-none"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={node?.sublabel ?? smartNode?.sublabel ?? ''}
                    onChange={(e) => onUpdateDiagramNode(nIdx, 'sublabel', e.target.value)}
                    placeholder="Sublabel / Spec"
                    className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-lg px-2 py-1 text-[11px] text-slate-300 focus:outline-none"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* diagramEdges & diagramFooter */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1">
            Connector 1 → 2
          </label>
          <input
            type="text"
            value={currentSlide.diagramEdges?.[0] ?? smart.diagramEdges[0]}
            onChange={(e) => onUpdateDiagramEdge(0, e.target.value)}
            placeholder={smart.diagramEdges[0]}
            className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1">
            Connector 2 → 3
          </label>
          <input
            type="text"
            value={currentSlide.diagramEdges?.[1] ?? smart.diagramEdges[1]}
            onChange={(e) => onUpdateDiagramEdge(1, e.target.value)}
            placeholder={smart.diagramEdges[1]}
            className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1">
            Footer Telemetry Line
          </label>
          <input
            type="text"
            value={currentSlide.diagramFooter ?? smart.diagramFooter}
            onChange={(e) => onUpdateField('diagramFooter', e.target.value)}
            placeholder={smart.diagramFooter}
            className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
          />
        </div>
      </div>

      {/* Optional Benchmark Metric Tag for Poster */}
      {currentSlide.type === 'poster' && (
        <div className="pt-2 border-t border-white/[0.08] grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold text-slate-400 block mb-1">
              Corner Benchmark Value (Optional)
            </label>
            <input
              type="text"
              value={currentSlide.metricValue ?? ''}
              onChange={(e) => onUpdateField('metricValue', e.target.value)}
              placeholder="e.g. 200x, 0ms, 99.9%"
              className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 block mb-1">
              Benchmark Label / Delta
            </label>
            <input
              type="text"
              value={currentSlide.metricLabel ?? ''}
              onChange={(e) => onUpdateField('metricLabel', e.target.value)}
              placeholder="e.g. P99 LATENCY or ▲ 12x"
              className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
};
