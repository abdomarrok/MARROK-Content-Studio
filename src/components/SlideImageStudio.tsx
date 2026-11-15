import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Wand2,
  Image as ImageIcon,
  Check,
  RefreshCw,
  Cpu,
  Shield,
  Terminal,
  Network,
  Maximize2,
  Download,
  AlertCircle,
  X,
  Layers,
  Sliders,
  Zap,
} from 'lucide-react';
import { SlideData, ThemePalette } from '../types';
import { parseImageDataUrl } from '../lib/validation/image';
import { createRequestDeadline } from '../lib/network/requestDeadline';
import { withClientAuthHeaders } from '../lib/security/clientSessionToken';

const IMAGE_REQUEST_TIMEOUT_MS = 50000;

interface SlideImageStudioProps {
  slideIndex?: number;
  slide: SlideData;
  theme: ThemePalette;
  onApplyImage: (targetIndex: number, imageUrl: string, prompt?: string, model?: string) => void;
  onClose?: () => void;
  onShowToast?: (msg: string) => void;
}

type StylePreset = 'blueprint' | 'terminal' | 'flowchart' | 'security' | 'raw';
type AspectRatio = '9:16' | '16:9' | '1:1';

const STYLE_PRESETS: { id: StylePreset; label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; desc: string }[] = [
  { id: 'blueprint', label: 'System Blueprint', icon: Cpu, desc: 'Isometric wireframe vector schema with neon lines' },
  { id: 'terminal', label: 'Terminal Core', icon: Terminal, desc: 'Dark CLI telemetry with glowing code matrices' },
  { id: 'flowchart', label: 'Services Flow', icon: Network, desc: 'Decoupled distributed nodes and data pipeline topology' },
  { id: 'security', label: 'Security Boundary', icon: Shield, desc: 'Attack blast radius and threat defense mesh' },
  { id: 'raw', label: 'Custom Prompt', icon: Sliders, desc: 'Raw prompt without style decorator' },
];

/**
 * Automatically constructs a zero-config technical prompt behind the scenes using the slide's
 * title, diagram nodes, and the active theme's exact hex colors (bg, surface, accent).
 */
export function buildThemeAwareDiagramPrompt(slide: SlideData, theme: ThemePalette): string {
  const title = (slide.enTitle || 'System Architecture').replace(/\n/g, ' ').replace(/[.?!]$/, '').trim();
  const nodes = (slide.diagramNodes || []).map((n) => n.label).filter(Boolean);
  const nodeFlow = nodes.length > 0 ? `Data pipeline stages: ${nodes.join(' -> ')}` : '';
  const sublabels = (slide.diagramNodes || []).map((n) => n.sublabel).filter(Boolean).slice(0, 2).join('; ');
  const details = sublabels ? `Technical mechanisms: ${sublabels}` : '';
  const footer = slide.diagramFooter ? `Telemetry: ${slide.diagramFooter}` : '';
  const body = slide.enBody ? `System details: ${slide.enBody.slice(0, 90)}` : '';

  const hexTheme = `Color palette strictly: accent highlight ${theme.accent}, dark base background ${theme.baseBg || '#080e12'}, container surface ${theme.surface || '#0d151c'}`;

  return `High-contrast dark OLED architectural diagram for "${title}". ${nodeFlow}. ${details}. ${body}. ${footer}. ${hexTheme}. Isometric vector schema, clean glowing connections, no human faces.`;
}

