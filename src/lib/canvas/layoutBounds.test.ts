import { describe, it, expect } from 'vitest';
import { computeSlideElementBounds, findSlideElementAtPoint } from './layoutBounds.ts';
import { SlideData } from '../../types.ts';

describe('computeSlideElementBounds & findSlideElementAtPoint', () => {
  it('correctly computes dynamic bounds on a Hub slide', () => {
    const hubSlide: SlideData = {
      type: 'hub',
      enTitle: 'Vector Databases, explained.',
      arTitle: 'تحليل معماري لمنظومة قواعد البيانات المتجهية',
      enBody: 'Data is converted into high-dimensional arrays of numbers using an embedding model.',
      arBody: 'نظرة معمارية معمقة تشرح آليات العمل والتحديات.',
    };

    const bounds = computeSlideElementBounds(hubSlide);

    expect(bounds.headerBadge).toBeDefined();
    expect(bounds.graphicCard).toBeDefined();
    expect(bounds.titleBlock).toBeDefined();
    expect(bounds.arabicTitleBlock).toBeDefined();
    expect(bounds.bodyBlock).toBeDefined();
    expect(bounds.arabicBodyBlock).toBeDefined();

    // Graphic card on Hub starts below the safe header (y=266, height=790), so titleBlock baseline is at y>=1050 with cap-height offset
    expect(bounds.graphicCard.y).toBe(266);
    expect(bounds.graphicCard.height).toBe(790);
    expect(bounds.titleBlock.y).toBeGreaterThan(900);
    expect(bounds.arabicTitleBlock.y).toBeGreaterThan(bounds.titleBlock.y);
    expect(bounds.bodyBlock.y).toBeGreaterThan(bounds.arabicTitleBlock.y);
    expect(bounds.arabicBodyBlock.y).toBeGreaterThan(bounds.bodyBlock.y);
  });

  it('correctly computes dynamic bounds on a Row/Diagram slide', () => {
    const rowSlide: SlideData = {
      type: 'row',
      diagramVariant: 'scatter',
      enTitle: 'Vectors (Embeddings).',
      arTitle: 'المتجهات والتضمين الدلالي',
      enBody: 'High-dimensional vectors with cosine similarity distance matching.',
      arBody: 'تحويل البيانات إلى مصفوفات رقمية عالية الأبعاد.',
    };

    const bounds = computeSlideElementBounds(rowSlide);

    // Graphic card on Row starts at y=266, height=490 (ends at y=756)
    expect(bounds.graphicCard.y).toBe(266);
    expect(bounds.graphicCard.height).toBe(490);
    expect(bounds.titleBlock.y).toBeGreaterThanOrEqual(756);
  });

  it('correctly computes bounds on a CTA slide', () => {
    const ctaSlide: SlideData = {
      type: 'cta',
      enTitle: 'Scaling Vector Databases?',
      arTitle: 'تبني حلول قواعد البيانات المتجهية؟',
      ctaText: 'Join discussion  •  شارك برأيك',
    };

    const bounds = computeSlideElementBounds(ctaSlide);

    expect(bounds.ctaButton).toBeDefined();
    expect(bounds.attributionCard).toBeDefined();
    expect(bounds.titleBlock).toBeDefined();
    expect(bounds.arabicTitleBlock).toBeDefined();

    // CTA button is positioned above attribution card
    expect(bounds.ctaButton.y).toBeLessThan(bounds.attributionCard.y);
  });

  it('accurately hit-tests clicked coordinates in 1080x1920 space', () => {
    const hubSlide: SlideData = {
      type: 'hub',
      enTitle: 'Vector Databases, explained.',
      arTitle: 'تحليل معماري لمنظومة قواعد البيانات المتجهية',
      enBody: 'High-dimensional arrays.',
      arBody: 'شرح معماري.',
    };

    const bounds = computeSlideElementBounds(hubSlide);

    // Point in center of titleBlock should hit titleBlock
    const titleMidX = bounds.titleBlock.x + bounds.titleBlock.width / 2;
    const titleMidY = bounds.titleBlock.y + bounds.titleBlock.height / 2;
    const hitTitle = findSlideElementAtPoint(titleMidX, titleMidY, bounds);
    expect(hitTitle).toBe('titleBlock');

    // Point in center of graphic card should hit graphicCard
    const cardMidX = bounds.graphicCard.x + bounds.graphicCard.width / 2;
    const cardMidY = bounds.graphicCard.y + bounds.graphicCard.height / 2;
    const hitCard = findSlideElementAtPoint(cardMidX, cardMidY, bounds);
    expect(hitCard).toBe('graphicCard');

    // Point in top header (inside y=206 safe header zone)
    const hitHeader = findSlideElementAtPoint(200, 220, bounds);
    expect(hitHeader).toBe('headerBadge');

    // Point in bottom margin outside all elements should return null
    const hitEmpty = findSlideElementAtPoint(100, 1850, bounds);
    expect(hitEmpty).toBeNull();
  });

  it('centers graphicCard and text blocks horizontally on Instagram 4:5 and 1:1 presets', () => {
    const hubSlide: SlideData = {
      type: 'hub',
      enTitle: 'Is your approved AI becoming a threat?',
      arTitle: 'هل أدوات الذكاء الاصطناعي المعتمدة آمنة؟',
      enBody: 'Approved AI tools can evolve beyond their original scope, creating new security risks.',
      arBody: 'الأدوات المعتمدة قد تتجاوز نطاق عملها الأصلي، مما يخلق مخاطر أمنية جديدة.',
    };

    const ig45Bounds = computeSlideElementBounds(hubSlide, {
      brand: 'MARROK',
      category: 'AI SECURITY & GOVERNANCE',
      theme: 'cyber',
      caption: 'AI Security',
      dimensionPreset: 'ig-4:5',
      slides: [hubSlide],
    });
    const ig45GraphicCenter = ig45Bounds.graphicCard.x + ig45Bounds.graphicCard.width / 2;
    const ig45TitleCenter = ig45Bounds.titleBlock.x + ig45Bounds.titleBlock.width / 2;
    expect(Math.abs(ig45GraphicCenter - 540)).toBeLessThanOrEqual(2);
    expect(Math.abs(ig45TitleCenter - 540)).toBeLessThanOrEqual(2);

    const ig11Bounds = computeSlideElementBounds(hubSlide, {
      brand: 'MARROK',
      category: 'AI SECURITY & GOVERNANCE',
      theme: 'cyber',
      caption: 'AI Security',
      dimensionPreset: 'ig-1:1',
      slides: [hubSlide],
    });
    const ig11GraphicCenter = ig11Bounds.graphicCard.x + ig11Bounds.graphicCard.width / 2;
    expect(Math.abs(ig11GraphicCenter - 540)).toBeLessThanOrEqual(2);
    expect(ig11Bounds.graphicCard.y).toBeGreaterThanOrEqual(112);
  });

  it('skips hidden elements during hit-testing and reflects scaled graphicCard dimensions', () => {
    const slide: SlideData = {
      type: 'row',
      enTitle: 'Hidden Title Test.',
      arTitle: 'اختبار إخفاء العنوان',
      enBody: 'Body text block.',
      arBody: 'نص الفقرة.',
      layoutOverrides: {
        graphicCard: { scale: 1.2 },
        titleBlock: { hidden: true },
        arabicBodyBlock: { hidden: true },
      },
    };

    const bounds = computeSlideElementBounds(slide);
    expect(bounds.titleBlock.hidden).toBe(true);
    expect(bounds.arabicBodyBlock.hidden).toBe(true);
    expect(bounds.graphicCard.height).toBeGreaterThan(490);

    // Clicking inside hidden titleBlock should never return titleBlock
    const titleMidX = bounds.titleBlock.x + bounds.titleBlock.width / 2;
    const titleMidY = bounds.titleBlock.y + bounds.titleBlock.height / 2;
    expect(findSlideElementAtPoint(titleMidX, titleMidY, bounds)).not.toBe('titleBlock');

    // Clicking inside hidden arabicBodyBlock (lowest block) should return null
    const arBodyMidX = bounds.arabicBodyBlock.x + bounds.arabicBodyBlock.width / 2;
    const arBodyMidY = bounds.arabicBodyBlock.y + bounds.arabicBodyBlock.height / 2;
    expect(findSlideElementAtPoint(arBodyMidX, arBodyMidY, bounds)).toBeNull();
  });
});
