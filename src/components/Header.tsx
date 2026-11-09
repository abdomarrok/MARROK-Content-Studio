import React, { useState, useEffect, useRef } from 'react';
import {
  Grid,
  MoreVertical,
  X,
  RotateCcw,
  Undo2,
  Redo2,
  BookmarkCheck,
  Check,
  FileEdit,
  Send,
  Layers,
  Radar,
} from 'lucide-react';
import { ThemePalette } from '../types.ts';

interface HeaderProps {
  currentPalette: ThemePalette;
  onOpenThemeCustomizer: () => void;
  onOpenApiKeyModal?: () => void;
  onOpenContactSheet?: () => void;
  onOpenSavedPostsDrawer?: () => void;
  savedPostsCount?: number;
  pendingReviewCount?: number;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  lastSavedTime?: string | null;
  onResetDraft?: () => void;
  deckStatus?: 'draft' | 'ready' | 'posted';
  onSaveToVault?: () => void;
  isSavingPost?: boolean;
  activePhase?: 'studio' | 'publish';
  isPeakProgramActive?: boolean;
  onPhaseChange?: (phase: 'studio' | 'publish') => void;
  onOpenPeakProgram?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPalette,
  onOpenThemeCustomizer,
  onOpenContactSheet,
  onOpenSavedPostsDrawer,
  savedPostsCount = 0,
  pendingReviewCount = 0,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  lastSavedTime,
  onResetDraft,
  deckStatus = 'draft',
  onSaveToVault,
  isSavingPost = false,
  activePhase = 'studio',
  isPeakProgramActive = false,
  onPhaseChange,
  onOpenPeakProgram,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close mobile menu on outside click or escape
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.07] bg-[#080d11]/95 backdrop-blur-md px-2.5 sm:px-6 py-2 transition-colors">
      <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-2 sm:gap-8">
        {/* Zone 1: Brand Wordmark + Studio/Publish/Peak Program Switcher */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 shrink-0">
          <a
            href="#"
            title="MARROK Content Studio"
            className="flex items-center gap-2 group whitespace-nowrap shrink-0"
          >
            <div className="w-7 h-7 rounded-lg overflow-hidden border border-white/15 bg-[#0D0D0D] flex items-center justify-center group-hover:border-white/30 transition-colors shrink-0">
              <img src="/marrok-logo.svg" alt="M" className="w-full h-full object-contain" />
            </div>
            <span className="hidden md:inline text-base sm:text-lg font-extrabold tracking-tight text-white font-jakarta whitespace-nowrap">
              MARROK
            </span>
          </a>

          {onPhaseChange && (
            <div
              role="group"
              aria-label="Workspace Phase"
              className="flex items-center gap-0.5 sm:gap-1 p-0.5 sm:p-1 rounded-lg border border-white/10 bg-black/50"
            >
              <button
                type="button"
                onClick={() => onPhaseChange('studio')}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activePhase === 'studio'
                    ? 'bg-white/15 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5 shrink-0" style={{ color: currentPalette.accent }} />
                <span className="sm:hidden">Studio</span>
                <span className="hidden sm:inline">1. Create Studio</span>
              </button>
              <button
                type="button"
                onClick={() => onPhaseChange('publish')}
                className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activePhase === 'publish' && !isPeakProgramActive
                    ? 'bg-emerald-500/20 text-emerald-200'
                    : 'text-slate-400 hover:text-emerald-300'
                }`}
              >
                <Send className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="sm:hidden">Publish</span>
                <span className="hidden sm:inline">2. Publish & Posts</span>
                {savedPostsCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono tabular-nums text-white">
                    {savedPostsCount}
                  </span>
                )}
              </button>
              {onOpenPeakProgram && (
                <button
                  type="button"
                  onClick={onOpenPeakProgram}
                  className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    activePhase === 'publish' && isPeakProgramActive
                      ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                      : 'text-slate-300 hover:text-cyan-300'
                  }`}
                  title="Open Daily Peak-Hour (10 · 12 · 18) Schedule Review, Weekly Program Approval & Topic Radar"
                >
                  <Radar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="sm:hidden">Peak & Gather</span>
                  <span className="hidden sm:inline">3. Gather & Peak (10·12·18)</span>
                  {pendingReviewCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/30 border border-amber-400/40 text-[10px] font-mono tabular-nums text-amber-200">
                      {pendingReviewCount} review
                    </span>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Zone 2: Workspace Navigation & History Controls */}
        <nav className="hidden md:flex items-center gap-5 text-xs font-medium text-slate-400">
          {(onUndo || onRedo) && (
            <div className="flex items-center gap-1 pr-3 border-r border-white/10">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Undo last edit (Ctrl+Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Redo edit (Ctrl+Y)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {onOpenContactSheet && (
            <button
              type="button"
              onClick={onOpenContactSheet}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
              title="View all slides in Contact Sheet"
            >
              <Grid className="w-3.5 h-3.5 text-cyan-400" />
              <span>All Slides Grid</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenThemeCustomizer}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
            title="Configure Theme & Visual Options"
          >
            <span
              className="w-2.5 h-2.5 rounded-full border border-white/30 shrink-0"
              style={{ backgroundColor: currentPalette.accent }}
            />
            <span>Theme: {currentPalette.name.split(' ')[0]}</span>
          </button>

          {lastSavedTime && (
            <div className="hidden xl:flex items-center gap-1.5 text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap shrink-0">
              <span>Saved {lastSavedTime}</span>
              {onResetDraft && (
                <>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={onResetDraft}
                    className="text-slate-400 hover:text-rose-400 cursor-pointer transition-colors"
                    title="Reset workspace"
                  >
                    Reset
                  </button>
                </>
              )}
            </div>
          )}
        </nav>

        {/* Zone 3: Primary Vault Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onSaveToVault && (
            <button
              type="button"
              disabled={isSavingPost}
              onClick={onSaveToVault}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[36px] sm:min-h-[38px] text-[11px] sm:text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 ${
                deckStatus === 'posted'
                  ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                  : deckStatus === 'ready'
                  ? 'border-teal-400/40 bg-teal-500/15 text-teal-200 hover:bg-teal-500/25'
                  : 'border-white/15 bg-white/[0.05] text-slate-200 hover:bg-white/[0.1] hover:text-white'
              }`}
              title={`Save current deck to Post Library (Status: ${deckStatus.toUpperCase()})`}
            >
              {deckStatus === 'posted' ? (
                <Check className="w-3.5 h-3.5 text-emerald-300" />
              ) : deckStatus === 'ready' ? (
                <BookmarkCheck className="w-3.5 h-3.5" style={{ color: currentPalette.accent }} />
              ) : (
                <FileEdit className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span className="hidden sm:inline">
                {deckStatus === 'posted'
                  ? 'Posted'
                  : deckStatus === 'ready'
                  ? 'Save · Ready'
                  : 'Save Draft'}
              </span>
              <span className="sm:hidden">
                {deckStatus === 'posted' ? 'Posted' : 'Save'}
              </span>
            </button>
          )}

          {/* Mobile Overflow Menu Button (Visible on < md) */}
          <div className="relative md:hidden" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer touch-manipulation"
              title="More Options"
              aria-label="More Options"
            >
              {isMobileMenuOpen ? <X className="w-4 h-4" /> : <MoreVertical className="w-4 h-4" />}
            </button>

            {isMobileMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-white/15 bg-slate-950/95 backdrop-blur-xl p-2 shadow-2xl space-y-1 z-50 animate-scale-up">
                {(onUndo || onRedo) && (
                  <div className="flex items-center gap-1 px-2 py-1 border-b border-white/10 mb-1">
                    <button
                      type="button"
                      onClick={() => {
                        onUndo?.();
                        setIsMobileMenuOpen(false);
                      }}
                      disabled={!canUndo}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-slate-200 hover:bg-white/10 disabled:opacity-30 cursor-pointer"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Undo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onRedo?.();
                        setIsMobileMenuOpen(false);
                      }}
                      disabled={!canRedo}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-slate-200 hover:bg-white/10 disabled:opacity-30 cursor-pointer"
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                      <span>Redo</span>
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onOpenThemeCustomizer();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors text-left cursor-pointer"
                >
                  <span
                    className="w-3 h-3 rounded-full border border-white/30 shrink-0"
                    style={{ backgroundColor: currentPalette.accent }}
                  />
                  <span>Theme: {currentPalette.name}</span>
                </button>

                {onOpenContactSheet && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenContactSheet();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors text-left cursor-pointer"
                  >
                    <Grid className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>All Slides Grid</span>
                  </button>
                )}

                {lastSavedTime && (
                  <div className="pt-1.5 mt-1 border-t border-white/10 px-3 py-1 flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
                    <span>Saved {lastSavedTime}</span>
                    {onResetDraft && (
                      <button
                        type="button"
                        onClick={() => {
                          onResetDraft();
                          setIsMobileMenuOpen(false);
                        }}
                        className="text-xs text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
