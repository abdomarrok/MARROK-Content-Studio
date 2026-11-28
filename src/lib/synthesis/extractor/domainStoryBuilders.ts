import type { SlideData } from '../../../types.ts';
import {
  autoFitTextToLimits,
  enforceHeadlineSpecRule,
  extractCleanSubject,
  isNonSemanticFileName,
} from '../../text/headlines.ts';
import {
  buildNonNumericHookClaimCard,
  extractSourceQuotedHubNodes,
  inferDynamicCoverArchetype,
} from '../smartVisualDefaults.ts';
import type { ExtractedEntities, ExtractedMetric, StoryOptions } from './types.ts';
import { resolveTechLogo } from './entityResolution.ts';
import { selectWinningHookMetric, trimSlides } from './metricsScanner.ts';

/**
 * VCS & Scion Story: Monorepo scale, virtual filesystem, lockless merges, and tradeoffs.
 */
export function buildVcsStory(opts: StoryOptions): SlideData[] {
  return [
    {
      type: 'hub',
      centerIcon: 'gitMerge',
      satIcons: ['server', 'database', 'gauge', 'cpu', 'box', 'activity'],
      satLabels: ['Virtual FS', 'Server Merge', 'API VCS', 'Changesets', 'CI Runners', 'Telemetry'],
      enTitle: 'Why did Anthropic\nmove beyond Git?',
      arTitle: 'السبب وراء ابتعاد\nAnthropic عن Git',
      enBody: 'A deeper look at Scion: a server-authoritative VCS designed for AI agents.',
      arBody: 'نظرة متعمقة على نظام Scion: نظام تحكم في النسخ صُمم خصيصاً لوكلاء الذكاء الاصطناعي.',
    },
    {
      type: 'metric',
      metricValue: '100 GB',
      metricLabel: 'MONOREPO SCALE',
      metricDiff: '▲ 25M CI checkouts every day',
      metricIcon: 'database',
      enTitle: '25M checkouts a day.',
      arTitle: '25 مليون سحب يومياً.',
      enBody: 'Git mirrors were collapsing under massive AI agent commits, stalling builds and blocking engineer deploys.',
      arBody: 'كانت خوادم Git تنهار تحت سيل التعديلات المستمر من وكلاء الذكاء الاصطناعي، مما عطّل عمليات البناء.',
    },
    {
      type: 'code',
      codeSnippet: `$ scion checkout --lazy\n✔ Virtual filesystem mapped (0.4s)\n✔ Changeset: 3 files (0.01% of repo)\n$ scion commit -m "agent: optimize index"\n✔ Server-side merge verified (1.2s)`,
      codeLanguage: 'bash',
      codeFileName: 'scion-cli.sh',
      enTitle: 'Virtual tree checkout.',
      arTitle: 'سحب شجرة افتراضية.',
      enBody: 'Instead of cloning the entire 100 GB repo history, Scion streams only the exact files the agent touches.',
      arBody: 'بدلاً من استنساخ كامل المستودع البالغ 100 GB، يرسل Scion فقط الملفات التي يلمسها الوكيل البرمجي.',
    },
    {
      type: 'compare',
      compareLeftTitle: 'Traditional Git',
      compareLeftBody: '• Full 100 GB clone on every CI job\n• Local merge locks monorepo branch\n• 40% compute wasted on VCS mirrors',
      compareRightTitle: 'Anthropic Scion',
      compareRightBody: '• Lazy virtual checkout in milliseconds\n• API server-side commits without locks\n• 25% of all CI computing reclaimed',
      enTitle: 'Git vs. Scion.',
      arTitle: 'مقارنة Git مع Scion.',
      enBody: 'Moving from local monolithic checkouts to an API-driven virtual filesystem cut compute overhead by 200x.',
      arBody: 'الانتقال من الاستنساخ الكامل المحلي إلى نظام ملفات افتراضي مدار عبر API قلل الهدر بمقدار 200x تقريباً.',
    },
    {
      type: 'row',
      diagramVariant: 'stack',
      icons: [{ icon: 'code', label: 'API VCS' }, { icon: 'server', label: 'Virtual mount' }, { icon: 'lock', label: 'Lockless merges' }],
      diagramNodes: [
        { label: 'Virtual Filesystem', sublabel: 'Lazy stream on access', status: 'MOUNTED', icon: 'server' },
        { label: 'API Engine', sublabel: 'Server-side commit logic', status: 'ORCHESTRATED', icon: 'cpu' },
        { label: 'Cloud Object Store', sublabel: 'Lockless snapshot storage', status: 'PERSISTED', icon: 'database' },
      ],
      diagramEdges: ['Lazy Fetch', 'Async Land'],
      diagramFooter: 'VIRTUAL FS: STREAMED • REPO CLONE: ZERO FULL HISTORY',
      enTitle: 'Server-side engine pipeline.',
      arTitle: 'محرك يدار خادمياً.',
      enBody: 'Everything is tracked in an object store; merges run server-side so CI runners never wait for branch rebase locks.',
      arBody: 'كل شيء يدار في مستودع كائنات سحابي؛ وتتم عمليات الدمج خادمياً حتى لا تنتظر بيئات العمل فك أقفال الفروع.',
    },
    {
      type: 'row',
      diagramVariant: 'topology',
      icons: [{ icon: 'terminal', label: 'Agent Commit' }, { icon: 'gitMerge', label: 'Speculative Merge' }, { icon: 'activity', label: 'Test Runner' }],
      diagramNodes: [
        { label: 'Agent Commit', sublabel: 'API payload dispatched', status: 'LANDED', icon: 'terminal' },
        { label: 'Speculative Merge', sublabel: 'Applied directly to main', status: 'COMMITTED', icon: 'gitMerge' },
        { label: 'Async Test CI', sublabel: 'Broken builds isolated', status: 'AUDITED', icon: 'activity' },
      ],
      diagramEdges: ['Direct Land', 'Post-Merge Test'],
      diagramFooter: 'STRATEGY: TEST-AFTER-MERGE • TEAM BLOCKING: 0 SECONDS',
      enTitle: 'Test after merge sequence.',
      arTitle: 'الاختبار بعد الدمج.',
      enBody: 'Scion lands code immediately and tests post-merge, isolating broken commits without stalling the rest of the team.',
      arBody: 'يدمج Scion الشيفرة فوراً ويختبرها بعد الدمج، مما يعزل التعديلات المعطوبة دون إيقاف باقي الفريق.',
    },
    {
      type: 'row',
      diagramVariant: 'takeaway',
      icons: [{ icon: 'gitMerge', label: 'General Repos' }, { icon: 'robot', label: 'Agent Workloads' }, { icon: 'shieldAlert', label: 'Internal Tool' }],
      diagramNodes: [
        { label: 'Git for General Teams', sublabel: 'Human workflow & tooling', status: 'STANDARD', icon: 'gitMerge' },
        { label: 'Scion for AI Agents', sublabel: '25M checkouts · custom infra', status: 'INTERNAL', icon: 'robot' },
        { label: 'No Public Release', sublabel: 'Proprietary internal system', status: 'CAVEAT', icon: 'shieldAlert' },
      ],
      diagramEdges: ['Human Workflow', 'Agent Scale'],
      diagramFooter: 'STATUS: PROPRIETARY ANTHROPIC TOOL • GENERAL REPOS STAY ON GIT',
      enTitle: 'Not a Git killer.',
      arTitle: 'ليس قاتلاً لنظام Git.',
      enBody: 'Anthropic says Git still suits most repos. Scion needs custom review, search and CI tools, and has no public release.',
      arBody: 'تقول Anthropic إن Git ما زال مناسباً لمعظم المستودعات؛ يحتاج Scion أدوات مراجعة وبحث مخصصة، ولا إصدار عام له.',
    },
    {
      type: 'cta',
      enTitle: 'Building with AI agents\nat scale?',
      arTitle: 'تبني بوكلاء الذكاء\nالاصطناعي على نطاق\nواسع؟',
      ctaText: 'DM us  •  رسالة خاصة',
      url: opts.brandUrl,
      enCredit: "Based on Anthropic's engineering post. The numbers are Anthropic's own.",
      arCredit: 'مبني على مقال Anthropic الهندسي، والأرقام من Anthropic نفسها.',
    },
  ];
}

/**
 * Docker & Container Story: Multi-stage build optimization, attack surface reduction, and debugging scratch images.
 */
