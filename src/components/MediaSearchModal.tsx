import React, { useState, useEffect } from 'react';
import { Search, Globe, Image as ImageIcon, Upload, Link, X, Check, Loader2, Sparkles } from 'lucide-react';
import { ThemePalette } from '../types';
import { fetchAuthedJson } from '../lib/network/httpClient';
import { getBundledOfficialLogoDataUrl, listBundledTechIcons } from '../lib/bundledTechSvgs';

interface MediaItem {
  name?: string;
  title: string;
  url: string;
  thumbUrl?: string;
  category?: string;
  source?: string;
}

interface MediaSearchModalProps {
  isOpen: boolean;
  theme: ThemePalette;
  title?: string;
  initialQuery?: string;
  onSelectUrl: (url: string, label?: string) => void;
  onClose: () => void;
}

export const MediaSearchModal: React.FC<MediaSearchModalProps> = ({
  isOpen,
  theme,
  title = 'Browse Web Icons & Subject Visuals',
  initialQuery = '',
  onSelectUrl,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'techLogos' | 'diagrams' | 'directUrl' | 'upload'>('techLogos');
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [icons, setIcons] = useState<MediaItem[]>([]);
  const [images, setImages] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [directUrl, setDirectUrl] = useState('');
  const [directUrlPreview, setDirectUrlPreview] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch search results from server
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const controller = new AbortController();
    setIsLoading(true);
    setErrorMsg(null);

    const timer = setTimeout(async () => {
      try {
        const data = await fetchAuthedJson<{
          icons?: MediaItem[];
          images?: MediaItem[];
        }>(`/api/search-media?q=${encodeURIComponent(searchQuery)}`, {
          timeoutMs: 15_000,
          signal: controller.signal,
          contextLabel: 'Media Search API',
        });
        if (active) {
          setIcons(data.icons || []);
          setImages(data.images || []);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn('Failed to search media:', err);
        if (active) setErrorMsg('Could not fetch external media. Check your network connection.');
      } finally {
        if (active) setIsLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, searchQuery]);

  if (!isOpen) return null;

  const handleApplyDirectUrl = () => {
    if (!directUrl.trim()) return;
    onSelectUrl(directUrl.trim());
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      onSelectUrl(dataUrl, file.name.replace(/\.[^/.]+$/, ''));
      onClose();
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-white/15 bg-[#090e13] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 px-6 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-bold"
              style={{ backgroundColor: `${theme.accent}20`, color: theme.accent }}
            >
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white font-jakarta">{title}</h3>
              <p className="text-[11px] text-slate-400">
                Official tech brand icons, subject diagrams & custom internet URLs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-white/[0.06] bg-black/40 text-xs">
          <button
            onClick={() => setActiveTab('techLogos')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-semibold transition-all cursor-pointer ${
              activeTab === 'techLogos'
                ? 'text-white border-white'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
            style={{ borderColor: activeTab === 'techLogos' ? theme.accent : undefined }}
          >
            <Sparkles className="w-3.5 h-3.5" style={{ color: activeTab === 'techLogos' ? theme.accent : undefined }} />
            <span>Tech Brand Logos ({icons.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('diagrams')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-semibold transition-all cursor-pointer ${
              activeTab === 'diagrams'
                ? 'text-white border-white'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
            style={{ borderColor: activeTab === 'diagrams' ? theme.accent : undefined }}
          >
            <ImageIcon className="w-3.5 h-3.5" style={{ color: activeTab === 'diagrams' ? theme.accent : undefined }} />
            <span>Web Diagrams & Visuals ({images.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('directUrl')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-semibold transition-all cursor-pointer ${
              activeTab === 'directUrl'
                ? 'text-white border-white'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
            style={{ borderColor: activeTab === 'directUrl' ? theme.accent : undefined }}
          >
            <Link className="w-3.5 h-3.5" style={{ color: activeTab === 'directUrl' ? theme.accent : undefined }} />
            <span>Paste Web URL</span>
          </button>

          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-semibold transition-all cursor-pointer ${
              activeTab === 'upload'
                ? 'text-white border-white'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
            style={{ borderColor: activeTab === 'upload' ? theme.accent : undefined }}
          >
            <Upload className="w-3.5 h-3.5" style={{ color: activeTab === 'upload' ? theme.accent : undefined }} />
            <span>Upload File</span>
          </button>
        </div>

        {/* Search Bar for Logos and Diagrams */}
        {(activeTab === 'techLogos' || activeTab === 'diagrams') && (
          <div className="p-4 px-6 border-b border-white/[0.06] bg-black/20">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  activeTab === 'techLogos'
                    ? 'Search official tech logos (e.g. redis, kubernetes, fastapi, docker, rust)...'
                    : 'Search diagrams by topic (e.g. distributed systems, kernel, cloud architecture)...'
                }
                className="w-full rounded-xl bg-black/60 border border-white/15 pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/40"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {isLoading && (
            <div className="flex items-center justify-center py-12 gap-2 text-slate-400 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: theme.accent }} />
              <span>Searching web media & CDN...</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs text-center mb-3">
              {errorMsg}
            </div>
          )}

          {/* TAB 1: Tech Brand Logos */}
          {activeTab === 'techLogos' && !isLoading && (() => {
            const bundledList = listBundledTechIcons();
            const filteredBundled = searchQuery.trim()
              ? bundledList.filter((b) =>
                  b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  b.slug.toLowerCase().includes(searchQuery.toLowerCase())
                )
              : bundledList;

            const mergedIcons = icons.length > 0 ? icons : filteredBundled.map((b) => ({
              title: b.title,
              category: 'Bundled SVG',
              url: getBundledOfficialLogoDataUrl(b.slug) || '',
            }));

            const resolveIconSrc = (item: { url: string; title: string }) => {
              const bundledData = getBundledOfficialLogoDataUrl(item.title) || getBundledOfficialLogoDataUrl(item.url);
              if (bundledData) return bundledData;
              if (item.url.startsWith('data:')) return item.url;
              return `/api/proxy-image?url=${encodeURIComponent(item.url)}&color=${encodeURIComponent(theme.accent)}`;
            };

            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {mergedIcons.map((item, idx) => {
                  const iconSrc = resolveIconSrc(item);
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        onSelectUrl(iconSrc, item.title);
                        onClose();
                      }}
                      className="group flex flex-col items-center justify-center p-3 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.07] hover:border-white/30 transition-all text-center cursor-pointer relative"
                    >
                      <div className="w-12 h-12 rounded-lg bg-black/50 border border-white/10 flex items-center justify-center p-2.5 mb-2 group-hover:scale-110 transition-transform">
                        <img
                          src={iconSrc}
                          alt={item.title}
                          className="w-full h-full object-contain opacity-90 group-hover:opacity-100"
                        />
                      </div>
                      <span className="text-xs font-bold text-white font-jakarta truncate max-w-full">
                        {item.title}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate max-w-full">
                        {item.category || 'Tech Logo'}
                      </span>
                    </button>
                  );
                })}
                {mergedIcons.length === 0 && (
                  <div className="col-span-full py-12 text-center text-slate-500 text-xs">
                    No tech brand logos matched "{searchQuery}". Try "cassandra", "scylladb", "discord", "postgres", or "docker".
                  </div>
                )}
              </div>
            );
          })()}

          {/* TAB 2: Web Diagrams & Visuals */}
          {activeTab === 'diagrams' && !isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onSelectUrl(img.url, img.title);
                    onClose();
                  }}
                  className="group flex flex-col rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.07] hover:border-white/30 overflow-hidden text-left transition-all cursor-pointer"
                >
                  <div className="w-full h-28 bg-black/60 flex items-center justify-center overflow-hidden relative">
                    <img
                      src={`/api/proxy-image?url=${encodeURIComponent(img.thumbUrl || img.url)}`}
                      alt={img.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      loading="lazy"
                    />
                    <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono bg-black/70 text-slate-300">
                      {img.source}
                    </div>
                  </div>
                  <div className="p-2.5">
                    <span className="text-xs font-semibold text-slate-200 line-clamp-1">
                      {img.title}
                    </span>
                  </div>
                </button>
              ))}
              {images.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-500 text-xs">
                  Type a technical topic in the search bar above to fetch diagrams from the web.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Paste Direct Web URL */}
          {activeTab === 'directUrl' && (
            <div className="space-y-4 max-w-lg mx-auto py-4">
              <div>
                <label className="text-xs font-bold text-slate-200 block mb-1.5">
                  Direct Image or SVG URL from the Internet
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={directUrl}
                    onChange={(e) => {
                      setDirectUrl(e.target.value);
                      setDirectUrlPreview(e.target.value.trim());
                    }}
                    placeholder="https://example.com/architecture-diagram.png"
                    className="flex-1 rounded-xl bg-black/60 border border-white/15 px-3 py-2 text-xs text-white focus:outline-none focus:border-white/40"
                  />
                  <button
                    onClick={handleApplyDirectUrl}
                    disabled={!directUrl.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-30 cursor-pointer"
                    style={{ backgroundColor: theme.accent, color: theme.iconStroke }}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Apply</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Supports SVGs, PNGs, WebP, and JPEGs. The studio automatically routes them through a CORS-safe proxy.
                </p>
              </div>

              {directUrlPreview && (
                <div className="p-3 rounded-xl bg-black/40 border border-white/10 flex flex-col items-center">
                  <span className="text-[11px] font-semibold text-slate-400 mb-2">Live Web Preview:</span>
                  <div className="max-h-48 max-w-full rounded-lg overflow-hidden border border-white/10 p-2 bg-black/60">
                    <img
                      src={`/api/proxy-image?url=${encodeURIComponent(directUrlPreview)}`}
                      alt="Preview"
                      className="max-h-44 object-contain"
                      onError={() => setDirectUrlPreview(null)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Upload Local File */}
          {activeTab === 'upload' && (
            <div className="max-w-md mx-auto py-8 text-center space-y-4">
              <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-white/20 rounded-2xl hover:border-white/40 hover:bg-white/[0.02] cursor-pointer transition-all">
                <Upload className="w-8 h-8 text-slate-400 mb-2" />
                <span className="text-xs font-bold text-white mb-1">
                  Upload custom icon or image from your computer
                </span>
                <span className="text-[11px] text-slate-500">
                  PNG, SVG, JPG, WebP up to 10MB
                </span>
                <input
                  type="file"
                  accept="image/*,.svg"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 px-6 border-t border-white/10 bg-black/40 flex items-center justify-between text-[11px] text-slate-500">
          <span>MARROK High-Resolution Web Asset Ingestion</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