export const SlideImageStudio: React.FC<SlideImageStudioProps> = ({
  slideIndex = 0,
  slide,
  theme,
  onApplyImage,
  onClose,
  onShowToast,
}) => {
  const boundSlideIndexRef = useRef(slideIndex);
  useEffect(() => {
    boundSlideIndexRef.current = slideIndex;
  }, [slideIndex]);

  const [activeMode, setActiveMode] = useState<'generate' | 'edit'>(slide.imageUrl ? 'edit' : 'generate');
  const [prompt, setPrompt] = useState<string>(() => buildThemeAwareDiagramPrompt(slide, theme));
  const [selectedPreset, setSelectedPreset] = useState<StylePreset>('blueprint');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [usedModel, setUsedModel] = useState<string>('gemini-nano-banana-2.1');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
    };
  }, []);

  // Synchronize auto-prompt if slide changes and user hasn't typed custom prompt
  useEffect(() => {
    if (!prompt || prompt.startsWith('High-contrast dark OLED') || prompt.startsWith('Architectural system diagram')) {
      setPrompt(buildThemeAwareDiagramPrompt(slide, theme));
    }
  }, [slide, theme]);

  // Auto-fill prompt from current slide context
  const handleAutoFillFromSlide = () => {
    const autoPrompt = buildThemeAwareDiagramPrompt(slide, theme);
    setPrompt(autoPrompt);
    onShowToast?.('Auto-populated technical prompt matching active theme palette');
  };

  // Quick edit suggestions
  const handleQuickEditPrompt = (quickText: string) => {
    setPrompt(quickText);
  };

  const executeGenerate = async (targetPrompt: string, targetAspectRatio: AspectRatio, targetPreset: StylePreset) => {
    if (!targetPrompt.trim()) {
      setErrorMsg('Please enter a prompt describing the diagram or visual to create.');
      return;
    }

    const sourceImage =
      activeMode === 'edit' && slide.imageUrl ? parseImageDataUrl(slide.imageUrl) : null;
    if (activeMode === 'edit' && slide.imageUrl && !sourceImage) {
      setErrorMsg('Image editing requires an embedded PNG, JPEG, WEBP, or GIF within the size limit.');
      return;
    }

    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    const requestId = ++requestIdRef.current;
    const deadline = createRequestDeadline(controller.signal, IMAGE_REQUEST_TIMEOUT_MS);

    setIsGenerating(true);
    setErrorMsg(null);

    const customKey = typeof window !== 'undefined' ? localStorage.getItem('marrok_custom_gemini_key') : null;
    const backupKey = typeof window !== 'undefined' ? localStorage.getItem('marrok_custom_gemini_backup_key') : null;
    const requestHeaders: Record<string, string> = withClientAuthHeaders({ 'Content-Type': 'application/json' });
    if (customKey) {
      requestHeaders['x-gemini-key'] = customKey;
    }
    if (backupKey) {
      requestHeaders['x-gemini-backup-key'] = backupKey;
    }

    try {
      const payload: Record<string, unknown> = {
        prompt: targetPrompt.trim(),
        aspectRatio: targetAspectRatio,
        imageSize: '1K',
        stylePreset: targetPreset,
        themeAccent: theme.accent,
        themeBg: theme.baseBg,
        themeSurface: theme.surface,
      };

      // If in edit mode and a valid embedded image is present, pass it as the edit source
      if (sourceImage) {
        payload.baseImageBase64 = sourceImage.dataUrl;
        payload.baseImageMimeType = sourceImage.mimeType;
      }

      const res = await fetch('/api/generate-image', {
        method: 'POST',
        credentials: 'include',
        headers: requestHeaders,
        signal: deadline.signal,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errDesc = 'Failed to generate image';
        try {
          const errData = await res.json();
          errDesc = errData.error || errData.details || errDesc;
        } catch {
          // ignore
        }
        throw new Error(errDesc);
      }

      const data = await res.json();
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;

      const parsedImage = parseImageDataUrl(data.imageUrl);
      if (parsedImage) {
        setGeneratedImageUrl(parsedImage.dataUrl);
        setUsedModel(data.model || 'gemini-nano-banana-2.1');
        onShowToast?.(`Successfully generated image with ${data.model || 'gemini-nano-banana-2.1'}!`);
      } else {
        throw new Error('No valid image returned from server.');
      }
    } catch (err: unknown) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      const timedOut =
        deadline.signal.reason instanceof DOMException && deadline.signal.reason.name === 'TimeoutError';
      const msg = timedOut ? 'Image generation timed out. Please try again.' : err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      deadline.cleanup();
      if (requestId === requestIdRef.current) {
        setIsGenerating(false);
      }
    }
  };

  const handleGenerate = () => executeGenerate(prompt, aspectRatio, selectedPreset);

  const handle1ClickThemeGenerate = () => {
    const autoPrompt = buildThemeAwareDiagramPrompt(slide, theme);
    setPrompt(autoPrompt);
    setSelectedPreset('blueprint');
    setAspectRatio('9:16');
    executeGenerate(autoPrompt, '9:16', 'blueprint');
  };

  const handleApplyToSlide = () => {
    if (!generatedImageUrl) return;
    onApplyImage(boundSlideIndexRef.current, generatedImageUrl, prompt, usedModel);
    onShowToast?.(`Applied generated visual to slide #${boundSlideIndexRef.current + 1}!`);
    if (onClose) onClose();
  };

  return (
    <div className="p-4 rounded-xl border border-white/10 bg-black/40 space-y-4">
      {/* Studio Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shadow-inner"
            style={{ backgroundColor: `${theme.accent}25` }}
          >
            <Sparkles className="w-4 h-4" style={{ color: theme.accent }} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5 font-jakarta">
              <span>AI Visual Studio</span>
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase"
                style={{ backgroundColor: `${theme.accent}20`, color: theme.accent }}
              >
                gemini-nano-banana-2.1
              </span>
            </h4>
            <p className="text-[10px] text-slate-400">
              Generate 9:16 vertical architecture diagrams or edit existing visuals with prompts
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Mode Switcher */}
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-black/60 border border-white/10">
        <button
          type="button"
          onClick={() => setActiveMode('generate')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
            activeMode === 'generate'
              ? 'bg-white/20 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Wand2 className="w-3.5 h-3.5" />
          <span>Text-to-Diagram</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveMode('edit')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
            activeMode === 'edit'
              ? 'bg-white/20 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Edit Existing Visual</span>
        </button>
      </div>

      {/* Style Presets */}
      {activeMode === 'generate' && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Technical Style Preset
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {STYLE_PRESETS.slice(0, 4).map((preset) => {
              const Icon = preset.icon;
              const isSelected = selectedPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedPreset(preset.id)}
                  className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-white/40 bg-white/10 text-white'
                      : 'border-white/5 bg-white/[0.02] text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
                  }`}
                  title={preset.desc}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Icon className="w-3 h-3" style={{ color: isSelected ? theme.accent : undefined }} />
                    <span className="text-[11px] font-bold leading-none">{preset.label}</span>
                  </div>
                  <p className="text-[9px] text-slate-500 line-clamp-1">{preset.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit Mode Suggestions */}
      {activeMode === 'edit' && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span className="font-semibold uppercase tracking-wider">Quick Edit Instructions</span>
            <span>Natural language brush</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              'Invert background to carbon dark mode with glowing cyan nodes',
              'Recolor accents to match emerald theme (#37E2C0)',
              'Add subtle blueprint grid lines and technical brackets',
              'Enhance diagram contrast and sharpen vector lines',
            ].map((sugg, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleQuickEditPrompt(sugg)}
                className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/5 text-[10px] text-slate-300 hover:text-white transition-colors cursor-pointer truncate max-w-full"
              >
                + {sugg}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Aspect Ratio Selector */}
      <div className="flex items-center justify-between gap-3 text-xs">
        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Dimensions & Aspect Ratio
        </label>
        <div className="flex items-center gap-1 bg-black/60 p-0.5 rounded-lg border border-white/10">
          {(['9:16', '16:9', '1:1'] as AspectRatio[]).map((ar) => (
            <button
              key={ar}
              type="button"
              onClick={() => setAspectRatio(ar)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                aspectRatio === ar
                  ? 'bg-white/20 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {ar === '9:16' ? '9:16 (Vertical)' : ar === '16:9' ? '16:9 (Card)' : '1:1 (Square)'}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt Input */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold text-slate-300 block">
            {activeMode === 'generate' ? 'Diagram Prompt / Description' : 'Edit Instruction Prompt'}
          </label>
          <button
            type="button"
            onClick={handleAutoFillFromSlide}
            className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 cursor-pointer"
          >
            <Sparkles className="w-3 h-3" />
            <span>Auto-fill from Slide</span>
          </button>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder={
            activeMode === 'generate'
              ? 'e.g. Distributed database replication cluster with Raft consensus leader election and vector storage nodes...'
              : 'e.g. Invert to dark OLED background, highlight the bottlenecks in neon red, and clean vector labels...'
          }
          className="w-full rounded-xl bg-black/70 border border-white/10 p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30 resize-none font-sans"
        />
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span className="truncate">{errorMsg}</span>
        </div>
      )}

      {/* 1-Click Zero-Config Theme Diagram Bar */}
      {activeMode === 'generate' && (
        <button
          type="button"
          onClick={handle1ClickThemeGenerate}
          disabled={isGenerating}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md border hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: `${theme.accent}1A`,
            borderColor: `${theme.accent}55`,
            color: '#FFFFFF',
          }}
        >
          <Zap className="w-3.5 h-3.5" style={{ color: theme.accent }} />
          <span>⚡ 1-Click Generate Theme Schematic (Zero-Config)</span>
        </button>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-black transition-all cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
          style={{ backgroundColor: theme.accent }}
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Generating with gemini-nano-banana-2.1...</span>
            </>
          ) : (
            <>
              <Wand2 className="w-3.5 h-3.5" />
              <span>{activeMode === 'generate' ? `Generate Diagram (${aspectRatio})` : 'Apply AI Edit'}</span>
            </>
          )}
        </button>
      </div>

      {/* Generated Preview & Apply Card */}
      {generatedImageUrl && (
        <div className="mt-3 p-3 rounded-xl bg-black/60 border border-white/15 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Generated Output Ready</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">{usedModel}</span>
          </div>

          <div className="relative rounded-lg overflow-hidden bg-black/80 border border-white/10 max-h-64 flex items-center justify-center">
            <img
              src={generatedImageUrl}
              alt="Generated visual"
              className="max-h-64 object-contain"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <a
              href={generatedImageUrl}
              download="marrok_generated_visual.png"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save PNG</span>
            </a>
            <button
              type="button"
              onClick={handleApplyToSlide}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-black transition-all cursor-pointer shadow-sm hover:opacity-90"
              style={{ backgroundColor: theme.accent }}
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply to Current Slide</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