export function buildContainerStory(opts: StoryOptions): SlideData[] {
  return [
    {
      type: 'hub',
      centerIcon: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/docker.svg',
      satIcons: ['box', 'layers', 'shieldAlert', 'cpu', 'hardDrive', 'activity'],
      satLabels: ['Multi-Stage', 'Builder SDK', 'Scratch Base', 'Minimal Image', 'Zero CVEs', 'Layer Cache'],
      enTitle: 'Multi-stage Docker builds.',
      arTitle: 'بناء حاويات Docker متعددة المراحل',
      enBody: 'How separating build environments from production runtimes slashes image sizes by 95%.',
      arBody: 'كيف يؤدي فصل بيئة البناء عن بيئة التشغيل إلى تقليص حجم الحاويات وإغلاق الثغرات.',
    },
    {
      type: 'metric',
      metricValue: '95%',
      metricLabel: 'IMAGE SIZE REDUCTION',
      metricDiff: '▲ 850MB down to 18MB',
      metricIcon: 'hardDrive',
      enTitle: 'Eliminating container bloat.',
      arTitle: 'تقليص الحجم بنسبة 95%',
      enBody: 'Single-stage images bundle compilers, package managers, and debug tools directly into production containers.',
      arBody: 'الحاويات التقليدية تحزم المترجمات وأدوات إدارة الحزم في بيئة الإنتاج، مما يرفع حجمها ويزيد ثغراتها.',
    },
    {
      type: 'compare',
      compareLeftTitle: 'Single-Stage Build',
      compareLeftBody: '• 850MB bulky container image\n• Bundled gcc, apt, and source files\n• 38 base operating system CVEs',
      compareRightTitle: 'Multi-Stage Build',
      compareRightBody: '• 18MB statically compiled binary\n• Zero compilers or package managers\n• 0 base operating system CVEs',
      enTitle: 'Single vs. multi-stage.',
      arTitle: 'مقارنة الحاوية التقليدية مع متعددة المراحل',
      enBody: 'Separating build tools from the final runtime creates minimal, immutable container images.',
      arBody: 'عزل أدوات البناء عن بيئة التشغيل النهائية ينتج حاويات خفيفة وغير قابلة للتعديل بأعلى معايير الأمان.',
    },
    {
      type: 'code',
      codeSnippet: `FROM golang:1.24 AS builder\nWORKDIR /app\nCOPY . .\nRUN CGO_ENABLED=0 go build -o /server\n\nFROM scratch\nCOPY --from=builder /server /server\nENTRYPOINT ["/server"]`,
      codeLanguage: 'dockerfile',
      codeFileName: 'Dockerfile',
      enTitle: 'Multi-stage Dockerfile syntax.',
      arTitle: 'صيغة ملف Dockerfile المتعدد',
      enBody: 'Stage 1 compiles the binary inside the full Go SDK; Stage 2 copies only the single static binary into scratch.',
      arBody: 'المرحلة الأولى تبني الملف داخل بيئة Go الكاملة، والمرحلة الثانية تنسخ الملف التنفيذي فقط إلى بيئة فارغة.',
    },
    {
      type: 'row',
      diagramVariant: 'topology',
      icons: [{ icon: 'box', label: 'Builder SDK' }, { icon: 'arrowRightLeft', label: 'Extract Binary' }, { icon: 'shieldAlert', label: 'Scratch Image' }],
      diagramNodes: [
        { label: 'Builder Container', sublabel: 'Full SDK & dependencies', status: 'DISCARDED', icon: 'box' },
        { label: 'Artifact Extraction', sublabel: 'Static binary only', status: 'EXTRACTED', icon: 'arrowRightLeft' },
        { label: 'Scratch Image', sublabel: 'Production runtime', status: 'DEPLOYED', icon: 'shieldAlert' },
      ],
      diagramEdges: ['go build', 'COPY --from'],
      diagramFooter: 'BUILD ARTIFACT ISOLATED • CONTAINER BLOAT ELIMINATED',
      enTitle: 'Artifact extraction pipeline.',
      arTitle: 'مسار استخراج الملف التنفيذي',
      enBody: 'Only the final binary enters the deployed image; all compilation intermediate layers are discarded.',
      arBody: 'الملف التنفيذي النهائي فقط هو ما يدخل الحاوية المرفوعة، بينما تُهمل كل الطبقات الوسيطة الأخرى.',
    },
    {
      type: 'row',
      diagramVariant: 'stack',
      icons: [{ icon: 'layers', label: 'Manifest' }, { icon: 'cpu', label: 'Dependency Cache' }, { icon: 'hardDrive', label: 'Compiled Rootfs' }],
      diagramNodes: [
        { label: 'Dependency Layer', sublabel: 'go.mod cached independently', status: 'CACHED', icon: 'layers' },
        { label: 'Source Layer', sublabel: 'Fast incremental builds', status: 'BUILT', icon: 'cpu' },
        { label: 'Production Rootfs', sublabel: '18MB minimal filesystem', status: 'VERIFIED', icon: 'hardDrive' },
      ],
      diagramEdges: ['Cache Hit', 'Assemble'],
      diagramFooter: 'BUILD TIME: < 4 SECONDS • CACHE REUSE: OPTIMIZED',
      enTitle: 'Layer caching strategy.',
      arTitle: 'استراتيجية التخزين المؤقت للطبقات',
      enBody: 'Ordering COPY directives properly prevents rebuilding dependency layers on simple code edits.',
      arBody: 'ترتيب تعليمات النسخ بذكاء يمنع إعادة تحميل الحزم مع كل تعديل بسيط في الشيفرة البرمجية.',
    },
    {
      type: 'row',
      diagramVariant: 'takeaway',
      icons: [{ icon: 'terminal', label: 'Zero Shell' }, { icon: 'alertCircle', label: 'Debug Container' }, { icon: 'lock', label: 'Hardened' }],
      diagramNodes: [
        { label: 'Scratch Limitations', sublabel: 'No /bin/sh or curl inside', status: 'HARDENED', icon: 'terminal' },
        { label: 'Ephemeral Debugging', sublabel: 'Attach debug sidecars', status: 'SOLUTION', icon: 'alertCircle' },
        { label: 'Production Security', sublabel: 'Zero shell escape surface', status: 'SECURED', icon: 'lock' },
      ],
      diagramEdges: ['No Shell', 'Attach Sidecar'],
      diagramFooter: 'ATTACK SURFACE: MINIMAL • DEBUGGING: EPHEMERAL ONLY',
      enTitle: 'Debugging scratch containers.',
      arTitle: 'تحدي فحص الحاويات الفارغة',
      enBody: 'Scratch images have no shell. Live debugging requires Kubernetes ephemeral debug containers or sidecars.',
      arBody: 'الحاويات الفارغة لا تحوي سطر أوامر؛ يتطلب فحصها أثناء التشغيل ربط حاويات تصحيح خارجية.',
    },
    {
      type: 'cta',
      enTitle: 'Hardening your container\npipeline?',
      arTitle: 'تحصين بيئة الحاويات\nالبرمجية لديك؟',
      ctaText: 'DM us  •  رسالة خاصة',
      url: opts.brandUrl,
      enCredit: '',
      arCredit: `${opts.brand} · دليل أمان الحاويات البرمجية`,
    },
  ];
}

/**
 * In-Memory & Redis Story: In-memory access, multi-threading, active clustering, and RAM trade-offs.
 */
export function buildCacheStory(opts: StoryOptions): SlideData[] {
  return [
    {
      type: 'hub',
      centerIcon: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/redis.svg',
      satIcons: ['database', 'zap', 'hardDrive', 'server', 'cpu', 'activity'],
      satLabels: ['In-Memory', 'I/O Threads', 'Active Sharding', 'Sub-ms P99', 'LRU Eviction', 'Persistence'],
      enTitle: 'Redis engine architecture.',
      arTitle: 'معمارية محرك قواعد بيانات Redis',
      enBody: 'How in-memory key-space and threaded I/O sustain millions of operations per second.',
      arBody: 'كيف يحقق محرك الذاكرة المباشر والتزامن المتعدد ملايين العمليات في الثانية باستجابة فورية.',
    },
    {
      type: 'metric',
      metricValue: '1.2M ops',
      metricLabel: 'THROUGHPUT PER NODE',
      metricDiff: '▲ Sub-millisecond p99 latency',
      metricIcon: 'zap',
      enTitle: '1.2M operations a second.',
      arTitle: 'أكثر من مليون عملية في الثانية.',
      enBody: 'Direct RAM pointer access bypasses disk I/O bottlenecks to deliver microsecond-level query latencies.',
      arBody: 'الوصول المباشر إلى مؤشرات الذاكرة يتجاوز بطء أقراص التخزين ليمنح استجابة في أجزاء من الميلي ثانية.',
    },
    {
      type: 'compare',
      compareLeftTitle: 'Disk-Based Database',
      compareLeftBody: '• B-Tree page reads from disk\n• Buffer cache eviction stalls\n• 5–20ms p99 query latency',
      compareRightTitle: 'In-Memory Store',
      compareRightBody: '• Direct memory pointers in RAM\n• Lockless ring-buffer dispatch\n• < 0.5ms p99 query latency',
      enTitle: 'Disk storage vs. RAM.',
      arTitle: 'مقارنة التخزين في الذاكرة مقابل الأقراص',
      enBody: 'Moving hot data into an in-memory key-space eliminates query lock contention under traffic spikes.',
      arBody: 'نقل البيانات الأكثر طلباً إلى الذاكرة يلغي اختناقات القراءة والكتابة أثناء ضغط الزيارات المفاجئ.',
    },
    {
      type: 'row',
      diagramVariant: 'stack',
      icons: [{ icon: 'server', label: 'Network I/O' }, { icon: 'cpu', label: 'I/O Threads' }, { icon: 'hardDrive', label: 'Atomic Core' }],
      diagramNodes: [
        { label: 'Socket Ingress', sublabel: 'Event epoll handler', status: 'POOLED', icon: 'server' },
        { label: 'Threaded I/O', sublabel: 'Parallel parse & serialize', status: 'WORKERS', icon: 'cpu' },
        { label: 'Single-Thread Core', sublabel: 'Atomic state execution', status: 'ATOMIC', icon: 'hardDrive' },
      ],
      diagramEdges: ['Parse', 'Execute'],
      diagramFooter: 'I/O CONCURRENCY: MULTI-THREADED • COMMANDS: 100% ATOMIC',
      enTitle: 'Multi-threaded I/O pipeline.',
      arTitle: 'بنية معالجة الإدخال والإخراج متعددة الأنوية',
      enBody: 'Redis threads socket parsing while executing commands on an atomic single-thread core to prevent race conditions.',
      arBody: 'معالجة قراءة وكتابة حزم الشبكة على أنوية متعددة مع إبقاء تنفيذ العمليات أحادياً لضمان سلامة البيانات.',
    },
    {
      type: 'code',
      codeSnippet: `$ redis-cli --cluster create 10.0.0.1:6379 10.0.0.2:6379 ...\n> Allocating 16384 hash slots across 3 primaries...\n✔ Slot distribution verified\n✔ Cluster online · 0 replication lag`,
      codeLanguage: 'bash',
      codeFileName: 'cluster-init.sh',
      enTitle: 'Cluster hash slot routing.',
      arTitle: 'توجيه البيانات عبر فتحات التجزئة',
      enBody: 'Keys map deterministically to 16,384 hash slots across primary shards without centralized coordination.',
      arBody: 'توزيع المفاتيح تلقائياً عبر 16,384 فتحة تجزئة بين الخوادم الأساسية دون الحاجة إلى منسق مركزي.',
    },
    {
      type: 'row',
      diagramVariant: 'topology',
      icons: [{ icon: 'network', label: 'Client Routing' }, { icon: 'database', label: 'Primary Shard' }, { icon: 'hardDrive', label: 'Replica' }],
      diagramNodes: [
        { label: 'Smart Client', sublabel: 'CRC16 slot hashing', status: 'DIRECT', icon: 'network' },
        { label: 'Primary Shard', sublabel: 'Active read/write memory', status: 'ACTIVE', icon: 'database' },
        { label: 'Replica Shard', sublabel: 'Asynchronous stream mirror', status: 'SYNCED', icon: 'hardDrive' },
      ],
      diagramEdges: ['Direct Route', 'Replication'],
      diagramFooter: 'CLUSTER: ACTIVE • REPLICATION LAG: < 1.0ms',
      enTitle: 'Deterministic cluster routing.',
      arTitle: 'مسار التوجيه الحتمي في العناقيد',
      enBody: 'Clients hash keys directly to target shards, eliminating intermediate proxy hops and latency spikes.',
      arBody: 'يقوم تطبيق العميل بحساب تجزئة المفتاح والاتصال مباشرة بالخادم المعني دون وسيط.',
    },
    {
      type: 'row',
      diagramVariant: 'takeaway',
      icons: [{ icon: 'hardDrive', label: 'RAM Cost' }, { icon: 'alertCircle', label: 'Eviction' }, { icon: 'shieldAlert', label: 'Persistence' }],
      diagramNodes: [
        { label: 'Memory Cost / GB', sublabel: '10x more expensive than NVMe', status: 'COST', icon: 'hardDrive' },
        { label: 'Eviction Policies', sublabel: 'volatile-lru or allkeys-lru', status: 'MANDATORY', icon: 'alertCircle' },
        { label: 'AOF Sync Delay', sublabel: 'Durability vs throughput tradeoff', status: 'CONFIG', icon: 'shieldAlert' },
      ],
      diagramEdges: ['High Cost', 'Enforce LRU'],
      diagramFooter: 'STRATEGY: CONFIGURE MAXMEMORY • ALWAYS DEFINE EVICTION POLICY',
      enTitle: 'The memory cost tradeoff.',
      arTitle: 'تكلفة الذاكرة وسياسات الحذف',
      enBody: 'RAM costs 10x more per gigabyte than NVMe. Configure strict maxmemory limits and eviction policies to prevent OOM.',
      arBody: 'الذاكرة أغلى بعشرة أضعاف من الأقراص؛ يجب تحديد سقف أقصى للذاكرة وسياسة إفراغ واضحة لتفادي انهيار الخادم.',
    },
    {
      type: 'cta',
      enTitle: 'Scaling in-memory caching\narchitectures?',
      arTitle: 'تبني طبقات تخزين مؤقت\nعالية السرعة؟',
      ctaText: 'DM us  •  رسالة خاصة',
      url: opts.brandUrl,
      enCredit: '',
      arCredit: `${opts.brand} · دليل معمارية قواعد البيانات السريعة`,
    },
  ];
}

