import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ThinkingLevel } from '@google/genai';
import {
  synthesizeCarousel,
  resolveSlide1CoverStyle,
  isGrammaticallyBrokenHook,
} from '../lib/synthesis/index.ts';
import { enrichAndPaceCarousel } from '../lib/autonomousPipeline.ts';
import { checkBilingualTranslationFidelity } from '../lib/qaChecks.ts';
import {
  handleRefineSlide,
  setGoogleGenAICtorForTesting,
  resetModelCooldownsForTest,
} from '../../api/controllers/generateController.ts';
import { CoverComposerPanel } from '../components/studio/CoverComposerPanel.tsx';
import { InlineSlideEditor } from '../components/studio/InlineSlideEditor.tsx';
import { DEFAULT_PALETTES, SlideData } from '../types.ts';

const JAVA4SHELL_PROMPT = `Java4Shell (CVE-2026-114938): A critical vulnerability in OpenJDK.
Discovered by the security research team at Calif, this critical vulnerability allows unauthenticated remote code execution across unpatched Java servers.
Affected OpenJDK runtimes fail to sanitize crafted serialized payloads before invoking privileged host commands (CVSS 9.8).
Security teams must audit every exposed JDK version, apply the emergency patch immediately, and isolate outbound network egress.`;

function createMockExpressRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: any = null;
  return {
    setHeader: (k: string, v: string) => {
      headers[k.toLowerCase()] = v;
    },
    status: (code: number) => {
      statusCode = code;
      return {
        json: (payload: any) => {
          body = payload;
          return payload;
        },
      };
    },
    json: (payload: any) => {
      body = payload;
      return payload;
    },
    getResult: () => ({ statusCode, headers, body }),
  };
}

