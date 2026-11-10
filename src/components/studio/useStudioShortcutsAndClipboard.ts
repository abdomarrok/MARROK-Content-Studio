import { useEffect } from 'react';

export interface CompressedImageResult {
  base64: string;
  mimeType: string;
  sizeKb: number;
}

/**
 * Client-side image compressor:
 * Downscales large screenshots to max 1280px JPEG (~150KB) for fast transmission
 */
export function compressImageClientSide(file: File): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const maxDim = 1280;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);
        const sizeKb = Math.round((compressedBase64.length * 3) / 4 / 1024);
        resolve({
          base64: compressedBase64,
          mimeType: 'image/jpeg',
          sizeKb,
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

interface UseStudioShortcutsAndClipboardParams {
  slidesCount: number;
  isExpanded: boolean;
  onCollapseExpanded: () => void;
  onChangeSlide: (updater: (prev: number) => number) => void;
  onPasteImageFile: (file: File) => void;
  onOpenContactSheet?: () => void;
}

/**
 * Encapsulates keyboard navigation (ArrowLeft / ArrowRight / 1-9 / Space / Escape) and
 * global clipboard image paste ingestion for AutonomousStudio.
 */
export function useStudioShortcutsAndClipboard({
  slidesCount,
  isExpanded,
  onCollapseExpanded,
  onChangeSlide,
  onPasteImageFile,
  onOpenContactSheet,
}: UseStudioShortcutsAndClipboardParams): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        onChangeSlide((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        onChangeSlide((prev) => Math.min(slidesCount - 1, prev + 1));
      } else if (e.key === 'Escape' && isExpanded) {
        onCollapseExpanded();
      } else if (/^[1-9]$/.test(e.key)) {
        const targetIndex = parseInt(e.key, 10) - 1;
        if (targetIndex >= 0 && targetIndex < slidesCount) {
          onChangeSlide(() => targetIndex);
        }
      } else if (e.key === ' ' && onOpenContactSheet && !isExpanded) {
        // Only trigger if focus is on body or stage container, not on a button
        if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) {
          return;
        }
        e.preventDefault();
        onOpenContactSheet();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slidesCount, isExpanded, onCollapseExpanded, onChangeSlide, onOpenContactSheet]);

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            onPasteImageFile(file);
            return;
          }
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [onPasteImageFile]);
}