/**
 * Cybersecurity & Zero-Trust Story: Perimeter flaws, service identity, and blast radius isolation.
 */
export function buildSecurityStory(opts: StoryOptions): SlideData[] {
  return [
    {
      type: 'hub',
      centerIcon: 'lock',
      satIcons: ['shieldAlert', 'network', 'key', 'server', 'eyeRisk', 'terminal'],
      satLabels: ['mTLS Enforce', 'Least Privilege', 'Service Mesh', 'Egress Guard', 'Blast Radius', 'Audit Log'],
      enTitle: 'Zero-Trust mesh security.',
      arTitle: 'أمن الشبكات بمبدأ انعدام الثقة',
      enBody: 'Why perimeter firewalls fail and how identity-based mutual TLS eliminates lateral attack movement.',
      arBody: 'لماذا تفشل الجدران النارية التقليدية، وكيف يمنع التوثيق التبادلي بالهوية التسلل الجانبي للمخترقين.',
    },
    {
      type: 'metric',
      metricValue: '100%',
      metricLabel: 'ENCRYPTED SERVICE MESH',
      metricDiff: '▲ Zero implicit trust boundaries',
      metricIcon: 'lock',
      enTitle: '100% mutual TLS encryption.',
      arTitle: 'تشفير كامل لكافة الاتصالات الداخلية',
      enBody: 'Every internal microservice verifies caller identity using short-lived cryptographic X.509 certificates.',
      arBody: 'كل خدمة داخلية تتحقق من هوية المتصل باستخدام شهادات رقمية مشفرة وقصيرة الأجل.',
    },
    {
      type: 'compare',
      compareLeftTitle: 'Perimeter Security',
      compareLeftBody: '• Implicit trust inside private network\n• Lateral movement once breached\n• Shared static IP allowlists',
      compareRightTitle: 'Zero-Trust Architecture',
      compareRightBody: '• Cryptographic SPIFFE identity tokens\n• Bounded blast radius per container\n• Continuous identity verification',
      enTitle: 'Perimeter vs. Zero-Trust.',
      arTitle: 'مقارنة الحماية المحيطية مقابل انعدام الثقة',
      enBody: 'Breaching one internal service should never grant access to surrounding production databases.',
      arBody: 'اختراق خدمة داخلية واحدة يجب ألا يمنح المهاجم أي وصول تلقائي إلى قواعد البيانات أو الخدمات المجاورة.',
    },
    {
      type: 'row',
      diagramVariant: 'isolation',
      icons: [{ icon: 'shieldAlert', label: 'Breached Pod' }, { icon: 'lock', label: 'Air-Gap Firewall' }, { icon: 'database', label: 'Protected Core' }],
      diagramNodes: [
        { label: 'Compromised Node', sublabel: 'Untrusted network scope', status: 'DENIED', icon: 'shieldAlert' },
        { label: 'Isolation Perimeter', sublabel: 'Strict egress boundary', status: 'ISOLATED', icon: 'lock' },
        { label: 'Protected Database', sublabel: 'Cryptographic auth required', status: 'SECURED', icon: 'database' },
      ],
      diagramEdges: ['QUARANTINE', 'REJECT'],
      diagramFooter: 'FAULT DOMAIN ISOLATED • LATERAL MOVEMENT: 0% SUCCESS RATE',
      enTitle: 'Blast radius containment.',
      arTitle: 'تطويق نطاق الاختراق وعزله',
      enBody: 'Egress filtering and network microsegmentation quarantine compromised containers from production backends.',
      arBody: 'تصفية الاتصالات الصادرة وعزل الشبكة يمنعان الحاوية المخترقة من التواصل مع قواعد بيانات الإنتاج.',
    },
    {
      type: 'code',
      codeSnippet: `apiVersion: security.istio.io/v1beta1\nkind: PeerAuthentication\nmetadata:\n  name: default\nspec:\n  mtls:\n    mode: STRICT`,
      codeLanguage: 'yaml',
      codeFileName: 'mtls-strict.yaml',
      enTitle: 'Strict mTLS policy config.',
      arTitle: 'إلزام التشفير والتوثيق الصارم',
      enBody: 'Enforcing STRICT mode rejects any plaintext TCP connections across all cluster namespaces.',
      arBody: 'تفعيل نمط STRICT يرفض أي اتصال غير مشفر داخل كافة بيئات العمل في العنقود البرمجي.',
    },
    {
      type: 'row',
      diagramVariant: 'stack',
      icons: [{ icon: 'server', label: 'Client App' }, { icon: 'lock', label: 'Envoy Proxy' }, { icon: 'database', label: 'Backend API' }],
      diagramNodes: [
        { label: 'Workload Token', sublabel: 'SPIFFE/SPIRE ID issued', status: 'AUTHENTIC', icon: 'server' },
        { label: 'Sidecar Proxy', sublabel: 'mTLS handshake & RBAC', status: 'ENFORCED', icon: 'lock' },
        { label: 'Target Service', sublabel: 'Authorized payload only', status: 'SECURED', icon: 'database' },
      ],
      diagramEdges: ['Verify Token', 'Decrypted Stream'],
      diagramFooter: 'IDENTITY: CRYPTOGRAPHIC • TLS 1.3 • CIPHER: CHACHA20-POLY1305',
      enTitle: 'Identity verification pipeline.',
      arTitle: 'مسار التحقق من الهوية الرقمية',
      enBody: 'Sidecar proxies handle certificate exchange and payload decryption transparently without changing application code.',
      arBody: 'تتولى الحاويات المرافقة فحص الشهادات وفك التشفير تلقائياً دون الحاجة لتعديل شيفرة التطبيق الأساسي.',
    },
    {
      type: 'row',
      diagramVariant: 'takeaway',
      icons: [{ icon: 'alertCircle', label: 'Rotation' }, { icon: 'cpu', label: 'Handshake Cost' }, { icon: 'shieldAlert', label: 'Complexity' }],
      diagramNodes: [
        { label: 'Certificate Rotation', sublabel: 'Automated short TTL renewals', status: 'REQUIRED', icon: 'alertCircle' },
        { label: 'Proxy CPU Overhead', sublabel: '1–2ms TLS handshake tax', status: 'MEASURED', icon: 'cpu' },
        { label: 'Operational Burden', sublabel: 'Service mesh debug complexity', status: 'CAVEAT', icon: 'shieldAlert' },
      ],
      diagramEdges: ['Automate', 'Profile'],
      diagramFooter: 'RECOMMENDATION: AUTOMATE CERT ROTATION BEFORE ENFORCING STRICT',
      enTitle: 'Operational complexity catch.',
      arTitle: 'أعباء إدارة شهادات الأمان',
      enBody: 'Zero-Trust adds proxy overhead and certificate renewal management. Automate renewals before enforcing strict mTLS.',
      arBody: 'يضيف مبدأ انعدام الثقة عبئاً في تجديد الشهادات واستهلاك المعالج؛ يجب أتمتة الإدارة قبل تفعيل الوضع الصارم.',
    },
    {
      type: 'cta',
      enTitle: 'Implementing Zero-Trust\nin production?',
      arTitle: 'تطبيق بنية انعدام الثقة\nفي بيئات العمل لديك؟',
      ctaText: 'DM us  •  رسالة خاصة',
      url: opts.brandUrl,
      enCredit: '',
      arCredit: `${opts.brand} · دليل أمن البنية التحتية`,
    },
  ];
}

/**
 * Linux Kernel & eBPF Story: Syscall boundary, in-kernel execution, verifier constraints, and telemetry.
 */
