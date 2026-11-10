import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import { Header } from './components/Header';
import { AutonomousStudio } from './components/AutonomousStudio';

const ThemeCustomizer = lazy(() =>
  import('./components/ThemeCustomizer').then((m) => ({ default: m.ThemeCustomizer }))
);
const ApiKeyModal = lazy(() =>
  import('./components/ApiKeyModal').then((m) => ({ default: m.ApiKeyModal }))
);
const ContactSheetModal = lazy(() =>
  import('./components/ContactSheetModal').then((m) => ({ default: m.ContactSheetModal }))
);
const SavedPostsDrawer = lazy(() =>
  import('./components/studio/SavedPostsDrawer').then((m) => ({ default: m.SavedPostsDrawer }))
);
const PublishingHubWorkspace = lazy(() =>
  import('./components/studio/PublishingHubWorkspace').then((m) => ({
    default: m.PublishingHubWorkspace,
  }))
);
import {
  CarouselData,
  DEFAULT_PALETTES,
  SavedPostRecord,
  SavedPostStatus,
  SavedPostStorageEngine,
  SlideData,
  ThemePalette,
} from './types';
import { DEFAULT_STARTER_DECK } from './lib/presets';
import { sanitizeFullCarousel, sanitizeSlide } from './lib/textSanitizer';
import { parseCarouselData } from './lib/validation/carousel';
import { runQAChecks } from './lib/qaChecks';
import { runPlatformRiskChecks } from './lib/riskChecks';
import { getPublishBlockers } from './components/studio/PublishChecklist.tsx';
import {
  loadVaultPosts,
  saveValidPost,
  updateSavedPostStatus,
  deleteSavedPost,
  exportVaultJson,
  importVaultJson,
} from './lib/storage/postsVaultClient';
import { fetchPublishStatus } from './lib/publish/publishClient';

const MAX_HISTORY_STEPS = 30;

