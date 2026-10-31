import { describe, it, expect } from 'vitest';
import {
  computeSlideLayoutAwareness,
  clampElementDrag,
  applySlideCompositionPreset,
  MIN_GAP_GRAPHIC_TO_TITLE,
  MIN_GAP_TITLES,
  MIN_GAP_TITLE_TO_BODY,
  MIN_GAP_BODIES,
} from './layoutAwareness.ts';
import { CarouselData, SlideData, CanvasDimensionPreset } from '../../types.ts';
import { SAFE_FOOTER_CEILING_Y, getCanvasDimensionSpec } from './constants.ts';

describe('Slide Layout Awareness Engine', () => {
  it('strictly guarantees positive clearance between graphic card and English title', () => {
    const archetypes: SlideData['type'][] = ['row', 'number', 'metric', 'code', 'compare', 'image', 'hub'];

    for (const type of archetypes) {
      const slide: SlideData = {
        type,
        enTitle: 'HNSW The graph approach.',
        arTitle: 'خوارزمية HNSW للبحث السريع',
        enBody: 'A skip-list for graphs. Layers allow greedy hops to neighbors.',
        arBody: 'قائمة تخطي للرسوم البيانية تسمح بالقفز السريع للجيران.',
      };

      const layout = computeSlideLayoutAwareness(slide);
      expect(layout.graphicCard).toBeDefined();
      expect(layout.titleBlock).toBeDefined();

      const cardBottom = layout.graphicCard!.effectiveBottom;
      const titleTop = layout.titleBlock!.top;
      const clearance = titleTop - cardBottom;

      // Clearance must be strictly >= MIN_GAP_GRAPHIC_TO_TITLE (44px)
      expect(clearance).toBeGreaterThanOrEqual(MIN_GAP_GRAPHIC_TO_TITLE);
      // First baseline Y must be below titleTop
      expect(layout.titleBlock!.firstBaselineY).toBeGreaterThan(titleTop);
    }
  });

  it('cascades non-overlapping vertical order: graphicCard -> title -> arTitle -> body -> arBody', () => {
    const slide: SlideData = {
      type: 'row',
      enTitle: 'Vector Indexing Strategies.',
      arTitle: 'استراتيجيات فهرسة المتجهات',
      enBody: 'Approximate Nearest Neighbors algorithm allows trading recall for latency.',
      arBody: 'تتيح خوارزميات الجيران الأقرب المقاربة موازنة دقة الاسترجاع مقابل زمن الاستجابة.',
    };

    const layout = computeSlideLayoutAwareness(slide);

    expect(layout.graphicCard!.effectiveBottom).toBeLessThan(layout.titleBlock!.top);
    expect(layout.titleBlock!.bottom).toBeLessThan(layout.arabicTitleBlock!.top);
    expect(layout.arabicTitleBlock!.bottom).toBeLessThan(layout.bodyBlock!.top);
    expect(layout.bodyBlock!.bottom).toBeLessThan(layout.arabicBodyBlock!.top);

    // Verify minimum safe gaps
    expect(layout.titleBlock!.top - layout.graphicCard!.effectiveBottom).toBeGreaterThanOrEqual(MIN_GAP_GRAPHIC_TO_TITLE);
    expect(layout.arabicTitleBlock!.top - layout.titleBlock!.bottom).toBeGreaterThanOrEqual(MIN_GAP_TITLES);
    expect(layout.bodyBlock!.top - layout.arabicTitleBlock!.bottom).toBeGreaterThanOrEqual(MIN_GAP_TITLE_TO_BODY);
    expect(layout.arabicBodyBlock!.top - layout.bodyBlock!.bottom).toBeGreaterThanOrEqual(MIN_GAP_BODIES);

    // Lowest element must not exceed the TikTok Photo Mode footer ceiling (y=1555)
    expect(layout.arabicBodyBlock!.bottom).toBeLessThanOrEqual(SAFE_FOOTER_CEILING_Y);
  });

  it('respects graphic card scaling and translates title block downward to prevent overlap', () => {
    const normalSlide: SlideData = {
      type: 'row',
      enTitle: 'HNSW Graph Structure.',
      arTitle: 'بنية الرسم البياني HNSW',
      enBody: 'Detailed technical mechanism description.',
      arBody: 'شرح تفصيلي للآلية الهندسية.',
    };

    const scaledSlide: SlideData = {
      ...normalSlide,
      layoutOverrides: {
        graphicCard: { scale: 1.25, dy: 30 },
      },
    };

    const normalLayout = computeSlideLayoutAwareness(normalSlide);
    const scaledLayout = computeSlideLayoutAwareness(scaledSlide);

    expect(scaledLayout.graphicCard!.effectiveBottom).toBeGreaterThan(normalLayout.graphicCard!.effectiveBottom);
    // Scaled slide title must stay below scaled card with at least 44px gap
    expect(scaledLayout.titleBlock!.top - scaledLayout.graphicCard!.effectiveBottom).toBeGreaterThanOrEqual(MIN_GAP_GRAPHIC_TO_TITLE);
  });

  it('clampElementDrag strictly prevents dragging titleBlock upward into graphicCard', () => {
    const slide: SlideData = {
      type: 'row',
      enTitle: 'HNSW Graph.',
      arTitle: 'خوارزمية الرسم البياني',
      enBody: 'High recall vector search.',
      arBody: 'بحث متجهي عالي الدقة.',
    };

    // User attempts to drag titleBlock up by 300px
    const clamped = clampElementDrag('titleBlock', 0, -300, slide);

    // Title should be clamped so that it cannot penetrate the graphic card
    const layoutWithDrag = computeSlideLayoutAwareness({
      ...slide,
      layoutOverrides: {
        titleBlock: { dy: clamped.dy },
      },
    });

    expect(layoutWithDrag.titleBlock!.top - layoutWithDrag.graphicCard!.effectiveBottom).toBeGreaterThanOrEqual(MIN_GAP_GRAPHIC_TO_TITLE);
  });

  it('clampElementDrag strictly prevents dragging arabicBodyBlock downward past footer ceiling', () => {
    const slide: SlideData = {
      type: 'row',
      enTitle: 'Title.',
      arTitle: 'عنوان',
      enBody: 'Body copy.',
      arBody: 'نص عربي.',
    };

    // User attempts to drag arabicBodyBlock down by 800px
    const clamped = clampElementDrag('arabicBodyBlock', 0, 800, slide);

    const layoutWithDrag = computeSlideLayoutAwareness({
      ...slide,
      layoutOverrides: {
        arabicBodyBlock: { dy: clamped.dy },
      },
    });

    expect(layoutWithDrag.arabicBodyBlock!.bottom).toBeLessThanOrEqual(SAFE_FOOTER_CEILING_Y);
  });

  it('handles CTA slide layout with non-overlapping emblem, headlines, and CTA button within safe ceiling', () => {
    const ctaSlide: SlideData = {
      type: 'cta',
      enTitle: 'Master Vector Architecture.',
      arTitle: 'احترف هندسة المتجهات وقواعد البيانات',
      ctaText: 'Follow @MARROK for deep dives',
    };

    const layout = computeSlideLayoutAwareness(ctaSlide);

    expect(layout.graphicCard).toBeDefined();
    expect(layout.titleBlock).toBeDefined();
    expect(layout.arabicTitleBlock).toBeDefined();
    expect(layout.ctaButton).toBeDefined();
    expect(layout.attributionCard).toBeDefined();

    // Verify ordering
    expect(layout.titleBlock!.top).toBeGreaterThan(layout.graphicCard!.effectiveBottom);
    expect(layout.arabicTitleBlock!.top).toBeGreaterThan(layout.titleBlock!.bottom);
    expect(layout.ctaButton!.y).toBeGreaterThan(layout.arabicTitleBlock!.bottom);
    expect(layout.attributionCard!.y).toBeGreaterThan(layout.ctaButton!.y);
    expect(layout.attributionCard!.y + layout.attributionCard!.height / 2).toBeLessThanOrEqual(SAFE_FOOTER_CEILING_Y);
  });

  it('reflows non-overlapping, center-locked, header-safe layout across TikTok 9:16 and Instagram 4:5, 3:4, 1:1, and 9:16 presets', () => {
    const presets: CanvasDimensionPreset[] = ['tiktok-9:16', 'ig-4:5', 'ig-3:4', 'ig-1:1', 'ig-9:16'];
    const archetypes: SlideData['type'][] = ['hub', 'row', 'number', 'poster', 'cta'];

    for (const preset of presets) {
      const spec = getCanvasDimensionSpec(preset);
      const mockCarousel: CarouselData = {
        brand: '@MARROK',
        category: 'SYSTEM DESIGN',
        theme: 'cyber',
        caption: 'Raft consensus architecture',
        dimensionPreset: preset,
        slides: [],
      };

      for (const type of archetypes) {
        const slide: SlideData = {
          type,
          enTitle: 'Distributed Consensus Under Partition.',
          arTitle: 'الإجماع الموزع تحت تقسيم الشبكة',
          enBody: 'Raft elects a single leader per term and replicates log entries to a majority quorum.',
          arBody: 'ينتخب بروتوكول Raft قائداً واحداً لكل دورة وينسخ السجلات للأغلبية.',
          takeaways:
            type === 'poster'
              ? [
                  { en: 'Leader election bounds split-brain.', ar: 'انتخاب القائد يمنع انقسام القرار.' },
                  { en: 'Quorum intersection guarantees safety.', ar: 'تقاطع الأغلبية يضمن الأمان.' },
                  { en: 'Log compaction bounds memory.', ar: 'ضغط السجل يحد من استهلاك الذاكرة.' },
                ]
              : undefined,
        };

        const layout = computeSlideLayoutAwareness(slide, mockCarousel);
        expect(layout.graphicCard).toBeDefined();
        expect(layout.titleBlock).toBeDefined();
        expect(layout.titleBlock!.top).toBeGreaterThan(layout.graphicCard!.effectiveBottom);

        // Graphic card must be horizontally coaxial with spec.safeTextCenterX
        const graphicCenterX = layout.graphicCard!.x + layout.graphicCard!.width / 2;
        expect(Math.abs(graphicCenterX - spec.safeTextCenterX)).toBeLessThanOrEqual(2);

        // Graphic card top must start below the MARROK header badge without collision
        expect(layout.graphicCard!.y).toBeGreaterThanOrEqual(layout.headerBadge.y + layout.headerBadge.height);

        // Top text cushion must remain tight so headlines never drift into the lower-right icon zone
        if (type !== 'cta') {
          expect(layout.titleBlock!.top - layout.graphicCard!.effectiveBottom).toBeLessThanOrEqual(90);
        }

        if (type === 'cta') {
          expect(layout.attributionCard).toBeDefined();
          expect(layout.attributionCard!.y + layout.attributionCard!.height / 2).toBeLessThanOrEqual(
            spec.safeFooterCeilingY + 20
          );
        } else {
          expect(layout.arabicBodyBlock).toBeDefined();
          expect(layout.arabicBodyBlock!.bottom).toBeLessThanOrEqual(spec.safeFooterCeilingY);
        }
      }
    }
  });

  it('supports headline-first composition preset with headlines above graphicCard and body below', () => {
    const baseSlide: SlideData = {
      type: 'image',
      enTitle: 'What is the true financial impact?',
      arTitle: 'ما قيمة الخسائر؟',
      enBody: 'Crypto exchange disclosed a security breach allowing unauthorized withdrawals.',
      arBody: 'أعلنت منصة تداول العملات المشفرة تعرضها لاختراق أمني أتاح تنفيذ عمليات سحب غير مصرح بها.',
    };

    const headlineFirstSlide = applySlideCompositionPreset(baseSlide, 'headline-first');
    expect(headlineFirstSlide.compositionPreset).toBe('headline-first');

    const layout = computeSlideLayoutAwareness(headlineFirstSlide);
    expect(layout.titleBlock).toBeDefined();
    expect(layout.arabicTitleBlock).toBeDefined();
    expect(layout.graphicCard).toBeDefined();
    expect(layout.bodyBlock).toBeDefined();
    expect(layout.arabicBodyBlock).toBeDefined();

    // In headline-first mode: titleBlock -> arabicTitleBlock -> graphicCard -> bodyBlock -> arabicBodyBlock
    expect(layout.titleBlock!.top).toBeGreaterThanOrEqual(layout.headerBadge.y + layout.headerBadge.height);
    expect(layout.arabicTitleBlock!.top).toBeGreaterThan(layout.titleBlock!.bottom);
    expect(layout.graphicCard!.effectiveTop).toBeGreaterThan(layout.arabicTitleBlock!.bottom);
    expect(layout.bodyBlock!.top).toBeGreaterThan(layout.graphicCard!.effectiveBottom);
    expect(layout.arabicBodyBlock!.top).toBeGreaterThan(layout.bodyBlock!.bottom);
    expect(layout.arabicBodyBlock!.bottom).toBeLessThanOrEqual(SAFE_FOOTER_CEILING_Y);
  });

  it('applies per-element scale, alignment, and hidden flags to text blocks', () => {
    const baseSlide: SlideData = {
      type: 'row',
      enTitle: 'Zero-Trust Service Mesh.',
      arTitle: 'شبكة الخدمات عديمة الثقة',
      enBody: 'Mutual TLS and identity-based policy enforcement at every hop.',
      arBody: 'تشفير متبادل وتطبيق السياسات المبنية على الهوية في كل نقطة.',
    };

    const normalLayout = computeSlideLayoutAwareness(baseSlide);
    const customizedLayout = computeSlideLayoutAwareness({
      ...baseSlide,
      layoutOverrides: {
        titleBlock: { scale: 1.25, align: 'left' },
        bodyBlock: { scale: 0.85, align: 'right', hidden: true },
      },
    });

    expect(customizedLayout.titleBlock!.fontSize).toBeGreaterThan(normalLayout.titleBlock!.fontSize);
    expect(customizedLayout.titleBlock!.align).toBe('left');
    expect(customizedLayout.bodyBlock!.align).toBe('right');
    expect(customizedLayout.bodyBlock!.hidden).toBe(true);
  });

  it('allows independent vertical positioning in freeMoveLayout mode without cascading downward push', () => {
    const baseSlide: SlideData = {
      type: 'row',
      enTitle: 'Independent Layer Positioning.',
      arTitle: 'تحريك الطبقات بحرية',
      enBody: 'Moving the English headline does not push the Arabic headline when Free Move is active.',
      arBody: 'تحريك العنوان الإنجليزي لا يدفع العنوان العربي عند تفعيل التحريك الحر.',
    };

    const baselineFree = computeSlideLayoutAwareness({
      ...baseSlide,
      freeMoveLayout: true,
    });
    const movedTitleFree = computeSlideLayoutAwareness({
      ...baseSlide,
      freeMoveLayout: true,
      layoutOverrides: {
        titleBlock: { dy: -120 },
      },
    });

    expect(movedTitleFree.titleBlock!.top).toBeLessThan(baselineFree.titleBlock!.top);
    // Arabic title top stays anchored at its baseline position in freeMoveLayout mode
    expect(movedTitleFree.arabicTitleBlock!.top).toBe(baselineFree.arabicTitleBlock!.top);
  });

  it('guarantees all elements stay strictly inside safe zones across all 5 social formats, composition presets, freeMoveLayout, and extreme overrides', () => {
    const presets: CanvasDimensionPreset[] = ['tiktok-9:16', 'ig-4:5', 'ig-3:4', 'ig-1:1', 'ig-9:16'];
    const compPresets = ['standard', 'headline-first', 'visual-hero', 'split-balanced', 'compact-editorial'] as const;
    const archetypes: SlideData['type'][] = ['hub', 'row', 'number', 'metric', 'code', 'compare', 'poster', 'cta'];

    for (const preset of presets) {
      const spec = getCanvasDimensionSpec(preset);
      const mockCarousel: CarouselData = {
        brand: '@MARROK',
        category: 'SYSTEMS ARCHITECTURE',
        theme: 'cyber',
        caption: 'Safe zone test',
        dimensionPreset: preset,
        slides: [],
      };

      for (const comp of compPresets) {
        for (const freeMove of [false, true]) {
          for (const type of archetypes) {
            const rawSlide: SlideData = applySlideCompositionPreset(
              {
                type,
                enTitle: 'High-Throughput Zero-Copy Kernel Bypass Architecture.',
                arTitle: 'معمارية تجاوز النواة بدون نسخ للبيانات عالية الإنتاجية',
                enBody:
                  'DPDK and io_uring eliminate context-switch overhead by polling NIC ring buffers directly in user space.',
                arBody:
                  'تقوم تقنيات DPDK و io_uring بإلغاء عبء تبديل السياق عبر قراءة حلقات الشبكة مباشرة في مساحة المستخدم.',
                takeaways:
                  type === 'poster'
                    ? [
                        { en: 'Zero-copy ring buffers.', ar: 'حلقات ذاكرة بدون نسخ.' },
                        { en: 'Sub-microsecond p99 tail.', ar: 'زمن استجابة أقل من ميكروثانية.' },
                        { en: 'Pinned NUMA core queues.', ar: 'طوابير أنوية NUMA مخصصة.' },
                      ]
                    : undefined,
              },
              comp
            );

            // Apply extreme overrides to verify clamping in all cases
            const stressedSlide: SlideData = {
              ...rawSlide,
              freeMoveLayout: freeMove,
              layoutOverrides: {
                headerBadge: { dx: -500, dy: -400 },
                graphicCard: { dx: 600, dy: 500, scale: 1.35 },
                titleBlock: { dx: -400, dy: 450, scale: 1.2, align: 'left' },
                arabicTitleBlock: { dx: 400, dy: 450, scale: 1.2, align: 'right' },
                bodyBlock: { dx: 350, dy: 500, scale: 1.15 },
                arabicBodyBlock: { dx: -350, dy: 550, scale: 1.15 },
                takeawaysBlock: { dx: 500, dy: 600, scale: 1.2 },
                ctaButton: { dx: -500, dy: 600, scale: 1.3 },
                attributionCard: { dx: 500, dy: 600, scale: 1.3 },
              },
            };

            const layout = computeSlideLayoutAwareness(stressedSlide, mockCarousel);
            const headerFloorY = layout.headerBadge.hidden
              ? spec.headerY
              : layout.headerBadge.y + layout.headerBadge.height;

            // Header stays inside horizontal safe margins
            expect(layout.headerBadge.x).toBeGreaterThanOrEqual(spec.safeMarginLeft);
            expect(layout.headerBadge.x + layout.headerBadge.width * layout.headerBadge.scale).toBeLessThanOrEqual(
              spec.safeMarginRight
            );

            // Graphic card stays inside vertical safe zone [headerFloorY, safeFooterCeilingY]
            if (layout.graphicCard && !layout.graphicCard.hidden) {
              expect(layout.graphicCard.effectiveTop).toBeGreaterThanOrEqual(headerFloorY - 1);
              expect(layout.graphicCard.effectiveBottom).toBeLessThanOrEqual(spec.safeFooterCeilingY + 1);
            }

            // All text blocks stay inside [headerFloorY, safeFooterCeilingY]
            for (const block of [
              layout.titleBlock,
              layout.arabicTitleBlock,
              layout.bodyBlock,
              layout.arabicBodyBlock,
            ]) {
              if (block && !block.hidden) {
                expect(block.top).toBeGreaterThanOrEqual(headerFloorY - 1);
                expect(block.bottom).toBeLessThanOrEqual(spec.safeFooterCeilingY + 1);
              }
            }

            // Takeaways block stays inside horizontal and vertical safe zone
            if (layout.takeawaysBlock && !layout.takeawaysBlock.hidden) {
              expect(layout.takeawaysBlock.x).toBeGreaterThanOrEqual(spec.safeMarginLeft - 1);
              expect(layout.takeawaysBlock.x + layout.takeawaysBlock.width).toBeLessThanOrEqual(
                spec.safeMarginRight + 1
              );
              expect(layout.takeawaysBlock.top).toBeGreaterThanOrEqual(headerFloorY - 1);
              expect(layout.takeawaysBlock.bottom).toBeLessThanOrEqual(spec.safeFooterCeilingY + 1);
            }

            // CTA button & attribution card stay inside horizontal and vertical safe zone
            if (layout.ctaButton && !layout.ctaButton.hidden) {
              expect(layout.ctaButton.x).toBeGreaterThanOrEqual(spec.safeMarginLeft - 1);
              expect(layout.ctaButton.x + layout.ctaButton.width).toBeLessThanOrEqual(spec.safeMarginRight + 1);
              expect(layout.ctaButton.y).toBeGreaterThanOrEqual(headerFloorY - 1);
              expect(layout.ctaButton.y + layout.ctaButton.height).toBeLessThanOrEqual(spec.safeFooterCeilingY + 1);
            }
            if (layout.attributionCard && !layout.attributionCard.hidden) {
              expect(layout.attributionCard.x).toBeGreaterThanOrEqual(spec.safeMarginLeft - 1);
              expect(layout.attributionCard.x + layout.attributionCard.width).toBeLessThanOrEqual(
                spec.safeMarginRight + 1
              );
              expect(layout.attributionCard.y).toBeGreaterThanOrEqual(headerFloorY - 1);
              expect(layout.attributionCard.y + layout.attributionCard.height).toBeLessThanOrEqual(
                spec.safeFooterCeilingY + 1
              );
            }
          }
        }
      }
    }
  });
});