export function buildKernelStory(opts: StoryOptions): SlideData[] {
  return [
    {
      type: 'hub',
      centerIcon: 'terminal',
      satIcons: ['cpu', 'lock', 'server', 'gauge', 'binary', 'codeFile'],
      satLabels: ['XDP Hook', 'Kernel Space', 'JIT Verifier', 'Syscall Trace', 'Zero-Copy', 'Ring Buffer'],
      enTitle: 'How eBPF observes Linux.',
      arTitle: 'كيف تراقب تقنية eBPF نواة Linux',
      enBody: 'Running safe, sandboxed bytecode inside the Linux kernel without recompiling modules.',
      arBody: 'تشغيل شيفرة برمجية آمنة ومعزولة داخل نواة Linux مباشرة دون الحاجة لتعديل أو إعادة بناء النواة.',
    },
    {
      type: 'metric',
      metricValue: '0 context switches',
      metricLabel: 'OBSERVABILITY OVERHEAD',
      metricDiff: '▲ In-kernel line-rate processing',
      metricIcon: 'gauge',
      enTitle: '0 context switch stalls.',
      arTitle: 'صفر تبديل سياق أثناء المراقبة',
      enBody: 'Traditional tracing copies data to user space via expensive context switches; eBPF filters directly at the NIC driver.',
      arBody: 'أدوات المراقبة التقليدية تنسخ البيانات إلى فضاء المستخدم مسببة تباطؤاً كبيراً، بينما تعمل eBPF داخل النواة مباشرة.',
    },
    {
      type: 'compare',
      compareLeftTitle: 'Kernel Modules',
      compareLeftBody: '• Risk of catastrophic kernel panic\n• Breaks on every kernel version upgrade\n• Unchecked memory pointer dereferences',
      compareRightTitle: 'eBPF Sandboxed Code',
      compareRightBody: '• Verified safe by in-kernel JIT checker\n• Stable across kernel versions via CO-RE\n• Cannot crash or stall the operating system',
      enTitle: 'Kernel modules vs. eBPF.',
      arTitle: 'مقارنة وحدات النواة مقابل برامج eBPF',
      enBody: 'eBPF programs must pass a rigorous in-kernel safety verification before being permitted to execute.',
      arBody: 'تخضع برامج eBPF لفحص أمان صارم داخل النواة يضمن استحالة تسببها في انهيار نظام التشغيل.',
    },
    {
      type: 'row',
      diagramVariant: 'stack',
      icons: [{ icon: 'network', label: 'NIC Hook' }, { icon: 'cpu', label: 'eBPF JIT' }, { icon: 'hardDrive', label: 'Ring Buffer' }],
      diagramNodes: [
        { label: 'XDP Driver Hook', sublabel: 'Packet arrives at network card', status: 'INGRESS', icon: 'network' },
        { label: 'eBPF Virtual Machine', sublabel: 'Safe JIT execution core', status: 'FILTERED', icon: 'cpu' },
        { label: 'BPF Ring Buffer', sublabel: 'Lockless zero-copy telemetry', status: 'DELIVERED', icon: 'hardDrive' },
      ],
      diagramEdges: ['Intercept', 'Stream'],
      diagramFooter: 'PROCESSING: LINE-RATE • PACKET LOSS: 0% • OVERHEAD: < 1.0%',
      enTitle: 'In-kernel execution stack.',
      arTitle: 'طبقات التنفيذ داخل النواة',
      enBody: 'Packets can be inspected, rewritten, or dropped at the network card driver level before allocating a kernel socket buffer.',
      arBody: 'يمكن فحص حزم البيانات وتعديلها أو إسقاطها فور وصولها لبطاقة الشبكة قبل استهلاك أي موارد من الذاكرة.',
    },
    {
      type: 'code',
      codeSnippet: `SEC("xdp")\nint filter_traffic(struct xdp_md *ctx) {\n    void *data = (void *)(long)ctx->data;\n    void *data_end = (void *)(long)ctx->data_end;\n    // Safety boundary check required by verifier\n    if (data + sizeof(struct ethhdr) > data_end)\n        return XDP_PASS;\n    return XDP_DROP;\n}`,
      codeLanguage: 'c',
      codeFileName: 'filter_xdp.c',
      enTitle: 'XDP packet filter syntax.',
      arTitle: 'شيفرة تصفية الحزم عبر XDP',
      enBody: 'The verifier requires proving that all memory accesses are bounded within the packet payload buffer.',
      arBody: 'يشترط الفاحص الأمني إثبات أن كافة قراءات الذاكرة تقع حصراً ضمن حدود حزمة البيانات المستلمة.',
    },
    {
      type: 'row',
      diagramVariant: 'topology',
      icons: [{ icon: 'binary', label: 'LLVM Clang' }, { icon: 'shieldAlert', label: 'Kernel Verifier' }, { icon: 'zap', label: 'JIT Compiler' }],
      diagramNodes: [
        { label: 'LLVM Bytecode', sublabel: 'Compiled C or Rust program', status: 'COMPILED', icon: 'binary' },
        { label: 'Kernel Verifier', sublabel: 'Checks loops & bounds', status: 'VERIFIED', icon: 'shieldAlert' },
        { label: 'Native JIT Code', sublabel: 'Direct CPU instruction set', status: 'ACTIVE', icon: 'zap' },
      ],
      diagramEdges: ['bpf() syscall', 'JIT emit'],
      diagramFooter: 'SAFETY PROVEN: DETERMINISTIC • EXECUTION: BARE-METAL SPEED',
      enTitle: 'Verification and JIT compilation.',
      arTitle: 'التحقق والتحويل للشيفرة الأصلية',
      enBody: 'The kernel simulates every possible execution branch to ensure no infinite loops or invalid memory reads exist.',
      arBody: 'تحاكي النواة كافة مسارات التنفيذ المحتملة للتأكد التام من خلو الشيفرة من أي حلقات لا نهائية أو قراءات خاطئة.',
    },
    {
      type: 'row',
      diagramVariant: 'takeaway',
      icons: [{ icon: 'alertCircle', label: 'Verifier Limit' }, { icon: 'cpu', label: 'No Sleeping' }, { icon: 'layers', label: 'Complexity' }],
      diagramNodes: [
        { label: 'Verifier Complexity', sublabel: '1 million instruction limit', status: 'STRICT', icon: 'alertCircle' },
        { label: 'Execution Constraints', sublabel: 'Cannot sleep or block kernel', status: 'NON-BLOCKING', icon: 'cpu' },
        { label: 'Tooling Maturity', sublabel: 'Requires modern Linux 5.8+', status: 'CAVEAT', icon: 'layers' },
      ],
      diagramEdges: ['Proof Needed', 'Non-blocking'],
      diagramFooter: 'CONSTRAINTS: BOUNDED EXECUTION • COMPATIBILITY: MODERN KERNELS ONLY',
      enTitle: 'The verifier strictness catch.',
      arTitle: 'قيود الفاحص الأمني في النواة',
      enBody: 'Complex programs often fail verification. eBPF cannot sleep or block, and loops must be strictly bounded.',
      arBody: 'البرامج المعقدة تفشل في اجتياز الفحص؛ لا يمكن لبرامج eBPF التوقف المؤقت ويجب أن تكون حلقاتها محددة بدقة.',
    },
    {
      type: 'cta',
      enTitle: 'Building low-level observability\ntools?',
      arTitle: 'تبني أدوات مراقبة\nمنخفضة المستوى للنواة؟',
      ctaText: 'DM us  •  رسالة خاصة',
      url: opts.brandUrl,
      enCredit: '',
      arCredit: `${opts.brand} · دليل أنظمة Linux المتقدمة`,
    },
  ];
}

/**
 * AI & LLM Inference Story: Attention complexity, KV-cache paging, quantization, and memory bandwidth bounds.
 */
export function buildAiStory(opts: StoryOptions): SlideData[] {
  return [
    {
      type: 'hub',
      centerIcon: 'brain',
      satIcons: ['cpu', 'robot', 'database', 'lightbulb', 'gauge', 'changesets'],
      satLabels: ['KV-Cache', 'Attention Heads', 'Paged Memory', 'Token Speed', 'Quantization', 'Model Weights'],
      enTitle: 'How KV-cache speeds up LLMs.',
      arTitle: 'كيف يسرع تخزين المفاتيح والقيم نماذج الذكاء الاصطناعي',
      enBody: 'Why autoregressive text generation stalls on long contexts and how paged memory unlocks 10x token efficiency.',
      arBody: 'لماذا تتباطأ النماذج اللغوية مع كبر السياق، وكيف تضاعف الذاكرة المجزأة سرعة توليد الكلمات.',
    },
    {
      type: 'metric',
      metricValue: '10x',
      metricLabel: 'TOKEN INFERENCE SPEEDUP',
      metricDiff: '▲ Zero quadratic attention recompute',
      metricIcon: 'gauge',
      enTitle: '10x token generation speedup.',
      arTitle: 'مضاعفة سرعة توليد الرموز 10 أضعاف',
      enBody: 'Storing computed key and value vectors in GPU RAM eliminates recalculating attention for previous tokens.',
      arBody: 'الاحتفاظ بمصفوفات المفاتيح والقيم في ذاكرة كرت الشاشة يلغي إعادة حساب الانتباه للكلمات السابقة.',
    },
    {
      type: 'compare',
      compareLeftTitle: 'Naive Attention',
      compareLeftBody: '• Quadratic $O(N^2)$ recomputation per token\n• GPU memory fragmentation & waste\n• Out-of-memory crashes on long prompts',
      compareRightTitle: 'Paged KV-Cache',
      compareRightBody: '• Constant-time token forward pass\n• Virtual memory paging inspired by OS\n• Continuous batching across streams',
      enTitle: 'Naive vs. paged attention.',
      arTitle: 'مقارنة الحساب التكراري مقابل الذاكرة المجزأة',
      enBody: 'Paged attention allocates non-contiguous GPU memory blocks, eliminating allocation fragmentation under concurrent users.',
      arBody: 'توزع الذاكرة المجزأة كتل البيانات في الذاكرة دون اشتراط تجاورها، مما يقضي على هدر المساحة في كرت الشاشة.',
    },
    {
      type: 'row',
      diagramVariant: 'stack',
      icons: [{ icon: 'layers', label: 'Prompt Tokens' }, { icon: 'cpu', label: 'Attention Core' }, { icon: 'hardDrive', label: 'Paged KV RAM' }],
      diagramNodes: [
        { label: 'Prompt Tokens', sublabel: 'Input prompt encoding', status: 'BATCHED', icon: 'layers' },
        { label: 'FlashAttention Engine', sublabel: 'Fast SRAM matrix multiplies', status: 'COMPUTE', icon: 'cpu' },
        { label: 'Paged KV-Cache', sublabel: 'High-bandwidth VRAM blocks', status: 'CACHED', icon: 'hardDrive' },
      ],
      diagramEdges: ['Compute Keys', 'Append Token'],
      diagramFooter: 'VRAM UTILIZATION: > 96% • MEMORY FRAGMENTATION: < 4%',
      enTitle: 'GPU inference memory hierarchy.',
      arTitle: 'تسلسل الذاكرة في معالجات الرسوميات',
      enBody: 'FlashAttention keeps matrices in ultra-fast GPU SRAM, minimizing high-latency reads from main video memory.',
      arBody: 'تحتفظ خوارزمية FlashAttention بالمصفوفات في الذاكرة فائقة السرعة داخل المعالج لتقليل القراءة البطيئة.',
    },
    {
      type: 'code',
      codeSnippet: `from vllm import LLM, SamplingParams\n\nllm = LLM(model="meta-llama/Llama-3-70B", kv_cache_dtype="auto")\nsampling_params = SamplingParams(temperature=0.7, max_tokens=256)\noutputs = llm.generate(prompts, sampling_params)`,
      codeLanguage: 'python',
      codeFileName: 'serve_vllm.py',
      enTitle: 'High-throughput engine setup.',
      arTitle: 'تشغيل محرك الاستدلال عالي السرعة',
      enBody: 'Modern inference engines like vLLM batch independent user requests continuously without waiting for sequence completion.',
      arBody: 'محركات الاستدلال الحديثة تدمج طلبات المستخدمين المختلفة باستمرار دون انتظار انتهاء النصوص الطويلة.',
    },
    {
      type: 'row',
      diagramVariant: 'topology',
      icons: [{ icon: 'robot', label: 'Draft Model' }, { icon: 'zap', label: 'Speculative Token' }, { icon: 'brain', label: 'Target Model' }],
      diagramNodes: [
        { label: 'Draft Model (1B)', sublabel: 'Rapid candidate generation', status: 'FAST', icon: 'robot' },
        { label: 'Speculative Window', sublabel: '4–8 tokens predicted ahead', status: 'SPECULATED', icon: 'zap' },
        { label: 'Target Model (70B)', sublabel: 'Single-step parallel verify', status: 'VERIFIED', icon: 'brain' },
      ],
      diagramEdges: ['Speculate', 'Validate'],
      diagramFooter: 'LATENCY REDUCTION: 2.5X • MATHEMATICALLY IDENTICAL OUTPUT',
      enTitle: 'Speculative decoding pipeline.',
      arTitle: 'مسار التوليد التخميني المتوازي',
      enBody: 'A small draft model predicts tokens rapidly while the large model validates them in a single parallel step.',
      arBody: 'يقوم نموذج صغير بتخمين عدة كلمات سريعاً بينما يتحقق النموذج الضخم منها جميعاً في خطوة واحدة متوازية.',
    },
    {
      type: 'row',
      diagramVariant: 'takeaway',
      icons: [{ icon: 'hardDrive', label: 'Memory Wall' }, { icon: 'gauge', label: 'Bandwidth Bound' }, { icon: 'shieldAlert', label: 'Quality Drift' }],
      diagramNodes: [
        { label: 'Memory Bandwidth Wall', sublabel: 'Inference is bound by HBM transfer', status: 'PHYSICAL', icon: 'hardDrive' },
        { label: 'Cache Scaling Limits', sublabel: '32k context saturates 80GB VRAM', status: 'LIMIT', icon: 'gauge' },
        { label: 'Quantization Tradeoff', sublabel: 'INT4 saves RAM but risks reasoning', status: 'TRADE-OFF', icon: 'shieldAlert' },
      ],
      diagramEdges: ['Memory Bound', 'Evaluate Loss'],
      diagramFooter: 'PHYSICAL CONSTRAINT: INFERENCE IS MEMORY-BANDWIDTH BOUND, NOT COMPUTE',
      enTitle: 'The memory bandwidth wall.',
      arTitle: 'حاجز سرعة نقل البيانات في الذاكرة',
      enBody: 'LLM inference is bound by memory bandwidth, not raw compute. High concurrency still exhausts available GPU VRAM.',
      arBody: 'توليد الكلمات مقيد بسرعة نقل الذاكرة وليس قوة المعالجة؛ كثرة الطلبات المتزامنة تستنزف سعة كرت الشاشة بسرعة.',
    },
    {
      type: 'cta',
      enTitle: 'Deploying high-throughput AI\ninference engines?',
      arTitle: 'تشغيل نماذج الذكاء\nالاصطناعي على نطاق واسع؟',
      ctaText: 'DM us  •  رسالة خاصة',
      url: opts.brandUrl,
      enCredit: '',
      arCredit: `${opts.brand} · دليل البنية التحتية لنماذج الذكاء الاصطناعي`,
    },
  ];
}

