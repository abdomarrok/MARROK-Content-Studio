import React, { useEffect, useRef, useState } from 'react';
import { X, Grid, Download, Eye, Sparkles, Check } from 'lucide-react';
import { CarouselData, ThemePalette } from '../types';
import { renderSlideToCanvas, downloadContactSheetJpg } from '../lib/canvasExporter';

interface ContactSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  carousel: CarouselData;
  theme: ThemePalette;
  onSelectSlide: (index: number) => void;
  onShowToast: (msg: string) => void;
}

export const ContactSheetModal: React.FC<ContactSheetModalProps> = ({
  isOpen,
  onClose,
  carousel,
  theme,
  onSelectSlide,
  onShowToast,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  // Render miniature canvases for each slide
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const total = carousel.slides.length;

    async function renderAllThumbnails() {
      for (let i = 0; i < total; i++) {
        const c = canvasRefs.current[i];
        if (c && isMounted) {
          try {
            // Render full-res offscreen, then downsample cleanly to lightweight preview thumbnail
            const offscreen = await renderSlideToCanvas(
              carousel,
              i,
              undefined,
              theme,
              carousel.visualOptions
            );
            const ctx = c.getContext('2d');
            if (ctx && isMounted) {
              ctx.clearRect(0, 0, c.width, c.height);
              ctx.drawImage(offscreen, 0, 0, 1080, 1920, 0, 0, c.width, c.height);
            }
            // Yield microtask so the browser UI stays completely fluid
            await new Promise((r) => setTimeout(r, 0));
          } catch (err) {
            console.error(`Failed rendering thumbnail ${i}:`, err);
          }
        }
      }
    }

    renderAllThumbnails();

    return () => {
      isMounted = false;
    };
  }, [isOpen, carousel, theme]);

  if (!isOpen) return null;

  const handleExportContactSheet = async () => {
    setIsExporting(true);
    setExportProgress({ current: 0, total: carousel.slides.length });
    try {
      await downloadContactSheetJpg(
        carousel,
        theme,
        (cur, tot) => {
          setExportProgress({ current: cur, total: tot });
        },
        carousel.visualOptions
      );
      onShowToast('Visual QA Contact Sheet exported successfully!');
    } catch (err) {
      console.error('Failed contact sheet export:', err);
      onShowToast('Failed to export contact sheet.');
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl border border-white/10 bg-[#0c1219] shadow-2xl overflow-hidden font-jakarta">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/[0.08] bg-black/40">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${theme.accent}20` }}
            >
              <Grid className="w-5 h-5" style={{ color: theme.accent }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">All Slides Grid · Visual QA Overview</h2>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span className="text-xs font-mono tabular-nums text-slate-300 font-semibold">
                  {carousel.slides.length} Slides
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Full-deck visual overview · Flow & pacing check · 1-click Contact Sheet JPG export
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportContactSheet}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg cursor-pointer disabled:opacity-40"
              style={{
                backgroundColor: theme.accent,
                color: '#0e1117',
              }}
            >
              <Download className="w-4 h-4" />
              <span>
                {isExporting
                  ? `Rendering ${exportProgress?.current}/${exportProgress?.total}...`
                  : 'Download Contact Sheet JPG'}
              </span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Slide Grid Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {carousel.slides.map((slide, idx) => (
              <div
                key={idx}
                onClick={() => {
                  onSelectSlide(idx);
                  onClose();
                  onShowToast(`Jumped to Slide ${idx + 1}`);
                }}
                className="group relative rounded-xl border border-white/10 bg-black/50 overflow-hidden cursor-pointer hover:border-white/30 transition-all hover:scale-[1.02] shadow-md flex flex-col"
              >
                {/* 9:16 Aspect ratio container */}
                <div className="relative aspect-[9/16] w-full bg-slate-950 flex items-center justify-center">
                  <canvas
                    ref={(el) => {
                      canvasRefs.current[idx] = el;
                    }}
                    width={270}
                    height={480}
                    className="w-full h-full object-contain"
                  />

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-3 text-center">
                    <Eye className="w-6 h-6 text-white" />
                    <span className="text-xs font-bold text-white">Edit Slide {idx + 1}</span>
                    <span className="text-[10px] text-slate-300 font-mono uppercase">{slide.type}</span>
                  </div>

                  {/* Slide number badge */}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/80 border border-white/10 text-[10px] font-mono font-bold text-white">
                    #{idx + 1}
                  </div>
                </div>

                {/* Micro Footer Summary */}
                <div className="p-2.5 bg-black/40 border-t border-white/[0.06] text-left">
                  <div className="text-[11px] font-bold text-white truncate">
                    {slide.enTitle || `Slide ${idx + 1}`}
                  </div>
                  <div className="text-[10px] text-slate-400 font-cairo truncate" dir="rtl">
                    {slide.arTitle || ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-3.5 px-6 border-t border-white/[0.08] bg-black/40 text-xs text-slate-400">
          <span>Click any slide to jump directly to it in the Slide Editor.</span>
          <span className="font-mono text-[11px]">
            Master Contact Sheet size: {carousel.slides.length <= 4 ? 4 : 5} cols ×{' '}
            {Math.ceil(carousel.slides.length / (carousel.slides.length <= 4 ? 4 : 5))} rows (JPG Q95)
          </span>
        </div>
      </div>
    </div>
  );
};
