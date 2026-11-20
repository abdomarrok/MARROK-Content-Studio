import { describe, it, expect } from 'vitest';
import {
  encryptVaultSecret,
  decryptVaultSecret,
  maskApiKey,
  isMaskedKey,
  sanitizeSettingsForClient,
  DEFAULT_AI_SETTINGS,
} from '../../api/controllers/aiStudioController.ts';

describe('AI Settings & Provider Vault Security', () => {
  it('encrypts and decrypts provider API keys cleanly with AES-256-GCM', () => {
    const rawSecret = 'sk-ant-api03-test-token-value-123456789';
    const encrypted = encryptVaultSecret(rawSecret);

    expect(encrypted).not.toBe(rawSecret);
    expect(encrypted.split(':')).toHaveLength(3); // iv:tag:ciphertext

    const decrypted = decryptVaultSecret(encrypted);
    expect(decrypted).toBe(rawSecret);
  });

  it('returns empty string when decrypting invalid or empty payload', () => {
    expect(decryptVaultSecret('')).toBe('');
    expect(decryptVaultSecret('invalid-payload')).toBe('');
    expect(decryptVaultSecret('a:b:c')).toBe('');
  });

  it('masks API keys without leaking characters', () => {
    const geminiKey = 'AIzaSyTestFakeKeyForUnitTestsOnly12345';
    const masked = maskApiKey(geminiKey);

    expect(masked.startsWith('AIzaSy')).toBe(true);
    expect(masked.endsWith('2345')).toBe(true);
    expect(masked).toContain('••••');
    expect(masked).not.toBe(geminiKey);
    expect(isMaskedKey(masked)).toBe(true);
    expect(isMaskedKey(geminiKey)).toBe(false);
  });

  it('handles short keys cleanly', () => {
    expect(maskApiKey('12345')).toBe('••••••••');
    expect(maskApiKey('')).toBe('');
  });

  it('sanitizes raw vault settings for client without exposing unencrypted secrets', () => {
    const rawSettings = {
      activeProviderId: 'anthropic' as const,
      fallbackEnabled: true,
      freeBackupEnabled: true,
      providers: {
        ...DEFAULT_AI_SETTINGS.providers,
        anthropic: {
          ...DEFAULT_AI_SETTINGS.providers.anthropic,
          enabled: true,
          encryptedApiKey: encryptVaultSecret('sk-ant-live-super-secret-key-12345678'),
        },
      },
    };

    const clientView = sanitizeSettingsForClient(rawSettings as any);
    expect(clientView.activeProviderId).toBe('anthropic');
    expect(clientView.providers.anthropic.apiKey).toContain('••••');
    expect(clientView.providers.anthropic.apiKey).not.toContain('live-super-secret');
    expect(clientView.providers.anthropic.enabled).toBe(true);
  });
});