/**
 * Databases & PgBouncer Story: Connection limits, transaction pooling, and session state caveats.
 */
export function buildDatabaseStory(opts: StoryOptions): SlideData[] {
  return [
    {
      type: 'hub',
      centerIcon: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/postgresql.svg',
      satIcons: ['database', 'server', 'network', 'activity', 'cpu', 'zap'],
      satLabels: ['Multiplexing', 'Client Pool', 'Tx Mode', 'Port 5432', 'Max Conns', 'Low Latency'],
      enTitle: 'Postgres connection pooling.',
      arTitle: 'إدارة اتصالات قواعد بيانات PostgreSQL',
      enBody: 'Why PostgreSQL forks processes per connection and how PgBouncer multiplexes 10,000 clients safely.',
      arBody: 'لماذا تستهلك اتصالات PostgreSQL موارد الخادم، وكيف يوزع PgBouncer آلاف الاتصالات بكفاءة.',
    },
    {
      type: 'metric',
      metricValue: '10,000 conns',
      metricLabel: 'CLIENT CONNECTIONS MULTIPLEXED',
      metricDiff: '▲ Handled by only 50 DB processes',
      metricIcon: 'database',
      enTitle: '10,000 connections to 50.',
      arTitle: 'دمج 10 آلاف اتصال في 50 خادماً',
      enBody: 'Postgres forks a full OS process (5–10MB RAM) per connection. Connecting thousands directly exhausts server memory.',
      arBody: 'تنشئ قواعد PostgreSQL عملية نظام كاملة لكل اتصال؛ فتح آلاف الاتصالات المباشرة يستنزف الذاكرة فوراً.',
    },
    {
      type: 'compare',
      compareLeftTitle: 'Direct Client Connections',
      compareLeftBody: '• 1,000 connections = 10GB RAM overhead\n• Linux process context-switch thrashing\n• Connection rejection under traffic spikes',
      compareRightTitle: 'PgBouncer Transaction Pool',
      compareRightBody: '• Multiplexes 10k clients into 50 workers\n• Connection reuse without process forking\n• Sub-millisecond connection handoff',
      enTitle: 'Direct conns vs. pooling.',
      arTitle: 'الاتصال المباشر مقابل مجمع الاتصالات',
      enBody: 'A lightweight connection pooler keeps a small, steady pool of backend workers while buffering client sockets.',
      arBody: 'يبقي مجمع الاتصالات عدداً محدوداً من الخوادم النشطة بينما يستقبل ويوجه آلاف اتصالات التطبيقات بسلاسة.',
    },
    {
      type: 'row',
      diagramVariant: 'stack',
      icons: [{ icon: 'network', label: '10k Clients' }, { icon: 'server', label: 'PgBouncer' }, { icon: 'database', label: 'Postgres Core' }],
      diagramNodes: [
        { label: 'Client Applications', sublabel: 'Web servers & workers', status: 'POOLED', icon: 'network' },
        { label: 'PgBouncer Proxy', sublabel: 'Multiplexing transaction pool', status: 'PROXY', icon: 'server' },
        { label: 'Postgres Primary', sublabel: '50 dedicated backend workers', status: 'OPTIMAL', icon: 'database' },
      ],
      diagramEdges: ['10k Sockets', '50 Pooled Links'],
      diagramFooter: 'CLIENT MULTIPLEXING: 200:1 RATIO • BACKEND OVERHEAD: MINIMAL',
      enTitle: 'Connection multiplexing stack.',
      arTitle: 'طبقات دمج وتوزيع الاتصالات',
      enBody: 'Clients establish instantaneous connections with PgBouncer, which borrows a Postgres backend only while queries run.',
      arBody: 'تتصل التطبيقات فورياً بالمجمع الذي يستعير خادماً فعلياً فقط خلال الجزء من الميلي ثانية المخصص لتنفيذ الاستعلام.',
    },
    {
      type: 'code',
      codeSnippet: `[databases]\n* = host=127.0.0.1 port=5432 auth_user=postgres\n\n[pgbouncer]\nlisten_port = 6432\npool_mode = transaction\nmax_client_conn = 10000\ndefault_pool_size = 50`,
      codeLanguage: 'ini',
      codeFileName: 'pgbouncer.ini',
      enTitle: 'Transaction pool mode config.',
      arTitle: 'إعداد نمط تجميع المعاملات',
      enBody: 'Setting pool_mode = transaction releases the server connection back to the pool as soon as the current transaction finishes.',
      arBody: 'تفعيل نمط المعاملات يعيد الخادم فوراً إلى المجمع بمجرد انتهاء الاستعلام لخدمة مستخدم آخر.',
    },
    {
      type: 'row',
      diagramVariant: 'topology',
      icons: [{ icon: 'network', label: 'Client Query' }, { icon: 'arrowRightLeft', label: 'Borrow Backend' }, { icon: 'checkCircle', label: 'Release' }],
      diagramNodes: [
        { label: 'Begin Transaction', sublabel: 'Client acquires backend', status: 'BORROWED', icon: 'network' },
        { label: 'Execute SQL', sublabel: 'Direct primary execution', status: 'EXECUTING', icon: 'arrowRightLeft' },
        { label: 'Commit & Release', sublabel: 'Backend returns to shared pool', status: 'RELEASED', icon: 'checkCircle' },
      ],
      diagramEdges: ['Acquire Link', 'Return to Pool'],
      diagramFooter: 'POOL EFFICIENCY: MAXIMUM • LATENCY TAX: < 0.2ms',
      enTitle: 'Transaction borrow-and-release.',
      arTitle: 'استعارة الاتصال وإعادته الفورية',
      enBody: 'Connections are shared aggressively; a thousand clients can be served by 20 backend connections if queries are fast.',
      arBody: 'تتم مشاركة الاتصالات بكفاءة عالية؛ يمكن لعشرين خادماً خدمة آلاف المستخدمين طالما كانت الاستعلامات سريعة.',
    },
    {
      type: 'row',
      diagramVariant: 'takeaway',
      icons: [{ icon: 'alertCircle', label: 'Session State' }, { icon: 'lock', label: 'Prepared Stmts' }, { icon: 'shieldAlert', label: 'LISTEN / NOTIFY' }],
      diagramNodes: [
        { label: 'Prepared Statements', sublabel: 'Require named prep cleanup', status: 'CAUTION', icon: 'lock' },
        { label: 'LISTEN / NOTIFY', sublabel: 'Requires session pooling mode', status: 'INCOMPATIBLE', icon: 'alertCircle' },
        { label: 'SET Commands', sublabel: 'Session variables leak across conns', status: 'RISK', icon: 'shieldAlert' },
      ],
      diagramEdges: ['Session State', 'Isolate'],
      diagramFooter: 'CAVEAT: TRANSACTION POOLING BREAKS SESSION-LEVEL POSTGRES FEATURES',
      enTitle: 'Transaction pool limitations.',
      arTitle: 'محاذير نمط تجميع المعاملات',
      enBody: 'Transaction pooling breaks session-level features like prepared statements and LISTEN/NOTIFY. Use session mode if needed.',
      arBody: 'نمط المعاملات لا يناسب ميزات الجلسة مثل LISTEN/NOTIFY؛ استخدم نمط الجلسة لهذه الحالات الخاصة.',
    },
    {
      type: 'cta',
      enTitle: 'Scaling high-concurrency\ndatabase workloads?',
      arTitle: 'تحسين أداء وقدرة\nاستيعاب قواعد البيانات؟',
      ctaText: 'DM us  •  رسالة خاصة',
      url: opts.brandUrl,
      enCredit: '',
      arCredit: `${opts.brand} · دليل معمارية قواعد البيانات المتقدمة`,
    },
  ];
}

/**
 * Comparative Story: Two entities/technologies directly compared.
 */