export default function App() {
  const hasRestoredLocalDraftRef = useRef(false);

  // Local Draft Persistence (Hydrate from browser localStorage if available)
  const [carousel, setCarousel] = useState<CarouselData>(() => {
    try {
      const saved = localStorage.getItem('marrok_deck_draft_v1');
      if (saved) {
        const parsed = parseCarouselData(JSON.parse(saved), { minSlides: 3 });
        if (parsed) {
          const isIdenticalToStarter =
            parsed.slides[0]?.enTitle === DEFAULT_STARTER_DECK.slides[0]?.enTitle &&
            !parsed.id;
          if (!isIdenticalToStarter) {
            hasRestoredLocalDraftRef.current = true;
          }
          return sanitizeFullCarousel(parsed);
        }
      }
    } catch (err) {
      console.warn('Failed to restore draft from localStorage:', err);
    }
    return DEFAULT_STARTER_DECK;
  });

  // 30-Step Undo / Redo History Ring Buffer
  const [pastHistory, setPastHistory] = useState<CarouselData[]>([]);
  const [futureHistory, setFutureHistory] = useState<CarouselData[]>([]);

  const carouselRef = useRef<CarouselData>(carousel);
  carouselRef.current = carousel;
  const pastHistoryRef = useRef<CarouselData[]>(pastHistory);
  pastHistoryRef.current = pastHistory;
  const futureHistoryRef = useRef<CarouselData[]>(futureHistory);
  futureHistoryRef.current = futureHistory;

  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  // Saved & Posted Vault State
  const [savedPosts, setSavedPosts] = useState<SavedPostRecord[]>([]);
  const [storageEngine, setStorageEngine] = useState<SavedPostStorageEngine>('vercel-tmp');
  const [isSavedPostsDrawerOpen, setIsSavedPostsDrawerOpen] = useState(false);
  const [isSavingPost, setIsSavingPost] = useState(false);

  // Palette State
  const initialPaletteKey = carousel.theme || 'teal';
  const [currentPalette, setCurrentPalette] = useState<ThemePalette>(
    DEFAULT_PALETTES[initialPaletteKey] || DEFAULT_PALETTES.teal
  );

  // Auto-Save Draft to LocalStorage whenever carousel changes (with QuotaExceededError fallback)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('marrok_deck_draft_v1', JSON.stringify(carousel));
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLastSavedTime(timeStr);
      } catch (err) {
        // If quota is exceeded due to large base64 images, strip inline data URLs and retry
        try {
          const lightweightDraft: CarouselData = {
            ...carousel,
            slides: carousel.slides.map((s) =>
              s.imageUrl && s.imageUrl.startsWith('data:') && s.imageUrl.length > 50_000
                ? { ...s, imageUrl: undefined }
                : s
            ),
          };
          localStorage.setItem('marrok_deck_draft_v1', JSON.stringify(lightweightDraft));
          const now = new Date();
          const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          setLastSavedTime(timeStr);
        } catch (retryErr) {
          console.warn('Failed to auto-save draft (quota exceeded):', err, retryErr);
        }
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [carousel]);

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [activePhase, setActivePhase] = useState<'studio' | 'publish'>('studio');
  const [publishHubTab, setPublishHubTab] = useState<'single' | 'program' | 'posts' | 'bulk' | 'storage'>('single');
  const [editingPostFromManagerId, setEditingPostFromManagerId] = useState<string | null>(null);
  const [isThemeCustomizerOpen, setIsThemeCustomizerOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isContactSheetOpen, setIsContactSheetOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  }, []);

  const refreshVaultPosts = useCallback((isInitialMount = false) => {
    loadVaultPosts()
      .then((res) => {
        setSavedPosts(res.posts);
        setStorageEngine(res.storageEngine);
        if (isInitialMount && res.posts.length > 0 && !hasRestoredLocalDraftRef.current) {
          const latest = sanitizeFullCarousel(res.posts[0].deck);
          carouselRef.current = latest;
          setCarousel(latest);
          if (latest.theme && DEFAULT_PALETTES[latest.theme]) {
            setCurrentPalette(DEFAULT_PALETTES[latest.theme]);
          }
        }
      })
      .catch((err) => {
        console.warn('Failed to load saved posts vault:', err);
      });
  }, []);

  // Load Saved & Posted Carousels on startup and re-sync when switching browser tabs
  // Also triggers automatic background Cloudinary cleanup for any scheduled post whose dueAt has passed
  useEffect(() => {
    refreshVaultPosts(true);
    fetchPublishStatus()
      .then((status) => {
        if (status.autoCleanedPostIds && status.autoCleanedPostIds.length > 0) {
          refreshVaultPosts(false);
        }
      })
      .catch(() => {
        // Non-fatal in offline mode
      });
    const handleFocus = () => refreshVaultPosts(false);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [refreshVaultPosts]);

  // History-aware Carousel State Updater
  const handleUpdateCarousel: React.Dispatch<React.SetStateAction<CarouselData>> = useCallback(
    (updaterOrValue) => {
      hasRestoredLocalDraftRef.current = true;
      const prev = carouselRef.current;
      const next =
        typeof updaterOrValue === 'function'
          ? (updaterOrValue as (prevState: CarouselData) => CarouselData)(prev)
          : updaterOrValue;
      if (next === prev) return;
      const nextPast = [...pastHistoryRef.current.slice(-(MAX_HISTORY_STEPS - 1)), prev];
      carouselRef.current = next;
      pastHistoryRef.current = nextPast;
      futureHistoryRef.current = [];
      setCarousel(next);
      setPastHistory(nextPast);
      setFutureHistory([]);
    },
    []
  );

  const handleUndo = useCallback(() => {
    const oldPast = pastHistoryRef.current;
    if (oldPast.length === 0) return;
    const previousState = oldPast[oldPast.length - 1];
    const remainingPast = oldPast.slice(0, -1);
    const current = carouselRef.current;
    const nextFuture = [current, ...futureHistoryRef.current.slice(0, MAX_HISTORY_STEPS - 1)];

    carouselRef.current = previousState;
    pastHistoryRef.current = remainingPast;
    futureHistoryRef.current = nextFuture;

    setPastHistory(remainingPast);
    setFutureHistory(nextFuture);
    setCarousel(previousState);
    showToast('Undid last change');
  }, [showToast]);

  const handleRedo = useCallback(() => {
    const oldFuture = futureHistoryRef.current;
    if (oldFuture.length === 0) return;
    const nextState = oldFuture[0];
    const remainingFuture = oldFuture.slice(1);
    const current = carouselRef.current;
    const nextPast = [...pastHistoryRef.current.slice(-(MAX_HISTORY_STEPS - 1)), current];

    carouselRef.current = nextState;
    pastHistoryRef.current = nextPast;
    futureHistoryRef.current = remainingFuture;

    setFutureHistory(remainingFuture);
    setPastHistory(nextPast);
    setCarousel(nextState);
    showToast('Redid change');
  }, [showToast]);

  // Global Keyboard Shortcuts for Undo (Ctrl+Z / Cmd+Z) and Redo (Ctrl+Y / Cmd+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Select or Custom Palette Update
  const handleSelectPalette = (palette: ThemePalette) => {
    setCurrentPalette(palette);
    handleUpdateCarousel((prev) => ({
      ...prev,
      theme: palette.id,
      visualOptions: {
        showCadReticles: palette.showCadReticles ?? prev.visualOptions?.showCadReticles ?? true,
        showSparklines: palette.showSparklines ?? prev.visualOptions?.showSparklines ?? true,
        terminalScanlines: palette.terminalScanlines ?? prev.visualOptions?.terminalScanlines ?? true,
      },
    }));
  };

  const handleResetDraft = () => {
    if (savedPosts.length > 0) {
      const latestSaved = savedPosts[0].deck;
      handleUpdateCarousel(sanitizeFullCarousel(latestSaved));
      if (latestSaved.theme && DEFAULT_PALETTES[latestSaved.theme]) {
        setCurrentPalette(DEFAULT_PALETTES[latestSaved.theme]);
      }
      setActiveSlideIndex(0);
      showToast(`Restored latest saved post: ${savedPosts[0].title.slice(0, 32)}`);
      return;
    }
    handleUpdateCarousel(DEFAULT_STARTER_DECK);
    setActiveSlideIndex(0);
    localStorage.removeItem('marrok_deck_draft_v1');
    showToast('Reset to starter deck');
  };

  // Save Current Carousel as Validated or Posted
  const handleSaveValidPost = async (
    status: SavedPostStatus,
    allowOverride = false
  ): Promise<void> => {
    setIsSavingPost(true);
    try {
      const savedRecord = await saveValidPost({
        deck: carousel,
        postStatus: status,
        allowOverride,
      });
      setSavedPosts((prev) => [savedRecord, ...prev.filter((p) => p.id !== savedRecord.id)]);
      if (savedRecord.storageEngine) {
        setStorageEngine(savedRecord.storageEngine);
      }
      setCarousel((prev) => ({
        ...prev,
        id: savedRecord.id,
        sourceMeta: {
          ...prev.sourceMeta,
          userReviewed: true,
        },
      }));
      showToast(
        status === 'posted'
          ? '✓ Saved & marked as POSTED in Vault!'
          : '✓ Saved as Valid Post in Vault!'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save valid post';
      showToast(`⚠️ ${msg}`);
    } finally {
      setIsSavingPost(false);
    }
  };

  const handleSelectSavedPost = (record: SavedPostRecord) => {
    const cleanDeck = sanitizeFullCarousel({
      ...record.deck,
      id: record.id,
    });
    handleUpdateCarousel(cleanDeck);
    if (cleanDeck.theme && DEFAULT_PALETTES[cleanDeck.theme]) {
      setCurrentPalette(DEFAULT_PALETTES[cleanDeck.theme]);
    }
    setActiveSlideIndex(0);
    showToast(`Loaded saved post: ${record.title.slice(0, 36)}`);
  };

  const handleTogglePostStatus = async (id: string, nextStatus: SavedPostStatus) => {
    try {
      const updated = await updateSavedPostStatus(id, nextStatus);
      setSavedPosts((prev) =>
        [updated, ...prev.filter((p) => p.id !== id)].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
      );
      showToast(
        nextStatus === 'posted' ? '✓ Marked post as POSTED' : 'Marked post as Validated'
      );
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to update post status');
    }
  };

  const handleDeleteSavedPost = async (id: string) => {
    try {
      const remaining = await deleteSavedPost(id);
      setSavedPosts(remaining);
      if (carousel.id === id) {
        setCarousel((prev) => ({ ...prev, id: undefined }));
      }
      showToast('Removed post from Saved Vault');
    } catch {
      showToast('Failed to delete saved post');
    }
  };

  const handleExportVault = () => {
    exportVaultJson(savedPosts);
    showToast(`Exported ${savedPosts.length} saved post(s) as JSON backup`);
  };

  const handleImportVault = async (file: File) => {
    try {
      const text = await file.text();
      const merged = await importVaultJson(text);
      setSavedPosts(merged);
      showToast(`✓ Imported ${merged.length} validated post(s) into Vault`);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to import JSON backup');
    }
  };

  // Derived Deck Status: posted | ready | draft
  const qaReport = runQAChecks(carousel);
  const riskReport = runPlatformRiskChecks(carousel);
  const isReviewed = Boolean(carousel.sourceMeta?.userReviewed);
  const isOfflineDraft = Boolean(
    carousel.sourceMeta?.isFallback ||
    carousel.sourceMeta?.engine === 'offline' ||
    carousel.sourceMeta?.engine === 'offline-synthesizer'
  );
  const blockers = getPublishBlockers(carousel, isOfflineDraft, isReviewed, qaReport, riskReport);
  const isPosted = savedPosts.find((p) => p.id === carousel.id)?.postStatus === 'posted';
  const deckStatus: 'posted' | 'ready' | 'draft' = isPosted
    ? 'posted'
    : blockers.isReady
    ? 'ready'
    : 'draft';

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden text-[#CDD5D9] flex flex-col font-jakarta selection:bg-white/20 transition-colors duration-300 bg-[#080d11]">
      {/* Streamlined Minimalist Header */}
      <Header
        currentPalette={currentPalette}
        onOpenThemeCustomizer={() => setIsThemeCustomizerOpen(true)}
        onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
        onOpenContactSheet={() => setIsContactSheetOpen(true)}
        deckStatus={deckStatus}
        onSaveToVault={() => handleSaveValidPost(deckStatus === 'posted' ? 'posted' : 'validated', true)}
        isSavingPost={isSavingPost}
        onOpenSavedPostsDrawer={() => {
          refreshVaultPosts(false);
          setPublishHubTab('posts');
          setActivePhase('publish');
        }}
        savedPostsCount={savedPosts.length}
        pendingReviewCount={
          savedPosts.filter(
            (p) => p.postStatus !== 'posted' && p.deck?.sourceMeta?.userReviewed === false
          ).length
        }
        canUndo={pastHistory.length > 0}
        canRedo={futureHistory.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        lastSavedTime={lastSavedTime}
        onResetDraft={handleResetDraft}
        activePhase={activePhase}
        isPeakProgramActive={activePhase === 'publish' && publishHubTab === 'program'}
        onPhaseChange={(phase) => {
          if (phase === 'publish' && publishHubTab === 'program') {
            setPublishHubTab('single');
          }
          setActivePhase(phase);
        }}
        onOpenPeakProgram={() => {
          refreshVaultPosts(false);
          setPublishHubTab('program');
          setActivePhase('publish');
        }}
      />

      {/* Primary Viewport: Either Phase 1 (Creation Studio) or Phase 2 (Separated Full-Page Publishing Hub) */}
      <main className="flex-1 lg:min-h-0 max-w-[1440px] w-full mx-auto px-2.5 sm:px-6 py-2 sm:py-3 pb-20 lg:pb-3 flex flex-col">
        {activePhase === 'publish' ? (
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center text-xs font-mono text-slate-400">
                Loading Publishing Hub...
              </div>
            }
          >
            <PublishingHubWorkspace
              initialTab={publishHubTab}
              carousel={carousel}
              theme={currentPalette}
              savedPosts={savedPosts}
              storageEngine={storageEngine}
              onBackToStudio={() => setActivePhase('studio')}
              onSelectPostIntoStudio={(record) => {
                handleSelectSavedPost(record);
                setEditingPostFromManagerId(record.id);
                setActivePhase('studio');
              }}
              onRefreshVault={() => refreshVaultPosts(false)}
              onShowToast={showToast}
              onExportVaultJson={handleExportVault}
              onImportVaultJson={handleImportVault}
            />
          </Suspense>
        ) : (
          <>
            {editingPostFromManagerId && carousel.id === editingPostFromManagerId && (
              <div className="mb-2 px-3 py-2 rounded-xl border border-emerald-400/35 bg-emerald-500/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 font-mono text-[10px] font-bold uppercase shrink-0">
                    Editing Post
                  </span>
                  <span className="font-bold text-white truncate">
                    {carousel.slides[0]?.enTitle || 'Saved Post'}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isSavingPost}
                    onClick={async () => {
                      const existing = savedPosts.find((p) => p.id === carousel.id);
                      await handleSaveValidPost(existing?.postStatus || 'validated', true);
                      setPublishHubTab('posts');
                      setActivePhase('publish');
                    }}
                    className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold cursor-pointer transition-colors"
                  >
                    {isSavingPost ? 'Saving...' : 'Save & Return to Posts Manager'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPublishHubTab('posts');
                      setActivePhase('publish');
                    }}
                    className="px-2.5 py-1 rounded-lg border border-white/15 bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 font-semibold cursor-pointer transition-colors"
                  >
                    Back to Posts
                  </button>
                </div>
              </div>
            )}
            <AutonomousStudio
              carousel={carousel}
              theme={currentPalette}
              activeSlideIndex={activeSlideIndex}
              onSlideChange={setActiveSlideIndex}
              onUpdateCarousel={handleUpdateCarousel}
              onSelectTheme={handleSelectPalette}
              onOpenThemeCustomizer={() => setIsThemeCustomizerOpen(true)}
              onOpenContactSheet={() => setIsContactSheetOpen(true)}
              onOpenSavedPostsDrawer={() => {
                refreshVaultPosts(false);
                setPublishHubTab('posts');
                setActivePhase('publish');
              }}
              onSaveValidPost={handleSaveValidPost}
              isSavingPost={isSavingPost}
              onShowToast={showToast}
              savedPosts={savedPosts}
              onOpenPublishScheduleModal={(tab) => {
                const existing = savedPosts.find((p) => p.id === carousel.id);
                void handleSaveValidPost(existing?.postStatus || 'validated', true);
                setPublishHubTab(tab || 'single');
                setActivePhase('publish');
              }}
            />
          </>
        )}
      </main>

      {/* Slide-Over Saved & Posted Carousels Vault Drawer */}
      {isSavedPostsDrawerOpen && (
        <Suspense fallback={null}>
          <SavedPostsDrawer
            isOpen={isSavedPostsDrawerOpen}
            onClose={() => setIsSavedPostsDrawerOpen(false)}
            posts={savedPosts}
            currentCarousel={carousel}
            theme={currentPalette}
            storageEngine={storageEngine}
            isSaving={isSavingPost}
            onSaveCurrentPost={(status) => handleSaveValidPost(status, true)}
            onSelectPost={handleSelectSavedPost}
            onTogglePostStatus={handleTogglePostStatus}
            onDeletePost={handleDeleteSavedPost}
            onExportVault={handleExportVault}
            onImportVault={handleImportVault}
            onOpenPublishScheduleModal={(tab) => {
              setIsSavedPostsDrawerOpen(false);
              setPublishHubTab(tab || 'bulk');
              setActivePhase('publish');
            }}
          />
        </Suspense>
      )}

      {/* Theme Customizer & Color Palette Studio Modal */}
      {isThemeCustomizerOpen && (
        <Suspense fallback={null}>
          <ThemeCustomizer
            currentPalette={currentPalette}
            onSelectPalette={handleSelectPalette}
            isOpen={isThemeCustomizerOpen}
            onClose={() => setIsThemeCustomizerOpen(false)}
            onShowToast={showToast}
            savedPosts={savedPosts}
          />
        </Suspense>
      )}

      {/* Gemini API Key Configuration Modal */}
      {isApiKeyModalOpen && (
        <Suspense fallback={null}>
          <ApiKeyModal
            isOpen={isApiKeyModalOpen}
            onClose={() => setIsApiKeyModalOpen(false)}
            onKeyUpdated={(key) => {
              showToast(key ? 'Custom Gemini API key active' : 'Using default environment key');
            }}
            onShowToast={showToast}
          />
        </Suspense>
      )}

      {/* Full Deck Contact Sheet Modal */}
      {isContactSheetOpen && (
        <Suspense fallback={null}>
          <ContactSheetModal
            isOpen={isContactSheetOpen}
            onClose={() => setIsContactSheetOpen(false)}
            carousel={carousel}
            theme={currentPalette}
            onSelectSlide={(idx) => {
              setActiveSlideIndex(idx);
              setIsContactSheetOpen(false);
              showToast(`Jumped to Slide ${idx + 1}`);
            }}
            onShowToast={showToast}
          />
        </Suspense>
      )}



      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 right-6 z-50 px-4 py-2.5 rounded-xl bg-slate-900 border border-white/20 text-white text-xs font-semibold shadow-2xl flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: currentPalette.accent }} />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}


