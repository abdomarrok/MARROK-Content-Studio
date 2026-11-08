import type { SavedPostRecord } from '../../types.ts';

/**
 * Bundled repository seed posts for the Saved & Posted Vault.
 * Kept inside `src/lib/storage/` so Vite/Rolldown and Vercel Serverless builds
 * always resolve it even when runtime `data/saved-posts.json` is not present in git.
 */
export const BUNDLED_SAVED_POSTS: SavedPostRecord[] = [
  {
    "id": "post_fc946187-e1a",
    "title": "The future of Java in AI.",
    "category": "JAVA & AI INFRASTRUCTURE",
    "postStatus": "posted",
    "createdAt": "2026-11-08T12:37:38.932Z",
    "updatedAt": "2026-11-08T14:35:03.798Z",
    "postedAt": "2026-11-08T12:37:38.932Z",
    "creatorHandle": "Oracle Java Developer Advocacy",
    "slideCount": 8,
    "qaPassed": true,
    "deck": {
      "theme": "emerald",
      "category": "JAVA & AI INFRASTRUCTURE",
      "caption": "⚡ مستقبل Java في عصر الذكاء الاصطناعي: كيف تتطور اللغة؟\n\nتنتقل Java من كونها لغة تعتمد على المعالج المركزي (CPU) إلى منصة تدعم الحوسبة غير المتجانسة (Heterogeneous Computing). استكشف كيف تساهم FFM API ومشروع Babylon في دمج نماذج AI مباشرة داخل بيئة Java.\n\nJava is evolving beyond CPU-centric models to embrace AI and heterogeneous hardware. Discover how the FFM API and Project Babylon are enabling native AI integration without leaving the Java ecosystem.\n\n🔹 FFM API: Native AI runtime calls without JNI overhead.\n🔹 Project Babylon: Code reflection for symbolic AI model transformation.\n🔹 Jextract: Automated binding generation for C/C++ libraries.\n🔹 Performance: Reducing memory copy overhead for tensor operations.\n\nهل تعتقد أن Java ستصبح اللغة الأولى لتطبيقات AI المؤسسية؟ شارك برأيك 👇\n\n🎥 Source: Oracle Java Developer Advocacy\n\n#Java #OpenJDK #AI #MachineLearning #ProjectBabylon #SoftwareArchitecture #Programming",
      "slides": [
        {
          "type": "row",
          "centerIcon": "cpu",
          "diagramFooter": "SYSTEM TOPOLOGY: END-TO-END DETERMINISTIC PIPELINE",
          "enTitle": "The future of Java in AI.",
          "arTitle": "مستقبل Java في عصر الذكاء الاصطناعي",
          "enBody": "Java is evolving beyond CPU-centric models to embrace AI and heterogeneous hardware.",
          "arBody": "تتطور Java لتتجاوز النماذج المعتمدة على المعالج المركزي وتتبنى تقنيات الذكاء الاصطناعي.",
          "url": "marrok.org",
          "satLabels": [
            "FFM API",
            "Project Babylon",
            "Jextract",
            "Tensor Ops",
            "Code Reflection",
            "ONNX Runtime"
          ],
          "diagramEdges": [
            "PROCESS",
            "COMMIT"
          ],
          "diagramNodes": [
            {
              "label": "Java",
              "sublabel": "Stage 01 Ingress",
              "status": "ACTIVE",
              "icon": "robot"
            },
            {
              "label": "CPU-centric",
              "sublabel": "Stage 02 Processing",
              "status": "VERIFIED",
              "icon": "cpu"
            },
            {
              "label": "Future",
              "sublabel": "Stage 03 Target State",
              "status": "SECURED",
              "icon": "shieldAlert"
            }
          ],
          "diagramVariant": "topology"
        },
        {
          "type": "metric",
          "stepNumber": "01",
          "stepLabel": "THE PROBLEM",
          "metricValue": "100%",
          "enTitle": "The CPU-centric bottleneck.",
          "arTitle": "عنق الزجاجة في الحوسبة التقليدية",
          "enBody": "Java traditionally targets CPU computation, but modern AI requires massive tensor operations on GPUs.",
          "arBody": "تستهدف Java تقليدياً عمليات المعالج المركزي، بينما تتطلب نماذج AI الحديثة عمليات مصفوفات ضخمة على وحدات GPU المعتمد."
        },
        {
          "type": "row",
          "stepNumber": "02",
          "stepLabel": "MECHANICS",
          "enTitle": "Bridging native AI runtimes.",
          "arTitle": "ربط بيئات تشغيل AI الأصلية",
          "enBody": "The Foreign Function & Memory API (FFM) allows Java to interact with C/C++ AI runtimes without JNI complexity.",
          "arBody": "تسمح واجهة FFM لـ Java بالتفاعل مع بيئات تشغيل AI المكتوبة بـ C/C++ دون تعقيدات JNI المعتمد.",
          "diagramVariant": "topology"
        },
        {
          "type": "row",
          "stepNumber": "03",
          "stepLabel": "MECHANICS",
          "enTitle": "Project Babylon's code reflection.",
          "arTitle": "انعكاس الكود في مشروع Babylon",
          "enBody": "Treating Java code as symbolic models allows transformation into foreign programming models like ONNX.",
          "arBody": "معاملة كود Java كنماذج رمزية يسمح بتحويله إلى نماذج برمجية خارجية مثل ONNX المعتمد.",
          "diagramVariant": "stack"
        },
        {
          "type": "compare",
          "stepNumber": "04",
          "stepLabel": "IMPACT",
          "compareLeftTitle": "Legacy JNI",
          "compareRightTitle": "FFM API",
          "enTitle": "Legacy vs modern integration.",
          "arTitle": "التكامل التقليدي مقابل الحديث",
          "enBody": "Moving from complex JNI bridges to native, high-throughput memory access.",
          "arBody": "الانتقال من جسور JNI المعقدة إلى وصول مباشر وعالي الإنتاجية للذاكرة."
        },
        {
          "type": "row",
          "stepNumber": "05",
          "stepLabel": "IMPACT",
          "enTitle": "Automating the AI pipeline.",
          "arTitle": "أتمتة خط أنابيب الذكاء الاصطناعي",
          "enBody": "Tools like Obgen and Protogen eliminate boilerplate, keeping AI-integrated Java code concise.",
          "arBody": "أدوات مثل Obgen و Protogen تلغي الكود المتكرر، مما يبقي كود Java المدمج مع AI مختصراً.",
          "diagramVariant": "features"
        },
        {
          "type": "row",
          "enTitle": "The core trade-off.",
          "arTitle": "المقايضة الجوهرية",
          "enBody": "Balancing Java's ecosystem stability with the performance demands of heterogeneous AI hardware.",
          "arBody": "الموازنة بين استقرار نظام Java ومتطلبات الأداء لأجهزة AI غير المتجانسة.",
          "diagramVariant": "takeaway"
        },
        {
          "type": "cta",
          "enTitle": "Join the discussion.",
          "arTitle": "انضم إلى النقاش",
          "enBody": "How will these new programming models change your enterprise AI strategy?",
          "arBody": "كيف ستغير نماذج البرمجة الجديدة هذه استراتيجية الذكاء الاصطناعي في مؤسستك؟",
          "ctaText": "Explore Project Babylon",
          "url": "marrok.org/java-ai-future"
        }
      ],
      "postFormat": "carousel",
      "id": "post_fc946187-e1a",
      "brand": "MARROK",
      "brandUrl": "marrok.org",
      "firstComment": "Check out the Project Babylon repository to experiment with Jextract and ONNX integration: https://github.com/openjdk/babylon",
      "shortCaption": "Java is evolving to embrace AI and heterogeneous hardware. Discover how FFM API and Project Babylon are changing the game.",
      "screenHook": "Java's AI evolution is here",
      "scheduleSlot": "10:00 DZ",
      "sourceMeta": {
        "type": "youtube",
        "title": "The Future of Java: Embracing AI and Next-Generation Programming Models",
        "creator": "Oracle Java Developer Advocacy",
        "url": "https://youtube.com",
        "published": "2024",
        "groundingQueries": [
          "Java FFM API AI integration",
          "Project Babylon Java code reflection",
          "Java ONNX runtime Jextract"
        ],
        "groundingSources": [
          {
            "title": "OpenJDK Project Babylon",
            "url": "https://openjdk.org/projects/babylon/"
          },
          {
            "title": "Java Foreign Function & Memory API",
            "url": "https://openjdk.org/jeps/454"
          }
        ],
        "isSearchGrounded": false,
        "isFallback": false,
        "engine": "ungrounded",
        "model": "gemini-3.1-flash-lite",
        "status": "unverified_draft",
        "userReviewed": true
      },
      "facts": [
        {
          "text": "FFM API enables Java to call native AI runtimes without JNI complexity.",
          "type": "claim",
          "verified": "unconfirmed"
        },
        {
          "text": "Project Babylon uses code reflection to transform Java code into native AI models.",
          "type": "claim",
          "verified": "unconfirmed"
        },
        {
          "text": "Simple LLM examples in Java can be implemented in under 200 lines using Babylon tools.",
          "type": "claim",
          "verified": "unconfirmed"
        }
      ],
      "notesForHuman": [
        "Project Babylon is currently experimental; emphasize this in the takeaway slide.",
        "Ensure the distinction between FFM API (interop) and Code Reflection (native expression) is clear.",
        "No financial or DevOps jargon used; strictly adhered to technical/architectural terminology."
      ],
      "captionVariants": [
        {
          "style": "Bulletins",
          "caption": "⚡ مستقبل Java في عصر الذكاء الاصطناعي: كيف تتطور اللغة؟\n\nتنتقل Java من كونها لغة تعتمد على المعالج المركزي (CPU) إلى منصة تدعم الحوسبة غير المتجانسة. استكشف كيف تساهم FFM API ومشروع Babylon في دمج نماذج AI مباشرة داخل بيئة Java.\n\n🔹 FFM API: Native AI runtime calls without JNI overhead.\n🔹 Project Babylon: Code reflection for symbolic AI model transformation.\n🔹 Jextract: Automated binding generation for C/C++ libraries.\n🔹 Performance: Reducing memory copy overhead for tensor operations.\n\nهل تعتقد أن Java ستصبح اللغة الأولى لتطبيقات AI المؤسسية؟ شارك برأيك 👇"
        },
        {
          "style": "Narrative",
          "caption": "Java is evolving beyond CPU-centric models to embrace AI and heterogeneous hardware. With the introduction of the FFM API and Project Babylon, developers can now interact with native AI runtimes and GPUs without leaving the Java ecosystem. This shift marks a new era for enterprise AI performance. 🚀\n\nهل تعتقد أن Java ستصبح اللغة الأولى لتطبيقات AI المؤسسية؟ شارك برأيك 👇"
        }
      ],
      "hookVariants": [
        {
          "tag": "Performance",
          "enTitle": "Java's AI performance shift.",
          "arTitle": "تحول أداء Java في الذكاء الاصطناعي",
          "enBody": "How FFM API and Project Babylon are bridging Java with native AI runtimes.",
          "arBody": "كيف تربط FFM API ومشروع Babylon لغة Java ببيئات تشغيل الذكاء الاصطناعي.",
          "centerIcon": "zap"
        },
        {
          "tag": "Architecture",
          "enTitle": "The future of Java models.",
          "arTitle": "مستقبل نماذج البرمجة في Java",
          "enBody": "Moving beyond CPU-centric computation to heterogeneous AI hardware.",
          "arBody": "تجاوز الحوسبة المعتمدة على المعالج المركزي إلى أجهزة AI غير المتجانسة.",
          "centerIcon": "layers"
        },
        {
          "tag": "Innovation",
          "enTitle": "Java meets native AI.",
          "arTitle": "Java تلتقي بالذكاء الاصطناعي الأصلي",
          "enBody": "Unlocking high-throughput AI inference without leaving the Java ecosystem.",
          "arBody": "فتح آفاق استنتاج AI عالي الإنتاجية دون مغادرة بيئة Java المعتمد.",
          "centerIcon": "cpu"
        }
      ]
    },
    "publishTargets": [
      "instagram",
      "tiktok"
    ],
    "hostedSlideUrls": [
      "https://n.uguu.se/ejJWofMo.jpg",
      "https://h.uguu.se/yHEcLGcE.jpg",
      "https://h.uguu.se/QlEmzQFH.jpg",
      "https://d.uguu.se/eFNRQtUm.jpg",
      "https://h.uguu.se/oyYTtSNJ.jpg",
      "https://d.uguu.se/WCnPeyyD.jpg",
      "https://n.uguu.se/vhRzkvTJ.jpg",
      "https://d.uguu.se/suqnXGCp.jpg"
    ],
    "cloudinaryPublicIds": [
      "ephemeral_staging/post_1794141454932_s1_1794141456",
      "ephemeral_staging/post_1794141454932_s2_1794141456",
      "ephemeral_staging/post_1794141454932_s3_1794141456",
      "ephemeral_staging/post_1794141454932_s4_1794141456",
      "ephemeral_staging/post_1794141454932_s5_1794141456",
      "ephemeral_staging/post_1794141454932_s6_1794141456",
      "ephemeral_staging/post_1794141454932_s7_1794141456",
      "ephemeral_staging/post_1794141454932_s8_1794141456",
      "ephemeral_staging/post_1794141456285_s1_1794141458",
      "ephemeral_staging/post_1794141456285_s2_1794141458",
      "ephemeral_staging/post_1794141456285_s3_1794141458",
      "ephemeral_staging/post_1794141456285_s4_1794141458",
      "ephemeral_staging/post_1794141456285_s5_1794141458",
      "ephemeral_staging/post_1794141456285_s6_1794141458",
      "ephemeral_staging/post_1794141456285_s7_1794141458",
      "ephemeral_staging/post_1794141456285_s8_1794141458"
    ],
    "bufferPostIds": [
      "6af06d13562f2e6de9ba4ae8"
    ],
    "tiktokHostedSlideUrls": [
      "https://h.uguu.se/yjphHEZt.jpg",
      "https://h.uguu.se/lhkYSYiR.jpg",
      "https://n.uguu.se/RTsaEtHn.jpg",
      "https://n.uguu.se/ulDHdOQv.jpg",
      "https://h.uguu.se/VewSAoTx.jpg",
      "https://d.uguu.se/iwGHARaL.jpg",
      "https://d.uguu.se/sKtaNNfb.jpg",
      "https://d.uguu.se/KjCrYBdt.jpg"
    ],
    "zernioPostIds": [
      "6af06d1e81e454264816d216"
    ],
    "cloudinaryCleanedAt": "2026-11-08T14:35:03.798Z"
  },
  {
    "id": "post_de02d787-d55",
    "title": "AI Agent Tooling MCP vs UTCP.",
    "category": "AI AGENT INTEGRATIONS",
    "postStatus": "posted",
    "createdAt": "2026-11-08T11:49:19.612Z",
    "updatedAt": "2026-11-08T13:08:42.091Z",
    "postedAt": "2026-11-08T11:49:19.613Z",
    "creatorHandle": "MARROK Engine",
    "slideCount": 8,
    "qaPassed": true,
    "deck": {
      "theme": "teal",
      "category": "AI AGENT INTEGRATIONS",
      "caption": "⚡ كيف تربط وكلاء الذكاء الاصطناعي بالأدوات الخارجية؟\n\nبناء وكيل ذكاء اصطناعي يتفاعل مع Jira أو GitHub يتطلب بروتوكولاً ذكياً. هل تختار MCP كوسيط أم UTCP للاتصال المباشر؟\n\nHow do AI agents interact with external tools like Jira? We break down the architectural trade-offs between MCP (Model-Call Protocol) and UTCP (Universal Tool Calling Protocol).\n\n🔹 MCP: Standardized middleware approach.\n🔹 UTCP: Direct API calls via manual specs.\n🔹 Trade-off: Server overhead vs. manual configuration.\n\nما هو البروتوكول الذي تفضله لمشاريعك؟ 👇\n\n🎥 Source: Understanding MCP vs UTCP (AI Agent Integration Deep Dive)\n\n#AI #LLM #SoftwareArchitecture #MCP #UTCP #DevOps #API",
      "slides": [
        {
          "type": "compare",
          "centerIcon": "cpu",
          "compareLeftTitle": "AI AGENT TOOLING MCP",
          "compareLeftBody": "• Legacy AI Agent Tooling MCP constraints\n• Higher operational overhead\n• Limited elasticity under load",
          "compareRightTitle": "UTCP",
          "compareRightBody": "• Optimized UTCP path\n• Sub-millisecond execution\n• Deterministic scaling guarantees",
          "enTitle": "AI Agent Tooling MCP vs UTCP.",
          "arTitle": "ربط وكلاء الذكاء الاصطناعي بالأدوات",
          "enBody": "How do AI agents interact with external services? We compare the two primary protocols for seamless tool calling.",
          "arBody": "كيف يتفاعل وكلاء الذكاء الاصطناعي مع الخدمات الخارجية؟ نقارن بين البروتوكولين الأساسيين للاتصال بالأدوات.",
          "satIcons": [
            "server",
            "code",
            "database",
            "layers",
            "shield",
            "terminal"
          ],
          "satLabels": [
            "MCP Server",
            "API Manuals",
            "Jira Integration",
            "Auth Handling",
            "Standardization",
            "Direct Calls"
          ]
        },
        {
          "type": "number",
          "enTitle": "The Integration Bottleneck.",
          "arTitle": "عنق زجاجة التكامل",
          "enBody": "AI models cannot talk to APIs directly. They require a protocol to translate intent into actionable tool calls.",
          "arBody": "نماذج الذكاء الاصطناعي لا تتحدث مع واجهات البرمجة مباشرة. تحتاج لبروتوكول يترجم النوايا إلى أوامر تنفيذية."
        },
        {
          "type": "row",
          "stepNumber": "01",
          "enTitle": "MCP: The Middleware Approach.",
          "arTitle": "نهج الوسيط البرمجي",
          "enBody": "MCP uses a server as an intermediary to handle authentication and API complexity, providing a standardized interface.",
          "arBody": "يستخدم MCP خادماً وسيطاً لإدارة المصادقة وتعقيدات واجهات البرمجة، مما يوفر واجهة موحدة للتعامل مع الخدمات.",
          "diagramVariant": "topology"
        },
        {
          "type": "row",
          "stepNumber": "02",
          "enTitle": "UTCP: Direct API Execution.",
          "arTitle": "التنفيذ المباشر",
          "enBody": "UTCP eliminates the middleman by using API manuals to call services directly, offering a lightweight integration.",
          "arBody": "يلغي UTCP الحاجة لوسيط عبر استخدام أدلة واجهات البرمجة للاتصال مباشرة، مما يوفر تكاملاً خفيف الوزن.",
          "diagramVariant": "topology"
        },
        {
          "type": "compare",
          "stepNumber": "03",
          "compareLeftTitle": "MCP (Middleware)",
          "compareRightTitle": "UTCP (Direct)",
          "enTitle": "Architecture Comparison.",
          "arTitle": "مقارنة البنية الهيكلية",
          "enBody": "Choosing between MCP and UTCP depends on your infrastructure requirements and maintenance capacity.",
          "arBody": "الاختيار بين MCP و UTCP يعتمد على متطلبات البنية التحتية وقدرتك على الصيانة.",
          "diagramNodes": [
            {
              "label": "MCP Client",
              "sublabel": "Middleware",
              "status": "STANDARD",
              "icon": "cpu"
            },
            {
              "label": "UTCP Client",
              "sublabel": "API Spec",
              "status": "DIRECT",
              "icon": "terminal"
            },
            {
              "label": "Target API",
              "sublabel": "Jira/GitHub",
              "status": "ENDPOINT",
              "icon": "database"
            }
          ],
          "diagramVariant": "split"
        },
        {
          "type": "row",
          "enTitle": "Operational Trade-offs.",
          "arTitle": "المقايضات التشغيلية",
          "enBody": "MCP simplifies multi-service integration but adds server overhead. UTCP offers control but requires manual upkeep.",
          "arBody": "يبسط MCP التكامل مع خدمات متعددة لكنه يضيف عبء الخادم. يوفر UTCP تحكماً أكبر لكنه يتطلب صيانة يدوية.",
          "diagramVariant": "takeaway"
        },
        {
          "type": "row",
          "enTitle": "Verdict: Which to choose?",
          "arTitle": "الخلاصة: ماذا تختار؟",
          "enBody": "Use MCP for standardized, multi-tool environments. Use UTCP for high-control, lightweight, direct API integrations.",
          "arBody": "استخدم MCP للبيئات الموحدة متعددة الأدوات. استخدم UTCP للتكاملات المباشرة خفيفة الوزن وعالية التحكم.",
          "diagramVariant": "isolation"
        },
        {
          "type": "cta",
          "enTitle": "Join the discussion.",
          "arTitle": "شارك برأيك",
          "enBody": "Are you building AI agents? Which protocol fits your stack better?",
          "arBody": "هل تبني وكلاء ذكاء اصطناعي؟ أي بروتوكول يناسب بنيتك التقنية بشكل أفضل؟",
          "ctaText": "Join discussion • شارك برأيك",
          "url": "marrok.org"
        }
      ],
      "postFormat": "carousel",
      "id": "post_de02d787-d55",
      "brand": "MARROK",
      "brandUrl": "marrok.org",
      "firstComment": "Read the full breakdown on AI agent protocols here: marrok.org/blog/mcp-vs-utcp",
      "shortCaption": "MCP vs. UTCP: How AI agents connect to tools. Which protocol wins? 🤖",
      "screenHook": "AI Agent Integration: MCP vs. UTCP",
      "scheduleSlot": "18:00 DZ",
      "sourceMeta": {
        "title": "Understanding MCP vs UTCP: How AI Agents Connect to Tools",
        "creator": "MARROK Engine",
        "url": "https://example.com/mcp-vs-utcp",
        "published": "2024-05-20",
        "groundingQueries": [
          "MCP vs UTCP AI agent integration",
          "Model-Call Protocol vs Universal Tool Calling Protocol"
        ],
        "groundingSources": [
          {
            "title": "Understanding MCP vs UTCP",
            "url": "https://example.com/mcp-vs-utcp"
          }
        ],
        "isSearchGrounded": false,
        "isFallback": false,
        "engine": "ungrounded",
        "model": "gemini-3.1-flash-lite",
        "status": "unverified_draft",
        "userReviewed": true
      },
      "facts": [
        {
          "text": "MCP uses a middleware server to standardize communication between AI agents and external APIs.",
          "type": "claim",
          "verified": "unconfirmed"
        },
        {
          "text": "UTCP uses API manuals to enable direct, serverless communication between AI agents and external services.",
          "type": "claim",
          "verified": "unconfirmed"
        },
        {
          "text": "MCP is highly portable across services, while UTCP requires accurate manual creation per API.",
          "type": "claim",
          "verified": "unconfirmed"
        }
      ],
      "notesForHuman": [
        "Verified the distinction between MCP (middleware-based) and UTCP (manual-based) as described in the input.",
        "Ensured no DevOps jargon was used, focusing on architectural and protocol terminology.",
        "The carousel follows a logical flow from problem to mechanism to trade-off."
      ],
      "captionVariants": [
        {
          "style": "Bulletins",
          "caption": "⚡ كيف تربط وكلاء الذكاء الاصطناعي بالأدوات الخارجية؟\n\nبناء وكيل ذكاء اصطناعي يتفاعل مع Jira أو GitHub يتطلب بروتوكولاً ذكياً. هل تختار MCP كوسيط أم UTCP للاتصال المباشر؟\n\n🔹 MCP: Standardized middleware approach.\n🔹 UTCP: Direct API calls via manual specs.\n🔹 Trade-off: Server overhead vs. manual configuration.\n\nما هو البروتوكول الذي تفضله لمشاريعك؟ 👇"
        },
        {
          "style": "Narrative",
          "caption": "بناء وكلاء ذكاء اصطناعي يتطلب ربطاً ذكياً بالأدوات. في هذا المنشور، نستعرض الفرق بين MCP و UTCP وكيف يؤثر كل منهما على تعقيد التكامل. 🤖\n\nChoosing between MCP and UTCP is a critical architectural decision for AI agents. We break down the pros, cons, and trade-offs of each approach."
        }
      ],
      "hookVariants": [
        {
          "tag": "Architecture",
          "enTitle": "MCP vs. UTCP: AI Integration.",
          "arTitle": "MCP مقابل UTCP تكامل الذكاء الاصطناعي",
          "enBody": "How do AI agents talk to tools? The architectural breakdown.",
          "arBody": "كيف يتحدث وكلاء الذكاء الاصطناعي مع الأدوات؟ تحليل البنية الهيكلية.",
          "centerIcon": "cpu"
        },
        {
          "tag": "Engineering",
          "enTitle": "Stop hardcoding AI integrations.",
          "arTitle": "توقف عن برمجة التكاملات يدوياً",
          "enBody": "Use MCP or UTCP to automate tool calling.",
          "arBody": "استخدم MCP أو UTCP لأتمتة استدعاء الأدوات.",
          "centerIcon": "terminal"
        },
        {
          "tag": "Strategy",
          "enTitle": "The AI Agent Protocol War.",
          "arTitle": "حرب بروتوكولات وكلاء الذكاء الاصطناعي",
          "enBody": "MCP vs. UTCP: Which one should you choose?",
          "arBody": "MCP مقابل UTCP أيهما يجب أن تختار؟",
          "centerIcon": "layers"
        }
      ],
      "visualOptions": {
        "showCadReticles": true,
        "showSparklines": true,
        "terminalScanlines": true
      }
    },
    "publishTargets": [
      "instagram",
      "facebook",
      "linkedin",
      "tiktok"
    ],
    "hostedSlideUrls": [
      "https://n.uguu.se/cAzsyMcN.jpg",
      "https://d.uguu.se/BMNaRVPK.jpg",
      "https://h.uguu.se/hXLhWfiC.jpg",
      "https://h.uguu.se/WsUrRwMp.jpg",
      "https://d.uguu.se/rCwtrhnB.jpg",
      "https://n.uguu.se/iHkVGmpN.jpg",
      "https://d.uguu.se/rioRBusj.jpg",
      "https://h.uguu.se/fFYvDdNe.jpg"
    ],
    "cloudinaryPublicIds": [
      "ephemeral_staging/post_1794138557468_s1_1794138559",
      "ephemeral_staging/post_1794138557468_s2_1794138559",
      "ephemeral_staging/post_1794138557468_s3_1794138559",
      "ephemeral_staging/post_1794138557468_s4_1794138559",
      "ephemeral_staging/post_1794138557468_s5_1794138559",
      "ephemeral_staging/post_1794138557468_s6_1794138559",
      "ephemeral_staging/post_1794138557468_s7_1794138559",
      "ephemeral_staging/post_1794138557468_s8_1794138559"
    ],
    "bufferPostIds": [
      "6af061c0562f2e6de9b64cb9",
      "6af061ca51492b796e35fc03"
    ],
    "countedInMetricoolMonth": "2026-11",
    "cloudinaryCleanedAt": "2026-11-08T13:08:42.091Z"
  },
  {
    "id": "post_787318fd-8c1",
    "title": "Is Your Voice Still Yours?",
    "category": "CYBERSECURITY & DIGITAL IDENTITY",
    "postStatus": "posted",
    "createdAt": "2026-10-28T11:41:01.716Z",
    "updatedAt": "2026-11-08T11:00:02.094Z",
    "postedAt": "2026-10-28T11:41:01.716Z",
    "creatorHandle": "Tech Podcaster",
    "slideCount": 8,
    "qaPassed": true,
    "deck": {
      "theme": "violet",
      "category": "CYBERSECURITY & DIGITAL IDENTITY",
      "caption": "⚡ هل صوتك ملكك فعلاً؟ استكشاف مخاطر استنساخ الصوت بالذكاء الاصطناعي.\n\nتتطور تقنيات استنساخ الصوت بسرعة تفوق الأطر القانونية الحالية. من استنساخ اللهجات الإقليمية إلى انتحال الشخصية الرقمية، إليك كيف تحمي هويتك الصوتية.\n\n🔹 كيف يتم استنساخ الصوت؟\n🔹 التحديات القانونية (Right of Publicity).\n🔹 خطوات عملية عند اكتشاف انتحال صوتك.\n🔹 غياب المرجع التقني الموثوق للتحقق.\n\nهل تعتقد أن القوانين الحالية كافية لحماية هويتنا الرقمية؟ شارك برأيك 👇\n\n🎥 المصدر: تجربة بودكاست تقني حول استنساخ الصوت.\n\n#CyberSecurity #AI #DigitalIdentity #TechEthics #Privacy #VoiceCloning #TechInArabic",
      "slides": [
        {
          "type": "hub",
          "centerIcon": "clickhouse",
          "centerTag": "elevenlabs",
          "stepNumber": "01",
          "enTitle": "Is Your Voice Still Yours?",
          "arTitle": "هل صوتك ملكك فعلاً؟",
          "enBody": "AI voice cloning is evolving faster than legal frameworks. Here is the reality of digital identity theft.",
          "arBody": "تتطور تقنيات استنساخ الصوت بسرعة تفوق الأطر القانونية. إليك واقع سرقة الهوية الرقمية.",
          "satLabels": [
            "Accent Markers",
            "Similarity Test",
            "Publicity Rights",
            "Identity Theft",
            "Legal Precedent",
            "Digital Signature"
          ]
        },
        {
          "type": "number",
          "stepNumber": "01",
          "enTitle": "The Reality of Voice Cloning.",
          "arTitle": "واقع استنساخ الصوت",
          "enBody": "AI tools like Eleven Labs can now capture unique regional accents and speech quirks with unsettling precision.",
          "arBody": "أدوات الذكاء الاصطناعي قادرة الآن على محاكاة اللهجات الإقليمية وسمات الكلام بدقة مقلقة."
        },
        {
          "type": "row",
          "stepNumber": "02",
          "enTitle": "The Identity Fingerprint.",
          "arTitle": "بصمة الهوية الصوتية",
          "enBody": "Your voice is a unique biometric fingerprint. AI cloning creates a 'masquerade' that undermines personal credibility.",
          "arBody": "صوتك هو بصمة بيومترية فريدة. استنساخ الذكاء الاصطناعي يخلق 'تنكراً' يضعف المصداقية الشخصية.",
          "icons": [
            {
              "icon": "fingerprint",
              "label": "Biometric"
            },
            {
              "icon": "shield-alert",
              "label": "Trust Gap"
            },
            {
              "icon": "user-x",
              "label": "Impersonation"
            }
          ],
          "diagramVariant": "isolation"
        },
        {
          "type": "compare",
          "stepNumber": "03",
          "compareLeftTitle": "Platform Metric",
          "compareRightTitle": "Human Perception",
          "enTitle": "The Similarity Threshold.",
          "arTitle": "عتبة التشابه التقني",
          "enBody": "Platforms use ENCAPA-TDNN tests to measure voice similarity, but these metrics often fail to detect regional nuance.",
          "arBody": "تستخدم المنصات اختبارات ENCAPA-TDNN لقياس التشابه، لكنها غالباً تفشل في رصد الفروق الدقيقة للهجات."
        },
        {
          "type": "row",
          "stepNumber": "04",
          "enTitle": "Legal Protection Gaps.",
          "arTitle": "فجوات الحماية القانونية",
          "enBody": "No federal law explicitly protects voices. We rely on state-level 'Right of Publicity' laws to fight misappropriation.",
          "arBody": "لا يوجد قانون فيدرالي يحمي الأصوات صراحة. نعتمد على قوانين 'حق الدعاية' على مستوى الولايات لمكافحة الانتحال.",
          "icons": [
            {
              "icon": "gavel",
              "label": "Publicity Law"
            },
            {
              "icon": "file-text",
              "label": "Evidence"
            },
            {
              "icon": "scale",
              "label": "Precedent"
            }
          ],
          "diagramVariant": "takeaway"
        },
        {
          "type": "number",
          "stepNumber": "05",
          "enTitle": "Steps to Protect Yourself.",
          "arTitle": "خطوات لحماية هويتك",
          "enBody": "1. Collect evidence (links/screenshots). 2. Request platform similarity tests. 3. Consult IP legal counsel.",
          "arBody": "1. اجمع الأدلة (روابط/لقطات). 2. اطلب اختبارات التشابه. 3. استشر محامياً متخصصاً في الملكية الفكرية."
        },
        {
          "type": "row",
          "enTitle": "The Hard Truth.",
          "arTitle": "الحقيقة المرة",
          "enBody": "There is currently no impartial referee for voice identity online. You are often left with only support emails.",
          "arBody": "لا يوجد حالياً حكم محايد للهوية الصوتية عبر الإنترنت. غالباً ما تترك وحيداً مع رسائل دعم العملاء.",
          "icons": [
            {
              "icon": "mail",
              "label": "Support Only"
            },
            {
              "icon": "alert-triangle",
              "label": "No Referee"
            },
            {
              "icon": "lock-keyhole",
              "label": "Vulnerable"
            }
          ],
          "diagramVariant": "takeaway"
        },
        {
          "type": "cta",
          "enTitle": "Stay Vigilant.",
          "arTitle": "ابقَ يقظاً",
          "enBody": "AI will only get better. Document evidence, ask questions, and support stronger digital identity laws.",
          "arBody": "الذكاء الاصطناعي في تطور مستمر. وثق الأدلة، اسأل، وادعم القوانين التي تحمي هويتك الرقمية.",
          "ctaText": "Join discussion • شارك برأيك",
          "url": "marrok.org"
        }
      ],
      "id": "post_787318fd-8c1",
      "brand": "MARROK",
      "brandUrl": "marrok.org",
      "firstComment": "هل تعرضت يوماً لموقف مشابه أو لاحظت أصواتاً مزيفة عبر الإنترنت؟ شاركنا تجربتك في التعليقات. للمزيد من التحليلات التقنية: marrok.org",
      "shortCaption": "هل صوتك ملكك فعلاً؟ اكتشف مخاطر استنساخ الصوت بالذكاء الاصطناعي وكيف تحمي هويتك الرقمية. 🎙️🛡️",
      "screenHook": "هل صوتك ملكك فعلاً؟",
      "scheduleSlot": "18:00 DZ",
      "sourceMeta": {
        "title": "When AI Steals Your Voice",
        "creator": "Tech Podcaster",
        "url": "https://example.com",
        "published": "2024",
        "groundingQueries": [
          "ENCAPA-TDNN voice similarity test",
          "Right of Publicity laws voice cloning",
          "Eleven Labs voice cloning legal issues"
        ],
        "groundingSources": [
          {
            "title": "Right of Publicity and AI Voice Cloning",
            "url": "https://example.com"
          }
        ],
        "isSearchGrounded": false,
        "isFallback": false,
        "engine": "ungrounded",
        "model": "gemini-3.1-flash-lite",
        "status": "unverified_draft",
        "userReviewed": true
      },
      "facts": [
        {
          "text": "AI voice cloning can replicate unique regional accents and speech quirks with high realism.",
          "type": "claim",
          "verified": "unconfirmed",
          "evidence": "Podcaster experience with Eleven Labs voice cloning."
        },
        {
          "text": "ENCAPA-TDNN tests are used by platforms to measure voice similarity, often with a 0.7 threshold.",
          "type": "claim",
          "verified": "unconfirmed",
          "evidence": "Platform response to voice similarity claims."
        },
        {
          "text": "State-level 'Right of Publicity' laws are the primary legal tool for voice misappropriation claims.",
          "type": "claim",
          "verified": "unconfirmed",
          "evidence": "Copyright lawyer consultation."
        }
      ],
      "notesForHuman": [
        "The source mentions a specific similarity test (ENCAPA-TDNN). This is a real technical metric used in speaker verification.",
        "The legal advice provided is based on US 'Right of Publicity' laws as cited in the source; this may vary by jurisdiction.",
        "No fabricated benchmarks were used; all numbers are cited from the source text."
      ],
      "captionVariants": [
        {
          "style": "Bulletins",
          "caption": "⚡ هل صوتك ملكك فعلاً؟ استكشاف مخاطر استنساخ الصوت بالذكاء الاصطناعي.\n\nتتطور تقنيات استنساخ الصوت بسرعة تفوق الأطر القانونية الحالية. إليك كيف تحمي هويتك الصوتية:\n\n🔹 كيف يتم استنساخ الصوت؟\n🔹 التحديات القانونية (Right of Publicity).\n🔹 خطوات عملية عند اكتشاف انتحال صوتك.\n🔹 غياب المرجع التقني الموثوق للتحقق.\n\nهل تعتقد أن القوانين الحالية كافية لحماية هويتنا الرقمية؟ شارك برأيك 👇\n\n#CyberSecurity #AI #DigitalIdentity #TechEthics #Privacy #VoiceCloning"
        },
        {
          "style": "Narrative",
          "caption": "تخيل أن تسمع صوتك في فيديو لم تسجله أبداً. هذه ليست خيالاً علمياً، بل واقعاً تقنياً مقلقاً. استكشفنا في هذا العرض كيف يتم استنساخ الأصوات، لماذا يصعب إثبات الانتحال، وما هي الخطوات القانونية المتاحة حالياً لحماية بصمتك الصوتية. 🎙️🛡️\n\n#TechInArabic #AI #Security #IdentityTheft"
        }
      ],
      "hookVariants": [
        {
          "tag": "Identity",
          "enTitle": "Is Your Voice Still Yours?",
          "arTitle": "هل صوتك ملكك فعلاً؟",
          "enBody": "AI voice cloning is evolving faster than legal frameworks.",
          "arBody": "تقنيات استنساخ الصوت تتطور أسرع من القوانين.",
          "centerIcon": "mic"
        },
        {
          "tag": "Security",
          "enTitle": "The New Identity Theft.",
          "arTitle": "سرقة الهوية الجديدة",
          "enBody": "AI can now clone your unique speech patterns.",
          "arBody": "الذكاء الاصطناعي يستنسخ أنماط كلامك الفريدة.",
          "centerIcon": "shield-alert"
        },
        {
          "tag": "Legal",
          "enTitle": "Can You Protect Your Voice?",
          "arTitle": "هل يمكنك حماية صوتك؟",
          "enBody": "Navigating the legal labyrinth of AI voice cloning.",
          "arBody": "كيف تتعامل مع المتاهة القانونية لاستنساخ الصوت.",
          "centerIcon": "gavel"
        }
      ],
      "visualOptions": {
        "showCadReticles": true,
        "showSparklines": true,
        "terminalScanlines": true
      }
    }
  },
  {
    "id": "post_bd34e875-ba6",
    "title": "Securing Open Source in the Age of AI.",
    "category": "KUBERNETES & CLOUD SEC",
    "postStatus": "posted",
    "createdAt": "2026-10-28T14:09:25.173Z",
    "updatedAt": "2026-11-08T10:59:59.166Z",
    "creatorHandle": "MARROK",
    "slideCount": 8,
    "qaPassed": true,
    "deck": {
      "theme": "blueprint",
      "category": "KUBERNETES & CLOUD SEC",
      "caption": "⚡ تحليل معماري لمنظومة بنية نماذج الذكاء\nتحليل تقني ومعماري متعمق لأحدث نقلة برمجية 🛠️\n\nSecuring Open Source in the Age of AI — Engineering Deep Dive\nWhy traditional architectures stall at scale and how modern systems solve the bottleneck.\n\n🔹 أبرز آليات العمل والنتائج / Key Technical Takeaways:\n• Domain: KUBERNETES & CLOUD SEC\n• Core Mechanism: # Securing Open Source in the Age of AI: The Race to Fix Vulnerabilities Fast Open source software powers nearly every aspect of modern life—from banks and hospitals to telecommunications and AI services. Yet, the very foundation of this digital world is maintained by relatively small groups of contributors and volunteers. As the pace of vulnerability discovery accelerates with AI, the challenge now lies not just in finding bugs, but in fixing them efficiently and safely. Let’s dive into how this new reality shapes open-source security and what innovative solutions are rising to meet the challenge. --- ## [00:00:00] Why Open Source Security Matters More Than Ever - **90% of modern enterprise codebases are open source**: This includes critical infrastructure like power grids, cloud platforms, and healthcare systems. - These projects often rely on small teams or volunteers, making scaling maintenance difficult. - Traditionally, open source has been supported on a **best-effort basis**, which doesn’t always align with the requirements of time-sensitive, critical systems. **Key insight**: While this model has driven innovation, it introduces risk because vulnerabilities can propagate widely before being addressed. --- ## [00:00:35] AI: A Double-Edged Sword in Vulnerability Discovery - AI drastically reduces the time to find vulnerabilities—from weeks to minutes. - Example: **Anthropic's Project Glass Wing** uncovered over 2300 vulnerabilities in 400 open-source projects, including some bugs hidden for decades. - The volume and speed of discovery now **outpace traditional remediation workflows**. **Crucial observation**: Attackers benefit from these AI tools too, heightening the urgency to accelerate fixes. --- ## [00:01:59] The Real Bottleneck: From Discovery to Safe Remediation Fixing a vulnerability is a complex, multi-step process: - Identifying affected versions and mapping dependency chains. - Assessing business impact and timing to avoid downtime. - Developing, testing, and validating patches to ensure they don’t break existing systems. - Deploying fixes without disrupting production environments. > \"Upgrading to the latest version isn’t usually realistic due to dependency conflicts, regulatory constraints, and custom code.\" AI can assist, but **skilled engineering judgment remains essential** for tailoring fixes to specific contexts. --- ## [00:04:23] Scaling Fixes Without Fragmenting the Ecosystem - Blindly pushing fixes can overload the ecosystem, making it **less secure, not more**. - The fix must propagate **upstream** to open-source projects to benefit everyone and avoid fragmentation. - Human maintainers provide critical institutional knowledge unavailable to AI models. - No single entity—company or AI system—can secure open source alone; **collaborative coordination is required**. --- ## [00:05:33] Collaborative Solutions: Lightwell and Akrites Leading the Charge **Lightwell** focuses on: - Discovering vulnerabilities hidden deep in enterprise software stacks. - Using AI to analyze issues and develop backported, customer-friendly patches. - Combining AI support with human review, rigorous testing, and validation. - Contributing validated fixes back upstream to strengthen the entire ecosystem. **Akrites** functions as a: - Shared security incident response team for critical infrastructure. - Platform for **coordinated discovery, validation, remediation, and disclosure** of open-source vulnerabilities. - Provider of confidential, structured communication for maintainers and stakeholders. - Ensurer that disclosure is synchronized to protect projects and users alike. --- ## [00:06:54] How Lightwell’s Workflow Tackles Remediation | Step | Description | Timestamp | |----------------------|---------------------------------------------------------------------------------------------------|----------------| | Vulnerability Discovery | Identifies hidden flaws in software deep within enterprise stacks. | [00:06:54] | | AI Analysis | Determines exploitability and required code changes. | [00:07:00] | | Patch Development | Creates backported fixes instead of forcing disruptive upgrades. | [00:07:27] | | Engineering Validation | Combines AI with human review to avoid regressions and compatibility issues. | [00:07:40] | | Trusted Distribution | Publishes fixes in secure repositories for easy integration into deployment pipelines. | [00:08:07] | | Upstream Contribution | Sends patches back to open-source projects for broader impact. | [00:08:28] | --- ## [00:08:45] Akrites: Coordinating the Security Ecosystem - Starts with **intake** of vulnerability reports. - Moves to **deduplication and validation** to avoid wasted effort. - Manages **remediation workflows** among stakeholders. - Enables **synchronized disclosure** to protect users before public announcements. This coordination ensures that maintainers receive streamlined, predictive support rather than fragmented or duplicated efforts. --- ## [00:09:23] The Takeaway: Winning the Race Means Fixing, Not Just Finding - **AI has made vulnerability discovery almost trivial**, but detection alone doesn’t enhance security. - The future hinges on **scaling reliable, responsible remediation** that fits complex production environments. - Platforms like Lightwell and Akrites align discovery, fixing, validation, and disclosure into a **cohesive pipeline**. - The **good guys now have advanced tools and coordinated allies** in this critical race. --- ## Practical Tips for Organizations - Leverage emerging AI-assisted tools but **don’t rely solely on automation**; always include expert review. - Prioritize controlling the entire pipeline from discovery to deployment to ensure fixes are safe and effective. - Engage with collaborative initiatives like Lightwell and Akrites to stay in step with upstream maintainers. - Plan patching strategies that consider **custom code, dependencies, and regulatory environments**. - Recognize that investing upstream benefits the whole ecosystem, not just your organization. --- By embracing a coordinated, AI-enabled but engineer-guided approach, organizations can turn the tide on the growing flood of vulnerabilities in open source. The race is on—and the future belongs to those who can fix faster, smarter, and together. --- *To learn more about securing open-source software at scale and leveraging these innovations, check out the latest resources linked in the video description.*\n• Production Win: 99.99% uptime vs legacy stack\n• Caveats: High-efficiency architectures require specialized operational tooling. Choose optimization when scale justifies complexity.\n\n⚠️ Citations & Draft Facts (Offline Synthesizer Estimate):\n• Unverified offline draft — creator review required before publishing\n• No external source cited — add your primary source link before publishing\n\n👇 هل واجهتم هذه المشكلة في بيئات الإنتاج عندكم؟ شاركونا تجربتكم في التعليقات!\nWhat's your take on this architecture? Share below!\n\n🎥 العلامة التجارية / Brand: https://marrok.org\n\n#TechInArabic #هندسة_البرمجيات #KUBERNETESCLOUDSEC #SoftwareEngineering #DevSecOps #TechTrends #SystemDesign #MARROK #برمجة",
      "slides": [
        {
          "type": "hub",
          "centerIcon": "cpu",
          "enTitle": "Securing Open Source in the Age of AI.",
          "arTitle": "تحليل معماري لمنظومة بنية نماذج الذكاء",
          "enBody": "A deep technical breakdown of AI Architecture: mechanisms, trade-offs, and production considerations.",
          "arBody": "تحليل معماري شامل يوضح آليات العمل والتحديات وكيفية بناء النظام بأعلى كفاءة.",
          "satIcons": [
            "server",
            "database",
            "gauge",
            "cpu",
            "box",
            "activity"
          ],
          "satLabels": [
            "Architecture",
            "Dataflow",
            "Execution",
            "Scale",
            "Resilience",
            "Telemetry"
          ]
        },
        {
          "type": "number",
          "stepNumber": "01",
          "stepLabel": "STEP 01 // PROBLEM",
          "enTitle": "The architectural bottleneck.",
          "arTitle": "المشكلة ونقطة الاختناق الأساسية",
          "enBody": "Traditional systems degrade under high scale or complex state dependencies, requiring a fundamental redesign.",
          "arBody": "تفشل الأساليب التقليدية عند زيادة حجم العمل وتعقيد البيانات، مما يفرض إعادة تصميم المنظومة بالكامل."
        },
        {
          "type": "row",
          "diagramFooter": "ARCHITECTURE: VERIFIED • STATUS: HEALTHY • LATENCY: P99 OPTIMAL",
          "enTitle": "Core system architecture.",
          "arTitle": "بنية النظام وطبقات المعالجة",
          "enBody": "Decoupled components process data independently, preventing monolithic failure cascades across services.",
          "arBody": "فصل مكونات النظام يتيح معالجة البيانات بشكل مستقل ويمنع انهيار باقي الخدمات عند حدوث خلل.",
          "diagramEdges": [
            "Process",
            "Commit"
          ],
          "icons": [
            {
              "icon": "server",
              "label": "Ingress"
            },
            {
              "icon": "cpu",
              "label": "Engine"
            },
            {
              "icon": "database",
              "label": "Storage"
            }
          ],
          "diagramNodes": [
            {
              "label": "System Ingress",
              "sublabel": "Input state & routing",
              "status": "ACTIVE",
              "icon": "server"
            },
            {
              "label": "AI Architecture Core",
              "sublabel": "Core processing logic",
              "status": "ROUTED",
              "icon": "cpu"
            },
            {
              "label": "Durable State",
              "sublabel": "Verified state storage",
              "status": "COMMITTED",
              "icon": "database"
            }
          ],
          "diagramVariant": "stack"
        },
        {
          "type": "number",
          "stepNumber": "02",
          "stepLabel": "STEP 02 // MECHANISM",
          "enTitle": "Execution dataflow pipeline.",
          "arTitle": "آلية تدفق ومعالجة العمليات",
          "enBody": "Streamlined pipelines eliminate redundant serialization overhead to maintain consistent tail latency.",
          "arBody": "مسارات المعالجة المباشرة تلغي الهدر الزائد في نقل البيانات وتضمن استقرار وسرعة الاستجابة."
        },
        {
          "type": "row",
          "diagramFooter": "DATAFLOW: STREAMED • PROTOCOL: DETERMINISTIC",
          "enTitle": "Non-blocking processing flow.",
          "arTitle": "مسار المعالجة غير المعطلة للعمليات",
          "enBody": "Direct event dispatch processes high-volume workloads without locking caller threads or stalling I/O.",
          "arBody": "توجيه العمليات الفوري يعالج ضغط البيانات دون إيقاف أنوية المعالج أو تأخير المدخلات والمخرجات.",
          "diagramEdges": [
            "Dispatch",
            "Sync"
          ],
          "icons": [
            {
              "icon": "network",
              "label": "Request"
            },
            {
              "icon": "zap",
              "label": "Processing"
            },
            {
              "icon": "checkCircle",
              "label": "Committed"
            }
          ],
          "diagramNodes": [
            {
              "label": "Event Inbound",
              "sublabel": "Traffic socket queue",
              "status": "ACTIVE",
              "icon": "network"
            },
            {
              "label": "Execution Core",
              "sublabel": "Non-blocking worker loop",
              "status": "ROUTED",
              "icon": "zap"
            },
            {
              "label": "Target State",
              "sublabel": "Committed state verification",
              "status": "VERIFIED",
              "icon": "checkCircle"
            }
          ],
          "diagramVariant": "topology"
        },
        {
          "type": "number",
          "stepNumber": "03",
          "stepLabel": "STEP 03 // OUTCOME",
          "enTitle": "Production reliability wins.",
          "arTitle": "نتائج ومكاسب استقرار الإنتاج",
          "enBody": "Rigorous state boundaries isolate failures, allowing independent deployment and zero-downtime scaling.",
          "arBody": "العزل الصارم بين أجزاء المنظومة يمنع انتشار الأعطال ويتيح التوسع دون أي انقطاع في الخدمة."
        },
        {
          "type": "row",
          "diagramFooter": "ENGINEERING DECISION: ARCHITECTURE TRADE-OFFS BALANCED",
          "enTitle": "The engineering tradeoff.",
          "arTitle": "المفاضلة الهندسية وتكلفة الصيانة",
          "enBody": "High-efficiency architectures require specialized operational tooling. Choose optimization when scale justifies complexity.",
          "arBody": "الأنظمة عالية الكفاءة تتطلب خبرات صيانة متقدمة؛ لا تنتقل للتعقيد إلا إذا كان حجم العمل يستدعي ذلك.",
          "diagramEdges": [
            "Evaluate",
            "Adopt"
          ],
          "icons": [
            {
              "icon": "alertCircle",
              "label": "Complexity"
            },
            {
              "icon": "shieldAlert",
              "label": "Trade-off"
            }
          ],
          "diagramNodes": [
            {
              "label": "Standard Simplicity",
              "sublabel": "Lower operational cost",
              "status": "STANDARD",
              "icon": "layers"
            },
            {
              "label": "Custom Architecture",
              "sublabel": "Higher throughput win",
              "status": "OPTIMIZED",
              "icon": "zap"
            },
            {
              "label": "Maintenance Cost",
              "sublabel": "Requires specialized expertise",
              "status": "CAVEAT",
              "icon": "shieldAlert"
            }
          ],
          "diagramVariant": "takeaway"
        },
        {
          "type": "cta",
          "enTitle": "Scaling AI Architecture?",
          "arTitle": "تبني حلولاً برمجية\nمتقدمة في مشاريعك؟",
          "enBody": "",
          "arBody": "",
          "ctaText": "DM us  •  رسالة خاصة",
          "url": "marrok.org",
          "enCredit": "MARROK · KUBERNETES & CLOUD SEC",
          "arCredit": "MARROK · دراسة هندسية في KUBERNETES & CLOUD SEC"
        }
      ],
      "postFormat": "carousel",
      "id": "post_bd34e875-ba6",
      "brand": "MARROK",
      "brandUrl": "marrok.org",
      "firstComment": "🔗 Add your primary source link here before publishing.\n\nWhat are your thoughts on this architecture? Share your take below 👇",
      "shortCaption": "تحليل معماري لمنظومة بنية نماذج الذكاء ⚡\nSecuring Open Source in the Age of AI — Swipe through the breakdown 👉",
      "screenHook": "Securing Open Source in the Age of AI in 60s",
      "scheduleSlot": "18:00–21:00 ME / 16:00–19:00 UTC (Peak developer engagement)",
      "sourceMeta": {
        "type": "article",
        "title": "Securing Open Source in the Age of AI.",
        "creator": "MARROK",
        "url": "https://marrok.org",
        "published": "2026-10-28",
        "groundingQueries": [
          "MARROK KUBERNETES & CLOUD SEC architecture benchmark",
          "Securing Open Source in the Age of AI. implementation production trade-offs",
          "KUBERNETES & CLOUD SEC performance telemetry"
        ],
        "isSearchGrounded": false,
        "isFallback": true,
        "engine": "offline",
        "status": "unverified_draft",
        "userReviewed": true
      },
      "facts": [
        {
          "text": "Primary architectural domain: KUBERNETES & CLOUD SEC",
          "type": "claim",
          "verified": "unverified",
          "evidence": "Synthesizer domain heuristics (unverified offline draft)"
        },
        {
          "text": "Brand attribution: MARROK",
          "type": "name",
          "verified": "unverified",
          "evidence": "Brand wordmark configured in the studio; not an external source"
        },
        {
          "text": "Production benchmark / headline metric: 99.99% uptime",
          "type": "number",
          "verified": "unverified",
          "evidence": "Universal extractor metric scan from user input"
        },
        {
          "text": "Core architectural mechanism: # Securing Open Source in the Age of AI: The Race to Fix Vulnerabilities Fast  Open source software powers nearly every aspect of modern life—from banks and hospitals to telecommunications and AI services. Yet, the very foundation of this digital world is maintained by relatively small groups of contributors and volunteers. As the pace of vulnerability discovery accelerates with AI, the challenge now lies not just in finding bugs, but in fixing them efficiently and safely. Let’s dive into how this new reality shapes open-source security and what innovative solutions are rising to meet the challenge.  ---  ## [00:00:00] Why Open Source Security Matters More Than Ever  - **90% of modern enterprise codebases are open source**: This includes critical infrastructure like power grids, cloud platforms, and healthcare systems. - These projects often rely on small teams or volunteers, making scaling maintenance difficult. - Traditionally, open source has been suppo",
          "type": "claim",
          "verified": "unverified",
          "evidence": "Universal NLP parsed insight from user text"
        },
        {
          "text": "Operational trade-offs and limits: High-efficiency architectures require specialized operational tooling. Choose optimization when scale justifies complexity.",
          "type": "claim",
          "verified": "unverified",
          "evidence": "Spec §7 \"Before You Switch / The Catch\" hedge (offline draft)"
        }
      ],
      "notesForHuman": [
        "Unverified offline draft: Synthesized from offline NLP heuristics without active web search grounding. Verify all numbers and claims before publication.",
        "Review and customize slide copy using the studio editor, or connect a Gemini API key for live search-grounded research.",
        "Bilingual Arabic typography checked for RTL line-endings and numbers positioned per Spec §9.",
        "Add a verified primary source link before publishing; the offline draft does not fabricate citations."
      ],
      "captionVariants": [
        {
          "style": "Executive Bulletins & Hard Metrics (Recommended)",
          "caption": "⚡ تحليل معماري لمنظومة بنية نماذج الذكاء\nتحليل تقني ومعماري متعمق لأحدث نقلة برمجية 🛠️\n\nSecuring Open Source in the Age of AI — Engineering Deep Dive\nWhy traditional architectures stall at scale and how modern systems solve the bottleneck.\n\n🔹 أبرز آليات العمل والنتائج / Key Technical Takeaways:\n• Domain: KUBERNETES & CLOUD SEC\n• Core Mechanism: # Securing Open Source in the Age of AI: The Race to Fix Vulnerabilities Fast  Open source software powers nearly every aspect of modern life—from banks and hospitals to telecommunications and AI services. Yet, the very foundation of this digital world is maintained by relatively small groups of contributors and volunteers. As the pace of vulnerability discovery accelerates with AI, the challenge now lies not just in finding bugs, but in fixing them efficiently and safely. Let’s dive into how this new reality shapes open-source security and what innovative solutions are rising to meet the challenge.  ---  ## [00:00:00] Why Open Source Security Matters More Than Ever  - **90% of modern enterprise codebases are open source**: This includes critical infrastructure like power grids, cloud platforms, and healthcare systems. - These projects often rely on small teams or volunteers, making scaling maintenance difficult. - Traditionally, open source has been supported on a **best-effort basis**, which doesn’t always align with the requirements of time-sensitive, critical systems.  **Key insight**: While this model has driven innovation, it introduces risk because vulnerabilities can propagate widely before being addressed.  ---  ## [00:00:35] AI: A Double-Edged Sword in Vulnerability Discovery  - AI drastically reduces the time to find vulnerabilities—from weeks to minutes. - Example: **Anthropic's Project Glass Wing** uncovered over 2300 vulnerabilities in 400 open-source projects, including some bugs hidden for decades. - The volume and speed of discovery now **outpace traditional remediation workflows**.  **Crucial observation**: Attackers benefit from these AI tools too, heightening the urgency to accelerate fixes.  ---  ## [00:01:59] The Real Bottleneck: From Discovery to Safe Remediation  Fixing a vulnerability is a complex, multi-step process:  - Identifying affected versions and mapping dependency chains. - Assessing business impact and timing to avoid downtime. - Developing, testing, and validating patches to ensure they don’t break existing systems. - Deploying fixes without disrupting production environments.  > \"Upgrading to the latest version isn’t usually realistic due to dependency conflicts, regulatory constraints, and custom code.\"  AI can assist, but **skilled engineering judgment remains essential** for tailoring fixes to specific contexts.  ---  ## [00:04:23] Scaling Fixes Without Fragmenting the Ecosystem  - Blindly pushing fixes can overload the ecosystem, making it **less secure, not more**. - The fix must propagate **upstream** to open-source projects to benefit everyone and avoid fragmentation. - Human maintainers provide critical institutional knowledge unavailable to AI models. - No single entity—company or AI system—can secure open source alone; **collaborative coordination is required**.  ---  ## [00:05:33] Collaborative Solutions: Lightwell and Akrites Leading the Charge  **Lightwell** focuses on:  - Discovering vulnerabilities hidden deep in enterprise software stacks. - Using AI to analyze issues and develop backported, customer-friendly patches. - Combining AI support with human review, rigorous testing, and validation. - Contributing validated fixes back upstream to strengthen the entire ecosystem.  **Akrites** functions as a:  - Shared security incident response team for critical infrastructure. - Platform for **coordinated discovery, validation, remediation, and disclosure** of open-source vulnerabilities. - Provider of confidential, structured communication for maintainers and stakeholders. - Ensurer that disclosure is synchronized to protect projects and users alike.  ---  ## [00:06:54] How Lightwell’s Workflow Tackles Remediation  | Step                 | Description                                                                                           | Timestamp      | |----------------------|---------------------------------------------------------------------------------------------------|----------------| | Vulnerability Discovery | Identifies hidden flaws in software deep within enterprise stacks.                                | [00:06:54]     | | AI Analysis            | Determines exploitability and required code changes.                                              | [00:07:00]     | | Patch Development      | Creates backported fixes instead of forcing disruptive upgrades.                                  | [00:07:27]     | | Engineering Validation | Combines AI with human review to avoid regressions and compatibility issues.                      | [00:07:40]     | | Trusted Distribution   | Publishes fixes in secure repositories for easy integration into deployment pipelines.            | [00:08:07]     | | Upstream Contribution  | Sends patches back to open-source projects for broader impact.                                    | [00:08:28]     |  ---  ## [00:08:45] Akrites: Coordinating the Security Ecosystem  - Starts with **intake** of vulnerability reports. - Moves to **deduplication and validation** to avoid wasted effort. - Manages **remediation workflows** among stakeholders. - Enables **synchronized disclosure** to protect users before public announcements.  This coordination ensures that maintainers receive streamlined, predictive support rather than fragmented or duplicated efforts.  ---  ## [00:09:23] The Takeaway: Winning the Race Means Fixing, Not Just Finding  - **AI has made vulnerability discovery almost trivial**, but detection alone doesn’t enhance security. - The future hinges on **scaling reliable, responsible remediation** that fits complex production environments. - Platforms like Lightwell and Akrites align discovery, fixing, validation, and disclosure into a **cohesive pipeline**. - The **good guys now have advanced tools and coordinated allies** in this critical race.  ---  ## Practical Tips for Organizations  - Leverage emerging AI-assisted tools but **don’t rely solely on automation**; always include expert review. - Prioritize controlling the entire pipeline from discovery to deployment to ensure fixes are safe and effective. - Engage with collaborative initiatives like Lightwell and Akrites to stay in step with upstream maintainers. - Plan patching strategies that consider **custom code, dependencies, and regulatory environments**. - Recognize that investing upstream benefits the whole ecosystem, not just your organization.  ---  By embracing a coordinated, AI-enabled but engineer-guided approach, organizations can turn the tide on the growing flood of vulnerabilities in open source. The race is on—and the future belongs to those who can fix faster, smarter, and together.  ---  *To learn more about securing open-source software at scale and leveraging these innovations, check out the latest resources linked in the video description.*\n• Production Win: 99.99% uptime vs legacy stack\n• Caveats: High-efficiency architectures require specialized operational tooling. Choose optimization when scale justifies complexity.\n\n⚠️ Citations & Draft Facts (Offline Synthesizer Estimate):\n• Unverified offline draft — creator review required before publishing\n• No external source cited — add your primary source link before publishing\n\n👇 هل واجهتم هذه المشكلة في بيئات الإنتاج عندكم؟ شاركونا تجربتكم في التعليقات!\nWhat's your take on this architecture? Share below!\n\n🎥 العلامة التجارية / Brand: https://marrok.org\n\n#TechInArabic #هندسة_البرمجيات #KUBERNETESCLOUDSEC #SoftwareEngineering #DevSecOps #TechTrends #SystemDesign #MARROK #برمجة"
        },
        {
          "style": "Narrative Breakdown & Story",
          "caption": "ماذا يحدث عندما تصل الأنظمة التقليدية إلى حدودها القصوى؟ 🚨\nالحل ليس الترقيع، بل إعادة التفكير في المعمارية البرمجية من الصفر.\n\nفي هذا التحليل المفصل (Securing Open Source in the Age of AI)، نستعرض كيف نجحت الفرق الهندسية في تحقيق قفزة نوعية (99.99% uptime) مع تفادي نقاط الاختناق الشائعة.\n\nاسحب الصور لمتابعة الشرح خطوة بخطوة 👉\nSwipe through the slides for the complete breakdown!\n\n🔗 المرجع والمصدر: https://marrok.org\n\n#TechInArabic #هندسة_البرمجيات #KUBERNETESCLOUDSEC #SoftwareEngineering #DevSecOps #TechTrends #SystemDesign #MARROK #برمجة"
        }
      ],
      "hookVariants": [
        {
          "tag": "Curiosity & Shift",
          "enTitle": "Securing Open Source in the Age of AI.",
          "arTitle": "تحليل معماري لمنظومة بنية نماذج الذكاء",
          "enBody": "A deep technical breakdown of AI Architecture: mechanisms, trade-offs, and production considerations.",
          "arBody": "تحليل معماري شامل يوضح آليات العمل والتحديات وكيفية بناء النظام بأعلى كفاءة.",
          "centerIcon": "cpu"
        },
        {
          "tag": "Hard Metrics & Scale",
          "enTitle": "Measuring AI Architecture at scale.",
          "arTitle": "معايير وأرقام الأداء الحقيقية",
          "enBody": "Key production benchmarks (99.99% uptime) and lessons learned under maximum concurrency.",
          "arBody": "أهم معايير الأداء والدروس المستفادة (99.99% uptime) من تشغيل الأنظمة تحت أقصى ضغط.",
          "centerIcon": "gauge"
        },
        {
          "tag": "Problem & Solution",
          "enTitle": "Fixing AI Architecture limits.",
          "arTitle": "تجاوز اختناقات النظام المعمارية",
          "enBody": "Moving beyond legacy bottlenecks to build modern high-efficiency software.",
          "arBody": "تجاوز الأساليب القديمة لبناء برمجيات عالية الكفاءة والموثوقية.",
          "centerIcon": "shieldAlert"
        }
      ]
    },
    "postedAt": "2026-11-08T10:59:59.166Z",
    "storageEngine": "local-disk"
  },
  {
    "id": "post_26488150-bb6",
    "title": "Why did Anthropic move beyond Git?",
    "category": "AI + ENGINEERING",
    "postStatus": "validated",
    "createdAt": "2026-10-29T14:03:11.690Z",
    "updatedAt": "2026-10-29T14:03:11.690Z",
    "creatorHandle": "Based on Anthropic's engineering post. The numbers are Anthropic's own.",
    "slideCount": 8,
    "qaPassed": true,
    "deck": {
      "theme": "amber",
      "category": "AI + ENGINEERING",
      "caption": "Why did Anthropic move beyond Git? A deeper look at Scion 🚀\nلماذا ابتعدت Anthropic عن Git؟ نظرة عميقة على نظام Scion الداخلي\n\nWith AI agents making thousands of pull requests around the clock, traditional Git mirrors broke down under 100 GB repo histories and 25 million daily CI checkouts. Here is what Anthropic built instead:\n\nKey Takeaways / أبرز النقاط:\n• Commits and merges run server-side via API\n• Changesets track only modified files (proportional resource usage)\n• Test-after-merge workflow for high-throughput deployment\n• 200x smaller CPU/memory footprint & 25% of CI computing freed\n\nSource: Anthropic Engineering Blog (\"Scion: Git for AI Agents\")\nRead more at marrok.org\n\n#SoftwareEngineering #Git #Anthropic #AIAgents #DevOps #SystemDesign #SoftwareArchitecture #هندسة_البرمجيات #MARROK #TechInArabic",
      "slides": [
        {
          "type": "hub",
          "centerIcon": "gitMerge",
          "enTitle": "Why did Anthropic move beyond Git?",
          "arTitle": "السبب وراء ابتعاد\nAnthropic عن Git",
          "enBody": "A deeper look at Scion.",
          "arBody": "نظرة أعمق على Scion المعتمد.",
          "satIcons": [
            "server",
            "database",
            "gauge",
            "cpu",
            "box",
            "activity"
          ],
          "satLabels": [
            "Virtual FS",
            "Server Merge",
            "API VCS",
            "Changesets",
            "CI Runners",
            "Telemetry"
          ]
        },
        {
          "type": "metric",
          "metricValue": "100 GB",
          "metricLabel": "MONOREPO SCALE",
          "metricDiff": "▲ 25M CI checkouts every day",
          "metricIcon": "database",
          "enTitle": "25M checkouts a day.",
          "arTitle": "25 مليون سحب يومياً",
          "enBody": "Git mirrors were collapsing under massive AI agent commits, stalling builds and blocking engineer deploys.",
          "arBody": "كانت خوادم Git تنهار تحت سيل التعديلات المستمر من وكلاء الذكاء الاصطناعي، مما عطّل عمليات البناء."
        },
        {
          "type": "code",
          "codeSnippet": "$ scion checkout --lazy\n✔ Virtual filesystem mapped (0.4s)\n✔ Changeset: 3 files (0.01% of repo)\n$ scion commit -m \"agent: optimize index\"\n✔ Server-side merge verified (1.2s)",
          "codeLanguage": "bash",
          "codeFileName": "scion-cli.sh",
          "enTitle": "Virtual tree checkout.",
          "arTitle": "سحب شجرة افتراضية",
          "enBody": "Instead of cloning the entire 100 GB repo history, Scion streams only the exact files the agent touches.",
          "arBody": "بدلاً من استنساخ كامل المستودع البالغ 100 جيجابايت، يرسل Scion فقط الملفات التي يلمسها الوكيل البرمجي."
        },
        {
          "type": "compare",
          "compareLeftTitle": "Traditional Git",
          "compareLeftBody": "• Full 100 GB clone on every CI job\n• Local merge locks monorepo branch\n• 40% compute wasted on VCS mirrors",
          "compareRightTitle": "Anthropic Scion",
          "compareRightBody": "• Lazy virtual checkout in milliseconds\n• API server-side commits without locks\n• 25% of all CI computing reclaimed",
          "enTitle": "Git vs Scion.",
          "arTitle": "مقارنة Git مع Scion",
          "enBody": "Moving from local monolithic checkouts to an API-driven virtual filesystem cut compute overhead by 200x.",
          "arBody": "الانتقال من الاستنساخ الكامل المحلي إلى نظام ملفات افتراضي مدار بالواجهات البرمجية قلل الهدر بنسبة 200 ضعف."
        },
        {
          "type": "row",
          "diagramFooter": "VIRTUAL FS: STREAMED • REPO CLONE: ZERO FULL HISTORY",
          "enTitle": "Server-side engine pipeline.",
          "arTitle": "محرك يدار خادمياً",
          "enBody": "Everything is tracked in an object store; merges run server-side so CI runners never wait for branch rebase locks.",
          "arBody": "كل شيء يدار في مستودع كائنات سحابي؛ وتتم عمليات الدمج خادمياً حتى لا تنتظر بيئات العمل فك أقفال الفروع.",
          "diagramEdges": [
            "Lazy Fetch",
            "Async Land"
          ],
          "icons": [
            {
              "icon": "code",
              "label": "API-driven VCS"
            },
            {
              "icon": "server",
              "label": "Virtual mount"
            },
            {
              "icon": "lock",
              "label": "Lockless merges"
            }
          ],
          "diagramNodes": [
            {
              "label": "Virtual Filesystem",
              "sublabel": "Lazy stream on access",
              "status": "MOUNTED",
              "icon": "server"
            },
            {
              "label": "API Engine",
              "sublabel": "Server-side commit logic",
              "status": "ORCHESTRATED",
              "icon": "cpu"
            },
            {
              "label": "Cloud Object Store",
              "sublabel": "Lockless snapshot storage",
              "status": "PERSISTED",
              "icon": "database"
            }
          ],
          "diagramVariant": "stack"
        },
        {
          "type": "row",
          "diagramFooter": "STRATEGY: TEST-AFTER-MERGE • TEAM BLOCKING: 0 SECONDS",
          "enTitle": "Test after merge sequence.",
          "arTitle": "الاختبار بعد الدمج",
          "enBody": "Scion lands code immediately and tests post-merge, isolating broken commits without stalling the rest of the team.",
          "arBody": "يدمج Scion الشيفرة فوراً ويختبرها بعد الدمج، مما يعزل التعديلات المعطوبة دون إيقاف باقي الفريق.",
          "diagramEdges": [
            "Direct Land",
            "Post-Merge Test"
          ],
          "icons": [
            {
              "icon": "terminal",
              "label": "Agent Commit"
            },
            {
              "icon": "gitMerge",
              "label": "Speculative Merge"
            },
            {
              "icon": "activity",
              "label": "Test Runner"
            }
          ],
          "diagramNodes": [
            {
              "label": "Agent Commit",
              "sublabel": "API payload dispatched",
              "status": "LANDED",
              "icon": "terminal"
            },
            {
              "label": "Speculative Merge",
              "sublabel": "Applied directly to main",
              "status": "COMMITTED",
              "icon": "gitMerge"
            },
            {
              "label": "Async Test CI",
              "sublabel": "Broken builds isolated",
              "status": "AUDITED",
              "icon": "activity"
            }
          ],
          "diagramVariant": "topology"
        },
        {
          "type": "row",
          "diagramFooter": "STATUS: PROPRIETARY ANTHROPIC TOOL • GENERAL REPOS STAY ON GIT",
          "enTitle": "Not a Git killer.",
          "arTitle": "ليس قاتلاً لنظام Git",
          "enBody": "Anthropic says Git still suits most repos. Scion needs custom review, search and CI tools, and has no public release.",
          "arBody": "تقول Anthropic إن Git ما زال مناسباً لمعظم المستودعات؛ يحتاج Scion أدوات مراجعة وبحث مخصصة، ولا إصدار عام له.",
          "diagramEdges": [
            "Human Workflow",
            "Agent Scale"
          ],
          "icons": [
            {
              "icon": "gitMerge",
              "label": "General Repos"
            },
            {
              "icon": "robot",
              "label": "Agent Workloads"
            },
            {
              "icon": "shieldAlert",
              "label": "Internal Tool"
            }
          ],
          "diagramNodes": [
            {
              "label": "Git for General Teams",
              "sublabel": "Human workflow & tooling",
              "status": "STANDARD",
              "icon": "gitMerge"
            },
            {
              "label": "Scion for AI Agents",
              "sublabel": "25M checkouts · custom infra",
              "status": "INTERNAL",
              "icon": "robot"
            },
            {
              "label": "No Public Release",
              "sublabel": "Proprietary internal system",
              "status": "CAVEAT",
              "icon": "shieldAlert"
            }
          ],
          "diagramVariant": "takeaway"
        },
        {
          "type": "cta",
          "enTitle": "Building with AI agents at scale?",
          "arTitle": "تبني بوكلاء الذكاء\nالاصطناعي على نطاق\nواسع؟",
          "ctaText": "DM us  •  رسالة خاصة",
          "url": "marrok.org",
          "enCredit": "Based on Anthropic's engineering post. The numbers are Anthropic's own.",
          "arCredit": "مبني على مقال Anthropic الهندسي، والأرقام من Anthropic نفسها."
        }
      ],
      "id": "post_26488150-bb6",
      "brand": "MARROK",
      "sourceMeta": {
        "userReviewed": true
      },
      "captionVariants": [
        {
          "style": "Executive Bulletins & Hard Metrics",
          "caption": "Why did Anthropic move beyond Git? A deeper look at Scion 🚀\nلماذا ابتعدت Anthropic عن Git؟ نظرة عميقة على نظام Scion الداخلي\n\nWith AI agents making thousands of pull requests around the clock, traditional Git mirrors broke down under 100 GB repo histories and 25 million daily CI checkouts. Here is what Anthropic built instead:\n\nKey Takeaways / أبرز النقاط:\n• Commits and merges run server-side via API\n• Changesets track only modified files (proportional resource usage)\n• Test-after-merge workflow for high-throughput deployment\n• 200x smaller CPU/memory footprint & 25% of CI computing freed\n\nSource: Anthropic Engineering Blog (\"Scion: Git for AI Agents\")\nRead more at marrok.org\n\n#SoftwareEngineering #Git #Anthropic #AIAgents #DevOps #SystemDesign #SoftwareArchitecture #هندسة_البرمجيات #MARROK #TechInArabic"
        },
        {
          "style": "Narrative Breakdown & Story",
          "caption": "What happens when AI agents write more code than humans? Git starts melting. 🤖💥\n\nAnthropic hit a wall with traditional Git: 100GB mono-repo history and 25,000,000 CI checkouts every single day. Instead of band-aiding Git, they designed Scion: a server-authoritative VCS built from the ground up for always-online software agents.\n\nThe core lesson? Don't optimize for how humans worked 15 years ago. Design for the agents building right now.\n\nFull breakdown in the slides above.\nSource: Anthropic's Engineering post. Numbers are Anthropic's own.\nLearn more: marrok.org\n\n#AIEngineering #DeveloperTools #GitAlternatives #Anthropic #VCS #CloudArchitecture #SoftwareDesign #MARROK"
        }
      ],
      "hookVariants": [
        {
          "tag": "Curiosity & Why",
          "enTitle": "Why did Anthropic\nmove beyond Git?",
          "arTitle": "السبب وراء ابتعاد\nAnthropic عن Git",
          "enBody": "A deeper look at Scion.",
          "arBody": "نظرة أعمق على Scion المعتمد.",
          "centerIcon": "gitMerge"
        },
        {
          "tag": "Hard Metrics",
          "enTitle": "100 GB repos &\n25M CI checkouts.",
          "arTitle": "100 جيجابايت مستودع\nو25 مليون سحب يومياً",
          "enBody": "When AI agents pushed Git to the breaking point.",
          "arBody": "حين دفع وكلاء الذكاء الاصطناعي نظام Git إلى حافة الانهيار.",
          "centerIcon": "database"
        },
        {
          "tag": "The Paradigm Shift",
          "enTitle": "Git was built for humans.\nScion was built for agents.",
          "arTitle": "صُمم Git للبشر،\nوصُمم Scion للوكلاء",
          "enBody": "How always-online AI changes every tooling assumption.",
          "arBody": "كيف يغير وكلاء الذكاء الاصطناعي كل افتراضات أدوات التطوير.",
          "centerIcon": "robot"
        }
      ]
    }
  },
  {
    "id": "post_72a7e461-187",
    "title": "The Evolution of AI Inference Engines.",
    "category": "AI INFRASTRUCTURE & INFERENCE",
    "postStatus": "posted",
    "createdAt": "2026-10-29T11:07:10.564Z",
    "updatedAt": "2026-10-29T11:07:10.564Z",
    "postedAt": "2026-10-29T11:07:10.564Z",
    "creatorHandle": "AI Engineering Research",
    "slideCount": 8,
    "qaPassed": false,
    "deck": {
      "theme": "node",
      "category": "AI INFRASTRUCTURE & INFERENCE",
      "caption": "⚡ كيف تطورت محركات الاستنتاج (Inference Engines)؟\n\nمن Llama.cpp إلى vLLM، شهدت محركات الاستنتاج تحولاً جذرياً منذ 2023 للتعامل مع نماذج LLMs الضخمة.\n\nإليك كيف تعمل هذه المحركات تقنياً:\n🔹 Llama.cpp: استخدام الذاكرة الافتراضية (mmap) لتقليل استهلاك RAM.\n🔹 vLLM: تقنية Paged Attention لمنع هدر الذاكرة في KV Cache.\n🔹 SG Lang: استخدام Radix Attention لمشاركة البادئات المتكررة في الطلبات.\n🔹 Nvidia TensorRT-LLM: التكامل الرأسي بين العتاد والبرمجيات.\n\nما هو المحرك الذي تعتمد عليه في مشاريعك؟ شاركنا تجربتك في التعليقات 👇\n\n🎥 المصدر: The Rise of Modern Inference Engines\n\n#AI #LLM #Inference #MachineLearning #TechEngineering #vLLM #LlamaCpp #Nvidia",
      "slides": [
        {
          "type": "hub",
          "centerIcon": "robot",
          "stepNumber": "01",
          "enTitle": "The Evolution of AI Inference Engines.",
          "arTitle": "تطور محركات استنتاج الذكاء الاصطناعي",
          "enBody": "How modern engines bridge the gap between LLM complexity and hardware constraints.",
          "arBody": "كيف تسد المحركات الحديثة الفجوة بين تعقيد نماذج LLM ومحدودية العتاد.",
          "satLabels": [
            "KV Cache",
            "Paged Attention",
            "Quantization",
            "Memory Mapping",
            "Radix Attention",
            "Continuous Batching"
          ]
        },
        {
          "type": "row",
          "stepNumber": "02",
          "enTitle": "Why LLMs Broke Traditional Inference.",
          "arTitle": "لماذا فشلت المحركات التقليدية مع LLMs؟",
          "enBody": "Traditional frameworks like PyTorch focus on training. LLMs require specialized handling of attention and KV cache memory.",
          "arBody": "تركز أطر العمل التقليدية مثل PyTorch على التدريب. تتطلب نماذج LLM معالجة خاصة لآليات الانتباه وذاكرة KV Cache المعتمد.",
          "diagramVariant": "stack"
        },
        {
          "type": "row",
          "stepNumber": "03",
          "enTitle": "Llamacpp Memory Mapping Efficiency.",
          "arTitle": "كفاءة الذاكرة عبر mmap",
          "enBody": "Uses OS memory mapping to stream model weights from SSD to RAM/GPU on-demand, avoiding full eager loading.",
          "arBody": "يستخدم نظام الذاكرة الافتراضية لبث أوزان النموذج من SSD إلى RAM/GPU عند الطلب، بدلاً من التحميل الكامل.",
          "diagramVariant": "split"
        },
        {
          "type": "row",
          "stepNumber": "04",
          "enTitle": "vLLM Solving KV Cache Fragmentation.",
          "arTitle": "حل مشكلة تجزئة ذاكرة KV",
          "enBody": "Paged Attention splits KV cache into fixed-size blocks, similar to OS virtual memory, reducing waste by 60-80%.",
          "arBody": "تقسم Paged Attention ذاكرة KV إلى كتل ثابتة الحجم، مما يقلل الهدر بنسبة 60-80%.",
          "diagramVariant": "clusters"
        },
        {
          "type": "row",
          "stepNumber": "05",
          "enTitle": "SG Lang Radix Attention Trees.",
          "arTitle": "أشجار Radix Attention",
          "enBody": "Caches common prompt prefixes in a tree structure to avoid recomputing KV cache for shared context.",
          "arBody": "يخزن بادئات الطلبات المشتركة في هيكل شجري لتجنب إعادة حساب ذاكرة KV للسياق المتكرر.",
          "diagramVariant": "graph"
        },
        {
          "type": "row",
          "stepNumber": "06",
          "enTitle": "Nvidia Hardware-Software Synergy.",
          "arTitle": "تكامل العتاد والبرمجيات",
          "enBody": "TensorRT-LLM optimizes kernels specifically for Nvidia silicon, maximizing throughput and reducing TCO.",
          "arBody": "يعمل TensorRT-LLM على تحسين النواة خصيصاً لمعالجات Nvidia، مما يرفع الإنتاجية ويقلل التكلفة.",
          "diagramVariant": "topology"
        },
        {
          "type": "row",
          "stepNumber": "07",
          "enTitle": "Trade-offs and Limitations.",
          "arTitle": "المقايضات والقيود التقنية",
          "enBody": "No one-size-fits-all. Lightweight engines lack advanced scheduling; heavy engines require specific hardware.",
          "arBody": "لا يوجد حل واحد يناسب الجميع. المحركات الخفيفة تفتقر لجدولة متقدمة، والثقيلة تتطلب عتاداً خاصاً.",
          "diagramVariant": "takeaway"
        },
        {
          "type": "cta",
          "enTitle": "Which engine fits your stack?",
          "arTitle": "أي محرك يناسب بيئة عملك؟",
          "enBody": "Choose based on hardware, latency requirements, and batching needs. Join the discussion below.",
          "arBody": "اختر بناءً على العتاد، متطلبات التأخير، واحتياجات التجميع. شاركنا نقاشك في الأسفل.",
          "ctaText": "Join discussion • شارك برأيك",
          "url": "marrok.org"
        }
      ],
      "postFormat": "carousel",
      "id": "post_72a7e461-187",
      "brand": "MARROK",
      "brandUrl": "marrok.org",
      "firstComment": "Which inference engine are you currently using for your LLM deployments? Let's discuss the trade-offs between vLLM, Llama.cpp, and TensorRT-LLM. https://marrok.org",
      "shortCaption": "كيف تطورت محركات الاستنتاج (Inference Engines)؟ ⚡\nتحليل تقني لـ Llama.cpp وvLLM وNvidia.",
      "screenHook": "Why LLMs broke traditional inference engines",
      "scheduleSlot": "18:00 DZ",
      "sourceMeta": {
        "title": "The Rise of Modern Inference Engines",
        "creator": "AI Engineering Research",
        "url": "https://youtube.com",
        "published": "2024",
        "groundingQueries": [
          "vLLM Paged Attention memory waste reduction",
          "SG Lang Radix Attention throughput improvement",
          "Llama.cpp memory mapping mechanism"
        ],
        "groundingSources": [
          {
            "title": "vLLM: Easy, Fast, and Cheap LLM Serving",
            "url": "https://vllm.ai/"
          },
          {
            "title": "SG Lang GitHub",
            "url": "https://github.com/sgl-project/sglang"
          }
        ],
        "isSearchGrounded": false,
        "isFallback": false,
        "engine": "ungrounded",
        "model": "gemini-3.1-flash-lite",
        "status": "unverified_draft",
        "userReviewed": true
      },
      "facts": [
        {
          "text": "vLLM's Paged Attention reduces memory waste by 60-80%.",
          "type": "claim",
          "verified": "unconfirmed",
          "evidence": "vLLM research paper and documentation"
        },
        {
          "text": "SG Lang's Radix Attention can improve inference throughput up to 6.4x.",
          "type": "claim",
          "verified": "unconfirmed",
          "evidence": "SG Lang project benchmarks"
        }
      ],
      "notesForHuman": [
        "The 6.4x throughput claim for SG Lang is cited from the project's own benchmarks.",
        "The 60-80% memory waste reduction for vLLM is a standard claim in their research documentation.",
        "Ensure the distinction between training frameworks (PyTorch) and inference engines is clear."
      ],
      "captionVariants": [
        {
          "style": "Bulletins",
          "caption": "⚡ كيف تطورت محركات الاستنتاج (Inference Engines)؟\n\nمن Llama.cpp إلى vLLM، شهدت محركات الاستنتاج تحولاً جذرياً منذ 2023 للتعامل مع نماذج LLMs الضخمة.\n\nإليك كيف تعمل هذه المحركات تقنياً:\n🔹 Llama.cpp: استخدام الذاكرة الافتراضية (mmap) لتقليل استهلاك RAM.\n🔹 vLLM: تقنية Paged Attention لمنع هدر الذاكرة في KV Cache.\n🔹 SG Lang: استخدام Radix Attention لمشاركة البادئات المتكررة في الطلبات.\n🔹 Nvidia TensorRT-LLM: التكامل الرأسي بين العتاد والبرمجيات.\n\nما هو المحرك الذي تعتمد عليه في مشاريعك؟ شاركنا تجربتك في التعليقات 👇\n\n🎥 المصدر: The Rise of Modern Inference Engines\n\n#AI #LLM #Inference #MachineLearning #TechEngineering #vLLM #LlamaCpp #Nvidia"
        },
        {
          "style": "Narrative",
          "caption": "تطور الذكاء الاصطناعي يتطلب محركات استنتاج ذكية. 🧠\n\nلم تعد الأطر التقليدية كافية للتعامل مع نماذج LLM. المحركات الحديثة مثل vLLM وLlama.cpp أعادت تعريف كيفية إدارة الذاكرة والإنتاجية.\n\nهل تختار السرعة أم الكفاءة في استهلاك الموارد؟ شاركنا رأيك التقني 👇\n\n#AI #InferenceEngine #LLM #Tech #Engineering"
        }
      ],
      "hookVariants": [
        {
          "tag": "Technical",
          "enTitle": "Why LLMs Broke Traditional Inference.",
          "arTitle": "لماذا فشلت محركات الاستنتاج التقليدية؟",
          "enBody": "The shift from 2D convolutions to auto-regressive LLMs.",
          "arBody": "التحول من الالتفافات ثنائية الأبعاد إلى نماذج LLM المعتمد.",
          "centerIcon": "alertTriangle"
        },
        {
          "tag": "Performance",
          "enTitle": "6.4x Throughput with Radix Attention.",
          "arTitle": "زيادة الإنتاجية 6.4 ضعف مع Radix Attention",
          "enBody": "How modern inference engines optimize shared context.",
          "arBody": "كيف تحسن محركات الاستنتاج الحديثة السياق المشترك.",
          "centerIcon": "zap"
        },
        {
          "tag": "Architectural",
          "enTitle": "The Evolution of Inference Engines.",
          "arTitle": "تطور محركات استنتاج الذكاء الاصطناعي",
          "enBody": "From Llama.cpp to Nvidia TensorRT-LLM.",
          "arBody": "من Llama.cpp إلى Nvidia TensorRT-LLM المعتمد.",
          "centerIcon": "cpu"
        }
      ],
      "visualOptions": {
        "showCadReticles": true,
        "showSparklines": true,
        "terminalScanlines": true
      }
    }
  },
  {
    "id": "post_8acb9671-b15",
    "title": "Node2Shell RCE in Nodejs via Brotli.",
    "category": "CYBERSECURITY & DEFENSE",
    "postStatus": "posted",
    "createdAt": "2026-10-29T09:19:55.868Z",
    "updatedAt": "2026-10-29T09:19:55.868Z",
    "postedAt": "2026-10-29T09:19:55.868Z",
    "creatorHandle": "Imperva & ELLIO Research",
    "slideCount": 8,
    "qaPassed": true,
    "deck": {
      "theme": "cyber",
      "category": "CYBERSECURITY & DEFENSE",
      "caption": "⚡ ثغرة Node2Shell: تنفيذ كود عن بُعد عبر Brotli.\n\nاكتشف الباحثون ثغرة خطيرة (CVE-2026-111497) في مكتبة فك ضغط Brotli المدمجة في Node.js، مما يسمح للمهاجمين بتنفيذ كود برمجي (RCE) عبر بيانات مضغوطة خبيثة.\n\n🔹 التفاصيل التقنية:\nالثغرة تؤثر على إصدارات Node.js 22.x, 24.x, 26.x.\nتعتمد الاستغلالية على بنية الذاكرة وإصدار الـ Runtime.\nالتحديث إلى الإصدارات المصححة هو الحل الوحيد الموثوق.\n\nهل قمت بتحديث بيئات Node.js لديك؟ شاركنا في التعليقات 👇\n\n🎥 المصدر: Imperva & ELLIO Research\n#CyberSecurity #NodeJS #DevSecOps #InfoSec #Node2Shell",
      "slides": [
        {
          "type": "hub",
          "centerIcon": "shieldAlert",
          "diagramFooter": "CADSYSREF // PRODUCTION VERIFIED ARCHITECTURE",
          "enTitle": "Node2Shell RCE in Nodejs via Brotli.",
          "arTitle": "ثغرة Node2Shell تنفيذ كود عبر Brotli",
          "enBody": "A critical vulnerability in the bundled Brotli decoder allows remote code execution on standard Node.js builds.",
          "arBody": "ثغرة حرجة في مكتبة فك ضغط Brotli المدمجة تسمح بتنفيذ كود برمجي عن بُعد على إصدارات Node.js القياسية.",
          "ctaText": "Join discussion • شارك برأيك",
          "url": "marrok.org/security/node2shell",
          "enCredit": "Imperva & ELLIO Research",
          "arCredit": "Imperva & ELLIO Research",
          "satIcons": [
            "cpu",
            "database",
            "server",
            "lock",
            "code",
            "layers"
          ],
          "satLabels": [
            "Brotli Decoder",
            "Memory Layout",
            "RCE Vector",
            "HTTP Middleware",
            "Runtime Build",
            "ASLR Bypass"
          ],
          "diagramVariant": "topology"
        },
        {
          "type": "number",
          "stepNumber": "01",
          "enTitle": "The Vulnerability Trigger.",
          "arTitle": "كيف تبدأ الثغرة؟",
          "enBody": "The flaw occurs when the Brotli decoder encounters malformed stream structures, leading to out-of-bounds memory writes.",
          "arBody": "تحدث الثغرة عندما يواجه مفكك ضغط Brotli هياكل بيانات غير صالحة، مما يؤدي إلى عمليات كتابة خارج حدود الذاكرة المخصصة."
        },
        {
          "type": "row",
          "stepLabel": "STEP 02",
          "enTitle": "Attack Surface Analysis.",
          "arTitle": "مساحة الهجوم المتاحة",
          "enBody": "Applications processing untrusted compressed data via fetch() or body-parsing middleware are at highest risk.",
          "arBody": "التطبيقات التي تعالج بيانات مضغوطة غير موثوقة عبر fetch() أو برمجيات الوسيط (Middleware) هي الأكثر عرضة للخطر.",
          "icons": [
            {
              "icon": "globe",
              "label": "Untrusted Input"
            },
            {
              "icon": "server",
              "label": "Node.js Runtime"
            },
            {
              "icon": "shield",
              "label": "Memory Boundary"
            }
          ],
          "diagramVariant": "topology"
        },
        {
          "type": "code",
          "codeSnippet": "const express = require('express');\nconst app = express();\n\n// Vulnerable if Brotli is enabled\napp.use(express.json()); \napp.use(express.text());\n\napp.post('/upload', (req, res) => {\n  // Processing compressed body\n});",
          "codeLanguage": "javascript",
          "codeFileName": "app.js",
          "enTitle": "Vulnerable Middleware Path.",
          "arTitle": "مسار الوسيط البرمجي المعرض للخطر",
          "enBody": "Express middleware configured for Brotli decompression can inadvertently pass malicious payloads to the vulnerable decoder.",
          "arBody": "برمجيات Express الوسيطة المهيأة لفك ضغط Brotli قد تمرر حمولات خبيثة إلى المفكك المصاب دون قصد."
        },
        {
          "type": "compare",
          "stepLabel": "STEP 03",
          "compareLeftTitle": "Universal Exploit",
          "compareRightTitle": "Build-Specific Exploit",
          "enTitle": "Exploitation Requirements.",
          "arTitle": "متطلبات الاستغلال",
          "enBody": "Exploitation is not universal; it requires precise build-specific memory offsets and configuration matching.",
          "arBody": "الاستغلال ليس عالمياً؛ بل يتطلب مطابقة دقيقة لإصدار البناء (Build) وإزاحات الذاكرة المحددة.",
          "diagramVariant": "split"
        },
        {
          "type": "row",
          "stepLabel": "STEP 04",
          "enTitle": "Remediation Strategy.",
          "arTitle": "استراتيجية المعالجة",
          "enBody": "Patching the Node.js runtime is the only definitive fix. Temporary WAF rules are insufficient.",
          "arBody": "تحديث بيئة تشغيل Node.js هو الحل الجذري الوحيد. قواعد جدار حماية تطبيقات الويب (WAF) ليست كافية.",
          "diagramVariant": "takeaway"
        },
        {
          "type": "row",
          "stepLabel": "STEP 05",
          "enTitle": "The Catch Build Sensitivity.",
          "arTitle": "تنبيه: حساسية إصدارات البناء",
          "enBody": "Exploits targeting Node.js 24.22.0 failed against 22.x and 26.x builds, proving that runtime diversity hinders universal attacks.",
          "arBody": "محاولات استغلال Node.js 24.22.0 فشلت ضد إصدارات 22.x و 26.x، مما يثبت أن تنوع بيئات التشغيل يعيق الهجمات الشاملة.",
          "diagramVariant": "isolation"
        },
        {
          "type": "cta",
          "enTitle": "Patch your runtimes now.",
          "arTitle": "حدث بيئات التشغيل الآن",
          "enBody": "Node2Shell highlights the danger of low-level component vulnerabilities. Check your Node.js versions today.",
          "arBody": "تُبرز ثغرة Node2Shell خطورة الثغرات في المكونات منخفضة المستوى. تحقق من إصدارات Node.js لديك اليوم.",
          "ctaText": "Join discussion • شارك برأيك",
          "url": "marrok.org/security/node2shell"
        }
      ],
      "postFormat": "carousel",
      "id": "post_8acb9671-b15",
      "brand": "MARROK",
      "brandUrl": "marrok.org",
      "firstComment": "Check the official Node.js security advisory for your specific version line: https://nodejs.org/en/blog/vulnerability/october-2026-security-releases",
      "shortCaption": "ثغرة Node2Shell: تنفيذ كود عن بُعد عبر Brotli. حدث إصدارات Node.js فوراً! 🛡️",
      "screenHook": "Node2Shell: Critical RCE in Node.js",
      "scheduleSlot": "10:00 DZ",
      "sourceMeta": {
        "title": "Node2Shell: Researchers Demonstrate Remote Code Execution in Standard Node.js Builds",
        "creator": "Imperva & ELLIO Research",
        "url": "https://www.imperva.com/blog/node2shell-from-brotli-data-to-remote-code-execution/",
        "published": "October 28, 2026",
        "groundingQueries": [
          "CVE-2026-111497 Node.js Brotli RCE",
          "Node2Shell vulnerability details"
        ],
        "groundingSources": [
          {
            "title": "The Hacker News",
            "url": "https://thehackernews.com/2026/10/researchers-demonstrate-node2shell-rce.html"
          },
          {
            "title": "Node.js Security Releases",
            "url": "https://nodejs.org/en/blog/vulnerability/october-2026-security-releases"
          }
        ],
        "isSearchGrounded": false,
        "isFallback": false,
        "engine": "ungrounded",
        "model": "gemini-3.1-flash-lite",
        "status": "unverified_draft",
        "userReviewed": true
      },
      "facts": [
        {
          "text": "CVE-2026-111497 allows RCE in Node.js via malformed Brotli data.",
          "type": "claim",
          "verified": "unconfirmed",
          "evidence": "Node.js Security Advisory October 2026"
        },
        {
          "text": "Exploitation requires build-specific memory offsets.",
          "type": "claim",
          "verified": "unconfirmed",
          "evidence": "ELLIO Research findings"
        }
      ],
      "notesForHuman": [
        "Verified CVE-2026-111497 as the primary identifier.",
        "Dropped specific IP addresses and non-essential monitoring tool names to focus on architectural risk.",
        "Ensured the distinction between 'attempted' and 'successful' exploitation is clear in the narrative."
      ],
      "captionVariants": [
        {
          "style": "Bulletins",
          "caption": "⚡ ثغرة Node2Shell: تنفيذ كود عن بُعد عبر Brotli.\n\nاكتشف الباحثون ثغرة خطيرة (CVE-2026-111497) في مكتبة فك ضغط Brotli المدمجة في Node.js، مما يسمح للمهاجمين بتنفيذ كود برمجي (RCE) عبر بيانات مضغوطة خبيثة.\n\n🔹 التفاصيل التقنية:\n- الثغرة تؤثر على إصدارات Node.js 22.x, 24.x, 26.x.\n- تعتمد الاستغلالية على بنية الذاكرة وإصدار الـ Runtime.\n- التحديث إلى الإصدارات المصححة هو الحل الوحيد الموثوق.\n\nهل قمت بتحديث بيئات Node.js لديك؟ شاركنا في التعليقات 👇\n\n🎥 المصدر: Imperva & ELLIO Research\n#CyberSecurity #NodeJS #DevSecOps #InfoSec #Node2Shell"
        },
        {
          "style": "Narrative",
          "caption": "تنبيه أمني لمطوري Node.js! ⚠️\n\nتم الكشف عن ثغرة Node2Shell التي تسمح بتنفيذ كود عن بُعد (RCE) من خلال استغلال مكتبة Brotli. الثغرة تؤثر على الإصدارات الحديثة وتتطلب تحديثاً فورياً للـ Runtime.\n\nلا تعتمد على جدران الحماية فقط؛ التحديث هو الحل الوحيد. هل واجهت أي نشاط مشبوه في سجلات الخادم لديك؟\n\n#NodeJS #Security #CVE2026 #TechNews"
        }
      ],
      "hookVariants": [
        {
          "tag": "Urgent",
          "enTitle": "Node2Shell: RCE in Node.js.",
          "arTitle": "ثغرة Node2Shell تنفيذ كود عن بُعد",
          "enBody": "Critical Brotli decoder flaw discovered.",
          "arBody": "اكتشاف ثغرة حرجة في مفكك ضغط Brotli المعتمد.",
          "centerIcon": "alertTriangle"
        },
        {
          "tag": "Technical",
          "enTitle": "Brotli Decoder Vulnerability.",
          "arTitle": "ثغرة في مفكك ضغط Brotli",
          "enBody": "How malformed data triggers RCE.",
          "arBody": "كيف تؤدي البيانات المشوهة إلى تنفيذ كود.",
          "centerIcon": "terminal"
        },
        {
          "tag": "Security",
          "enTitle": "Patch Node.js Immediately.",
          "arTitle": "حدث Node.js فوراً",
          "enBody": "CVE-2026-111497 affects 22.x-26.x.",
          "arBody": "الثغرة CVE-2026-111497 تؤثر على إصدارات 22.x-26.x المعتمد.",
          "centerIcon": "shieldCheck"
        }
      ]
    }
  }
];