export function buildComparativeStory(
  entities: ExtractedEntities,
  metrics: ExtractedMetric[],
  opts: StoryOptions
): SlideData[] {
  const topMetric = metrics[0]?.value || 'Measurable throughput win';

  return [
    {
      type: 'hub',
      centerIcon: entities.rightLogo || 'cpu',
      satIcons: [entities.rightLogo || 'zap', entities.leftLogo || 'server', 'gauge', 'hardDrive', 'activity', 'checkCircle'],
      satLabels: [entities.rightShort, entities.leftShort, 'Throughput', 'Latency p99', 'Memory Footprint', 'Concurrency'],
      enTitle: `${entities.rightShort} vs. ${entities.leftShort}.`,
      arTitle: `مقارنة أداء ${entities.rightShort} ضد ${entities.leftShort}`,
      enBody: `Head-to-head engineering benchmark: architecture, throughput, memory footprint, and real deployment limits.`,
      arBody: `مقارنة هندسية شاملة توضح الفارق في استهلاك الموارد وسرعة تلبية الطلبات في بيئات الإنتاج.`,
    },
    {
      type: 'metric',
      metricValue: topMetric,
      metricLabel: 'PERFORMANCE MULTIPLIER',
      metricDiff: `▲ Measurable architectural speedup`,
      metricIcon: 'gauge',
      enTitle: `${entities.rightShort} measured throughput.`,
      arTitle: `تفوق الأداء: ${topMetric}`,
      enBody: `Execution speed and tail latency measured under heavy concurrent workload conditions.`,
      arBody: `أرقام حقيقية تثبت الفارق في سرعة المعالجة واستقرار الاستجابة تحت أقصى ضغط عمل.`,
    },
    {
      type: 'compare',
      compareLeftTitle: entities.leftTitle,
      compareLeftBody: entities.leftBullets.join('\n'),
      compareRightTitle: entities.rightTitle,
      compareRightBody: entities.rightBullets.join('\n'),
      enTitle: 'Resource footprint comparison.',
      arTitle: 'مقارنة استهلاك الموارد المباشرة',
      enBody: `${entities.rightTitle} demonstrates significant architectural efficiency advantages over ${entities.leftTitle}.`,
      arBody: `مقارنة مباشرة توضح استهلاك الذاكرة وتوزيع العمليات بين المنظومتين.`,
    },
    {
      type: 'code',
      codeFileName: 'handler_benchmark.sh',
      codeLanguage: 'bash',
      codeSnippet: `$ ./bench --concurrency=10000 --target=${entities.rightShort.toLowerCase()}\n+ Sustained: ${topMetric}\n✔ Zero stalls · Low p99 tail latency verified`,
      enTitle: 'Concurrent execution benchmark.',
      arTitle: 'اختبار المعالجة المتزامنة بالشيفرة',
      enBody: `How runtime execution eliminates redundant memory overhead and context switching stalls.`,
      arBody: `فحص الشيفرة البرمجية لمعرفة كيف تلغي البنية الحديثة هدر الموارد وتضمن سرعة الاستجابة.`,
    },
    {
      type: 'row',
      diagramVariant: 'stack',
      icons: [{ icon: 'server', label: 'Network Ingress' }, { icon: 'cpu', label: 'Concurrency Engine' }, { icon: 'hardDrive', label: 'Memory Model' }],
      diagramNodes: [
        { label: `${entities.leftShort} Stack`, sublabel: 'Baseline execution model', status: 'BASELINE', icon: 'server' },
        { label: 'Event Dispatch Loop', sublabel: 'Non-blocking I/O workers', status: 'PIPELINE', icon: 'cpu' },
        { label: `${entities.rightShort} Engine`, sublabel: 'Optimized memory allocation', status: 'OPTIMIZED', icon: 'zap' },
      ],
      diagramEdges: ['Dispatch Work', 'Commit State'],
      diagramFooter: `EXECUTION MODEL: NON-BLOCKING • WIN: ${topMetric}`,
      enTitle: 'Concurrency architecture model.',
      arTitle: 'بنية المعالجة وإدارة التزامن',
      enBody: `How asynchronous execution handles concurrent connections without thread contention stalls.`,
      arBody: `كيفية إدارة تدفق العمليات المتزامنة بكفاءة عالية دون استنزاف أنوية المعالج.`,
    },
    {
      type: 'row',
      diagramVariant: 'topology',
      icons: [{ icon: 'network', label: 'Client Inbound' }, { icon: 'zap', label: 'Processing' }, { icon: 'checkCircle', label: 'Response' }],
      diagramNodes: [
        { label: 'Inbound Sockets', sublabel: 'High-frequency queue', status: 'POOLED', icon: 'network' },
        { label: 'Core Dispatcher', sublabel: 'Zero-copy pipeline', status: 'ACTIVE', icon: 'zap' },
        { label: `${topMetric} Result`, sublabel: 'Microsecond tail latency', status: 'VERIFIED', icon: 'checkCircle' },
      ],
      diagramEdges: [topMetric, 'Zero Stalls'],
      diagramFooter: `LATENCY: SUB-MILLISECOND • CONCURRENCY: SCALED`,
      enTitle: 'Request processing dataflow.',
      arTitle: 'مسار معالجة الطلبات المتزامنة',
      enBody: `Direct event loops process inbound traffic without blocking caller threads or allocating redundant memory.`,
      arBody: `معالجة فورية ومباشرة للاتصالات الواردة لضمان استقرار وسرعة الاستجابة الدائمة.`,
    },
    {
      type: 'row',
      diagramVariant: 'takeaway',
      icons: [{ icon: 'terminal', label: 'Developer Speed' }, { icon: 'alertCircle', label: 'Cognitive Cost' }, { icon: 'shieldAlert', label: 'Trade-off' }],
      diagramNodes: [
        { label: `${entities.leftShort} Velocity`, sublabel: 'Faster team onboarding', status: 'VELOCITY', icon: 'terminal' },
        { label: 'Architectural Overhead', sublabel: 'Deeper tuning complexity', status: 'OVERHEAD', icon: 'alertCircle' },
        { label: `${entities.rightShort} Raw Power`, sublabel: 'Maximum production throughput', status: 'POWER', icon: 'shieldAlert' },
      ],
      diagramEdges: ['Velocity', 'Throughput'],
      diagramFooter: 'ENGINEERING DECISION: THROUGHPUT SCALE VS DEVELOPMENT VELOCITY',
      enTitle: 'Development velocity tradeoff.',
      arTitle: 'تكلفة التطوير وسرعة الإنجاز',
      enBody: `Simpler stacks offer faster iteration. Choose deep optimization when throughput justifies the complexity.`,
      arBody: `الأنظمة الأبسط تمنحك سرعة في التطوير؛ لا تنتقل للتحسين المعقد إلا إذا كان حجم العمل يتطلب ذلك.`,
    },
    {
      type: 'cta',
      enTitle: `Scaling ${entities.rightShort}\nin production?`,
      arTitle: `تبني أنظمة عالية\nالكفاءة في مشاريعك؟`,
      ctaText: 'DM us  •  رسالة خاصة',
      url: opts.brandUrl,
      enCredit: '',
      arCredit: `${opts.brand} · تقرير مقارنة الأنظمة البرمجية`,
    },
  ];
}

/**
 * AI Agent Delegation, Identity & Scoped Autonomy Story:
 * Dedicated deep architectural narrative for AI Agents vs Human Identity, OAuth Delegation, MCP, and Cryptographic Boundaries.
 */
export function buildAgentDelegationStory(subject: string, opts: StoryOptions): SlideData[] {
  const { cleanSubject, arSubject } = extractCleanSubject(subject);
  const enHook = enforceHeadlineSpecRule(subject, { isHook: true, fallbackSubject: 'AI Agent Delegation' });

  const candidates: SlideData[] = [
    {
      type: 'hub',
      centerIcon: 'robot',
      satIcons: ['users', 'key', 'lock', 'shieldAlert', 'code', 'activity'],
      satLabels: ['Human Principal', 'Scoped OAuth', 'Token Exchange', 'Tool Sandbox', 'Audit Trail', 'Kill Switch'],
      enTitle: enHook,
      arTitle: `لماذا يختلف الوكيل الذكي عن المستخدم البشري؟`,
      enBody: `AI agents are neither static cron scripts nor human users — they require cryptographic delegation, scoped tokens, and bounded tool access.`,
      arBody: `وكلاء الذكاء الاصطناعي ليسوا مجرد سكربتات تقليدية ولا بشراً؛ بل يحتاجون إلى تفويض مشفر وصلاحيات محددة بدقة.`,
    },
    {
      type: 'compare',
      compareLeftTitle: 'HUMAN USER / STATIC BOT',
      compareLeftBody: '• Broad session cookies or static API keys\n• Interactive CAPTCHA & browser assumptions\n• Full account blast radius on compromise',
      compareRightTitle: 'DELEGATED AI AGENT',
      compareRightBody: '• Short-lived RFC 8693 OAuth token exchange\n• Explicit `act` claim linking human & agent\n• Task-scoped permissions with instant revocation',
      enTitle: 'Human identity vs agent delegation.',
      arTitle: 'هوية البشر مقابل تفويض الوكيل الذكي.',
      enBody: 'Treating agents like humans forces shared passwords; treating them like dumb bots blocks legitimate delegated workflows.',
      arBody: 'معاملة الوكيل كإنسان تدفع لمشاركة كلمات المرور، ومعاملته كبوت عشوائي تمنعه من إنجاز المهام المفوضة شرعياً.',
    },
    {
      type: 'row',
      diagramVariant: 'isolation',
      diagramNodes: [
        { label: 'Human Principal', sublabel: 'Grants Intent & Consent', status: 'VERIFIED', icon: 'users' },
        { label: 'OAuth Token Exchange', sublabel: 'Attests Agent + Scopes', status: 'SCOPED', icon: 'key' },
        { label: 'Resource Server', sublabel: 'Enforces Least Privilege', status: 'GUARDED', icon: 'lock' },
      ],
      diagramEdges: ['DELEGATE', 'ATTEST'],
      diagramFooter: 'CRYPTOGRAPHIC DELEGATION: SEPARATING PRINCIPAL FROM ACTOR',
      enTitle: 'Cryptographic delegation chains.',
      arTitle: 'سلسلة التفويض المشفر وعزل الهوية.',
      enBody: 'Instead of impersonating the user, the agent presents a dual-identity token proving both who authorized the task and which agent is acting.',
      arBody: 'بدلاً من انتحال شخصية المستخدم، يحمل الوكيل رمزاً مزدوجاً يثبت هوية المفوِّض البشري وهوية الوكيل المنفِّذ معاً.',
    },
    {
      type: 'code',
      codeFileName: 'delegated_agent_jwt.json',
      codeLanguage: 'json',
      codeSnippet: `{\n  "iss": "https://auth.cloudflare.com",\n  "sub": "user:eng-lead@acme.dev",\n  "act": { "sub": "agent:triage-bot-v2" },\n  "scope": "workers:read logs:query",\n  "exp": 1735690200\n}`,
      enTitle: 'Attesting identity with `act` claims.',
      arTitle: 'توثيق التفويض عبر معيار `act` البرمجي.',
      enBody: 'RFC 8693 Token Exchange embeds the `act` (actor) claim inside the JWT so downstream APIs audit the exact agent and human principal.',
      arBody: 'يتيح معيار RFC 8693 تضمين حقل الفاعل `act` داخل الرمز لتمكين الخوادم من تدقيق حركات الوكيل والمستخدم بدقة.',
    },
    {
      type: 'row',
      diagramVariant: 'clusters',
      diagramNodes: [
        { label: 'Read-Only Tools', sublabel: 'Autonomous Execution', status: 'AUTO', icon: 'search' },
        { label: 'Scoped Writes', sublabel: 'Policy Rate-Limited', status: 'BOUNDED', icon: 'sliders' },
        { label: 'Destructive Actions', sublabel: 'Human-in-the-Loop Gate', status: 'GATED', icon: 'shieldAlert' },
      ],
      diagramEdges: ['CLASSIFY', 'GATE'],
      diagramFooter: 'TOOL GOVERNANCE: TIERED AUTONOMY & APPROVAL GATES',
      enTitle: 'Tiered autonomy by action risk.',
      arTitle: 'تدرج الاستقلالية حسب خطورة العملية.',
      enBody: 'Agents can query telemetry autonomously, but production mutations or billing changes require explicit human-in-the-loop step-up approval.',
      arBody: 'يمكن للوكيل قراءة السجلات تلقائياً، لكن تعديل الإنتاج أو الفواتير يتطلب موافقة بشرية فورية قبل التنفيذ.',
    },
    {
      type: 'metric',
      metricValue: '300s',
      metricLabel: 'EPHEMERAL AGENT TOKEN TTL',
      metricDiff: '▼ Eliminates long-lived static API key leaks',
      metricIcon: 'lock',
      enTitle: 'Zero standing privileges.',
      arTitle: 'إلغاء الصلاحيات الدائمة والمفاتيح الثابتة.',
      enBody: 'Short-lived 5-minute delegated tokens ensure that even if an agent context is prompt-injected, the blast radius expires immediately.',
      arBody: 'رموز التفويض قصيرة الأجل تضمن انتهاء الصلاحية فوراً وحصر الأضرار حتى في حال تعرض الوكيل لحقن الأوامر.',
    },
    {
      type: 'row',
      diagramVariant: 'takeaway',
      diagramNodes: [
        { label: 'Bot Blocking', sublabel: 'Breaks legitimate agents', status: 'FRAGILE', icon: 'shieldAlert' },
        { label: 'Verified Delegation', sublabel: 'Signed identity + intent', status: 'TRUSTED', icon: 'key' },
        { label: 'Auditability', sublabel: 'Per-action accountability', status: 'VERIFIED', icon: 'checkCircle' },
      ],
      diagramEdges: ['AUTHENTICATE', 'ACCOUNT'],
      diagramFooter: 'ARCHITECTURE VERDICT: DESIGN FOR DELEGATED AGENCY',
      enTitle: 'Design APIs for delegated agency.',
      arTitle: 'الخلاصة: صمّم أنظمتك لتفويض الوكلاء.',
      enBody: `The web must evolve beyond binary "human vs bad bot" checks toward verifiable agent identity, scoped consent, and revocation.`,
      arBody: `يجب أن تتجاوز الأنظمة ثنائية "إنسان أو بوت ضار" نحو هوية وكيل موثقة وتفويض محدد النطاق قابل للإلغاء لحظياً.`,
    },
    {
      type: 'cta',
      enTitle: enforceHeadlineSpecRule(`How do you scope ${cleanSubject}?`, { isCta: true }),
      arTitle: `كيف تضبط صلاحيات ${arSubject} في مشاريعك؟`,
      enBody: 'Share how your engineering team handles OAuth token exchange, MCP tool permissions, and agent guardrails in production.',
      arBody: 'شاركنا في التعليقات كيف يدير فريقك صلاحيات وكلاء الذكاء الاصطناعي وتفويض الأدوات في بيئة الإنتاج.',
      ctaText: 'Join discussion  •  شارك برأيك',
      url: opts.brandUrl,
      enCredit: '',
      arCredit: `${opts.brand} · دراسة هندسية في أمن وهوية الوكلاء`,
    },
  ];

  return trimSlides(candidates, opts.targetCount);
}

