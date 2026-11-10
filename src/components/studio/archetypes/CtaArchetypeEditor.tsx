import React from 'react';
import { ShieldCheck, Globe } from 'lucide-react';
import { CarouselData, SlideData, ThemePalette } from '../../../types.ts';

export interface CtaArchetypeEditorProps {
  currentSlide: SlideData;
  carousel?: CarouselData;
  theme: ThemePalette;
  onUpdateField: (field: keyof SlideData, value: any) => void;
  onUpdateCarouselField?: (field: keyof CarouselData, value: any) => void;
}

export const CtaArchetypeEditor: React.FC<CtaArchetypeEditorProps> = ({
  currentSlide,
  carousel,
  theme,
  onUpdateField,
  onUpdateCarouselField,
}) => {
  return (
    <div className="pt-3 border-t border-white/[0.08] animate-fade-in">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" style={{ color: theme.accent }} />
            <span>CTA Closer Emblem & Attribution Card</span>
          </span>
          <span className="text-[10px] font-mono text-slate-400">Isometric Closer</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Emblem Brand Wordmark</label>
            <input
              type="text"
              value={carousel?.brand || 'MARROK'}
              onChange={(e) => onUpdateCarouselField?.('brand', e.target.value)}
              placeholder="MARROK"
              className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Domain Category Badge</label>
            <input
              type="text"
              value={carousel?.category || ''}
              onChange={(e) => onUpdateCarouselField?.('category', e.target.value)}
              placeholder="SOFTWARE ARCHITECTURE"
              className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono uppercase"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Action Pill CTA Button</label>
            <input
              type="text"
              value={currentSlide.ctaText || ''}
              onChange={(e) => onUpdateField('ctaText', e.target.value)}
              placeholder="Join discussion  •  شارك برأيك"
              className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-semibold"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 flex items-center gap-1 mb-1">
              <Globe className="w-3 h-3 text-slate-400" />
              <span>Website / Profile URL</span>
            </label>
            <input
              type="text"
              value={currentSlide.url ?? carousel?.brandUrl ?? 'marrok.org'}
              onChange={(e) => {
                onUpdateField('url', e.target.value);
                onUpdateCarouselField?.('brandUrl', e.target.value);
              }}
              placeholder="marrok.org"
              className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">
              English Source Attribution Line
            </label>
            <input
              type="text"
              value={currentSlide.enCredit || ''}
              onChange={(e) => onUpdateField('enCredit', e.target.value)}
              placeholder="Technical Analysis // Engineering Architecture"
              className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">
              Arabic Source Attribution Line (RTL)
            </label>
            <input
              type="text"
              dir="rtl"
              value={currentSlide.arCredit || ''}
              onChange={(e) => onUpdateField('arCredit', e.target.value)}
              placeholder="توثيق وتحليل تقني // هندسة الأنظمة"
              className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-arabic"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
