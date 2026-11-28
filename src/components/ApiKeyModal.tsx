import React, { useState, useEffect } from 'react';
import { Key, Check, ShieldCheck, X, ExternalLink, RotateCcw } from 'lucide-react';
import { fetchJsonWithTimeout } from '../lib/network/httpClient';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyUpdated: (key: string | null) => void;
  onShowToast: (msg: string) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  onKeyUpdated,
  onShowToast,
}) => {
  const [keyInput, setKeyInput] = useState('');
  const [backupKeyInput, setBackupKeyInput] = useState('');
  const [hasCustomKey, setHasCustomKey] = useState(false);
  const [serverHasKey, setServerHasKey] = useState(true);
  const [serverKeyCount, setServerKeyCount] = useState(1);

  useEffect(() => {
    if (!isOpen) return;

    let savedPrimary = '';
    let savedBackup = '';
    try {
      savedPrimary = localStorage.getItem('marrok_custom_gemini_key') || '';
      savedBackup = localStorage.getItem('marrok_custom_gemini_backup_key') || '';
    } catch {
      // Browser storage unavailable (e.g., restricted iframe sandbox)
    }
    setKeyInput(savedPrimary);
    setBackupKeyInput(savedBackup);
    setHasCustomKey(Boolean(savedPrimary || savedBackup));

    let active = true;
    const controller = new AbortController();

    // Check server key status
    fetchJsonWithTimeout<{ hasApiKey?: boolean; apiKeyCount?: number }>('/api/health', {
      timeoutMs: 10_000,
      signal: controller.signal,
      contextLabel: 'Health check',
    })
      .then((data) => {
        if (!active) return;
        if (typeof data.hasApiKey === 'boolean') {
          setServerHasKey(data.hasApiKey);
        }
        if (typeof data.apiKeyCount === 'number') {
          setServerKeyCount(data.apiKeyCount);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.warn('[ApiKeyModal] Failed to query /api/health:', err);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmedPrimary = keyInput.trim();
    const trimmedBackup = backupKeyInput.trim();

    try {
      if (trimmedPrimary) {
        localStorage.setItem('marrok_custom_gemini_key', trimmedPrimary);
      } else {
        localStorage.removeItem('marrok_custom_gemini_key');
      }

      if (trimmedBackup) {
        localStorage.setItem('marrok_custom_gemini_backup_key', trimmedBackup);
      } else {
        localStorage.removeItem('marrok_custom_gemini_backup_key');
      }
    } catch (err) {
      console.warn('[ApiKeyModal] Browser storage unavailable:', err);
      onShowToast('Browser storage is blocked in this preview; keys could not be saved.');
      return;
    }

    const anyKey = trimmedPrimary || trimmedBackup || null;
    setHasCustomKey(Boolean(anyKey));
    onKeyUpdated(anyKey);

    if (trimmedPrimary && trimmedBackup) {
      onShowToast('Saved Primary + Backup Gemini API keys (Account 1 → Account 2 failover active)!');
    } else if (anyKey) {
      onShowToast('Gemini API key saved with free backup cascade active!');
    } else {
      onShowToast('Cleared custom keys. Using server key pool + zero-key AI backup.');
    }
    onClose();
  };

  const handleClear = () => {
    try {
      localStorage.removeItem('marrok_custom_gemini_key');
      localStorage.removeItem('marrok_custom_gemini_backup_key');
    } catch (err) {
      console.warn('[ApiKeyModal] Failed to clear browser storage:', err);
    }
    setKeyInput('');
    setBackupKeyInput('');
    setHasCustomKey(false);
    onKeyUpdated(null);
    onShowToast('Cleared custom keys. Using default AI Studio runtime.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#0b1015] border border-[#1E2833] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2833] bg-[#0e161c]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#37E2C0]/15 text-[#37E2C0] border border-[#37E2C0]/30 flex items-center justify-center">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Multi-Key Gemini & Free AI Backup
              </h2>
              <p className="text-[11px] text-[#8E989E]">
                Automatic Account 1 → Account 2 rotation & zero-key AI fallback
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8E989E] hover:text-white hover:bg-[#1a232c] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Status Banner */}
          <div className="p-3 bg-[#0e171f] border border-[#1b2b38] rounded-xl flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-[#37E2C0] shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-white">
                {keyInput.trim() && backupKeyInput.trim()
                  ? 'Dual-Account Gemini Rotation Active (2 Keys)'
                  : hasCustomKey
                  ? 'Custom Gemini Key + Free Backup Cascade Active'
                  : serverHasKey
                  ? `Server Gemini Key Pool Active (${Math.max(1, serverKeyCount)} Key${serverKeyCount > 1 ? 's' : ''})`
                  : 'Zero-Key Free AI Backup Active'}
              </p>
              <p className="text-[11px] text-[#8E989E]">
                Failover chain: Account 1 → Account 2 → Gemini Lite/Flash → Zero-Key Pollinations AI.
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-white block mb-1.5">
              Primary Gemini API Key — Account 1 (Optional)
            </label>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs bg-black/60 border border-[#1E2833] rounded-xl text-white font-mono placeholder-[#4f5963] focus:outline-none focus:border-[#37E2C0]"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-white block mb-1.5">
              Backup Gemini API Key — Account 2 (Automatic 429/503 Failover)
            </label>
            <input
              type="password"
              placeholder="AIzaSy... (Second Google account key)"
              value={backupKeyInput}
              onChange={(e) => setBackupKeyInput(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs bg-black/60 border border-[#1E2833] rounded-xl text-white font-mono placeholder-[#4f5963] focus:outline-none focus:border-[#37E2C0]"
            />
            <p className="text-[11px] text-[#8E989E] mt-1.5 flex items-center justify-between">
              <span>Keys stay in your browser storage only (or set GEMINI_API_KEY_BACKUP in Vercel).</span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[#37E2C0] hover:underline flex items-center gap-1 shrink-0 ml-2"
              >
                <span>Get Key</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#1E2833] bg-[#0c1318]">
          {hasCustomKey ? (
            <button
              onClick={handleClear}
              className="text-xs text-[#F43F5E] hover:underline flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Clear & Use Default
            </button>
          ) : (
            <span className="text-[11px] text-[#8E989E]">Multi-key rotation ready</span>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#CDD5D9] hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 text-xs font-bold bg-[#37E2C0] text-black rounded-xl hover:brightness-110 transition-all flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              Save Keys
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