describe('Translation Accuracy, High-Stakes Slide 1 Hooks & Cybersecurity Visuals', () => {
  afterEach(() => {
    setGoogleGenAICtorForTesting(null);
    resetModelCooldownsForTest();
  });

  it('produces grammatically clean high-stakes Slide 1 hooks, distinct Arabic copy, and security visuals for Java4Shell CVE-2026-114938', () => {
    const raw = synthesizeCarousel({
      prompt: JAVA4SHELL_PROMPT,
      postFormat: 'carousel',
    });
    const deck = enrichAndPaceCarousel(raw, JAVA4SHELL_PROMPT);
    const slide1 = deck.slides[0];

    expect(slide1).toBeDefined();
    expect(slide1.enBody).toBe('');
    expect(slide1.arBody).toBe('');

    // 1. No broken English grammar glue or dry attribution hooks
    expect(slide1.enTitle).not.toMatch(/how\s+discovered\s+by/i);
    expect(slide1.enTitle).not.toMatch(/^discovered\s+by/i);
    expect(isGrammaticallyBrokenHook(slide1.enTitle)).toBe(false);
    expect(slide1.coverTeaserEn || '').not.toMatch(/^discovered\s+by/i);
    expect((slide1.coverTeaserEn || '').length).toBeGreaterThan(12);
    expect((slide1.coverTeaserEn || '').length).toBeLessThanOrEqual(68);

    // 2. Accurate, non-duplicated Arabic copy — never off-topic SQL template
    expect(slide1.arTitle).toMatch(/[\u0600-\u06FF]/);
    expect(slide1.coverTeaserAr).toMatch(/[\u0600-\u06FF]/);
    expect(slide1.arTitle).not.toContain('الاستعلام عبر الشيفرة البرمجية');
    expect(slide1.coverTeaserAr).not.toContain('الاستعلام عبر الشيفرة البرمجية');
    expect(slide1.arTitle?.trim()).not.toBe(slide1.coverTeaserAr?.trim());

    // 3. No SQL or Hot Memory / Cold Index storage hallucinations anywhere in the deck
    for (const s of deck.slides) {
      expect(s.arTitle || '').not.toContain('الاستعلام عبر الشيفرة البرمجية');
      expect(s.diagramFooter || '').not.toMatch(/HOT\s+MEMORY|COLD\s+INDEX|HOT\/COLD/i);
      expect(s.codeFileName || '').not.toMatch(/pgvector|query\.sql/i);
    }

    // 4. Slide 1 coverStyle strictly matches its rendered slide archetype
    const resolvedStyle = resolveSlide1CoverStyle(slide1, deck.slides);
    expect(slide1.coverStyle).toBe(resolvedStyle);
    if (slide1.type === 'row') {
      expect(slide1.coverStyle).not.toBe('versus-hook');
    }
  });

  it('flags duplicated AR teaser, off-topic SQL Arabic, missing CVE ID, and broken hook grammar in QA checks', () => {
    const brokenSlide: SlideData = {
      type: 'row',
      enTitle: 'Stop ignoring how discovered by the security CVE-2026-114938.',
      arTitle: 'الاستعلام عبر الشيفرة البرمجية',
      coverTeaserEn: 'Discovered by the security research team at Calif.',
      coverTeaserAr: 'الاستعلام عبر الشيفرة البرمجية',
      enBody: '',
      arBody: '',
    };

    const issues = checkBilingualTranslationFidelity(brokenSlide, 0);
    const ids = issues.map((i) => i.id);
    expect(ids).toContain('bilingual-ar-teaser-dup-0');
    expect(ids).toContain('bilingual-offtopic-ar-0');
    expect(ids).toContain('bilingual-missing-cve-0');
    expect(ids).toContain('hook-grammar-fragment-0');
  });

  it('supports live single-slide Sync AR via handleRefineSlide without altering English copy', async () => {
    const capturedConfigs: any[] = [];
    class FakeGenAI {
      models = {
        generateContent: async (args: any) => {
          capturedConfigs.push(args);
          return {
            text: JSON.stringify({
              arTitle: 'كيف تسمح ثغرة CVE-2026-114938 باختراق خوادم OpenJDK؟',
              coverTeaserAr: 'تفاصيل مسار الاستغلال وخطوات العزل الفوري في الإنتاج',
              arBody: '',
            }),
          };
        },
      };
    }
    setGoogleGenAICtorForTesting(FakeGenAI as any);

    const req: any = {
      headers: { 'x-gemini-key': 'AIzaSyTestFakeKeyForUnitTestsOnly12345' },
      body: {
        mode: 'sync_ar',
        isCover: true,
        category: 'CYBERSECURITY',
        slide: {
          enTitle: 'How CVE-2026-114938 hijacks unpatched OpenJDK servers?',
          coverTeaserEn: 'Inside the exploit chain and emergency patch window',
          enBody: '',
          arTitle: 'الاستعلام عبر الشيفرة البرمجية',
          coverTeaserAr: 'الاستعلام عبر الشيفرة البرمجية',
          arBody: '',
        },
      },
    };
    const res = createMockExpressRes();
    await handleRefineSlide(req, res as any);

    const { body, headers } = res.getResult();
    expect(headers['x-marrok-engine']).toBe('ungrounded');
    expect(body.enTitle).toBe('How CVE-2026-114938 hijacks unpatched OpenJDK servers?');
    expect(body.coverTeaserEn).toBe('Inside the exploit chain and emergency patch window');
    expect(body.arTitle).toContain('CVE-2026-114938');
    expect(body.arTitle).toContain('OpenJDK');
    expect(body.coverTeaserAr).not.toBe(body.arTitle);
    expect(capturedConfigs[0].config.thinkingConfig?.thinkingLevel).toBe(ThinkingLevel.LOW);
    expect(capturedConfigs[0].config.temperature).toBeUndefined();
  });

  it('supports batch deck-wide Sync All AR via handleRefineSlide sync_ar_deck mode', async () => {
    class FakeGenAI {
      models = {
        generateContent: async () => ({
          text: JSON.stringify({
            slides: [
              {
                index: 0,
                arTitle: 'ثغرة CVE-2026-114938 تهدد خوادم OpenJDK فوراً',
                coverTeaserAr: 'تتبع مسار الاستغلال الكامل وخطة العزل العاجل',
                arBody: '',
              },
              {
                index: 1,
                arTitle: 'تنفيذ شيفرة عن بُعد عبر RCE في OpenJDK',
                coverTeaserAr: '',
                arBody: 'الحزم الخبيثة تتجاوز التحقق وتنفذ أوامر داخل الخادم المتأثر.',
              },
            ],
          }),
        }),
      };
    }
    setGoogleGenAICtorForTesting(FakeGenAI as any);

    const req: any = {
      headers: { 'x-gemini-key': 'AIzaSyTestFakeKeyForUnitTestsOnly12345' },
      body: {
        mode: 'sync_ar_deck',
        category: 'CYBERSECURITY',
        slides: [
          {
            enTitle: 'Why CVE-2026-114938 exposes OpenJDK servers immediately',
            coverTeaserEn: 'Trace the exploit path and emergency patch plan',
            enBody: '',
          },
          {
            enTitle: 'Remote code execution via OpenJDK RCE',
            enBody: 'Crafted payloads bypass checks and execute commands on affected hosts.',
          },
        ],
      },
    };
    const res = createMockExpressRes();
    await handleRefineSlide(req, res as any);

    const { body } = res.getResult();
    expect(body.engine).toBe('ungrounded');
    expect(body.slides).toHaveLength(2);
    expect(body.slides[0].arTitle).toContain('CVE-2026-114938');
    expect(body.slides[0].coverTeaserAr).not.toBe(body.slides[0].arTitle);
    expect(body.slides[1].arBody).toContain('الخادم');
  });

  it('renders live Sync AR buttons and keeps CoverComposerPanel focal visual synced with rendered Row slide', () => {
    const onSyncArabic = vi.fn();
    const mismatchedRowSlide: SlideData = {
      type: 'row',
      coverStyle: 'versus-hook', // Intentionally stale/mismatched coverStyle
      diagramVariant: 'isolation',
      enTitle: 'How CVE-2026-114938 breaks OpenJDK runtime isolation?',
      arTitle: 'كيف تكسر ثغرة CVE-2026-114938 عزل OpenJDK؟',
      coverTeaserEn: 'Inside the exploit chain and immediate containment steps',
      coverTeaserAr: 'تفاصيل مسار الهجوم وخطوات الاحتواء الفوري',
      enBody: '',
      arBody: '',
    };

    const { getByTestId, queryByText } = render(
      <CoverComposerPanel
        currentSlide={mismatchedRowSlide}
        theme={Object.values(DEFAULT_PALETTES)[0]}
        onUpdateField={vi.fn()}
        onApplyCoverStyle={vi.fn()}
        onOpenVisualTab={vi.fn()}
        onSyncArabic={onSyncArabic}
      />
    );

    // Must resolve to Visual Teaser (matching slide.type === 'row'), NOT Versus Hook Before/After fields
    expect(queryByText('Before / Legacy')).toBeNull();
    expect(getByTestId('cover-open-visual-gallery-btn')).toBeTruthy();

    fireEvent.click(getByTestId('cover-sync-ar-btn'));
    expect(onSyncArabic).toHaveBeenCalledTimes(1);

    const innerSync = vi.fn();
    const innerSlide: SlideData = {
      type: 'row',
      enTitle: 'Untrusted payloads trigger RCE.',
      arTitle: 'عنوان مبدئي',
      enBody: 'Malicious input reaches privileged runtime paths.',
      arBody: 'نص مبدئي',
    };

    const innerRender = render(
      <InlineSlideEditor
        currentSlide={innerSlide}
        currentSlideIndex={1}
        totalSlides={6}
        theme={Object.values(DEFAULT_PALETTES)[0]}
        isAdvancedCustomizerOpen={false}
        onToggleAdvancedCustomizer={vi.fn()}
        onUpdateField={vi.fn()}
        onSyncArabic={innerSync}
      />
    );

    fireEvent.click(innerRender.getByTestId('slide-sync-ar-btn'));
    expect(innerSync).toHaveBeenCalledTimes(1);
  });
});
