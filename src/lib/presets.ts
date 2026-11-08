import { CarouselData } from '../types';

/**
 * Default starter template used for initial application hydration
 * and when the user clicks "Reset Draft" in the Header.
 */
export const DEFAULT_STARTER_DECK: CarouselData = {
  id: 'post_26488150-bb6',
  theme: 'amber',
  category: 'AI + ENGINEERING',
  caption: `Why did Anthropic move beyond Git? A deeper look at Scion 🚀
لماذا ابتعدت Anthropic عن Git؟ نظرة عميقة على نظام Scion الداخلي

With AI agents making thousands of pull requests around the clock, traditional Git mirrors broke down under 100 GB repo histories and 25 million daily CI checkouts. Here is what Anthropic built instead:

Key Takeaways / أبرز النقاط:
• Commits and merges run server-side via API
• Changesets track only modified files (proportional resource usage)
• Test-after-merge workflow for high-throughput deployment
• 200x smaller CPU/memory footprint & 25% of CI computing freed

Source: Anthropic Engineering Blog ("Scion: Git for AI Agents")
Read more at marrok.org

#SoftwareEngineering #Git #Anthropic #AIAgents #DevOps #SystemDesign #SoftwareArchitecture #هندسة_البرمجيات #MARROK #TechInArabic`,
  captionVariants: [
    {
      style: 'Executive Bulletins & Hard Metrics',
      caption: `Why did Anthropic move beyond Git? A deeper look at Scion 🚀
لماذا ابتعدت Anthropic عن Git؟ نظرة عميقة على نظام Scion الداخلي

With AI agents making thousands of pull requests around the clock, traditional Git mirrors broke down under 100 GB repo histories and 25 million daily CI checkouts. Here is what Anthropic built instead:

Key Takeaways / أبرز النقاط:
• Commits and merges run server-side via API
• Changesets track only modified files (proportional resource usage)
• Test-after-merge workflow for high-throughput deployment
• 200x smaller CPU/memory footprint & 25% of CI computing freed

Source: Anthropic Engineering Blog ("Scion: Git for AI Agents")
Read more at marrok.org

#SoftwareEngineering #Git #Anthropic #AIAgents #DevOps #SystemDesign #SoftwareArchitecture #هندسة_البرمجيات #MARROK #TechInArabic`,
    },
    {
      style: 'Narrative Breakdown & Story',
      caption: `What happens when AI agents write more code than humans? Git starts melting. 🤖💥

Anthropic hit a wall with traditional Git: 100GB mono-repo history and 25,000,000 CI checkouts every single day. Instead of band-aiding Git, they designed Scion: a server-authoritative VCS built from the ground up for always-online software agents.

The core lesson? Don't optimize for how humans worked 15 years ago. Design for the agents building right now.

Full breakdown in the slides above.
Source: Anthropic's Engineering post. Numbers are Anthropic's own.
Learn more: marrok.org

#AIEngineering #DeveloperTools #GitAlternatives #Anthropic #VCS #CloudArchitecture #SoftwareDesign #MARROK`,
    },
  ],
  hookVariants: [
    {
      tag: 'Curiosity & Why',
      enTitle: 'Why did Anthropic\nmove beyond Git?',
      arTitle: 'السبب وراء ابتعاد\nAnthropic عن Git',
      enBody: 'A deeper look at Scion.',
      arBody: 'نظرة أعمق على Scion.',
      centerIcon: 'gitMerge',
    },
    {
      tag: 'Hard Metrics',
      enTitle: '100 GB repos &\n25M CI checkouts.',
      arTitle: '100 جيجابايت مستودع\nو25 مليون سحب يومياً.',
      enBody: 'When AI agents pushed Git to the breaking point.',
      arBody: 'حين دفع وكلاء الذكاء الاصطناعي نظام Git إلى حافة الانهيار.',
      centerIcon: 'database',
    },
    {
      tag: 'The Paradigm Shift',
      enTitle: 'Git was built for humans.\nScion was built for agents.',
      arTitle: 'صُمم Git للبشر،\nوصُمم Scion للوكلاء.',
      enBody: 'How always-online AI changes every tooling assumption.',
      arBody: 'كيف يغير وكلاء الذكاء الاصطناعي كل افتراضات أدوات التطوير.',
      centerIcon: 'robot',
    },
  ],
  slides: [
    {
      type: 'hub',
      centerIcon: 'gitMerge',
      satIcons: ['server', 'database', 'gauge', 'cpu', 'box', 'activity'],
      satLabels: ['Virtual FS', 'Server Merge', 'API VCS', 'Changesets', 'CI Runners', 'Telemetry'],
      enTitle: 'Why did Anthropic\nmove beyond Git?',
      arTitle: 'السبب وراء ابتعاد\nAnthropic عن Git',
      enBody: 'A deeper look at Scion.',
      arBody: 'نظرة أعمق على Scion.',
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
      codeSnippet: `$ scion checkout --lazy
✔ Virtual filesystem mapped (0.4s)
✔ Changeset: 3 files (0.01% of repo)
$ scion commit -m "agent: optimize index"
✔ Server-side merge verified (1.2s)`,
      codeLanguage: 'bash',
      codeFileName: 'scion-cli.sh',
      enTitle: 'Virtual tree checkout.',
      arTitle: 'سحب شجرة افتراضية.',
      enBody: 'Instead of cloning the entire 100 GB repo history, Scion streams only the exact files the agent touches.',
      arBody: 'بدلاً من استنساخ كامل المستودع البالغ 100 جيجابايت، يرسل Scion فقط الملفات التي يلمسها الوكيل البرمجي.',
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
      arBody: 'الانتقال من الاستنساخ الكامل المحلي إلى نظام ملفات افتراضي مدار بالواجهات البرمجية قلل الهدر بنسبة 200 ضعف.',
    },
    {
      type: 'row',
      diagramVariant: 'stack',
      icons: [
        { icon: 'code', label: 'API-driven VCS' },
        { icon: 'server', label: 'Virtual mount' },
        { icon: 'lock', label: 'Lockless merges' },
      ],
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
      icons: [
        { icon: 'terminal', label: 'Agent Commit' },
        { icon: 'gitMerge', label: 'Speculative Merge' },
        { icon: 'activity', label: 'Test Runner' },
      ],
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
      icons: [
        { icon: 'gitMerge', label: 'General Repos' },
        { icon: 'robot', label: 'Agent Workloads' },
        { icon: 'shieldAlert', label: 'Internal Tool' },
      ],
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
      url: 'marrok.org',
      enCredit: "Based on Anthropic's engineering post. The numbers are Anthropic's own.",
      arCredit: 'مبني على مقال Anthropic الهندسي، والأرقام من Anthropic نفسها.',
    },
  ],
};

/**
 * Standard registry for backward-compatibility with App.tsx and starter loaders.
 */
export const PRESET_CAROUSELS: Record<string, { name: string; category: string; description: string; data: CarouselData }> = {
  scion: {
    name: "Anthropic's Scion: Moving Beyond Git",
    category: 'AI + ENGINEERING',
    description: 'Anthropic built Scion to handle 25M CI checkouts/day and 100GB repos.',
    data: DEFAULT_STARTER_DECK,
  },
};
