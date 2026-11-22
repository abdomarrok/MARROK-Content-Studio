// ─── Character Limits (Spec §8) ────────────────────────────────────
export const CHAR_LIMITS = {
  enTitle: 45,
  arTitle: 40,
  enBody: 140,
  arBody: 150,
  iconLabel: 16,
  hookTitle: 78, // 6-12 word viral Slide 1 hook headline (2-line @ 96px)
  hookArTitle: 68, // 6-12 word Arabic Slide 1 hook headline matching EN span without mid-clause truncation
} as const;

export const SINGLE_SLIDE_CHAR_LIMITS = {
  enTitle: 55,
  arTitle: 50,
  enBody: 220,
  arBody: 230,
  takeawayEn: 75,
  takeawayAr: 80,
  iconLabel: 16,
  hookTitle: 78,
  hookArTitle: 68,
} as const;

export const PLATFORM_CAPTION_CHAR_LIMITS = {
  instagram: 2200,
  tiktok: 2200,
  linkedin: 3000,
} as const;

export const ARABIC_TRANSLATED_TERM_RULES: Array<{
  pattern: RegExp;
  translatedLabel: string;
  englishTerm: string;
}> = [
  {
    pattern: /(?:^|[\s،.(])(?:ال)?مقابس(?:\s+الشبكة|\s+الشبكية)?(?=$|[\s،.)!؟])/u,
    translatedLabel: 'المقابس / مقابس الشبكة',
    englishTerm: 'Sockets',
  },
  {
    pattern: /زمن\s+(?:ال)?استجابة|(?<=^|[\s،.(])(?:ال)?كمون(?=$|[\s،.)!؟])/u,
    translatedLabel: 'زمن الاستجابة / الكمون',
    englishTerm: 'Latency',
  },
  {
    pattern: /(?:ذاكرة\s+)?(?:ال)?تخزين\s+(?:ال)?مؤقت|الذاكرة\s+(?:ال)?مؤقتة|(?<=^|[\s،.(])الكاش(?=$|[\s،.)!؟])/u,
    translatedLabel: 'الذاكرة المؤقتة / التخزين المؤقت',
    englishTerm: 'Cache',
  },
  {
    pattern: /(?:^|[\s،.(])(?:ال)?عنقود(?:ية)?(?=$|[\s،.)!؟])/u,
    translatedLabel: 'العنقود',
    englishTerm: 'Cluster',
  },
  {
    pattern: /واجه(?:ة|ات)\s+(?:ال)?برمج(?:ة|ية)(?:\s+التطبيقات)?/u,
    translatedLabel: 'واجهة برمجة التطبيقات',
    englishTerm: 'API',
  },
  {
    pattern: /طابور\s+الرسائل|طوابير\s+الرسائل|صفوف\s+الانتظار/u,
    translatedLabel: 'طابور/صفوف الرسائل',
    englishTerm: 'Queue',
  },
  {
    pattern: /موازن\s+(?:ال)?أحمال|توازن\s+(?:ال)?أحمال/u,
    translatedLabel: 'موازن الأحمال',
    englishTerm: 'Load Balancer',
  },
  {
    pattern: /بروتوكول\s+رافت|(?<=^|[\s،.(])رافت(?=$|[\s،.)!؟])/u,
    translatedLabel: 'رافت',
    englishTerm: 'Raft',
  },
  {
    pattern: /(?:^|[\s،.(])كافكا(?=$|[\s،.)!؟])/u,
    translatedLabel: 'كافكا',
    englishTerm: 'Kafka',
  },
  {
    pattern: /(?:^|[\s،.(])بوستجرس(?:كيول)?(?=$|[\s،.)!؟])/u,
    translatedLabel: 'بوستجرس',
    englishTerm: 'Postgres',
  },
  {
    pattern: /(?:^|[\s،.(])ريديس(?=$|[\s،.)!؟])/u,
    translatedLabel: 'ريديس',
    englishTerm: 'Redis',
  },
  {
    pattern: /(?:^|[\s،.(])دوكر(?=$|[\s،.)!؟])/u,
    translatedLabel: 'دوكر',
    englishTerm: 'Docker',
  },
  {
    pattern: /(?:^|[\s،.(])كوبرنيتيس(?=$|[\s،.)!؟])/u,
    translatedLabel: 'كوبرنيتيس',
    englishTerm: 'Kubernetes',
  },
  {
    pattern: /جيجابايت|غيغابايت/u,
    translatedLabel: 'جيجابايت',
    englishTerm: 'GB',
  },
  {
    pattern: /ميجابايت|ميغابايت/u,
    translatedLabel: 'ميجابايت',
    englishTerm: 'MB',
  },
  {
    pattern: /تيرابايت/u,
    translatedLabel: 'تيرابايت',
    englishTerm: 'TB',
  },
  {
    pattern: /كيلوبايت/u,
    translatedLabel: 'كيلوبايت',
    englishTerm: 'KB',
  },
  {
    pattern: /مللي\s+ثانية|ميلي\s+ثانية|ملي\s+ثانية/u,
    translatedLabel: 'مللي ثانية',
    englishTerm: 'ms',
  },
  {
    pattern: /ميكروثانية|ميكرو\s+ثانية/u,
    translatedLabel: 'ميكروثانية',
    englishTerm: 'μs',
  },
  {
    pattern: /نانوثانية|نانو\s+ثانية/u,
    translatedLabel: 'نانوثانية',
    englishTerm: 'ns',
  },
];

