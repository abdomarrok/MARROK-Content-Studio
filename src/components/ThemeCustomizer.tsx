import React, { useState, useMemo } from 'react';
import { Palette, RotateCcw, Check, Sparkles, Sliders, X, Eye, ArrowRight, History } from 'lucide-react';
import { DEFAULT_PALETTES, ThemePalette, SavedPostRecord } from '../types';
import { analyzePostHistoryCadence } from '../lib/theme/cadenceEngine';

interface ThemeCustomizerProps {
  currentPalette: ThemePalette;
  onSelectPalette: (palette: ThemePalette) => void;
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (msg: string) => void;
  savedPosts?: SavedPostRecord[];
}

export const ThemeCustomizer: React.FC<ThemeCustomizerProps> = ({
  currentPalette,
  onSelectPalette,
  isOpen,
  onClose,
  onShowToast,
  savedPosts = [],
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'custom' | 'visual'>('presets');
  const [customColors, setCustomColors] = useState<ThemePalette>(currentPalette);

  const cadenceAnalysis = useMemo(() => {
    return analyzePostHistoryCadence(savedPosts, currentPalette.id);
  }, [savedPosts, currentPalette.id]);

  if (!isOpen) return null;

  const handlePresetSelect = (presetKey: string) => {
    const selected = DEFAULT_PALETTES[presetKey];
    if (selected) {
      // Preserve visual toggle settings when switching presets
      const withToggles: ThemePalette = {
        ...selected,
        showCadReticles: customColors.showCadReticles ?? true,
        showSparklines: customColors.showSparklines ?? true,
        terminalScanlines: customColors.terminalScanlines ?? true,
      };
      setCustomColors(withToggles);
      onSelectPalette(withToggles);
      onShowToast(`Applied ${selected.name}`);
    }
  };

  const handleColorChange = (key: keyof ThemePalette, value: string) => {
    const updated: ThemePalette = {
      ...customColors,
      id: 'custom',
      name: 'Custom Palette',
      [key]: value,
    };

    // If accent changes, automatically compute matching radial glow
    if (key === 'accent') {
      try {
        const hex = value.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) || 55;
        const g = parseInt(hex.substring(2, 4), 16) || 226;
        const b = parseInt(hex.substring(4, 6), 16) || 192;
        updated.radialGlow = `rgba(${r}, ${g}, ${b}, 0.16)`;
        updated.gridLine = `rgba(${r}, ${g}, ${b}, 0.045)`;
        updated.categoryTag = value;
      } catch {
        // keep existing glow if invalid hex
      }
    }

    setCustomColors(updated);
    onSelectPalette(updated);
  };

  const handleToggleVisual = (key: 'showCadReticles' | 'showSparklines' | 'terminalScanlines') => {
    const currentVal = customColors[key] ?? true;
    const updatedVal = !currentVal;
    const updated: ThemePalette = {
      ...customColors,
      [key]: updatedVal,
    };
    setCustomColors(updated);
    onSelectPalette(updated);
    const label =
      key === 'showCadReticles'
        ? 'CAD Reticles'
        : key === 'showSparklines'
        ? 'Sparklines & Gauge Meter'
        : 'Terminal Scanlines';
    onShowToast(`${label} ${updatedVal ? 'enabled' : 'hidden'}`);
  };

  const handleReset = () => {
    const defaultTeal = DEFAULT_PALETTES.teal;
    setCustomColors(defaultTeal);
    onSelectPalette(defaultTeal);
    onShowToast('Reset to MARROK Terminal Teal');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md sm:p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl max-h-[88vh] sm:max-h-[90vh] flex flex-col bg-[#0b1015] border-t sm:border border-[#1E2833] rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Mobile Drag Handle */}
        <div className="sm:hidden w-10 h-1 rounded-full bg-white/20 mx-auto mt-2.5 -mb-1 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-[#1E2833] bg-[#0e161c]">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border shadow-inner"
              style={{
                backgroundColor: currentPalette.surface,
                borderColor: currentPalette.accent,
                color: currentPalette.accent,
              }}
            >
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Theme & Visual Graphics Studio
              </h2>
              <p className="text-xs text-[#8E989E]">
                Customize palettes, OLED surfaces, CAD reticles, sparklines, and terminal textures
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8E989E] hover:text-white hover:bg-[#1a232c] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-[#1E2833] bg-[#0c1318] px-6 pt-3 overflow-x-auto">
          <button
            onClick={() => setActiveTab('presets')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all border-b-2 -mb-[2px] whitespace-nowrap ${
              activeTab === 'presets'
                ? 'text-[#37E2C0] border-[#37E2C0] bg-[#121c22]'
                : 'text-[#8E989E] border-transparent hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Curated Presets ({Object.keys(DEFAULT_PALETTES).length})
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all border-b-2 -mb-[2px] whitespace-nowrap ${
              activeTab === 'custom'
                ? 'text-[#37E2C0] border-[#37E2C0] bg-[#121c22]'
                : 'text-[#8E989E] border-transparent hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Full Custom Palette
          </button>
          <button
            onClick={() => setActiveTab('visual')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all border-b-2 -mb-[2px] whitespace-nowrap ${
              activeTab === 'visual'
                ? 'text-[#37E2C0] border-[#37E2C0] bg-[#121c22]'
                : 'text-[#8E989E] border-transparent hover:text-white'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Visual Graphics Toggles
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'visual' ? (
            <div className="space-y-4">
              <div className="p-3 bg-[#121c22] border border-[#1e2d36] rounded-xl flex items-center justify-between text-xs text-[#8E989E]">
                <span>Toggle architectural visual layers on the 1080×1920 canvas. Defaults to subtle precision brutalism.</span>
              </div>

              {/* 1. CAD Reticles Toggle */}
              <div className="p-4 bg-[#0e161c] border border-[#1E2833] rounded-xl flex items-center justify-between">
                <div className="pr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-white">CAD Corner Reticles & Coordinate Ticks</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#37E2C0]/15 text-[#37E2C0] font-semibold">
                      SAFE ZONE
                    </span>
                  </div>
                  <p className="text-[11px] text-[#8E989E]">
                    Displays subtle corner crosshairs (+) and safe boundary tick marks along 1080×1920 viewport edges.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleVisual('showCadReticles')}
                  className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-1 flex-shrink-0 ${
                    (customColors.showCadReticles ?? true) ? 'bg-[#37E2C0]' : 'bg-[#1E2833]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-[#081216] transition-transform ${
                      (customColors.showCadReticles ?? true) ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 2. Sparklines & Gauge Toggle */}
              <div className="p-4 bg-[#0e161c] border border-[#1E2833] rounded-xl flex items-center justify-between">
                <div className="pr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-white">Acceleration Sparkline & Gauge Meter</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#37E2C0]/15 text-[#37E2C0] font-semibold">
                      ARCHETYPE 3
                    </span>
                  </div>
                  <p className="text-[11px] text-[#8E989E]">
                    Renders the acceleration bezier curve and 11-point tick meter directly below the hero stat on Metric slides.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleVisual('showSparklines')}
                  className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-1 flex-shrink-0 ${
                    (customColors.showSparklines ?? true) ? 'bg-[#37E2C0]' : 'bg-[#1E2833]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-[#081216] transition-transform ${
                      (customColors.showSparklines ?? true) ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 3. Terminal CRT Scanlines Toggle */}
              <div className="p-4 bg-[#0e161c] border border-[#1E2833] rounded-xl flex items-center justify-between">
                <div className="pr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-white">Terminal CRT Scanline Texture</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#37E2C0]/15 text-[#37E2C0] font-semibold">
                      ARCHETYPE 4
                    </span>
                  </div>
                  <p className="text-[11px] text-[#8E989E]">
                    Applies subtle 3.5% scanline CRT texture inside the code terminal window while preserving razor-sharp typography.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleVisual('terminalScanlines')}
                  className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-1 flex-shrink-0 ${
                    (customColors.terminalScanlines ?? true) ? 'bg-[#37E2C0]' : 'bg-[#1E2833]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-[#081216] transition-transform ${
                      (customColors.terminalScanlines ?? true) ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          ) : activeTab === 'presets' ? (
            <div className="space-y-4">
              {/* Feed Cadence & Smart Next Palette Section */}
              <div className="p-4 rounded-2xl bg-[#0c141a] border border-[#1b2b35] space-y-3.5 shadow-inner">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#37E2C0] font-bold px-2 py-0.5 rounded bg-[#37E2C0]/10 border border-[#37E2C0]/20">
                      FEED CADENCE
                    </span>
                    <span className="text-xs text-white font-semibold">Smart Next Palette</span>
                  </div>
                  {cadenceAnalysis.lastPostedThemeId && (
                    <div className="text-[11px] font-mono text-[#8E989E] flex items-center gap-1.5">
                      <span>Last posted:</span>
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block border border-white/20 shrink-0"
                        style={{
                          backgroundColor:
                            DEFAULT_PALETTES[cadenceAnalysis.lastPostedThemeId]?.accent || '#37E2C0',
                        }}
                      />
                      <span className="text-slate-200 font-semibold">
                        {DEFAULT_PALETTES[cadenceAnalysis.lastPostedThemeId]?.name.split(' ')[0]}
                      </span>
                    </div>
                  )}
                </div>

                {/* Recommendation Hero Box */}
                <div
                  className="p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all"
                  style={{
                    backgroundColor: cadenceAnalysis.recommendedPalette.surface,
                    borderColor: cadenceAnalysis.recommendedPalette.accent + '44',
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg border"
                      style={{
                        backgroundColor: cadenceAnalysis.recommendedPalette.baseBg,
                        borderColor: cadenceAnalysis.recommendedPalette.accent,
                      }}
                    >
                      <Sparkles
                        className="w-5 h-5"
                        style={{ color: cadenceAnalysis.recommendedPalette.accent }}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white truncate">
                          {cadenceAnalysis.recommendedPalette.name}
                        </span>
                        <span
                          className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border font-semibold shrink-0"
                          style={{
                            color: cadenceAnalysis.recommendedPalette.accent,
                            borderColor: cadenceAnalysis.recommendedPalette.accent + '55',
                            backgroundColor: cadenceAnalysis.recommendedPalette.accent + '15',
                          }}
                        >
                          Recommended Next
                        </span>
                      </div>
                      <p className="text-[11px] text-[#A0ACB3] mt-0.5 line-clamp-2 leading-relaxed">
                        {cadenceAnalysis.reason}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePresetSelect(cadenceAnalysis.recommendedThemeId)}
                    className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shadow-md text-slate-950 shrink-0 hover:opacity-90 active:scale-[0.98]"
                    style={{ backgroundColor: cadenceAnalysis.recommendedPalette.accent }}
                  >
                    {currentPalette.id === cadenceAnalysis.recommendedThemeId ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-slate-950" />
                        <span>Active in Studio</span>
                      </>
                    ) : (
                      <>
                        <span>Apply Smart Palette</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-950" />
                      </>
                    )}
                  </button>
                </div>

                {/* Recent Feed History Strip */}
                {cadenceAnalysis.recentCadence.length > 0 ? (
                  <div className="pt-2 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 text-[#8E989E] shrink-0">
                      <History className="w-3.5 h-3.5" />
                      <span>Recent posts:</span>
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-thin">
                      {cadenceAnalysis.recentCadence.slice(0, 4).map((post, idx) => (
                        <React.Fragment key={post.id || idx}>
                          <div
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/40 border border-white/10 shrink-0 text-[10px] font-mono text-slate-300"
                            title={`Post: ${post.title} (${post.themeName})`}
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: post.accentColor }}
                            />
                            <span className="truncate max-w-[80px]">{post.themeName}</span>
                            {idx === 0 && (
                              <span className="text-[9px] text-[#37E2C0] font-bold">Latest</span>
                            )}
                          </div>
                          {idx < Math.min(3, cadenceAnalysis.recentCadence.length - 1) && (
                            <span className="text-white/20 select-none">→</span>
                          )}
                        </React.Fragment>
                      ))}
                      <span className="text-white/20 select-none">→</span>
                      <div
                        className="flex items-center gap-1 px-2 py-0.5 rounded-md shrink-0 text-[10px] font-mono font-bold border"
                        style={{
                          borderColor: cadenceAnalysis.recommendedPalette.accent + '66',
                          backgroundColor: cadenceAnalysis.recommendedPalette.accent + '20',
                          color: cadenceAnalysis.recommendedPalette.accent,
                        }}
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>Next: {cadenceAnalysis.recommendedPalette.name.split(' ')[0]}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="pt-1 text-[11px] text-[#8E989E] flex items-center gap-1.5 font-mono">
                    <History className="w-3.5 h-3.5 text-slate-500" />
                    <span>No saved posts in vault yet. Initial feed rotation active.</span>
                  </div>
                )}
              </div>

              {/* All Curated Presets Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {Object.entries(DEFAULT_PALETTES).map(([key, pal]) => {
                  const isSelected = currentPalette.id === pal.id;
                  const isSmartRecommended = cadenceAnalysis.recommendedThemeId === pal.id;
                  const isLastPosted = cadenceAnalysis.lastPostedThemeId === pal.id;

                  return (
                    <button
                      key={key}
                      onClick={() => handlePresetSelect(key)}
                      className={`flex flex-col text-left p-3.5 rounded-xl border transition-all text-xs group relative overflow-hidden ${
                        isSelected
                          ? 'border-[#37E2C0] bg-[#121e25] ring-1 ring-[#37E2C0]/50 shadow-lg'
                          : isSmartRecommended
                          ? 'border-[#38BDF8]/60 bg-[#0e1822] hover:border-[#38BDF8] hover:bg-[#111f2c]'
                          : 'border-[#1E2833] bg-[#0e161c] hover:border-[#2e3e4f] hover:bg-[#131d24]'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-2.5 gap-2">
                        <span className="font-semibold text-white group-hover:text-[#37E2C0] transition-colors truncate">
                          {pal.name}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isLastPosted && !isSelected && (
                            <span className="text-[9px] font-mono text-[#8E989E] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
                              Last Posted
                            </span>
                          )}
                          {isSmartRecommended && !isSelected && (
                            <span
                              className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded font-bold border"
                              style={{
                                color: pal.accent,
                                borderColor: pal.accent + '55',
                                backgroundColor: pal.accent + '15',
                              }}
                            >
                              ★ Smart Next
                            </span>
                          )}
                          {isSelected && (
                            <span className="flex items-center gap-1 text-[10px] text-[#37E2C0] bg-[#37E2C0]/15 px-2 py-0.5 rounded-full font-bold">
                              <Check className="w-3 h-3" /> Active
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Color Swatch Bar */}
                      <div className="flex items-center gap-1.5 w-full h-6 rounded-lg p-1 bg-black/40 border border-white/5">
                        <div
                          className="flex-1 h-full rounded"
                          style={{ backgroundColor: pal.baseBg }}
                          title={`Canvas: ${pal.baseBg}`}
                        />
                        <div
                          className="flex-1 h-full rounded"
                          style={{ backgroundColor: pal.surface }}
                          title={`Surface: ${pal.surface}`}
                        />
                        <div
                          className="w-6 h-full rounded shadow-sm"
                          style={{ backgroundColor: pal.accent }}
                          title={`Accent: ${pal.accent}`}
                        />
                        <div
                          className="w-4 h-full rounded"
                          style={{ backgroundColor: pal.alert }}
                          title={`Alert: ${pal.alert}`}
                        />
                        <div
                          className="w-4 h-full rounded"
                          style={{ backgroundColor: pal.textWhite }}
                          title={`Headline: ${pal.textWhite}`}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-[#121c22] border border-[#1e2d36] rounded-xl flex items-center justify-between text-xs text-[#8E989E]">
                <span>Fine-tune any exact hex value. Changes reflect live on the 1080×1920 canvas.</span>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1 text-[11px] text-[#37E2C0] hover:underline"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>

              {/* Color Pickers Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* 1. Canvas Background */}
                <div className="p-3 bg-[#0e161c] border border-[#1E2833] rounded-xl flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-white block">Canvas Background</label>
                    <span className="text-[10px] text-[#8E989E]">1080×1920 base color</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customColors.baseBg}
                      onChange={(e) => handleColorChange('baseBg', e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={customColors.baseBg}
                      onChange={(e) => handleColorChange('baseBg', e.target.value)}
                      className="w-20 px-2 py-1 text-xs font-mono bg-black/50 border border-[#1E2833] rounded text-white text-center uppercase"
                    />
                  </div>
                </div>

                {/* 2. Primary Accent */}
                <div className="p-3 bg-[#0e161c] border border-[#1E2833] rounded-xl flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-white block">Primary Accent & Glow</label>
                    <span className="text-[10px] text-[#8E989E]">Hub icon & badges</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customColors.accent}
                      onChange={(e) => handleColorChange('accent', e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={customColors.accent}
                      onChange={(e) => handleColorChange('accent', e.target.value)}
                      className="w-20 px-2 py-1 text-xs font-mono bg-black/50 border border-[#1E2833] rounded text-white text-center uppercase"
                    />
                  </div>
                </div>

                {/* 3. Card Surface */}
                <div className="p-3 bg-[#0e161c] border border-[#1E2833] rounded-xl flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-white block">Card Surface</label>
                    <span className="text-[10px] text-[#8E989E]">Row cards & containers</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customColors.surface}
                      onChange={(e) => handleColorChange('surface', e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={customColors.surface}
                      onChange={(e) => handleColorChange('surface', e.target.value)}
                      className="w-20 px-2 py-1 text-xs font-mono bg-black/50 border border-[#1E2833] rounded text-white text-center uppercase"
                    />
                  </div>
                </div>

                {/* 4. Stroke & Border */}
                <div className="p-3 bg-[#0e161c] border border-[#1E2833] rounded-xl flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-white block">Card Borders</label>
                    <span className="text-[10px] text-[#8E989E]">Technical dividers</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customColors.surfaceBorder}
                      onChange={(e) => handleColorChange('surfaceBorder', e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={customColors.surfaceBorder}
                      onChange={(e) => handleColorChange('surfaceBorder', e.target.value)}
                      className="w-20 px-2 py-1 text-xs font-mono bg-black/50 border border-[#1E2833] rounded text-white text-center uppercase"
                    />
                  </div>
                </div>

                {/* 5. Alert & Risk */}
                <div className="p-3 bg-[#0e161c] border border-[#1E2833] rounded-xl flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-white block">Alert & Risk Accent</label>
                    <span className="text-[10px] text-[#8E989E]">Security flaws & warnings</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customColors.alert}
                      onChange={(e) => handleColorChange('alert', e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={customColors.alert}
                      onChange={(e) => handleColorChange('alert', e.target.value)}
                      className="w-20 px-2 py-1 text-xs font-mono bg-black/50 border border-[#1E2833] rounded text-white text-center uppercase"
                    />
                  </div>
                </div>

                {/* 6. English Headline Text */}
                <div className="p-3 bg-[#0e161c] border border-[#1E2833] rounded-xl flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-white block">Headline Color</label>
                    <span className="text-[10px] text-[#8E989E]">Bold title typography</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customColors.textWhite}
                      onChange={(e) => handleColorChange('textWhite', e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={customColors.textWhite}
                      onChange={(e) => handleColorChange('textWhite', e.target.value)}
                      className="w-20 px-2 py-1 text-xs font-mono bg-black/50 border border-[#1E2833] rounded text-white text-center uppercase"
                    />
                  </div>
                </div>

                {/* 7. English Body Copy */}
                <div className="p-3 bg-[#0e161c] border border-[#1E2833] rounded-xl flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-white block">English Body Text</label>
                    <span className="text-[10px] text-[#8E989E]">Subtitle & descriptions</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customColors.textEnBody}
                      onChange={(e) => handleColorChange('textEnBody', e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={customColors.textEnBody}
                      onChange={(e) => handleColorChange('textEnBody', e.target.value)}
                      className="w-20 px-2 py-1 text-xs font-mono bg-black/50 border border-[#1E2833] rounded text-white text-center uppercase"
                    />
                  </div>
                </div>

                {/* 8. Arabic Copy */}
                <div className="p-3 bg-[#0e161c] border border-[#1E2833] rounded-xl flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-white block">Arabic Body Text</label>
                    <span className="text-[10px] text-[#8E989E]">Cairo RTL subtitles</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customColors.textArBody}
                      onChange={(e) => handleColorChange('textArBody', e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={customColors.textArBody}
                      onChange={(e) => handleColorChange('textArBody', e.target.value)}
                      className="w-20 px-2 py-1 text-xs font-mono bg-black/50 border border-[#1E2833] rounded text-white text-center uppercase"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#1E2833] bg-[#0c1318]">
          <div className="flex items-center gap-2 text-xs text-[#8E989E]">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentPalette.accent }} />
            <span>Active: <strong className="text-white">{currentPalette.name}</strong></span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-black rounded-xl shadow-md hover:brightness-110 transition-all"
            style={{ backgroundColor: currentPalette.accent }}
          >
            Done & Apply
          </button>
        </div>
      </div>
    </div>
  );
};
