import React from 'react';
import {
  Check,
  Copy,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { PostFormat, ThemePalette } from '../../../types.ts';

export interface CaptionInspectorProps {
  caption: string;
  onChangeCaption: (newCaption: string) => void;
  hashtags: string[];
  activePostFormat: PostFormat;
  isVideoSlide?: boolean;
  isGeneratingFromVideo?: boolean;
  onGenerateFromVideo?: () => void;
  copiedType?: string | null;
  onCopyCaption: () => void;
  theme: ThemePalette;
  onOpenPublishScheduleModal?: (tab?: 'single' | 'bulk' | 'storage') => void;
}

export const CaptionInspector: React.FC<CaptionInspectorProps> = ({
  caption,
  onChangeCaption,
  hashtags,
  activePostFormat,
  isVideoSlide = false,
  isGeneratingFromVideo = false,
  onGenerateFromVideo,
  copiedType = null,
  onCopyCaption,
  theme,
  onOpenPublishScheduleModal,
}) => {
  return (
    <div className="space-y-4 w-full" data-testid="caption-inspector">
      {/* Bilingual TikTok / Instagram Posting Copy */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/[0.08] space-y-3 shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="text-xs font-bold text-white uppercase tracking-wider block">
              Social Caption &amp; Hashtags (EN / AR)
            </span>
            <span className="text-[11px] text-slate-400">
              {activePostFormat === 'single'
                ? 'Ready to paste directly into TikTok/Instagram or export in your bundle'
                : 'Included automatically in your marrok_<topic>.zip bundle'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isVideoSlide && onGenerateFromVideo && (
              <button
                type="button"
                data-testid="caption-generate-from-video-btn"
                disabled={isGeneratingFromVideo}
                onClick={onGenerateFromVideo}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-xs text-emerald-200 hover:bg-emerald-500/30 font-semibold cursor-pointer transition-colors disabled:opacity-60"
                title="Extract keyframes from the active video and generate a bilingual social caption + slide copy"
              >
                {isGeneratingFromVideo ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-300" />
                    <span>Analyzing Video...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Generate Caption &amp; Text from Video</span>
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              data-testid="copy-caption-btn"
              onClick={onCopyCaption}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-xs text-cyan-200 hover:bg-cyan-500/25 font-semibold cursor-pointer transition-colors"
            >
              {copiedType === 'caption' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedType === 'caption' ? 'Copied EN + AR!' : 'Copy EN + AR Caption & Hashtags'}</span>
            </button>
          </div>
        </div>

        <textarea
          rows={5}
          value={caption || ''}
          onChange={(e) => onChangeCaption(e.target.value)}
          placeholder="Enter bilingual TikTok caption..."
          className="w-full p-3 rounded-xl bg-black/70 border border-white/10 focus:border-white/30 text-xs text-slate-200 leading-relaxed focus:outline-none resize-y font-sans"
        />

        <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-400 tabular-nums">
          <span className="truncate">{hashtags.join(' ')}</span>
          <span className="shrink-0">{(caption || '').length} chars</span>
        </div>
      </div>

      {onOpenPublishScheduleModal && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => onOpenPublishScheduleModal('single')}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 transition-all cursor-pointer whitespace-nowrap shadow-sm hover:brightness-105"
            style={{ backgroundColor: theme.accent }}
          >
            Send to Publish Hub →
          </button>
        </div>
      )}
    </div>
  );
};
