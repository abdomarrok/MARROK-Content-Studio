import type { SlideData } from '../../../types.ts';
import { autoFitTextToLimits, enforceHeadlineSpecRule, extractCleanSubject } from '../../text/headlines.ts';
import { sanitizeArabicSlideText } from '../../text/arabicBiDi.ts';
import {
  buildNonNumericHookClaimCard,
  extractSourceQuotedHubNodes,
  inferDynamicCoverArchetype,
} from '../smartVisualDefaults.ts';
import type { ExtractedMetric } from './types.ts';
import { resolveTechLogo } from './entityResolution.ts';
import { selectWinningHookMetric } from './metricsScanner.ts';

export function parsePointTopicAndBody(rawPoint: string): { topicTitle: string; topicBody: string } {
  const clean = rawPoint.replace(/^[•\s\d.-]+/, '').trim();
  const match = clean.match(/^\*{0,2}([^:*]{2,45})\*{0,2}:\s*(.+)$/s);
  if (match) {
    const rawHeading = match[1].replace(/[*_`]/g, '').trim();
    const rawBody = match[2].replace(/[*_`]/g, '').trim();
    return { topicTitle: rawHeading, topicBody: rawBody };
  }
  return { topicTitle: '', topicBody: clean };
}

/**
 * Builds slides directly from the user's provided notes, bullets, or recap lines.
 * Dynamic, topic-driven synthesis mapping concepts to dedicated visual schematics.
 */
