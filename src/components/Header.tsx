import React, { useState, useEffect, useRef } from 'react';
import {
  Grid,
  MoreHorizontal,
  X,
  RotateCcw,
  Undo2,
  Redo2,
  BookmarkCheck,
  Check,
  FileEdit,
  Send,
  Layers,
  FolderOpen,
  LogOut,
  KeyRound,
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
  authenticatedUser?: string | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPalette,
  onOpenThemeCustomizer,
  onOpenApiKeyModal,
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
  onPhaseChange,
  authenticatedUser,
  onLogout,
}) => {
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isWorkspaceMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsWorkspaceMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsWorkspaceMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isWorkspaceMenuOpen]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.08] bg-[#080d11]/95 backdrop-blur-md px-2.5 sm:px-6 py-2 transition-colors">
      <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-2 sm:gap-6">
        {/* Zone 1: Brand + Clean Workspace Switcher */}
        <div className="flex items-center gap-2 sm:gap-3.5 min-w-0 shrink-0">
          <a
            href="#"
            title="MARROK Content Studio"
            className="flex items-center gap-2 group whitespace-nowrap shrink-0"
          >
            <div className="w-7 h-7 rounded-lg overflow-hidden border border-white/15 bg-[#0D0D0D] flex items-center justify-center group-hover:border-white/30 transition-colors shrink-0">
              <img src="/marrok-logo.svg" alt="M" className="w-full h-full object-contain" />
            </div>
            <span className="hidden md:inline text-base font-extrabold tracking-tight text-white font-jakarta whitespace-nowrap">
              MARROK
            </span>
          </a>

          {onPhaseChange && (
            <div
              role="group"
              aria-label="Workspace Phase"
              className="flex items-center gap-0.5 p-0.5 rounded-lg border border-white/[0.08] bg-white/[0.03]"
            >
              <button
                type="button"
                onClick={() => onPhaseChange('studio')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activePhase === 'studio'
                    ? 'bg-white/12 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: activePhase === 'studio' ? currentPalette.accent : undefined }}
                />
                <span>Create</span>
              </button>
              <button
                type="button"
                onClick={() => onPhaseChange('publish')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activePhase === 'publish'
                    ? 'bg-emerald-500/20 text-emerald-200'
                    : 'text-slate-400 hover:text-emerald-300'
                }`}
                title="Open Publishing Hub, Schedule Calendar & Gather Radar"
              >
                <Send className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Publish</span>
                {pendingReviewCount > 0 && (
                  <span className="hidden lg:inline text-[11px] font-mono tabular-nums text-amber-300">
                    · {pendingReviewCount}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Zone 2: Quiet Studio History & Canvas Utilities (Desktop md:+) */}
        <nav className="hidden md:flex items-center gap-4 text-xs font-medium text-slate-400">
          {activePhase === 'studio' && (onUndo || onRedo) && (
            <div className="flex items-center gap-0.5 pr-3 border-r border-white/[0.08]">
              <button
                type="button"
                data-testid="header-undo-btn"
                onClick={onUndo}
                disabled={!canUndo}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 transition-colors cursor-pointer"
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                data-testid="header-redo-btn"
                onClick={onRedo}
                disabled={!canRedo}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 transition-colors cursor-pointer"
                title="Redo (Ctrl+Y)"
                aria-label="Redo"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {activePhase === 'studio' && (
            <button
              type="button"
              onClick={onOpenThemeCustomizer}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
              title="Change Theme & Visual Options"
            >
              <span
                className="w-2.5 h-2.5 rounded-full border border-white/25 shrink-0"
                style={{ backgroundColor: currentPalette.accent }}
              />
              <span>{currentPalette.name.split(' ')[0]}</span>
            </button>
          )}

          {activePhase === 'studio' && onOpenContactSheet && (
            <button
              type="button"
              onClick={onOpenContactSheet}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
              title="View all slides in Contact Sheet"
            >
              <Grid className="w-3.5 h-3.5 text-slate-400" />
              <span>All Slides</span>
            </button>
          )}
        </nav>

        {/* Zone 3: Vault, Save & Workspace Overflow Menu */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onOpenSavedPostsDrawer && (
            <button
              type="button"
              aria-label="Open Saved Posts Vault"
              onClick={onOpenSavedPostsDrawer}
              className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[34px] text-xs font-medium rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-300 hover:text-white hover:bg-white/[0.07] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Open Saved & Posted Vault Drawer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="hidden sm:inline">Vault</span>
              <span className="font-mono tabular-nums text-slate-400">{savedPostsCount}</span>
            </button>
          )}

          {activePhase === 'studio' && onSaveToVault && (
            <button
              type="button"
              disabled={isSavingPost}
              onClick={onSaveToVault}
              className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 ${
                deckStatus === 'posted'
                  ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                  : deckStatus === 'ready'
                  ? 'border-teal-400/35 bg-teal-500/15 text-teal-200 hover:bg-teal-500/25'
                  : 'border-white/15 bg-white/[0.05] text-slate-200 hover:bg-white/[0.1] hover:text-white'
              }`}
              title={`Save current deck to Vault (${deckStatus})`}
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

          {/* Unified Workspace Overflow Menu (Desktop + Mobile) */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              data-testid="header-workspace-menu-btn"
              onClick={() => setIsWorkspaceMenuOpen((prev) => !prev)}
              className="w-[34px] h-[34px] flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer touch-manipulation"
              title="Workspace menu"
              aria-label="Workspace menu"
              aria-expanded={isWorkspaceMenuOpen}
            >
              {isWorkspaceMenuOpen ? (
                <X className="w-4 h-4" />
              ) : (
                <MoreHorizontal className="w-4 h-4" />
              )}
            </button>

            {isWorkspaceMenuOpen && (
              <div
                data-testid="header-workspace-menu"
                className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-white/12 bg-[#0c1218]/98 backdrop-blur-xl p-1.5 shadow-2xl space-y-0.5 z-50 animate-scale-up"
              >
                {/* Mobile-only Quick History & Studio Controls */}
                <div className="md:hidden space-y-0.5 pb-1 mb-1 border-b border-white/[0.08]">
                  {activePhase === 'studio' && (onUndo || onRedo) && (
                    <div className="flex items-center gap-1 px-1 py-1">
                      <button
                        type="button"
                        onClick={() => {
                          onUndo?.();
                          setIsWorkspaceMenuOpen(false);
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
                          setIsWorkspaceMenuOpen(false);
                        }}
                        disabled={!canRedo}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-slate-200 hover:bg-white/10 disabled:opacity-30 cursor-pointer"
                      >
                        <Redo2 className="w-3.5 h-3.5" />
                        <span>Redo</span>
                      </button>
                    </div>
                  )}

                  {activePhase === 'studio' && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenThemeCustomizer();
                        setIsWorkspaceMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-slate-200 hover:text-white hover:bg-white/[0.08] rounded-lg transition-colors text-left cursor-pointer"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-white/30 shrink-0"
                        style={{ backgroundColor: currentPalette.accent }}
                      />
                      <span>Theme · {currentPalette.name.split(' ')[0]}</span>
                    </button>
                  )}

                  {activePhase === 'studio' && onOpenContactSheet && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenContactSheet();
                        setIsWorkspaceMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-slate-200 hover:text-white hover:bg-white/[0.08] rounded-lg transition-colors text-left cursor-pointer"
                    >
                      <Grid className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>All Slides Grid</span>
                    </button>
                  )}
                </div>

                {/* Saved Timestamp (Studio Phase Only) */}
                {activePhase === 'studio' && lastSavedTime && (
                  <div className="px-2.5 py-1.5 text-[11px] font-mono tabular-nums text-slate-400">
                    Saved {lastSavedTime}
                  </div>
                )}

                {activePhase === 'studio' && onResetDraft && (
                  <button
                    type="button"
                    onClick={() => {
                      onResetDraft();
                      setIsWorkspaceMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-slate-300 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors text-left cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    <span>Reset Draft</span>
                  </button>
                )}

                {onOpenApiKeyModal && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenApiKeyModal();
                      setIsWorkspaceMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-slate-200 hover:text-white hover:bg-white/[0.08] rounded-lg transition-colors text-left cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>AI Engine Settings</span>
                  </button>
                )}

                {onLogout && authenticatedUser && (
                  <div className="pt-1 mt-1 border-t border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => {
                        setIsWorkspaceMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.08] rounded-lg transition-colors text-left cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <LogOut className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Sign Out</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 truncate max-w-[80px]">
                        {authenticatedUser}
                      </span>
                    </button>
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