/**
 * Humor / Opinion / Cultural Commentary Story Builder:
 * Avoids dry "architectural breakdown" jargon when the user inputs jokes, dev humor, or opinion takes.
 * Quotes real nouns directly from the input and builds a quote/contrast hook card + clean story arc.
 */
export function buildHumorOrOpinionStory(
  rawSource: string,
  subject: string,
  userPoints: string[],
  opts: StoryOptions
): SlideData[] {
  const { cleanSubject, arSubject } = extractCleanSubject(subject);
  const fullContext = `${rawSource} ${userPoints.join(' ')}`.trim();
  const quoted = extractSourceQuotedHubNodes(fullContext, {
    titleText: subject,
    category: opts.domainCategory || 'DEV CULTURE',
    targetCount: 5,
  });
  const claimCard = buildNonNumericHookClaimCard(fullContext, { enTitle: subject, enBody: userPoints.join(' ') });

  const enHook = enforceHeadlineSpecRule(subject, { isHook: true, fallbackSubject: cleanSubject });
  const term0 = quoted.satLabels[0]?.toLowerCase() || cleanSubject.toLowerCase();
  const term1 = quoted.satLabels[1]?.toLowerCase() || 'reality';
  const term2 = quoted.satLabels[2]?.toLowerCase() || 'workflow';

  const candidates: SlideData[] = [
    {
      type: claimCard?.mode === 'contrast' ? 'compare' : 'metric',
      storyRole: 'hook',
      centerIcon: 'sparkles',
      satIcons: ['terminal', 'alertTriangle', 'gitBranch', 'clock', 'zap'],
      satLabels: quoted.satLabels.slice(0, 5),
      hubNodeReasons: quoted.hubNodeReasons,
      hookClaimCard: claimCard,
      metricValue: '',
      metricLabel: '',
      metricDiff: '',
      chartDirection: 'none',
      enTitle: enHook,
      arTitle: `الحقيقة المضحكة وراء ${arSubject}`,
      enBody: '',
      arBody: '',
    },
    {
      type: 'compare',
      storyRole: 'problem',
      compareLeftTitle: 'WHAT TEAMS SAY',
      compareLeftBody: `• "Just push ${term0} before Friday"\n• Skip checking ${term1}\n• Hope nothing wakes alerts`,
      compareRightTitle: 'WHAT ACTUALLY HAPPENS',
      compareRightBody: `• Midnight ${term0} fire drills\n• Emergency fixes in ${term2}\n• Monday post-mortems again`,
      enTitle: enforceHeadlineSpecRule(`Expectation vs reality with ${term0}`, { isHook: false }),
      arTitle: `ما يُقال وقت الإطلاق مقابل الواقع الفعلي.`,
      enBody: userPoints[0]
        ? autoFitTextToLimits(userPoints[0], 135)
        : `What sounds effortless when shipping ${cleanSubject} usually turns into avoidable weekend rework.`,
      arBody: `ما يبدو سريعاً عند الحديث عن ${arSubject} يتحول غالباً إلى ضغط إضافي وإصلاحات متأخرة.`,
    },
    {
      type: 'row',
      storyRole: 'mechanism',
      diagramVariant: 'topology',
      diagramNodes: [
        { label: quoted.satLabels[0] || 'SHORTCUT', sublabel: 'Rushed trigger', status: 'TRIGGER', icon: 'zap' },
        { label: quoted.satLabels[1] || 'REACTION', sublabel: 'Team friction', status: 'FRICTION', icon: 'alertTriangle' },
        { label: quoted.satLabels[2] || 'AFTERMATH', sublabel: 'Cleanup habit', status: 'REALITY', icon: 'checkCircle' },
      ],
      diagramEdges: ['TRIGGERS', 'LEADS TO'],
      diagramFooter: `REALITY LOOP: ${cleanSubject.toUpperCase().slice(0, 26)}`,
      enTitle: enforceHeadlineSpecRule(`How ${term0} turns into rework`, { isHook: false }),
      arTitle: `كيف يتحول الاختصار إلى تكلفة مضاعفة.`,
      enBody: userPoints[1]
        ? autoFitTextToLimits(userPoints[1], 135)
        : `Behind the joke around ${cleanSubject} sits a repeatable feedback loop between shortcuts and ${term1}.`,
      arBody: `خلف النكتة الدارجة حول ${arSubject} دائماً ما تتكرر الحلقة نفسها بين التسرع وتراكم الإصلاحات.`,
    },
    {
      type: 'number',
      storyRole: 'proof',
      stepNumber: '02',
      stepLabel: `CHECKPOINT // ${quoted.satLabels[3] || 'DISCIPLINE'}`,
      centerIcon: 'sliders',
      enTitle: enforceHeadlineSpecRule(`The habit that fixes ${term0}`, { isHook: false }),
      arTitle: `العادة البسيطة التي تمنع هذا السيناريو.`,
      enBody: `Great teams laugh at ${cleanSubject} because they replaced heroic rescues with quiet, repeatable guardrails.`,
      arBody: `الفرق الهادئة تبتسم أمام مواقف ${arSubject} لأنها استبدلت التدخلات البطولية بخطوات وقائية واضحة.`,
    },
    {
      type: 'row',
      storyRole: 'takeaway',
      diagramVariant: 'takeaway',
      icons: [{ icon: 'alertCircle', label: 'Shortcut' }, { icon: 'checkCircle', label: 'Craft' }],
      diagramNodes: [
        { label: quoted.satLabels[0] || 'RUSHED MOVE', sublabel: 'Short-term laugh', status: 'RISKY', icon: 'alertTriangle' },
        { label: quoted.satLabels[3] || 'CLEAR RULE', sublabel: 'Shared team agreement', status: 'ADOPTED', icon: 'sliders' },
        { label: quoted.satLabels[4] || 'CALM WEEKEND', sublabel: 'Predictable shipping', status: 'GAIN', icon: 'checkCircle' },
      ],
      diagramEdges: ['REPLACE', 'SHIP CALMLY'],
      diagramFooter: `TAKEAWAY: ${cleanSubject.toUpperCase().slice(0, 28)}`,
      enTitle: `Turn the ${cleanSubject.split(/\s+/).slice(0, 2).join(' ')} joke into a rule`,
      arTitle: `حوّل الموقف المتكرر إلى قاعدة واضحة للفريق.`,
      enBody: `Every recurring joke in engineering or product points directly to the one checklist step missing from the workflow.`,
      arBody: `كل موقف ساخر يتكرر في العمل يكشف بوضوح خطوة التحقق الناقصة التي تستحق الإصلاح مرة واحدة.`,
    },
    {
      type: 'cta',
      storyRole: 'cta',
      enTitle: enforceHeadlineSpecRule(`Need calmer workflows with Marrok?`, { isCta: true }),
      arTitle: `تريد فريقك يشحن بثقة وبلا توتر؟`,
      enBody: `Message Marrok to simplify your release checklists and build product workflows your whole team trusts.`,
      arBody: `تواصل مع فريق مروك لبناء أنظمة وخطوات إطلاق واضحة تمنح فريقك سرعة واستقراراً حقيقياً.`,
      ctaText: 'Save & Message Marrok  •  احفظ وراسلنا',
      url: opts.brandUrl,
      enCredit: '',
      arCredit: `${opts.brand} · ثقافة المنتجات والفرق التقنية`,
    },
  ];

  return trimSlides(candidates, opts.targetCount);
}

/**
 * General Source-Grounded Narrative Story (No Canned Architecture Clichés):
 * Hooks -> Problem -> Mechanism -> Proof -> Takeaway -> CTA using quoted source nouns.
 */