export function buildDeckFromUserPoints(
  subject: string,
  userPoints: string[],
  options: {
    brand: string;
    brandUrl: string;
    domainCategory: string;
    targetCount: number;
    metrics: ExtractedMetric[];
    centerIcon?: string;
    rawSourceText?: string;
  }
): SlideData[] {
  const { brand, brandUrl, domainCategory, targetCount, metrics } = options;

  const combinedRaw = `${options.rawSourceText || ''} ${subject} ${userPoints.join(' ')}`;
  const isFinancialOrMacro =
    /\$\s*\d+(?:\.\d+)?\s*(?:trillion|billion|million|T|B|M)\b|\b(?:valuation|billion|trillion|deficit|circular\s+financing|subsid|taxpayer|retiree|s&p\s*500|pension|401k|cash[- ]?out|economy|economic|inflation|energy\s+bill|electricity\s+bill|financial\s+engineering|for\s+every\s+\$1)\b|مليار|تريليون|خسائر|تمويل|تقييم|ضرائب|متقاعد|طاقة|اقتصاد|استثمار/i.test(
      combinedRaw
    );

  const cveMatch = combinedRaw.match(/\bCVE-\d{4}-\d{4,7}\b/i);
  const detectedCve = cveMatch ? cveMatch[0].toUpperCase() : '';
  const isCybersecurityDomain =
    !isFinancialOrMacro &&
    (Boolean(detectedCve) ||
      /\b(?:vulnerability|vulnerabilities|zero[- ]?day|exploit|remote\s+code\s+execution|\brce\b|sandbox\s+escape|cvss|privilege\s+escalation|arbitrary\s+code|deserialization|buffer\s+overflow|sql\s+injection|ssrf|xss|java4shell|log4shell|shellshock|heartbleed|security\s+advisory|malicious\s+payload|unpatched|threat\s+actor|attack\s+surface|critical\s+flaw)\b|ثغرة|اختراق|أمن\s+سيبراني|تنفيذ\s+شيفرة/i.test(
        combinedRaw
      ));

  const { cleanSubject, arSubject } = extractCleanSubject(subject);
  const enHook = enforceHeadlineSpecRule(subject, { isHook: true, fallbackSubject: cleanSubject });
  const arHook = isFinancialOrMacro
    ? `مخاطر التقييمات الضخمة و${arSubject}`
    : isCybersecurityDomain
    ? detectedCve
      ? `كيف تعرض ثغرة ${detectedCve} خوادم ${arSubject} للاختراق؟`
      : `كيف تهدد ثغرة ${arSubject} خوادم الإنتاج فعلياً؟`
    : `لماذا يتغير تصميم ${arSubject} فعلياً؟`;

  // Extract strictly source-quoted Hub node labels + 1-line provenance reasons
  const quotedHub = extractSourceQuotedHubNodes(combinedRaw, {
    titleText: enHook,
    category: domainCategory,
    targetCount: 5,
  });

  const pickedMetric = selectWinningHookMetric(combinedRaw, metrics);
  const formattedHookMetricValue = pickedMetric
    ? pickedMetric.type === 'latency'
      ? pickedMetric.value.replace(/\s+/g, '')
      : pickedMetric.value
    : '';
  const hasNumericHook = Boolean(formattedHookMetricValue && /\d/.test(formattedHookMetricValue));
  const nonNumericClaim = !hasNumericHook
    ? buildNonNumericHookClaimCard(combinedRaw, {
        enTitle: enHook,
        enBody: userPoints.slice(0, 2).join(' '),
      })
    : undefined;

  const hookSlide: SlideData = {
    type: hasNumericHook
      ? 'metric'
      : inferDynamicCoverArchetype({
          enTitle: enHook,
          arTitle: arHook,
          enBody: userPoints.slice(0, 2).join(' '),
          hookClaimCard: nonNumericClaim,
        } as SlideData),
    storyRole: 'hook',
    centerIcon: options.centerIcon || (isFinancialOrMacro ? 'dollarSign' : resolveTechLogo(subject) || 'cpu'),
    satLabels: quotedHub.satLabels.slice(0, 5),
    hubNodeReasons: quotedHub.hubNodeReasons,
    ...(hasNumericHook && pickedMetric
      ? {
          metricValue: formattedHookMetricValue,
          metricLabel: (quotedHub.satLabels[0] || pickedMetric.type).toUpperCase(),
          metricDiff: `SOURCE WIN: ${formattedHookMetricValue}`,
          chartDirection: pickedMetric.type === 'latency' ? 'down' : 'up',
        }
      : {
          metricValue: '',
          metricLabel: '',
          metricDiff: '',
          chartDirection: 'none',
          hookClaimCard: nonNumericClaim,
        }),
    enTitle: enHook,
    arTitle: arHook,
    enBody: '',
    arBody: '',
  };

  const slides: SlideData[] = [hookSlide];

  // Distribute points across available content slots (targetCount - 2 = 6 slots)
  const maxContentSlots = targetCount - 2;
  let selectedPoints: string[] = [];

  // Filter out standalone section title lines that don't contain a colon or period and are short
  const substantivePoints = userPoints.filter((p) => {
    const clean = p.replace(/^[•\s\d.-]+/, '').trim();
    if (clean.length < 22) return false;
    if (!clean.includes(':') && !clean.includes('.') && !/\$|\d+%/.test(clean) && clean.length < 40) return false;
    return true;
  });

  if (isFinancialOrMacro && substantivePoints.length > 0) {
    // Score and group points into the logical narrative arc:
    // Stage 1: The Problem / Losses & Valuation Gamble ($20.9B loss, $2.60 per $1, $500B valuation)
    // Stage 2: The Mechanics & Scale (Circular financing, $1.4T commitments, 10GW / nuclear power)
    // Stage 3: The Real-World & Human Impact Grouped Together (Energy bills +63%, Retirees / S&P 500, $6.6B employee cash-out, 5% gov stake / taxpayers)
    // Stage 4: The Core Trade-off / Conclusion
    const classifyNarrativePhase = (pt: string): number => {
      const lowerPt = pt.toLowerCase();
      if (/\b(?:trade-?off|verdict|bottom\s+line|conclusion|private\s+gain|socialized)\b/.test(lowerPt)) return 4;
      if (/\b(?:retiree|pension|401k|s&p\s*500|energy\s+bill|electricity\s+price|63%|taxpayer|government\s+stake|5%\s+stake|backstop|cash[- ]?out|employee|insider|household|consumer)\b/.test(lowerPt)) {
        return 3;
      }
      if (/\b(?:circular|round[- ]?trip|1\.4\s*trillion|\$1\.4t|commitment|infrastructure|gigawatt|10\s*gw|nuclear|reactor|data\s+center)\b/.test(lowerPt)) {
        return 2;
      }
      if (/\b(?:loss|losses|deficit|burn|\$20\.9|\$2\.60|for\s+every\s+\$1|valuation|\$500b|500\s*billion)\b/.test(lowerPt)) {
        return 1;
      }
      return 2;
    };

    const scoreGoldenPoint = (pt: string): number => {
      let score = 0;
      if (/\$\s*\d+(?:\.\d+)?\s*(?:trillion|billion|million|T|B|M)\b/i.test(pt)) score += 5;
      if (/\$2\.60|\$6\.6|\$500|\$1\.4|\$20\.9|63%|5%|10\s*(?:gw|gigawatt)/i.test(pt)) score += 6;
      if (/\b(?:cash[- ]?out|taxpayer|retiree|circular|nuclear|loss|valuation)\b/i.test(pt)) score += 4;
      return score;
    };

    const indexed = substantivePoints.map((pt, idx) => ({
      pt,
      idx,
      phase: classifyNarrativePhase(pt),
      score: scoreGoldenPoint(pt),
    }));

    let chosen = indexed;
    if (indexed.length > maxContentSlots) {
      // Ensure each narrative phase is represented and highest-scoring golden stats win
      const byScore = [...indexed].sort((a, b) => b.score - a.score || a.idx - b.idx);
      const picked = new Set<number>();
      for (const phase of [1, 2, 3, 4]) {
        const phaseMatches = byScore.filter((item) => item.phase === phase);
        for (const m of phaseMatches.slice(0, phase === 3 ? 2 : 1)) {
          if (picked.size < maxContentSlots) picked.add(m.idx);
        }
      }
      for (const item of byScore) {
        if (picked.size >= maxContentSlots) break;
        picked.add(item.idx);
      }
      chosen = indexed.filter((item) => picked.has(item.idx));
    }

    // Sort chosen points strictly by Narrative Phase (1: Losses -> 2: Mechanics/Scale -> 3: Human/Energy/Taxpayer Impact -> 4: Trade-off)
    chosen.sort((a, b) => a.phase - b.phase || a.idx - b.idx);
    selectedPoints = chosen.map((item) => item.pt);
  } else if (substantivePoints.length <= maxContentSlots) {
    selectedPoints = [...substantivePoints];
  } else {
    // Semantic diversity grouping: collect candidates for distinct mechanism variants
    const categories: Array<{ pattern: RegExp }> = [
      { pattern: /vector|embedding|high-dimensional|cosine/i },
      { pattern: /hnsw|hierarchical|graph|skip[- ]?list/i },
      { pattern: /ivf|cluster|k-means|centroid|partition/i },
      { pattern: /write|hot|cold|buffer|lsm|compaction/i },
      { pattern: /choosing\s+a\s+database|postgres.*pinecone|vs\b|versus/i },
      { pattern: /model upgrade|re-embed|source of truth|primary db|boring|trade-?off/i },
      { pattern: /filter|constraint|metadata/i },
    ];

    const pickedIndices = new Set<number>();

    for (const cat of categories) {
      if (pickedIndices.size >= maxContentSlots) break;
      const matchIdx = substantivePoints.findIndex((p, idx) => !pickedIndices.has(idx) && cat.pattern.test(p));
      if (matchIdx >= 0) {
        pickedIndices.add(matchIdx);
      }
    }

    // Fill remaining slots in sequential order if needed
    for (let i = 0; i < substantivePoints.length && pickedIndices.size < maxContentSlots; i++) {
      pickedIndices.add(i);
    }

    selectedPoints = Array.from(pickedIndices)
      .sort((a, b) => a - b)
      .slice(0, maxContentSlots)
      .map((idx) => substantivePoints[idx]);
  }

  selectedPoints.forEach((point, idx) => {
    const { topicTitle, topicBody } = parsePointTopicAndBody(point);
    const fullText = `${topicTitle} ${topicBody}`.toLowerCase();
    const effectiveTitle = topicTitle || point.split(/\s+/).slice(0, 5).join(' ');
    const enTitle = enforceHeadlineSpecRule(effectiveTitle, { isHook: false });
    const hasArabicText = /[\u0600-\u06FF]/.test(topicBody);

    // Financial & Economic Specific Slide Mapping (Prevents DevOps/SQL/Vector Hallucinations)
    if (isFinancialOrMacro) {
      // A. Circular Financing / Capital Loop Topology
      if (/circular|round[- ]?trip|vendor|cloud\s+credit|invest.*spend/i.test(fullText)) {
        slides.push({
          type: 'row',
          diagramVariant: 'topology',
          diagramNodes: [
            { label: 'Capital Injection', sublabel: 'Tech Giants & Debt Funds', status: 'CAPITAL', icon: 'dollarSign' },
            { label: 'Cloud & Chips', sublabel: 'Compute Credits & GPUs', status: 'ALLOCATED', icon: 'cpu' },
            { label: 'Booked Revenue', sublabel: 'Recycled Vendor Top-Line', status: 'BOOKED', icon: 'landmark' },
          ],
          diagramEdges: ['INVEST', 'RECYCLE'],
          diagramFooter: 'CAPITAL TOPOLOGY: CIRCULAR FINANCING & VALUE FLOW',
          enTitle,
          arTitle: `آلية التمويل الدائري: ${effectiveTitle.slice(0, 22)}.`,
          enBody: autoFitTextToLimits(topicBody, 135),
          arBody: hasArabicText
            ? sanitizeArabicSlideText(topicBody.slice(0, 135))
            : 'تضخ الشركات الكبرى المليارات كاستثمارات ثم تستردها فوراً كعوائد مقابل تأجير السحابة والرقائق.',
        });
        return;
      }

      // B. Insider Cash-Out vs Taxpayer Backstop / $2.60 Spent per $1 Earned Comparison
      if (/cash[- ]?out|taxpayer|backstop|5%\s+stake|for\s+every\s+\$1|\$2\.60|vs\b|versus/i.test(fullText) && /taxpayer|backstop|cash[- ]?out|for\s+every\s+\$1/i.test(fullText)) {
        const isUnitEcon = /\$2\.60|for\s+every\s+\$1/i.test(fullText);
        slides.push({
          type: 'compare',
          compareLeftTitle: isUnitEcon ? '$1.00 REVENUE EARNED' : '$6.6B INSIDER CASH-OUT',
          compareLeftBody: isUnitEcon
            ? '• Customer subscription inflow\n• Outpaced by compute burn\n• Structural operating deficit'
            : '• Employees liquidate $6.6B equity\n• Private valuation gains locked in\n• Zero personal downside exposure',
          compareRightTitle: isUnitEcon ? '$2.60 CAPITAL SPENT' : 'TAXPAYER & PUBLIC RISK',
          compareRightBody: isUnitEcon
            ? '• Massive GPU & energy capex\n• $20.9B projected annual loss\n• Relies on continuous new funding'
            : '• Public subsidies & 5% state stake\n• Grid & infrastructure backstops\n• Downside socialized to taxpayers',
          enTitle,
          arTitle: isUnitEcon ? 'مقارنة العوائد مقابل الإنفاق.' : 'سيولة المطلعين مقابل ضمانات الضرائب.',
          enBody: autoFitTextToLimits(topicBody, 135),
          arBody: hasArabicText
            ? sanitizeArabicSlideText(topicBody.slice(0, 135))
            : 'بينما يحقق المطلعون مكاسب نقدية بمليارات الدولارات، يتحمل دافعو الضرائب وصناديق التقاعد مخاطر التعثر.',
        });
        return;
      }

      // C. Standout Financial / Energy / Valuation Metric ($500B, $20.9B, $1.4T, 63%, 10 GW)
      const finMetricMatch =
        point.match(/\$\s*\d+(?:\.\d+)?\s*(?:trillion|billion|million|T|B|M)\b/i) ||
        point.match(/\b(\d+(?:\.\d+)?\s*(?:%|GW|gigawatts?))\b/i);
      if (finMetricMatch) {
        const rawVal = finMetricMatch[0]
          .replace(/\s+/g, ' ')
          .replace(/trillion/i, 'T')
          .replace(/billion/i, 'B')
          .replace(/million/i, 'M')
          .replace(/gigawatts?/i, 'GW')
          .replace(/\$\s+/, '$')
          .trim();
        const isEnergy = /energy|electricity|63%|gigawatt|gw\b|nuclear/i.test(fullText);
        const isLoss = /loss|deficit|burn|\$20\.9/i.test(fullText);
        slides.push({
          type: 'metric',
          metricValue: rawVal,
          metricLabel: isEnergy
            ? 'ENERGY & GRID IMPACT'
            : isLoss
            ? 'ANNUAL OPERATING DEFICIT'
            : 'CAPITAL & VALUATION SCALE',
          metricDiff: isEnergy
            ? '▲ Consumer power & nuclear grid demand'
            : isLoss
            ? '▼ Capital burn outpaces revenue'
            : '▲ Unprecedented financial commitment',
          metricIcon: isEnergy ? 'factory' : isLoss ? 'trendingDown' : 'dollarSign',
          enTitle,
          arTitle: `الأثر الرقمي: ${rawVal}.`,
          enBody: autoFitTextToLimits(topicBody, 135),
          arBody: hasArabicText
            ? sanitizeArabicSlideText(topicBody.slice(0, 135))
            : 'أرقام مالية واقتصادية تعكس حجم الالتزامات الرأسمالية وتأثيرها المباشر على السوق والمستهلكين.',
        });
        return;
      }

      // D. Retirees / S&P 500 / Systemic Risk Isolation or Stack
      slides.push({
        type: 'row',
        diagramVariant: /retiree|s&p|pension|taxpayer|risk/i.test(fullText) ? 'isolation' : 'stack',
        diagramNodes: [
          { label: 'Valuation Leverage', sublabel: '$500B Priced Perfection', status: 'LEVERAGED', icon: 'dollarSign' },
          { label: 'Index Concentration', sublabel: 'S&P 500 & Tech Weighting', status: 'EXPOSED', icon: 'landmark' },
          { label: 'Retiree Portfolios', sublabel: '401(k) & Pension Savings', status: 'AT RISK', icon: 'users' },
        ],
        diagramEdges: ['CONCENTRATE', 'EXPOSE'],
        diagramFooter: 'SYSTEMIC EXPOSURE: RETIREMENT FUNDS & PUBLIC MARKETS',
        enTitle,
        arTitle: `المخاطر النظامية: ${effectiveTitle.slice(0, 22)}.`,
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: hasArabicText
          ? sanitizeArabicSlideText(topicBody.slice(0, 135))
          : 'ارتباط صناديق التقاعد ومؤشرات السوق بتقييمات الذكاء الاصطناعي يضع مدخرات المتقاعدين في دائرة المخاطر.',
      });
      return;
    }

    // 0.5 Cybersecurity & CVE Advisory Mapping (Prevents SQL "code" and Hot/Cold "buffer/write" hallucinations)
    if (isCybersecurityDomain) {
      const pointCve = point.match(/\bCVE-\d{4}-\d{4,7}\b/i)?.[0]?.toUpperCase() || detectedCve;
      const secAnchor = pointCve || cleanSubject;
      const cvssMatch = point.match(/\bCVSS(?:\s+v?[34](?:\.\d)?)?\s*[:=]?\s*(\d{1,2}(?:\.\d)?)\b/i);
      const secMetricMatch =
        cvssMatch ||
        point.match(/\b(\d{1,2}\.\d)\s*\/\s*10\b/) ||
        point.match(/\b(\d+(?:\.\d+)?\s*(?:%|x|ms|seconds?|hours?|million|billion|servers?|hosts?))\b/i);

      if (secMetricMatch && idx <= 2) {
        const rawSecVal = cvssMatch ? `CVSS ${cvssMatch[1]}` : secMetricMatch[1] || secMetricMatch[0];
        slides.push({
          type: 'metric',
          metricValue: rawSecVal.trim(),
          metricLabel: cvssMatch ? 'CVSS CRITICALITY RATING' : 'EXPOSURE & IMPACT SCALE',
          metricDiff: pointCve ? `▲ ${pointCve} active security advisory` : '▲ Critical production exposure',
          metricIcon: 'shieldAlert',
          enTitle,
          arTitle: cvssMatch
            ? `خطورة ${rawSecVal.trim()} في ${arSubject} فعلياً`
            : `نطاق تأثير ${secAnchor} على الأنظمة`,
          enBody: autoFitTextToLimits(topicBody, 135),
          arBody: hasArabicText
            ? sanitizeArabicSlideText(topicBody.slice(0, 135))
            : `تقييم الخطورة في ${secAnchor} يضع خوادم ${arSubject} غير المحدَّثة أمام خطر استغلال مباشر.`,
        });
        return;
      }

      if (/\b(?:patch|upgrade|mitigat|remediat|fix|fixed|hardened|unpatched|vulnerable\s+vs|before|after)\b/i.test(fullText)) {
        slides.push({
          type: 'compare',
          compareLeftTitle: `UNPATCHED ${cleanSubject.toUpperCase().slice(0, 14)}`,
          compareLeftBody: '• Exposed attack surface in runtime\n• Untrusted input reaches privileged path\n• Silent takeover risk in production',
          compareRightTitle: 'PATCHED & ISOLATED',
          compareRightBody: '• Security patch applied immediately\n• Strict input & sandbox enforcement\n• Blast radius verified and contained',
          enTitle,
          arTitle: `النسخة المعرضة مقابل المحدَّثة في ${arSubject}`,
          enBody: autoFitTextToLimits(topicBody, 135),
          arBody: hasArabicText
            ? sanitizeArabicSlideText(topicBody.slice(0, 135))
            : `الفرق بين تشغيل ${arSubject} قبل التحديث الأمني وبعد تطبيق العزل والترقيع الفوري.`,
        });
        return;
      }

      const isExploitFlow = /\b(?:rce|remote\s+code|exploit|payload|inject|deserializ|bypass|escape|trigger|execut|attack|craft)\b/i.test(
        fullText
      );
      const secVariant: 'isolation' | 'stack' | 'topology' = isExploitFlow
        ? 'isolation'
        : idx % 2 === 0
        ? 'stack'
        : 'topology';
      slides.push({
        type: 'row',
        diagramVariant: secVariant,
        diagramNodes: isExploitFlow
          ? [
              { label: 'Crafted Input', sublabel: 'Untrusted External Payload', status: 'EXPOSED', icon: 'shieldAlert' },
              { label: cleanSubject.slice(0, 18), sublabel: pointCve || 'Vulnerable Runtime Path', status: 'BREACHED', icon: 'cpu' },
              { label: 'Host Execution', sublabel: 'Arbitrary Command Impact', status: 'CRITICAL', icon: 'lock' },
            ]
          : [
              { label: 'Attack Surface', sublabel: pointCve || cleanSubject.slice(0, 18), status: 'EXPOSED', icon: 'shieldAlert' },
              { label: 'Runtime Boundary', sublabel: 'Affected Version Check', status: 'AUDITED', icon: 'server' },
              { label: 'Containment Gate', sublabel: 'Patch & Network Isolation', status: 'GUARDED', icon: 'lock' },
            ],
        diagramEdges: isExploitFlow ? ['TRIGGER', 'EXECUTE'] : ['AUDIT', 'ISOLATE'],
        diagramFooter: `SECURITY ADVISORY: ${secAnchor.toUpperCase().slice(0, 26)} • CONTAINMENT`,
        enTitle,
        arTitle: isExploitFlow
          ? `كيف يعمل مسار استغلال ${secAnchor} فعلياً`
          : `تحليل سطح الهجوم في ${secAnchor} فعلياً`,
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: hasArabicText
          ? sanitizeArabicSlideText(topicBody.slice(0, 135))
          : isExploitFlow
          ? `تجاوز طبقة التحقق في ${arSubject} يتيح تنفيذ أوامر غير مصرح بها على الخوادم المتأثرة.`
          : `فحص الإصدارات المتأثرة بثغرة ${secAnchor} وعزل نقاط الدخول قبل توسع الاستغلال.`,
      });
      return;
    }

    // 1. Compare Archetype (e.g. Standard DB vs Purpose-Built Vector DB)
    if (/choosing\s+a\s+database|standard\s+database|vs\b|versus|compared\s+to/i.test(fullText)) {
      if (/postgres|pgvector|elasticsearch/i.test(fullText)) {
        slides.push({
          type: 'compare',
          compareLeftTitle: 'POSTGRES + PGVECTOR',
          compareLeftBody: '• Standard relational database\n• ACID transactional guarantees\n• Zero new operational footprint',
          compareRightTitle: 'PINECONE / MILVUS',
          compareRightBody: '• Dedicated vector database\n• Billion-scale clustering engine\n• Specialized operational overhead',
          enTitle: 'Choosing your vector database.',
          arTitle: 'مقارنة: قواعد البيانات والبحث المتجهي',
          enBody: autoFitTextToLimits(topicBody, 135),
          arBody: 'قواعد البيانات الحالية مثل Postgres مع pgvector كافية لمعظم المشاريع، بينما قواعد البيانات المتخصصة للأنظمة المليارية.',
        });
        return;
      }
      slides.push({
        type: 'compare',
        compareLeftTitle: 'STANDARD BASELINE',
        compareLeftBody: '• Standard execution model\n• Higher indexing cost\n• Generic pipeline overhead',
        compareRightTitle: 'DEDICATED ARCHITECTURE',
        compareRightBody: '• Specialized high-throughput engine\n• Scaled partition indexes\n• Verified production speedup',
        enTitle,
        arTitle: `مقارنة: ${effectiveTitle}`,
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: hasArabicText
          ? sanitizeArabicSlideText(topicBody.slice(0, 135))
          : 'مقارنة معمارية توضح الفوارق في الكفاءة والتكلفة التشغيلية.',
      });
      return;
    }

    // 2. Code Archetype (SQL query or script — strictly require real SQL/database query signals, never generic "code")
    if (/\b(?:sql|psql|pgvector|query\s+planner|select\s+.+\s+from|explain\s+analyze)\b|<=>/i.test(fullText)) {
      const isVectorSql = /vector|embedding|<=>|pgvector/i.test(fullText);
      slides.push({
        type: 'code',
        codeFileName: isVectorSql ? 'pgvector_example.sql' : 'query.sql',
        codeLanguage: 'sql',
        codeSnippet: isVectorSql
          ? `-- Semantic cosine similarity with pgvector\nSELECT id, title, 1 - (embedding <=> $query) AS score\nFROM documents\nWHERE status = 'in_stock'\nORDER BY embedding <=> $query LIMIT 5;`
          : `$ psql -h localhost -U postgres\n> EXPLAIN ANALYZE SELECT * FROM vectors;\n+ Index Scan using hnsw_cosine_idx\n✔ Execution verified`,
        enTitle: enforceHeadlineSpecRule(effectiveTitle || 'pgvector distance query', { isHook: false }),
        arTitle: 'الاستعلام عبر SQL والفهارس فعلياً',
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: 'طريقة تطبيق الاستعلام في قاعدة البيانات ودمج الشروط المسبقة بكفاءة عالية.',
      });
      return;
    }

    // 3. Split Visual Schematic (Hot/Cold Stores & Writes — strictly storage/index architecture)
    if (
      /\b(?:hot\s+and\s+cold|cold\s+store|hot\s+store|lsm[- ]?tree|compaction|memtable|sstable|write[- ]?ahead)\b/i.test(
        fullText
      ) ||
      /\bhot\b[^.]{0,45}\bcold\b/i.test(fullText) ||
      (/\b(?:write|writes|buffer|insert|inserting)\b/i.test(fullText) &&
        /\b(?:database|index|vector|storage|disk|ram|table|wal|hnsw|graph|consistency)\b/i.test(fullText))
    ) {
      slides.push({
        type: 'row',
        diagramVariant: 'split',
        diagramNodes: [
          { label: 'Hot Store', sublabel: 'Mutable RAM Write Buffer', status: 'FAST WRITE', icon: 'zap' },
          { label: 'Async Compactor', sublabel: 'Batch Index Flusher', status: 'SYNCING', icon: 'arrowRightLeft' },
          { label: 'Cold Store', sublabel: 'Immutable Vector Index', status: 'PERSISTED', icon: 'database' },
        ],
        diagramEdges: ['BUFFER', 'COMPACT'],
        diagramFooter: 'ARCHITECTURE: DUAL HOT/COLD STORE',
        enTitle,
        arTitle: 'معمارية التخزين الساخن والبارد',
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: hasArabicText
          ? sanitizeArabicSlideText(topicBody.slice(0, 135))
          : 'فصل عمليات الكتابة السريعة في الذاكرة الحية عن الفهارس الثابتة لتقليل تكلفة إعادة بناء الرسم البياني.',
      });
      return;
    }

    // 4. Graph Visual Schematic (HNSW Indexing) — evaluated before generic vector scatter
    if (/hnsw|hierarchical|skip[- ]?list/i.test(fullText)) {
      slides.push({
        type: 'row',
        diagramVariant: 'graph',
        diagramNodes: [
          { label: 'Entry Node', sublabel: 'Top Sparse Layer 2', status: 'ENTRY', icon: 'network' },
          { label: 'Skip Traversal', sublabel: 'Fast Long-Range Hops', status: 'ROUTED', icon: 'layers' },
          { label: 'Target Neighbor', sublabel: 'Dense Base Layer 0', status: 'CONVERGED', icon: 'checkCircle' },
        ],
        diagramEdges: ['DESCENT', 'CONVERGE'],
        diagramFooter: 'GRAPH: HIERARCHICAL NAVIGABLE SMALL WORLD',
        enTitle,
        arTitle: 'فهارس HNSW الطبقية',
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: hasArabicText
          ? sanitizeArabicSlideText(topicBody.slice(0, 135))
          : 'هيكل بياني متعدد الطبقات يتيح التنقل السريع عبر قفزات متباعدة في الفضاء عالي الأبعاد ثم تقارب دقيق.',
      });
      return;
    }

    // 5. Clusters Visual Schematic (IVF Indexing) — evaluated before generic vector scatter
    if (/ivf|inverted file|cluster|k-means|centroid|partition/i.test(fullText)) {
      slides.push({
        type: 'row',
        diagramVariant: 'clusters',
        diagramNodes: [
          { label: 'K-Means Centroid', sublabel: 'Space Partition Hub', status: 'PARTITIONED', icon: 'layers' },
          { label: 'Target Cluster', sublabel: 'Shortlisted Candidate Subset', status: 'SELECTED', icon: 'zap' },
          { label: 'Inverted List', sublabel: 'Pruned Candidate Scan', status: 'SCANNED', icon: 'search' },
        ],
        diagramEdges: ['PARTITION', 'SCAN'],
        diagramFooter: 'INDEX: INVERTED FILE CLUSTERING • FAST PRUNING',
        enTitle,
        arTitle: 'تقسيم المساحات عبر عناقيد IVF',
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: hasArabicText
          ? sanitizeArabicSlideText(topicBody.slice(0, 135))
          : 'تجزئة الفضاء عالي الأبعاد عبر خوارزميات العناقيد، وحصر البحث فقط داخل العناقيد الأقرب للمتجه المطلوب.',
      });
      return;
    }

    // 6. Features Visual Schematic (Filtered Search)
    if (/filter|constraint|metadata|pre-filter|hard constraint/i.test(fullText)) {
      slides.push({
        type: 'row',
        diagramVariant: 'features',
        diagramNodes: [
          { label: 'Metadata Filter', sublabel: 'Hard Business Constraints', status: 'FILTERED', icon: 'sliders' },
          { label: 'Vector Index', sublabel: 'Similarity Distance Scan', status: 'INDEXED', icon: 'search' },
          { label: 'Ranked Result', sublabel: 'Top-K Verified Items', status: 'VERIFIED', icon: 'checkCircle' },
        ],
        diagramEdges: ['FILTER', 'INTERSECT'],
        diagramFooter: 'SEARCH: METADATA CONSTRAINTS + VECTOR DISTANCE',
        enTitle,
        arTitle: 'البحث المفلتر والقيود المسبقة',
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: hasArabicText
          ? sanitizeArabicSlideText(topicBody.slice(0, 135))
          : 'دمج الشروط المحددة (مثل توفر المنتج والحد السعري) مع البحث المتجهي عبر الفلترة المسبقة الموثقة.',
      });
      return;
    }

    // 7. Takeaway / Trade-off (Model upgrades & Primary DB source of truth)
    if (/model upgrade|re-embed|source of truth|primary db|boring|interview|catch|trade-?off|overhead/i.test(fullText)) {
      slides.push({
        type: 'row',
        diagramVariant: 'takeaway',
        diagramNodes: [
          { label: 'Primary DB', sublabel: 'Immutable Source of Truth', status: 'PRIMARY', icon: 'database' },
          { label: 'Vector Index', sublabel: 'Disposable Search Index', status: 'INDEX', icon: 'search' },
          { label: 'Model Upgrade', sublabel: 'Full Re-Embedding Cost', status: 'CAUTION', icon: 'shieldAlert' },
        ],
        diagramEdges: ['SOURCE', 'RE-EMBED'],
        diagramFooter: 'ARCHITECTURE RULE: PRIMARY DB AS SOURCE OF TRUTH',
        enTitle,
        arTitle: 'تحديث النماذج وقاعدة البيانات المرجعية',
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: hasArabicText
          ? sanitizeArabicSlideText(topicBody.slice(0, 135))
          : 'الاحتفاظ بقاعدة البيانات الأساسية كمصدر موثوق؛ فترقية نموذج التضمين تعني إعادة معالجة وحساب كل المتجهات من جديد.',
      });
      return;
    }

    // 8. Scatter Visual Schematic (Vectors & Embeddings)
    if (/vector|embedding|high-dimensional|cosine|similarity|ann\b|nearest neighbor/i.test(fullText)) {
      slides.push({
        type: 'row',
        diagramVariant: 'scatter',
        diagramNodes: [
          { label: 'Embedding Model', sublabel: 'Dense Float Vector Array', status: 'ENCODED', icon: 'cpu' },
          { label: 'Vector Index', sublabel: 'High-Dimensional Space', status: 'INDEXED', icon: 'database' },
          { label: 'Cosine Search', sublabel: 'Nearest Neighbor Top-K', status: 'MATCHED', icon: 'search' },
        ],
        diagramEdges: ['ENCODE', 'SIMILARITY'],
        diagramFooter: 'METRIC: COSINE SIMILARITY • RECALL OPTIMIZED',
        enTitle,
        arTitle: 'المتجهات والتضمين الدلالي',
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: hasArabicText
          ? sanitizeArabicSlideText(topicBody.slice(0, 135))
          : 'تحويل البيانات (صور، نصوص، منتجات) إلى مصفوفات رقمية عالية الأبعاد مع قياس التشابه عبر مسافة جيب التمام.',
      });
      return;
    }

    // 9. Metric Archetype
    if (/\b(\d+(?:\.\d+)?(?:x|%|GB|MB|ms|req\/s))\b/i.test(fullText)) {
      const match = fullText.match(/\b(\d+(?:\.\d+)?(?:x|%|GB|MB|ms|req\/s))\b/i);
      const val = match ? match[1] : '10x';
      slides.push({
        type: 'metric',
        metricValue: val,
        metricLabel: 'PRODUCTION MEASUREMENT',
        metricDiff: '▲ Verified in production benchmark',
        metricIcon: 'gauge',
        enTitle,
        arTitle: `قياس الأداء الفعلي: ${val}`,
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: 'أرقام حقيقية تثبت كفاءة النظام تحت أقصى ضغط عمل في بيئة التشغيل.',
      });
      return;
    }

    // 10. AI Agent / Delegation / Auth / Identity Boundary Recognition
    if (/\b(agent|delegat|oauth|mcp|human|impersonat|permission|token|scope|bot|identity|credential)\b/i.test(fullText)) {
      if (/\b(human|user|bot|script|vs\b|versus|neither|nor|impersonat)\b/i.test(fullText) && idx <= 1) {
        slides.push({
          type: 'compare',
          compareLeftTitle: 'UNSCOPED BOT / HUMAN LOGIN',
          compareLeftBody: '• Shares static user credentials\n• Broad ambient account privileges\n• Zero cryptographic delegation trail',
          compareRightTitle: 'DELEGATED AI AGENT',
          compareRightBody: '• Ephemeral scoped OAuth/JWT token\n• Explicit human-in-the-loop bounds\n• Verifiable per-action audit log',
          enTitle,
          arTitle: 'مقارنة: حساب بشري مقابل تفويض الوكيل.',
          enBody: autoFitTextToLimits(topicBody, 135),
          arBody: hasArabicText
            ? sanitizeArabicSlideText(topicBody.slice(0, 135))
            : 'الوكيل الذكي ليس مجرد نص برمجي ولا مستخدماً بشرياً؛ بل يتطلب تفويضاً مشفراً بصلاحيات محددة.',
        });
        return;
      }

      if (/\b(token|jwt|oauth|scope|policy|header|attestation|sign)\b/i.test(fullText)) {
        slides.push({
          type: 'code',
          codeFileName: 'agent_delegation_jwt.json',
          codeLanguage: 'json',
          codeSnippet: `{\n  "sub": "agent:cloudflare-worker-04",\n  "act": { "sub": "user:principal@org.com" },\n  "scope": "read:dns write:workers_kv",\n  "exp": 1735689900\n}`,
          enTitle,
          arTitle: 'تفويض الصلاحيات عبر رموز OAuth.',
          enBody: autoFitTextToLimits(topicBody, 135),
          arBody: hasArabicText
            ? sanitizeArabicSlideText(topicBody.slice(0, 135))
            : 'تقييد الوكيل الذكي برموز جلسة قصيرة الأجل تحدد هوية المفوِّض ونطاق الأدوات المسموح بها.',
        });
        return;
      }

      slides.push({
        type: 'row',
        diagramVariant: 'isolation',
        diagramNodes: [
          { label: 'Human Principal', sublabel: 'Issues Scoped Consent', status: 'VERIFIED', icon: 'users' },
          { label: 'Delegation Gate', sublabel: 'Token Exchange & Policy', status: 'SCOPED', icon: 'lock' },
          { label: 'AI Agent Runtime', sublabel: 'Bounded Tool Execution', status: 'ISOLATED', icon: 'robot' },
        ],
        diagramEdges: ['DELEGATE', 'ENFORCE'],
        diagramFooter: 'IDENTITY BOUNDARY: CRYPTOGRAPHIC AGENT DELEGATION',
        enTitle,
        arTitle: 'عزل وتفويض صلاحيات الوكيل الذكي.',
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: hasArabicText
          ? sanitizeArabicSlideText(topicBody.slice(0, 135))
          : 'فصل هوية المستخدم عن هوية الوكيل عبر بوابة تفويض تمنع تجاوز الصلاحيات أو انتحال الهوية.',
      });
      return;
    }

    // 11. Context-Aware Dynamic Archetype Rotation (No generic filler)
    const fallbackQuoted = extractSourceQuotedHubNodes(`${point} ${topicBody}`, {
      titleText: enTitle,
      category: domainCategory,
      targetCount: 3,
    });
    const phrase1 = fallbackQuoted.satLabels[0] || cleanSubject.slice(0, 16).toUpperCase();
    const phrase2 = fallbackQuoted.satLabels[1] || 'WORKFLOW STEP';
    const phrase3 = fallbackQuoted.satLabels[2] || 'OUTCOME CHECK';

    const dynamicVariants: Array<'isolation' | 'clusters' | 'split' | 'features' | 'graph' | 'topology' | 'stack'> = [
      'topology',
      'isolation',
      'clusters',
      'split',
      'features',
      'stack',
      'graph',
    ];
    const chosenVariant = dynamicVariants[idx % dynamicVariants.length];

    slides.push({
      type: 'row',
      diagramVariant: chosenVariant,
      diagramNodes: [
        { label: phrase1.slice(0, 18), sublabel: 'From source point', status: 'SOURCE', icon: 'layers' },
        { label: phrase2.slice(0, 18), sublabel: 'Applied mechanism', status: 'ACTIVE', icon: 'cpu' },
        { label: phrase3.slice(0, 18), sublabel: 'Measured result', status: 'VERIFIED', icon: 'checkCircle' },
      ],
      diagramEdges: ['INPUT', 'RESULT'],
      diagramFooter: `${cleanSubject.toUpperCase().slice(0, 28)} • FLOW`,
      enTitle,
      arTitle: `${effectiveTitle.slice(0, 26)} في ${arSubject}`,
      enBody: autoFitTextToLimits(topicBody, 135),
      arBody: hasArabicText
        ? sanitizeArabicSlideText(topicBody.slice(0, 135))
        : `دور ${phrase1.toLowerCase()} في تحسين نتائج ${arSubject} وتقليل الاحتكاك أثناء التنفيذ.`,
    });
  });

  // Guarantee a concrete takeaway slide before closing
  if (!slides.some((s) => s.diagramVariant === 'takeaway')) {
    slides.push(
      isFinancialOrMacro
        ? {
            type: 'row',
            storyRole: 'takeaway',
            diagramVariant: 'takeaway',
            icons: [
              { icon: 'dollarSign', label: 'Private Gains' },
              { icon: 'scales', label: 'Public Risk' },
            ],
            diagramNodes: [
              { label: quotedHub.satLabels[0] || 'Upside Capture', sublabel: 'Insider equity & valuations', status: 'CAPTURED', icon: 'dollarSign' },
              { label: quotedHub.satLabels[1] || 'Capital Loop', sublabel: 'Recycled capex & bills', status: 'LEVERAGED', icon: 'landmark' },
              { label: quotedHub.satLabels[2] || 'Public Exposure', sublabel: 'Taxpayers & retirees', status: 'EXPOSED', icon: 'scales' },
            ],
            diagramEdges: ['Leverage', 'Socialize'],
            diagramFooter: 'VERDICT: PRIVATE GAINS VS PUBLIC EXPOSURE',
            enTitle: 'Who pays when capital bets miss?',
            arTitle: 'من يتحمل الكلفة عند تعثر الرهانات الضخمة؟',
            enBody: 'Follow unit economics and power commitments closely before assuming headline valuations represent durable profit.',
            arBody: 'راقب عوائد التشغيل والتزامات الطاقة قبل افتراض أن التقييمات الضخمة تعكس أرباحاً مستدامة.',
          }
        : isCybersecurityDomain
        ? {
            type: 'row',
            storyRole: 'takeaway',
            diagramVariant: 'isolation',
            icons: [{ icon: 'shieldAlert', label: 'Patch Now' }, { icon: 'lock', label: 'Isolate' }],
            diagramNodes: [
              { label: 'Inventory Audit', sublabel: 'Find exposed versions', status: 'SCAN', icon: 'search' },
              { label: 'Emergency Patch', sublabel: detectedCve || 'Apply vendor fix', status: 'PATCH', icon: 'shieldAlert' },
              { label: 'Runtime Isolation', sublabel: 'Limit blast radius', status: 'GUARDED', icon: 'lock' },
            ],
            diagramEdges: ['AUDIT', 'CONTAIN'],
            diagramFooter: `SECURITY RESPONSE: ${(detectedCve || cleanSubject).toUpperCase().slice(0, 28)}`,
            enTitle: `Patch ${detectedCve || cleanSubject.split(/\s+/).slice(0, 3).join(' ')} before exploit scans hit`,
            arTitle: `أولوية التحديث وعزل ${detectedCve || arSubject} فوراً`,
            enBody: `Audit every ${cleanSubject} runtime, apply vendor security updates, and restrict outbound egress until patched.`,
            arBody: `افحص جميع خوادم ${arSubject} فوراً وطبّق التحديثات الأمنية مع تقييد الصلاحيات لتقليل نطاق الاختراق.`,
          }
        : {
            type: 'row',
            storyRole: 'takeaway',
            diagramVariant: 'takeaway',
            icons: [{ icon: 'shieldAlert', label: 'Trade-off' }, { icon: 'activity', label: 'Outcome' }],
            diagramNodes: [
              { label: quotedHub.satLabels[0] || 'Old Habit', sublabel: 'Default setup friction', status: 'BEFORE', icon: 'layers' },
              { label: quotedHub.satLabels[1] || `${cleanSubject.slice(0, 12)} Shift`, sublabel: 'Focused change', status: 'APPLIED', icon: 'zap' },
              { label: quotedHub.satLabels[2] || 'Team Payoff', sublabel: 'Clear ownership & speed', status: 'AFTER', icon: 'shieldAlert' },
            ],
            diagramEdges: ['Change', 'Verify'],
            diagramFooter: `KEY LESSON: ${cleanSubject.toUpperCase().slice(0, 32)}`,
            enTitle: `What teams should apply from ${cleanSubject.split(/\s+/).slice(0, 3).join(' ')}`,
            arTitle: `الخطوة العملية التي يمكنك تطبيقها في ${arSubject}`,
            enBody: `Adopt the parts of ${cleanSubject} that remove real bottlenecks for your users rather than copying complexity blindly.`,
            arBody: `اعتمد من ${arSubject} ما يزيل الاختناقات الفعلية لدى عملائك بدلاً من إضافة تعقيد غير مبرر.`,
          }
    );
  }

  // Pad to targetCount - 1 with varied, topic-grounded archetypes if fewer points were given
  const padArchetypes: Array<'compare' | 'code' | 'number'> = ['compare', 'code', 'number'];
  let padIdx = 0;
  while (slides.length < targetCount - 1) {
    const padType = padArchetypes[padIdx % padArchetypes.length];
    padIdx++;
    if (isFinancialOrMacro) {
      slides.splice(1, 0, {
        type: 'number',
        stepNumber: `0${padIdx}`,
        stepLabel: `STEP 0${padIdx} // UNIT ECONOMICS`,
        centerIcon: 'trendingDown',
        enTitle: 'Unit burn vs. operating revenue.',
        arTitle: 'فجوة العوائد والإنفاق الرأسمالي.',
        enBody: 'Capital commitments exceed current operating revenue, turning balance-sheet discipline into the decisive constraint.',
        arBody: 'تتجاوز الالتزامات الرأسمالية وتكاليف التشغيل العوائد الحالية، ما يجعل الانضباط المالي عنصراً حاسماً.',
      });
    } else if (padType === 'compare') {
      slides.splice(Math.min(2, slides.length), 0, {
        type: 'compare',
        compareLeftTitle: `BEFORE ${quotedHub.satLabels[0] || 'CHANGE'}`,
        compareLeftBody: `• Manual workarounds\n• Slow feedback cycles\n• Hidden rework cost`,
        compareRightTitle: `WITH ${quotedHub.satLabels[1] || 'FOCUS'}`,
        compareRightBody: `• Clear ownership rules\n• Predictable delivery\n• Measurable customer win`,
        enTitle: enforceHeadlineSpecRule(`Old habit vs focused ${cleanSubject.split(/\s+/).slice(0, 2).join(' ')}`, { isHook: false }),
        arTitle: `الفارق العملي قبل وبعد تطبيق ${arSubject}.`,
        enBody: `Replacing vague defaults in ${cleanSubject} with concrete ownership eliminates repeat bottlenecks.`,
        arBody: `استبدال الإعدادات العشوائية بضوابط واضحة في ${arSubject} يمنع تكرار الاختناقات نفسها.`,
      });
    } else if (padType === 'code') {
      slides.splice(Math.min(3, slides.length), 0, {
        type: 'code',
        codeFileName: `${cleanSubject.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 16) || 'rules'}.yaml`,
        codeLanguage: 'yaml',
        codeSnippet: `# Guardrails derived from ${cleanSubject.slice(0, 24)}\nfocus: "${(quotedHub.satLabels[0] || 'primary').toLowerCase()}"\ncheck: "${(quotedHub.satLabels[1] || 'outcome').toLowerCase()}"\naudit_enabled: true`,
        enTitle: enforceHeadlineSpecRule(`Concrete guardrails for ${cleanSubject.split(/\s+/).slice(0, 3).join(' ')}`, { isHook: false }),
        arTitle: `تطبيق القواعد عملياً داخل ${arSubject}.`,
        enBody: `Turning lessons from ${cleanSubject} into explicit rules stops regressions before customers notice.`,
        arBody: `تحويل دروس ${arSubject} إلى قواعد تنفيذية واضحة يمنع عودة الأعطال قبل وصولها للمستخدم.`,
      });
    } else {
      slides.splice(Math.min(4, slides.length), 0, {
        type: 'number',
        stepNumber: `0${padIdx}`,
        stepLabel: `PILLAR 0${padIdx} // ${quotedHub.satLabels[2] || 'OUTCOME'}`,
        centerIcon: 'shieldAlert',
        enTitle: enforceHeadlineSpecRule(`Checking ${cleanSubject.split(/\s+/).slice(0, 3).join(' ')} results`, { isHook: false }),
        arTitle: `التحقق من أثر ${arSubject} على العمل.`,
        enBody: `Track whether ${cleanSubject} actually shortens delivery cycles or lowers real costs for your team.`,
        arBody: `قس الأثر الحقيقي لـ ${arSubject} على سرعة التسليم والتكلفة التشغيلية بدلاً من الوعود العامة.`,
      });
    }
  }

  // Trim excess if too many points were given
  while (slides.length > targetCount - 1) {
    slides.splice(slides.length - 2, 1);
  }

  // Closer Slide (always actionable Marrok CTA)
  slides.push({
    type: 'cta',
    storyRole: 'cta',
    enTitle: isFinancialOrMacro
      ? enforceHeadlineSpecRule(`Audit your ${cleanSubject} exposure`, { isCta: true })
      : enforceHeadlineSpecRule(`Apply ${cleanSubject} with Marrok`, { isCta: true }),
    arTitle: isFinancialOrMacro ? `هل تراجع مخاطر ${arSubject} في مشروعك؟` : `طبّق دروس ${arSubject} في فريقك اليوم`,
    enBody: isFinancialOrMacro
      ? 'Review where unit costs and vendor lock-in hide in your roadmap before scaling commitments.'
      : `Turn this ${cleanSubject} lesson into a simpler, faster workflow for your product and engineering team.`,
    arBody: isFinancialOrMacro
      ? 'راجع تكاليف التشغيل والالتزامات التقنية في خطتك قبل التوسع في الإنفاق، وشاركنا سؤالك في التعليقات.'
      : `حوّل درس ${arSubject} إلى خطوة عملية تبسّط العمل وتسرّع النتائج، وتواصل معنا لتطبيقه في منتجك.`,
    ctaText: 'Save & Message Marrok  •  احفظ وراسلنا',
    url: brandUrl,
    enCredit: '',
    arCredit: `${brand} · ${isFinancialOrMacro ? 'قراءة مالية واقتصادية' : domainCategory}`,
  });

  return slides;
}