// ─── Known Boilerplate & Template Patterns ─────────────────────────
export const KNOWN_BOILERPLATE_PATTERNS: { pattern: RegExp; description: string }[] = [
  {
    pattern: /A breakdown of technical mechanisms/i,
    description: 'Generic fallback template summary ("A breakdown of technical mechanisms...")',
  },
  {
    pattern: /(?:technical|architectural)\s+breakdown\s+of\b/i,
    description: 'Template cliché ("technical breakdown of ...")',
  },
  {
    pattern: /\bcore\s+mechanisms\b/i,
    description: 'Template cliché ("core mechanisms")',
  },
  {
    pattern: /\boperational\s+boundaries\b/i,
    description: 'Template cliché ("operational boundaries")',
  },
  {
    pattern: /\bThe\s+core\s+trade-?off\b/i,
    description: 'Template cliché ("The core trade-off")',
  },
  {
    pattern: /\bproduction\s+trade-?offs?\b/i,
    description: 'Template cliché ("production trade-offs")',
  },
  {
    pattern: /\barchitectural\s+trade-?offs?\b/i,
    description: 'Template cliché ("architectural trade-offs")',
  },
  {
    pattern: /^Join the discussion\b/i,
    description: 'Generic CTA boilerplate ("Join the discussion")',
  },
  {
    pattern: /النقلة المعمارية لمنظومة/i,
    description: 'Generic template Arabic title ("النقلة المعمارية لمنظومة...")',
  },
  {
    pattern: /تحليل معماري لمنظومة|تحليل هندسي معمق|الآليات الأساسية|الحدود التشغيلية|المقايضة الجوهرية|مقايضات الإنتاج|تنازلات الإنتاج|آليات النظام الأساسية|كيف تعمل منظومة .* تحت الضغط|شارك في النقاش/i,
    description: 'Template Arabic cliché or literal echo of English template',
  },
  {
    pattern: /هذا العنصر يعرض|تفاصيل هندسية عامة|وصف تقني عام|نص عربي تجريبي/i,
    description: 'Generic Arabic filler copy instead of specific technical explanation',
  },
  {
    pattern: /\sالمعتمد(?:\s*[.?!،؟]*$|\s)/,
    description: 'Fake Arabic placeholder word ("المعتمد") — use pure RTL BiDi isolation instead',
  },
  {
    pattern: /When system frequency increases, legacy architectures become memory bottlenecks/i,
    description: 'Generic fallback body ("When system frequency increases...")',
  },
  {
    pattern: /A breakdown of technical mechanisms, benchmarks, and production architecture/i,
    description: 'Boilerplate body text',
  },
  {
    pattern: /\b\d+(?:png|jpg|jpeg|webp|svg)\b/i,
    description: 'Raw file name or extension in copy (e.g. "20760png")',
  },
  {
    pattern: /\.(?:png|jpe?g|webp|svg|gif)\b/i,
    description: 'Raw image file extension in slide text (e.g. ".png")',
  },
  {
    pattern: /\b(?:IMG|DSC|PXL|Screenshot|Screen\s*Shot)[-_ \d]+\b/i,
    description: 'Auto-generated camera or screenshot filename in copy',
  },
];

export const CONTENT_QUALITY_FILLER_LABELS = new Set([
  'TECH',
  'TECH HUMOR',
  'HUMOR',
  'OPINION',
  'TELEMETRY STAT',
  'EXPOSURE METRIC',
  'BOUNDARIES',
  'VERIFICATION',
  'OBSERVABILITY',
  'STORES TRILLIONS',
  'SYSTEM INGRESS',
  'TRAFFIC INGRESS',
  'EXECUTION CORE',
  'TARGET STATE',
  'PLACEHOLDER',
  'SAMPLE METRIC',
]);

export const SUMMARY_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'are', 'was', 'were',
  'have', 'has', 'had', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must',
  'how', 'why', 'what', 'when', 'where', 'which', 'who', 'than', 'then', 'they', 'their',
  'there', 'here', 'more', 'most', 'some', 'such', 'only', 'over', 'under', 'between',
  'about', 'using', 'used', 'uses', 'make', 'makes', 'also', 'very', 'just', 'still',
]);

export const MEANINGLESS_LABEL_PATTERN =
  /\b(?:EXPOSURE\s+METRIC|DROPPING\s+EXPOSURE|NODE\s*0[1-9]|SYS_REF|TECHNICAL|STORES\s+TRILLIONS|PLACEHOLDER|SAMPLE\s+METRIC)\b/i;

export const DROP_MESSAGE_PATTERN =
  /\b(?:drop(?:ping|ped|s)?|slashed|cut(?:ting)?|reduc(?:ed|ing|tion)|lower(?:ed|ing)?|fell|down\s+from|from\s+\d+\s*(?:ms|s|%)\s+to\s+\d+)\b/i;

export const PARTNERSHIP_CLAIM_PATTERN =
  /\b(?:official\s+partner|powered\s+by|in\s+collaboration\s+with|endorsed\s+by|sponsored\s+by)\b/i;
