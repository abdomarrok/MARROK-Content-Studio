import type { AIProviderId, AISettingsState } from '../../types.ts';
import { withClientAuthHeaders } from '../security/clientSessionToken.ts';
import { resolvePipelineApiUrl } from '../autonomousPipeline.ts';

/**
 * Retrieves masked AI connection settings from the server vault.
 */
export async function fetchAiSettings(apiBaseUrl?: string): Promise<AISettingsState | null> {
  try {
    const url = resolvePipelineApiUrl('/api/ai-settings', apiBaseUrl);
    const headers = withClientAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers,
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[AI-Client] Failed to load server AI settings:', (err as Error).message);
    return null;
  }
}

/**
 * Saves AI connection settings into the encrypted server vault.
 */
export async function saveAiSettings(
  settings: Partial<AISettingsState>,
  apiBaseUrl?: string
): Promise<AISettingsState | null> {
  try {
    const url = resolvePipelineApiUrl('/api/ai-settings', apiBaseUrl);
    const headers = withClientAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      signal: AbortSignal.timeout(16000),
      body: JSON.stringify(settings),
    });

    if (!res.ok) return null;
    const body = await res.json();
    return body?.settings || null;
  } catch (err) {
    console.warn('[AI-Client] Failed to save AI settings:', (err as Error).message);
    return null;
  }
}

/**
 * Tests connection to a specific AI provider with an instant 1-token ping.
 */
export async function testProviderConnection(
  params: {
    providerId: AIProviderId;
    apiKey?: string;
    baseUrl?: string;
    selectedModel?: string;
  },
  apiBaseUrl?: string
): Promise<{ ok: boolean; latencyMs?: number; error?: string; provider?: string; model?: string }> {
  try {
    const url = resolvePipelineApiUrl('/api/ai-settings/test', apiBaseUrl);
    const headers = withClientAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      signal: AbortSignal.timeout(16000),
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }

    return await res.json();
  } catch (err) {
    return { ok: false, error: (err as Error).message || 'Connection test timeout' };
  }
}
