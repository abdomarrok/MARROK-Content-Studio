import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  ShieldCheck,
  Check,
  ExternalLink,
  Cpu,
  Zap,
  Server,
  Activity,
  AlertCircle,
  Loader2,
  Sliders,
  Globe,
} from 'lucide-react';
import type {
  AIProviderId,
  AISettingsState,
  ThemePalette,
} from '../../types.ts';
import {
  fetchAiSettings,
  saveAiSettings,
  testProviderConnection,
} from '../../lib/ai/aiSettingsClient.ts';

interface AiSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (msg: string) => void;
  theme?: ThemePalette;
}

const PROVIDER_METADATA: Record<
  AIProviderId,
  {
    name: string;
    description: string;
    docsUrl: string;
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
  }
> = {
  gemini: {
    name: 'Google Gemini',
    description: 'Gemini 4 Hydrogen, 3.1 Flash Lite & Nano image models with multimodal grounding.',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    icon: Zap,
    accentColor: '#37E2C0',
  },
  anthropic: {
    name: 'Anthropic Claude',
    description: 'Claude 3.7 Sonnet & 3.5 Haiku for architectural depth and reasoning.',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    icon: Cpu,
    accentColor: '#E06C75',
  },
  openai: {
    name: 'OpenAI',
    description: 'GPT-4o, GPT-4o-mini & o3-mini models via official API.',
    docsUrl: 'https://platform.openai.com/api-keys',
    icon: Globe,
    accentColor: '#10A37F',
  },
  groq: {
    name: 'Groq Cloud',
    description: 'Ultra-fast LPU inference for Llama 3.3 70B & DeepSeek R1 Distill.',
    docsUrl: 'https://console.groq.com/keys',
    icon: Activity,
    accentColor: '#F55036',
  },
  ollama: {
    name: 'Ollama / Local LLM',
    description: 'Zero-cloud local inference running on localhost (11434).',
    docsUrl: 'https://ollama.com',
    icon: Server,
    accentColor: '#98C379',
  },
  custom: {
    name: 'Custom Endpoint',
    description: 'Any OpenAI-compatible gateway (OpenRouter, DeepSeek, vLLM).',
    docsUrl: 'https://openrouter.ai',
    icon: Sliders,
    accentColor: '#61AFEF',
  },
};

const DEFAULT_PROVIDER_MODELS: Record<AIProviderId, string> = {
  gemini: 'gemini-4-hydrogen',
  anthropic: 'claude-3-7-sonnet-20250219',
  openai: 'gpt-4o',
  groq: 'llama-3.3-70b-versatile',
  ollama: 'llama3',
  custom: 'deepseek/deepseek-chat',
};

