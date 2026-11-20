import React, { useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
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
  smart,
  onSelectVariant,
  onUpdateField,
  onUpdateDiagramNode,
  onUpdateDiagramEdge,
  onRequestIconPicker,
}) => {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Essentials First: 3 Primary Component Labels */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold text-slate-200">
            Diagram Components
          </label>
          {currentSlide.type === 'poster' && (
            <select
              aria-label="Poster schematic style"
              value={activeDiagramVariant}
              onChange={(e) => onSelectVariant(e.target.value as DiagramVariant)}
              className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-white/25 cursor-pointer"
            >
              {DIAGRAM_VARIANTS.map((v) => (
                <option key={v.id} value={v.id} className="bg-[#0c1218] text-slate-100">
                  {v.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, nIdx) => {
            const smartNode = smart.diagramNodes[nIdx];
            const node = currentSlide.diagramNodes?.[nIdx] || smartNode;
            return (
              <div key={nIdx} className="space-y-1">
                <label className="text-[11px] text-slate-400 block">
                  Component {nIdx + 1}
                </label>
                <input
                  type="text"
                  value={node?.label ?? smartNode?.label ?? ''}
                  onChange={(e) => onUpdateDiagramNode(nIdx, 'label', e.target.value)}
                  placeholder={`Component ${nIdx + 1}`}
                  className="w-full bg-white/[0.03] border border-white/10 focus:border-white/30 rounded-lg px-2.5 py-1.5 text-xs text-white font-medium focus:outline-none transition-colors"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Progressive Disclosure: Icons, Status, Specs, Connectors & Telemetry */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <button
          type="button"
          data-testid="diagram-customize-details-toggle"
          onClick={() => setIsDetailsOpen((prev) => !prev)}
          aria-expanded={isDetailsOpen}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.03] transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
            <span>Customize Details</span>
            <span className="text-[11px] text-slate-500 font-normal hidden sm:inline">
              · Icons, specs, connectors &amp; footer
            </span>
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
              isDetailsOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isDetailsOpen && (
          <div className="px-3 pb-3 pt-2 border-t border-white/[0.06] space-y-3 animate-fade-in">
            {/* Node Icons, Status Badges & Sublabels */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, nIdx) => {
                const smartNode = smart.diagramNodes[nIdx];
                const node = currentSlide.diagramNodes?.[nIdx] || smartNode;
                const nodeIconKey = node?.icon || smartNode?.icon || 'cpu';
                const nodeIconLabel = getIconDisplayName(nodeIconKey);

                return (
                  <div
                    key={nIdx}
                    className="bg-black/35 border border-white/[0.08] rounded-lg p-2 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          onRequestIconPicker({
                            title: `Select Component ${nIdx + 1} Icon`,
                            currentIcon: nodeIconKey,
                            onSelect: (icon) => onUpdateDiagramNode(nIdx, 'icon', icon),
                          })
                        }
                        className="w-6 h-6 rounded-md flex items-center justify-center border shrink-0 transition-transform hover:scale-105 cursor-pointer"
                        style={{
                          borderColor: `${theme.accent}35`,
                          backgroundColor: `${theme.accent}12`,
                        }}
                        title={`Change icon (${nodeIconLabel})`}
                      >
                        <IconThumbnail icon={nodeIconKey} theme={theme} className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="text"
                        value={node?.status || smartNode?.status || ''}
                        onChange={(e) => onUpdateDiagramNode(nIdx, 'status', e.target.value)}
                        placeholder="Status"
                        className="w-20 text-right bg-transparent border-b border-white/10 focus:border-white/35 text-[10px] font-mono text-emerald-400 uppercase focus:outline-none"
                        title="Status label (e.g. ACTIVE, VERIFIED, ISOLATED)"
                      />
                    </div>
                    <input
                      type="text"
                      value={node?.sublabel ?? smartNode?.sublabel ?? ''}
                      onChange={(e) => onUpdateDiagramNode(nIdx, 'sublabel', e.target.value)}
                      placeholder="Short description / spec"
                      className="w-full bg-black/50 border border-white/10 focus:border-white/30 rounded-md px-2 py-1 text-[11px] text-slate-300 focus:outline-none"
                    />
                  </div>
                );
              })}
            </div>

            {/* Connectors & Footer Line */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Connector 1 → 2
                </label>
                <input
                  type="text"
                  value={currentSlide.diagramEdges?.[0] ?? smart.diagramEdges[0]}
                  onChange={(e) => onUpdateDiagramEdge(0, e.target.value)}
                  placeholder={smart.diagramEdges[0]}
                  className="w-full bg-black/45 border border-white/10 focus:border-white/30 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Connector 2 → 3
                </label>
                <input
                  type="text"
                  value={currentSlide.diagramEdges?.[1] ?? smart.diagramEdges[1]}
                  onChange={(e) => onUpdateDiagramEdge(1, e.target.value)}
                  placeholder={smart.diagramEdges[1]}
                  className="w-full bg-black/45 border border-white/10 focus:border-white/30 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Footer Note
                </label>
                <input
                  type="text"
                  value={currentSlide.diagramFooter ?? smart.diagramFooter}
                  onChange={(e) => onUpdateField('diagramFooter', e.target.value)}
                  placeholder={smart.diagramFooter}
                  className="w-full bg-black/45 border border-white/10 focus:border-white/30 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
                />
              </div>
            </div>

            {/* Optional Poster Corner Benchmark */}
            {currentSlide.type === 'poster' && (
              <div className="pt-2 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Corner Metric (Optional)
                  </label>
                  <input
                    type="text"
                    value={currentSlide.metricValue ?? ''}
                    onChange={(e) => onUpdateField('metricValue', e.target.value)}
                    placeholder="e.g. 200x, 0ms, 99.9%"
                    className="w-full bg-black/45 border border-white/10 focus:border-white/30 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Metric Label
                  </label>
                  <input
                    type="text"
                    value={currentSlide.metricLabel ?? ''}
                    onChange={(e) => onUpdateField('metricLabel', e.target.value)}
                    placeholder="e.g. P99 Latency"
                    className="w-full bg-black/45 border border-white/10 focus:border-white/30 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
