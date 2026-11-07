import React, { useState, useRef } from 'react';
import {
  X,
  BookmarkCheck,
  CheckCircle2,
  Send,
  Trash2,
  FolderOpen,
  Search,
  Download,
  Upload,
  Cloud,
  HardDrive,
  Sparkles,
} from 'lucide-react';
import type {
  CarouselData,
  SavedPostRecord,
  SavedPostStatus,
  SavedPostStorageEngine,
  ThemePalette,
} from '../../types.ts';

interface SavedPostsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  posts: SavedPostRecord[];
  currentCarousel: CarouselData;
  theme: ThemePalette;
  storageEngine: SavedPostStorageEngine;
  isSaving: boolean;
  onSaveCurrentPost: (status: SavedPostStatus) => Promise<void>;
  onSelectPost: (record: SavedPostRecord) => void;
  onTogglePostStatus: (id: string, nextStatus: SavedPostStatus) => Promise<void>;
  onDeletePost: (id: string) => Promise<void>;
  onExportVault: () => void;
  onImportVault: (file: File) => Promise<void>;
  onOpenPublishScheduleModal?: (tab?: 'single' | 'bulk' | 'storage') => void;
}

export const SavedPostsDrawer: React.FC<SavedPostsDrawerProps> = ({
  isOpen,
  onClose,
  posts,
  currentCarousel,
  theme,
  storageEngine,
  isSaving,
  onSaveCurrentPost,
  onSelectPost,
  onTogglePostStatus,
  onDeletePost,
  onExportVault,
  onImportVault,
  onOpenPublishScheduleModal,
}) => {
  const [filterTab, setFilterTab] = useState<'all' | 'posted' | 'validated'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const postedCount = posts.filter((p) => p.postStatus === 'posted').length;
  const validatedCount = posts.filter((p) => p.postStatus === 'validated').length;

  const filteredPosts = posts.filter((post) => {
    if (filterTab === 'posted' && post.postStatus !== 'posted') return false;
    if (filterTab === 'validated' && post.postStatus !== 'validated') return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const firstSlide = post.deck.slides[0];
    return (
      post.title.toLowerCase().includes(q) ||
      post.category.toLowerCase().includes(q) ||
      post.creatorHandle.toLowerCase().includes(q) ||
      (firstSlide?.enTitle || '').toLowerCase().includes(q) ||
      (firstSlide?.arTitle || '').toLowerCase().includes(q)
    );
  });

  const storageBadge =
    storageEngine === 'cloud-kv'
      ? {
          label: 'Vercel KV Cloud Active',
          desc: 'Synced permanently across all devices via Upstash/Vercel KV + IndexedDB Vault',
          cls: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
          icon: Cloud,
        }
      : storageEngine === 'local-disk'
      ? {
          label: 'Server Disk + Browser Vault',
          desc: 'Saved to backend data/saved-posts.json and mirrored to IndexedDB Vault',
          cls: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300',
          icon: HardDrive,
        }
      : {
          label: 'Vercel Serverless + IndexedDB Vault',
          desc: 'Persisted in durable Browser IndexedDB (500MB+) & auto-synced with /api/posts across cold starts',
          cls: 'bg-teal-500/15 border-teal-500/30 text-teal-300',
          icon: Cloud,
        };

  const StorageIcon = storageBadge.icon;
  const activePostRecord = currentCarousel.id
    ? posts.find((p) => p.id === currentCarousel.id)
    : undefined;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Slide-Over Panel */}
      <aside className="relative z-10 w-full max-w-xl bg-[#090e14] border-l border-white/15 h-full flex flex-col shadow-2xl animate-fade-in">
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-white/10 bg-[#0b1118] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center border border-white/15"
              style={{ backgroundColor: `${theme.accent}20` }}
            >
              <BookmarkCheck className="w-4 h-4" style={{ color: theme.accent }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-extrabold text-white font-jakarta tracking-tight">
                  Saved & Posted Vault
                </h2>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-white/10 text-white">
                  {posts.length}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Only validated and posted carousels are stored here — replaces static presets
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Close Vault"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Storage Status & Backup Bar */}
        <div className="px-5 py-2.5 bg-black/40 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-mono font-semibold ${storageBadge.cls}`}
            title={storageBadge.desc}
          >
            <StorageIcon className="w-3 h-3 shrink-0" />
            <span>{storageBadge.label}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onImportVault(file);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[11px] text-slate-300 hover:text-white font-medium transition-colors cursor-pointer"
              title="Import saved posts from a .json backup file"
            >
              <Upload className="w-3 h-3 text-cyan-400" />
              <span>Import JSON</span>
            </button>
            <button
              type="button"
              onClick={onExportVault}
              disabled={posts.length === 0}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[11px] text-slate-300 hover:text-white font-medium transition-colors cursor-pointer disabled:opacity-40"
              title="Download all saved posts as a portable .json backup"
            >
              <Download className="w-3 h-3 text-teal-400" />
              <span>Backup JSON</span>
            </button>
          </div>
        </div>

        {/* Save Current Workspace Post Card */}
        <div className="px-5 py-3.5 bg-[#0d151e] border-b border-white/10 space-y-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                Current Studio Workspace {activePostRecord ? `· Saved (${activePostRecord.postStatus.toUpperCase()})` : '· Unsaved Draft'}
              </span>
              <p className="text-xs font-bold text-white truncate">
                {currentCarousel.slides[0]?.enTitle || currentCarousel.category || 'Current Carousel'}
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300 shrink-0">
              {currentCarousel.slides.length} slides
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-mono text-slate-400">
              Vault Status: <span className="font-bold uppercase text-white">{activePostRecord?.postStatus || 'Draft (Unsaved)'}</span>
            </span>

            <div className="flex items-center gap-1.5">
              {onOpenPublishScheduleModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPublishScheduleModal('bulk');
                  }}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl font-semibold text-xs bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                  title="Batch schedule multiple Vault posts to a weekly calendar queue"
                >
                  <span>Bulk Weekly Queue</span>
                </button>
              )}

              <button
                type="button"
                disabled={isSaving || activePostRecord?.postStatus === 'posted'}
                onClick={() => onSaveCurrentPost('posted')}
                className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl font-bold text-xs text-slate-950 transition-all shadow-md cursor-pointer disabled:opacity-50 whitespace-nowrap"
                style={{ backgroundColor: theme.accent }}
                title="Mark this deck as published/posted to social channels"
              >
                <Send className="w-3.5 h-3.5 text-slate-950" />
                <span>{activePostRecord?.postStatus === 'posted' ? 'Marked as Posted ✓' : 'Mark as Posted'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filter Tabs & Search Bar */}
        <div className="px-5 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-black/50 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                filterTab === 'all' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({posts.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('posted')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                filterTab === 'posted'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Posted ({postedCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('validated')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                filterTab === 'validated'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Validated ({validatedCount})
            </button>
          </div>

          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search saved posts..."
              className="w-full bg-black/50 border border-white/10 focus:border-white/25 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none"
            />
          </div>
        </div>

        {/* Saved Posts List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {filteredPosts.length === 0 ? (
            <div className="h-64 rounded-2xl border border-dashed border-white/10 bg-white/[0.01] flex flex-col items-center justify-center p-6 text-center space-y-2">
              <Sparkles className="w-7 h-7 text-slate-500" />
              <p className="text-xs font-bold text-slate-300">
                {posts.length === 0
                  ? 'No validated posts saved yet'
                  : 'No saved posts match your filter'}
              </p>
              <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed">
                {posts.length === 0
                  ? 'Generate or edit a carousel, verify its copy, and click "Save as Valid Post" or "Save & Mark Posted" above. Your latest saved post will automatically load on startup instead of static starter data.'
                  : 'Try clearing your search query or switching filter tabs.'}
              </p>
            </div>
          ) : (
            filteredPosts.map((record) => {
              const isCurrent = currentCarousel.id === record.id;
              const isPosted = record.postStatus === 'posted';
              const firstSlide = record.deck.slides[0];
              const dateFormatted = new Date(record.updatedAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={record.id}
                  className={`rounded-2xl border p-4 transition-all space-y-3 ${
                    isCurrent
                      ? 'bg-white/[0.06] border-cyan-400/50 shadow-lg'
                      : 'bg-[#0d141d]/90 border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Top Meta Row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider border ${
                          isPosted
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                            : 'bg-cyan-500/15 border-cyan-500/35 text-cyan-300'
                        }`}
                      >
                        {isPosted ? '✓ POSTED' : '● VALIDATED'}
                      </span>

                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-black/50 text-slate-300 border border-white/5">
                        {record.category}
                      </span>

                      <span className="text-[10px] font-mono text-slate-400">
                        {record.slideCount} slides
                      </span>

                      {isCurrent && (
                        <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30">
                          Active in Studio
                        </span>
                      )}
                    </div>

                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {dateFormatted}
                    </span>
                  </div>

                  {/* Bilingual Headline Preview */}
                  <div className="space-y-1">
                    <h3 className="text-xs sm:text-sm font-bold text-white leading-snug">
                      {firstSlide?.enTitle || record.title}
                    </h3>
                    {firstSlide?.arTitle && (
                      <p
                        dir="rtl"
                        className="text-xs font-bold text-slate-300 font-cairo leading-snug"
                      >
                        {firstSlide.arTitle}
                      </p>
                    )}
                    {firstSlide?.enBody && (
                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                        {firstSlide.enBody}
                      </p>
                    )}
                  </div>

                  {/* Bottom Actions Row */}
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-slate-400 truncate">
                      Credit: <strong className="text-slate-200">{record.creatorHandle}</strong>
                    </span>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onTogglePostStatus(record.id, isPosted ? 'validated' : 'posted')
                        }
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                          isPosted
                            ? 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-slate-300'
                            : 'border-emerald-500/35 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200'
                        }`}
                        title={isPosted ? 'Change status back to Validated' : 'Mark this post as Posted on TikTok'}
                      >
                        {isPosted ? 'Mark Unposted' : 'Mark Posted'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onSelectPost(record);
                          onClose();
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold text-[11px] text-slate-950 transition-all cursor-pointer"
                        style={{ backgroundColor: theme.accent }}
                        title="Load this validated carousel into the Studio editor"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Load Post</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeletePost(record.id)}
                        className="p-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-rose-500/20 hover:border-rose-500/40 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
                        title="Delete saved post"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
};