export const AiSettingsDrawer: React.FC<AiSettingsDrawerProps> = ({
  isOpen,
  onClose,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<AIProviderId>('gemini');
  const [settings, setSettings] = useState<AISettingsState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);

  // Per-provider test connection state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs?: number;
    error?: string;
  } | null>(null);

  // Form edit buffer for current active provider
  const [currentKey, setCurrentKey] = useState('');
  const [currentBackupKey, setCurrentBackupKey] = useState('');
  const [currentBaseUrl, setCurrentBaseUrl] = useState('');
  const [currentModel, setCurrentModel] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setTestResult(null);

    fetchAiSettings()
      .then((data) => {
        if (data) {
          setSettings(data);
          const active = data.providers[activeTab] || data.providers.gemini;
          setCurrentKey(active?.apiKey || '');
          setCurrentBackupKey(active?.backupApiKey || '');
          setCurrentBaseUrl(active?.baseUrl || '');
          setCurrentModel(active?.selectedModel || '');
        }
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  // Update edit buffer and commit changes when switching tabs
  const handleTabChange = (nextProviderId: AIProviderId) => {
    if (!settings) {
      setActiveTab(nextProviderId);
      return;
    }

    // Preserve edits from the tab we are leaving
    const updatedSettings: AISettingsState = {
      ...settings,
      providers: {
        ...settings.providers,
        [activeTab]: {
          ...settings.providers[activeTab],
          apiKey: currentKey,
          backupApiKey: currentBackupKey,
          baseUrl: currentBaseUrl,
          selectedModel: currentModel,
          enabled: Boolean(
            currentKey ||
            currentBaseUrl ||
            settings.providers[activeTab]?.enabled
          ),
        },
      },
    };
    setSettings(updatedSettings);

    const nextP = updatedSettings.providers[nextProviderId];
    setActiveTab(nextProviderId);
    setShowModelPicker(false);
    setTestResult(null);
    setCurrentKey(nextP?.apiKey || '');
    setCurrentBackupKey(nextP?.backupApiKey || '');
    setCurrentBaseUrl(nextP?.baseUrl || '');
    setCurrentModel(nextP?.selectedModel || '');
  };

  const handleTestPing = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const res = await testProviderConnection({
        providerId: activeTab,
        apiKey: currentKey,
        baseUrl: currentBaseUrl || (activeTab === 'custom' ? 'https://openrouter.ai/api/v1' : undefined),
        selectedModel: currentModel || DEFAULT_PROVIDER_MODELS[activeTab],
      });
      setTestResult(res);
      if (res.ok) {
        onShowToast(`${PROVIDER_METADATA[activeTab].name} connected (${res.latencyMs}ms)!`);
      } else {
        onShowToast(`Connection failed: ${res.error || 'Timeout'}`);
      }
    } finally {
      setTesting(false);
    }
  };

  const handleSaveAll = async () => {
    if (!settings) return;
    setSaving(true);

    try {
      // Commit current tab edits into settings buffer
      const updatedProviders = {
        ...settings.providers,
        [activeTab]: {
          ...settings.providers[activeTab],
          apiKey: currentKey,
          backupApiKey: currentBackupKey,
          baseUrl: currentBaseUrl,
          selectedModel: currentModel,
          enabled: true,
        },
      };

      const updatedSettings: AISettingsState = {
        ...settings,
        providers: updatedProviders,
      };

      const saved = await saveAiSettings(updatedSettings);
      if (saved) {
        setSettings(saved);
        onShowToast('AI connections and provider settings securely vaulted!');
        onClose();
      } else {
        onShowToast('Failed to save settings. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSetActiveProvider = (pId: AIProviderId) => {
    if (!settings) return;
    setSettings({
      ...settings,
      activeProviderId: pId,
    });
    onShowToast(`Active generation provider set to ${PROVIDER_METADATA[pId].name}.`);
  };

  if (!isOpen) return null;

  const currentMeta = PROVIDER_METADATA[activeTab];
  const activeConfig = settings?.providers[activeTab];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl h-full bg-[#0a0f14] border-l border-[#1a2530] flex flex-col shadow-2xl">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a2530] bg-[#0d141c]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#37E2C0]/15 text-[#37E2C0] border border-[#37E2C0]/30 flex items-center justify-center">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                AI Studio Connections & Model Hub
              </h2>
              <p className="text-[11px] text-[#7E8B95]">
                Configure multi-provider API keys, custom endpoints & failover cascades
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#7E8B95] hover:text-white hover:bg-[#16202a] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-7 h-7 text-[#37E2C0] animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Active Provider Pill Banner */}
            <div className="p-3.5 bg-[#0e1620] border border-[#1b2a38] rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-[#37E2C0] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span>Active Generation Engine:</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#37E2C0]/20 text-[#37E2C0] border border-[#37E2C0]/40">
                      {PROVIDER_METADATA[settings?.activeProviderId || 'gemini'].name}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#7E8B95] mt-0.5">
                    Cascades to backup providers before using zero-key Pollinations AI.
                  </p>
                </div>
              </div>
              {settings?.activeProviderId !== activeTab && (
                <button
                  type="button"
                  onClick={() => handleSetActiveProvider(activeTab)}
                  className="px-3 py-1.5 text-xs font-bold bg-[#1b2b3a] hover:bg-[#25384c] text-white rounded-xl border border-white/10 transition-colors"
                >
                  Make Primary
                </button>
              )}
            </div>

            {/* Provider Tabs */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#7E8B95]">
                Select AI Provider to Configure
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(PROVIDER_METADATA) as AIProviderId[]).map((pId) => {
                  const meta = PROVIDER_METADATA[pId];
                  const isSelected = activeTab === pId;
                  const isPrimary = settings?.activeProviderId === pId;
                  const Icon = meta.icon;

                  return (
                    <button
                      key={pId}
                      type="button"
                      onClick={() => handleTabChange(pId)}
                      className={`relative p-3 rounded-xl border text-left transition-all flex flex-col gap-1.5 ${
                        isSelected
                          ? 'bg-[#15212c] border-[#37E2C0] shadow-lg shadow-[#37E2C0]/5'
                          : 'bg-[#0d141b] border-[#1a2530] hover:border-[#2a3847]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <Icon className="w-4 h-4" />
                        {isPrimary && (
                          <span className="w-2 h-2 rounded-full bg-[#37E2C0] shadow-sm shadow-[#37E2C0]" />
                        )}
                      </div>
                      <span className="text-xs font-bold text-white truncate">{meta.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Provider Configuration Card */}
            <div className="p-4 bg-[#0d141b] border border-[#1a2530] rounded-2xl space-y-4">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#16212b]">
                <div>
                  <h3 className="text-sm font-extrabold text-white">{currentMeta.name}</h3>
                  <p className="text-[11px] text-[#7E8B95] mt-0.5">{currentMeta.description}</p>
                </div>
                <a
                  href={currentMeta.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[#37E2C0] hover:underline flex items-center gap-1 shrink-0"
                >
                  <span>Docs / Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Endpoint URL (for Ollama or Custom) */}
              {activeConfig?.isCustomEndpoint && (
                <div>
                  <label className="text-xs font-semibold text-white block mb-1.5">
                    API Base URL (OpenAI-compatible)
                  </label>
                  <input
                    type="text"
                    value={currentBaseUrl}
                    onChange={(e) => setCurrentBaseUrl(e.target.value)}
                    placeholder={
                      activeTab === 'ollama'
                        ? 'http://localhost:11434/v1'
                        : 'https://openrouter.ai/api/v1'
                    }
                    className="w-full px-3.5 py-2.5 text-xs bg-black/60 border border-[#1E2833] rounded-xl text-white font-mono placeholder-[#4f5963] focus:outline-none focus:border-[#37E2C0]"
                  />
                </div>
              )}

              {/* API Key */}
              {activeTab !== 'ollama' && (
                <div>
                  <label className="text-xs font-semibold text-white block mb-1.5">
                    {activeTab === 'gemini' ? 'Primary Gemini API Key (Account 1)' : 'API Key'}
                  </label>
                  <input
                    type="password"
                    value={currentKey}
                    onChange={(e) => setCurrentKey(e.target.value)}
                    placeholder="Enter or paste API key..."
                    className="w-full px-3.5 py-2.5 text-xs bg-black/60 border border-[#1E2833] rounded-xl text-white font-mono placeholder-[#4f5963] focus:outline-none focus:border-[#37E2C0]"
                  />
                </div>
              )}

              {/* Backup Key (Gemini only) */}
              {activeTab === 'gemini' && (
                <div>
                  <label className="text-xs font-semibold text-white block mb-1.5">
                    Backup Gemini Key — Account 2 (Automatic 429 Failover)
                  </label>
                  <input
                    type="password"
                    value={currentBackupKey}
                    onChange={(e) => setCurrentBackupKey(e.target.value)}
                    placeholder="Second Google account key for quota rotation..."
                    className="w-full px-3.5 py-2.5 text-xs bg-black/60 border border-[#1E2833] rounded-xl text-white font-mono placeholder-[#4f5963] focus:outline-none focus:border-[#37E2C0]"
                  />
                </div>
              )}

              {/* Auto Model Configuration */}
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-black/40 border border-[#1b2a38] rounded-xl">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-[#37E2C0] shadow-sm shadow-[#37E2C0]/50" />
                    <div>
                      <div className="text-[11px] text-[#7E8B95] font-medium">Model (Auto-Configured)</div>
                      <div className="text-xs font-mono font-bold text-white flex items-center gap-2 mt-0.5">
                        <span>{currentModel || DEFAULT_PROVIDER_MODELS[activeTab]}</span>
                        <span className="text-[10px] font-sans font-normal text-[#37E2C0] bg-[#37E2C0]/10 px-1.5 py-0.5 rounded border border-[#37E2C0]/20">
                          Recommended
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowModelPicker(!showModelPicker)}
                    className="text-[11px] text-slate-400 hover:text-white transition-colors underline cursor-pointer"
                  >
                    {showModelPicker ? 'Done' : 'Change model'}
                  </button>
                </div>

                {showModelPicker && (
                  <div className="p-3 bg-[#0a0f15] border border-[#1E2833] rounded-xl space-y-2 animate-in fade-in duration-150">
                    <label className="text-[11px] font-semibold text-slate-300 block">
                      Choose another model or enter ID
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={currentModel}
                        onChange={(e) => setCurrentModel(e.target.value)}
                        className="flex-1 px-3 py-2 text-xs bg-black/60 border border-[#1E2833] rounded-xl text-white font-mono focus:outline-none focus:border-[#37E2C0]"
                      >
                        {(activeConfig?.availableModels || []).map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={currentModel}
                        onChange={(e) => setCurrentModel(e.target.value)}
                        placeholder="Custom model ID"
                        className="w-40 px-3 py-2 text-xs bg-black/60 border border-[#1E2833] rounded-xl text-white font-mono focus:outline-none focus:border-[#37E2C0]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Test Connection Button & Result */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleTestPing}
                  disabled={testing}
                  className="px-3.5 py-2 text-xs font-bold bg-[#17232f] hover:bg-[#203142] text-[#37E2C0] border border-[#37E2C0]/40 rounded-xl flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {testing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Pinging Provider...</span>
                    </>
                  ) : (
                    <>
                      <Activity className="w-3.5 h-3.5" />
                      <span>Test Connection</span>
                    </>
                  )}
                </button>

                {testResult && (
                  <div className="flex items-center gap-1.5 text-xs font-mono">
                    {testResult.ok ? (
                      <span className="text-[#37E2C0] flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Connected ({testResult.latencyMs}ms)
                      </span>
                    ) : (
                      <span className="text-[#F43F5E] flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {testResult.error || 'Failed'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Cascade Preferences */}
            <div className="p-4 bg-[#0d141b] border border-[#1a2530] rounded-2xl space-y-3">
              <h4 className="text-xs font-extrabold text-white">Failover & Free Backup Cascades</h4>
              <div className="space-y-2">
                <label className="flex items-center justify-between text-xs text-[#CDD5D9] cursor-pointer">
                  <span>Automatic Failover Chain (Primary → Backup → Zero-Key)</span>
                  <input
                    type="checkbox"
                    checked={settings?.fallbackEnabled ?? true}
                    onChange={(e) =>
                      setSettings(settings ? { ...settings, fallbackEnabled: e.target.checked } : null)
                    }
                    className="rounded text-[#37E2C0] focus:ring-0"
                  />
                </label>
                <label className="flex items-center justify-between text-xs text-[#CDD5D9] cursor-pointer">
                  <span>Zero-Key Pollinations AI Backup (openai, mistral, llama)</span>
                  <input
                    type="checkbox"
                    checked={settings?.freeBackupEnabled ?? true}
                    onChange={(e) =>
                      setSettings(settings ? { ...settings, freeBackupEnabled: e.target.checked } : null)
                    }
                    className="rounded text-[#37E2C0] focus:ring-0"
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Drawer Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#1a2530] bg-[#0c131a]">
          <span className="text-[11px] text-[#7E8B95]">Keys encrypted at rest (AES-256-GCM)</span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#CDD5D9] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="px-5 py-2 text-xs font-bold bg-[#37E2C0] text-black rounded-xl hover:brightness-110 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>Save & Vault</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