export function buildGeneralSystemsStory(rawSource: string, opts: StoryOptions): SlideData[] {
  const sentences = rawSource
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
  const firstSentence = sentences[0] || rawSource;
  const safeSubject = !firstSentence || isNonSemanticFileName(firstSentence) ? opts.domainCategory || 'Product Systems' : firstSentence;
  const { cleanSubject, arSubject } = extractCleanSubject(safeSubject);

  const quoted = extractSourceQuotedHubNodes(rawSource, {
    titleText: firstSentence,
    category: opts.domainCategory,
    targetCount: 5,
  });

  const firstMetric = opts.metrics ? selectWinningHookMetric(rawSource, opts.metrics) : undefined;
  const formattedFirstMetric = firstMetric
    ? firstMetric.type === 'latency'
      ? firstMetric.value.replace(/\s+/g, '')
      : firstMetric.value
    : '';
  const hasNumeric = Boolean(formattedFirstMetric && /\d/.test(formattedFirstMetric));
  const claimCard = !hasNumeric
    ? buildNonNumericHookClaimCard(rawSource, { enTitle: firstSentence, enBody: sentences.slice(1).join(' ') })
    : undefined;

  const enHook = enforceHeadlineSpecRule(firstSentence, { isHook: true, fallbackSubject: cleanSubject });
  const term1 = (quoted.satLabels[0] || cleanSubject.split(/\s+/)[0] || 'Core').toLowerCase();
  const term2 = (quoted.satLabels[1] || 'execution').toLowerCase();
  const term3 = (quoted.satLabels[2] || 'reliability').toLowerCase();
  const slug = cleanSubject.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 18) || 'workflow_spec';

  const coverHookType = hasNumeric
    ? 'metric'
    : inferDynamicCoverArchetype({
        enTitle: enHook,
        arTitle: `ما الذي يغيره ${arSubject} فعلياً؟`,
        enBody: sentences.slice(1).join(' '),
        hookClaimCard: claimCard,
      } as SlideData);

  const clauseSplits = rawSource
    .split(/(?:,\s+(?:using|removing|to\s+store|to\s+eliminate|instead\s+of|without|causing|cutting|reducing)\s+|;\s+)/i)
    .map((c) => c.trim())
    .filter((c) => c.length >= 16);
  const slide2SourceClause =
    sentences[1] ||
    clauseSplits[1] ||
    (clauseSplits[0] && clauseSplits[0] !== firstSentence ? clauseSplits[0] : '') ||
    firstSentence;
  const slide2TitleRaw =
    sentences[1]
      ? sentences[1].split(',')[0].trim()
      : clauseSplits[1] || `${quoted.satLabels[0] || cleanSubject} contention under load`;
  const slide2BodyRaw =
    sentences[1] ||
    rawSource;

  const candidates: SlideData[] = [
    {
      type: coverHookType,
      storyRole: 'hook',
      centerIcon: resolveTechLogo(rawSource) || 'cpu',
      satIcons: ['layers', 'lock', 'code', 'gauge', 'box'],
      satLabels: quoted.satLabels.slice(0, 5),
      hubNodeReasons: quoted.hubNodeReasons,
      ...(hasNumeric && firstMetric
        ? {
            metricValue: formattedFirstMetric,
            metricLabel: (quoted.satLabels[0] || 'KEY OUTCOME').toUpperCase(),
            metricDiff: `SOURCE WIN: ${formattedFirstMetric}`,
            chartDirection: firstMetric.type === 'latency' ? 'down' : 'up',
          }
        : {
            metricValue: '',
            metricLabel: '',
            metricDiff: '',
            chartDirection: 'none',
            hookClaimCard: claimCard,
          }),
      enTitle: enHook,
      arTitle: `ما الذي يفرضه ${arSubject} عند التنفيذ؟`,
      enBody: '',
      arBody: '',
    },
    {
      type: 'compare',
      storyRole: 'problem',
      compareLeftTitle: `WITHOUT ${quoted.satLabels[0] || 'STRUCTURE'}`,
      compareLeftBody: `• Unbounded load across ${term1}\n• Contention handing off to ${term2}\n• Slow recovery when traffic spikes`,
      compareRightTitle: `WITH ${quoted.satLabels[1] || 'DESIGN'}`,
      compareRightBody: `• Explicit ${term1} boundaries\n• Direct ${term2} execution\n• Predictable ${term3} behavior`,
      enTitle: enforceHeadlineSpecRule(slide2TitleRaw, { isHook: false, fallbackSubject: cleanSubject }),
      arTitle: `أين يواجه ${arSubject} عنق الزجاجة الفعلي؟`,
      enBody: autoFitTextToLimits(slide2SourceClause || slide2BodyRaw, 135),
      arBody: `تكشف آلية ${arSubject} في ${term1} أن الاختناق يبدأ عند تداخل المهام مع ${term2}.`,
    },
    {
      type: 'row',
      storyRole: 'mechanism',
      diagramVariant: 'isolation',
      diagramNodes: [
        { label: quoted.satLabels[0] || 'INPUT RULE', sublabel: 'Clear entry contract', status: 'VALIDATED', icon: 'lock' },
        { label: quoted.satLabels[1] || 'ACTIVE STEP', sublabel: 'Focused processing', status: 'ISOLATED', icon: 'cpu' },
        { label: quoted.satLabels[2] || 'RESULT STATE', sublabel: 'Measured output', status: 'VERIFIED', icon: 'checkCircle' },
      ],
      diagramEdges: ['VALIDATE', 'DELIVER'],
      diagramFooter: `${cleanSubject.toUpperCase().slice(0, 26)} • WORKFLOW`,
      enTitle: enforceHeadlineSpecRule(`How ${term1} connects to ${term2}`, { isHook: false }),
      arTitle: `ترابط ${arSubject} خطوة بخطوة.`,
      enBody: sentences[2]
        ? autoFitTextToLimits(sentences[2], 135)
        : `Separating ${term1} checks from ${term2} keeps failures contained and outcomes predictable.`,
      arBody: `فصل خطوات التحقق عن مرحلة التنفيذ في ${arSubject} يحصر الأخطاء ويحافظ على استقرار النتيجة.`,
    },
    {
      type: 'row',
      storyRole: 'mechanism',
      diagramVariant: 'topology',
      diagramNodes: [
        { label: quoted.satLabels[0] || 'SOURCE EVENT', sublabel: 'Inbound signal', status: 'INBOUND', icon: 'network' },
        { label: quoted.satLabels[1] || 'COORDINATOR', sublabel: 'Direct state transition', status: 'ROUTED', icon: 'gitBranch' },
        { label: quoted.satLabels[2] || 'DURABLE ACK', sublabel: 'Confirmed result', status: 'COMMITTED', icon: 'checkCircle' },
      ],
      diagramEdges: ['ROUTE', 'COMMIT'],
      diagramFooter: `${cleanSubject.toUpperCase().slice(0, 26)} • TOPOLOGY`,
      enTitle: enforceHeadlineSpecRule(`Request flow through ${term1}`, { isHook: false }),
      arTitle: `مسار التدفق والتنسيق داخل ${arSubject}.`,
      enBody: `Keeping routing direct between ${term1} and ${term2} removes hidden queues and contention stalls.`,
      arBody: `الربط المباشر بين مراحل ${arSubject} يمنع الطوابير المخفية ويحافظ على ثبات سرعة الاستجابة.`,
    },
    {
      type: 'code',
      storyRole: 'mechanism',
      codeFileName: `${slug}.yaml`,
      codeLanguage: 'yaml',
      codeSnippet: `# Explicit ${cleanSubject.slice(0, 26)} rules\nprimary: "${term1}"\nhandoff: "${term2}"\ncheck: "${term3}"`,
      enTitle: enforceHeadlineSpecRule(`Codifying ${term1} rules cleanly`, { isHook: false }),
      arTitle: `تثبيت قواعد ${arSubject} بشكل واضح.`,
      enBody: `Putting ${term1} and ${term2} expectations into explicit configuration removes guesswork across teams.`,
      arBody: `توثيق قواعد ${arSubject} في إعدادات واضحة يلغي الاجتهاد الشخصي ويمنع تضارب البيئات.`,
    },
    {
      type: 'number',
      storyRole: 'proof',
      stepNumber: '03',
      stepLabel: `CHECK // ${quoted.satLabels[3] || 'RELIABILITY'}`,
      centerIcon: 'gauge',
      enTitle: enforceHeadlineSpecRule(`Spotting ${term1} bottlenecks early`, { isHook: false }),
      arTitle: `قياس الأثر الفعلي في ${arSubject}.`,
      enBody: `Measuring ${term1} and ${term3} directly shows whether changes save real user time and budget.`,
      arBody: `المراقبة الواضحة لـ ${arSubject} تكشف الاختناقات مبكراً قبل أن يشتكي العملاء من البطء.`,
    },
    {
      type: 'row',
      storyRole: 'takeaway',
      diagramVariant: 'takeaway',
      icons: [{ icon: 'alertCircle', label: 'Cost' }, { icon: 'checkCircle', label: 'Payoff' }],
      diagramNodes: [
        { label: quoted.satLabels[0] || 'BASELINE', sublabel: 'Old default habit', status: 'BEFORE', icon: 'layers' },
        { label: quoted.satLabels[1] || 'FOCUSED RULE', sublabel: 'Clear boundary', status: 'APPLIED', icon: 'zap' },
        { label: quoted.satLabels[4] || 'DURABLE WIN', sublabel: 'Steadier delivery', status: 'AFTER', icon: 'checkCircle' },
      ],
      diagramEdges: ['SIMPLIFY', 'SHIP'],
      diagramFooter: `TAKEAWAY: ${cleanSubject.toUpperCase().slice(0, 28)}`,
      enTitle: enforceHeadlineSpecRule(`Focus on ${term1} before adding layers`, { isHook: false }),
      arTitle: `ابدأ بضبط الأساسيات في ${arSubject} أولاً.`,
      enBody: `Teams win with ${cleanSubject} when they tighten ${term1} and ${term2} before introducing extra moving parts.`,
      arBody: `نجاح ${arSubject} يبدأ بتبسيط القواعد الأساسية ووضوح المسؤوليات قبل إضافة أي تعقيد جديد.`,
    },
    {
      type: 'cta',
      storyRole: 'cta',
      enTitle: enforceHeadlineSpecRule(`Apply ${cleanSubject} with Marrok`, { isCta: true }),
      arTitle: `هل تطبّق ${arSubject} في مشروعك الآن؟`,
      enBody: `Turn this ${cleanSubject} lesson into clear execution steps with the Marrok engineering team.`,
      arBody: `شاركنا التحدي الذي تواجهه مع ${arSubject} أو راسل فريق مروك لتصميم حل عملي لمشروعك.`,
      ctaText: 'Save & Message Marrok  •  احفظ وراسلنا',
      url: opts.brandUrl,
      enCredit: '',
      arCredit: `${opts.brand} · ${opts.domainCategory || 'تصميم الأنظمة والمنتجات'}`,
    },
  ];

  return trimSlides(candidates, opts.targetCount);
}

