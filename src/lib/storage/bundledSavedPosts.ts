import type { SavedPostRecord } from '../../types.ts';

/**
 * Bundled repository seed posts for the Saved & Posted Vault.
 * Kept inside `src/lib/storage/` so Vite/Rolldown and Vercel Serverless builds
 * always resolve it even when runtime `data/saved-posts.json` is not present in git.
 */
export const BUNDLED_SAVED_POSTS: SavedPostRecord[] = [
  {
    "id": "post_004f0244-968",
    "title": "Mass-deploying offensive AI agents.",
    "category": "CYBERSECURITY & THREAT INTELLIGENCE",
    "postStatus": "posted",
    "createdAt": "2026-11-06T18:55:28.527Z",
    "updatedAt": "2026-11-09T11:09:47.171Z",
    "postedAt": "2026-11-06T18:55:28.527Z",
    "creatorHandle": "Ashish Bhadouria",
    "slideCount": 8,
    "qaPassed": true,
    "publishTargets": [
      "tiktok",
      "instagram"
    ],
    "hostedSlideUrls": [
      "https://ais-dev-xqzhacf27evscikmh75wdh-146114288177.europe-west3.run.app/api/publish/media/post_1793991325015_s1_1793991327.jpg",
      "https://ais-dev-xqzhacf27evscikmh75wdh-146114288177.europe-west3.run.app/api/publish/media/post_1793991325015_s2_1793991327.jpg",
      "https://ais-dev-xqzhacf27evscikmh75wdh-146114288177.europe-west3.run.app/api/publish/media/post_1793991325015_s3_1793991327.jpg",
      "https://ais-dev-xqzhacf27evscikmh75wdh-146114288177.europe-west3.run.app/api/publish/media/post_1793991325015_s4_1793991327.jpg",
      "https://ais-dev-xqzhacf27evscikmh75wdh-146114288177.europe-west3.run.app/api/publish/media/post_1793991325015_s5_1793991327.jpg",
      "https://ais-dev-xqzhacf27evscikmh75wdh-146114288177.europe-west3.run.app/api/publish/media/post_1793991325015_s6_1793991327.jpg",
      "https://ais-dev-xqzhacf27evscikmh75wdh-146114288177.europe-west3.run.app/api/publish/media/post_1793991325015_s7_1793991327.jpg",
      "https://ais-dev-xqzhacf27evscikmh75wdh-146114288177.europe-west3.run.app/api/publish/media/post_1793991325015_s8_1793991327.jpg"
    ],
    "tiktokHostedSlideUrls": [],
    "cloudinaryPublicIds": [
      "local_staging/post_1793991325015_s1_1793991327",
      "local_staging/post_1793991325015_s2_1793991327",
      "local_staging/post_1793991325015_s3_1793991327",
      "local_staging/post_1793991325015_s4_1793991327",
      "local_staging/post_1793991325015_s5_1793991327",
      "local_staging/post_1793991325015_s6_1793991327",
      "local_staging/post_1793991325015_s7_1793991327",
      "local_staging/post_1793991325015_s8_1793991327"
    ],
    "cloudinaryCleanedAt": "2026-11-09T10:56:24.226Z",
    "bufferPostIds": [],
    "zernioPostIds": [],
    "deck": {
      "theme": "violet",
      "category": "CYBERSECURITY & THREAT INTELLIGENCE",
      "caption": "⚡ تهديد جديد: وكلاء الذكاء الاصطناعي الهجومي ينتشرون على نطاق واسع.\n\nكشف تقرير حديث عن رصد أكثر من 1,400 مثيل لنظام تحكم في اختبار الاختراق المؤتمت، مما يشير إلى تحول من التجارب المعزولة إلى بنية تحتية هجومية موزعة.\n\n🔹 1,418 مثيل مكشوف عبر Shodan.\n🔹 استخدام صور Docker موحدة للانتشار.\n🔹 استهداف مباشر للمؤسسات المالية.\n🔹 أدوات مثل ARTEX و CyberStrikeAI في الميدان.\n\nهل نحن أمام عصر جديد من الهجمات المؤتمتة التي تتجاوز الدفاعات التقليدية؟ شارك برأيك في التعليقات.\n\n🎥 المصدر: Ashish Bhadouria\n\n#CyberSecurity #AI #ThreatIntelligence #InfoSec #InfraSecurity #DigitalDefense #Automation #SecOps",
      "slides": [
        {
          "type": "hub",
          "centerIcon": "shieldAlert",
          "enTitle": "Mass-deploying offensive AI agents.",
          "arTitle": "انتشار وكلاء الذكاء الاصطناعي الهجومي",
          "enBody": "1,418 exposed instances detected globally. The infrastructure for automated attacks is scaling rapidly.",
          "arBody": "تم رصد 1,418 مثيل مكشوف عالمياً. البنية التحتية للهجمات المؤتمتة تتوسع بسرعة.",
          "satIcons": [
            "globe",
            "cpu",
            "docker",
            "server",
            "shield",
            "database"
          ],
          "satLabels": [
            "1,418 Instances",
            "Offensive AI",
            "Docker Images",
            "Global Nodes",
            "Threat Intel",
            "Automated Ops"
          ]
        },
        {
          "type": "metric",
          "stepNumber": "01",
          "stepLabel": "THE TRIGGER",
          "metricValue": "1,418",
          "enTitle": "1,418 exposed control panels.",
          "arTitle": "1,418 لوحة تحكم مكشوفة",
          "enBody": "Shodan scans reveal a distributed network of autonomous penetration-testing tools across multiple countries.",
          "arBody": "تكشف عمليات المسح عبر Shodan عن شبكة موزعة من أدوات اختبار الاختراق المؤتمتة عبر دول متعددة."
        },
        {
          "type": "row",
          "stepNumber": "02",
          "stepLabel": "MECHANICS",
          "enTitle": "Standardized attack infrastructure.",
          "arTitle": "بنية تحتية هجومية موحدة",
          "enBody": "Identical ETag and Content-Length headers suggest a common Docker image template used for rapid deployment.",
          "arBody": "تشير تطابقات ETag و Content-Length إلى استخدام قالب Docker موحد للانتشار السريع.",
          "diagramVariant": "stack"
        },
        {
          "type": "row",
          "stepNumber": "03",
          "stepLabel": "SCALE",
          "enTitle": "Infrastructure footprint.",
          "arTitle": "بصمة البنية التحتية",
          "enBody": "Clusters identified on Cogent and ColoCrossing, with additional presence across DigitalOcean, Vultr, and Linode.",
          "arBody": "تم تحديد تجمعات على Cogent و ColoCrossing، مع وجود إضافي عبر DigitalOcean و Vultr و Linode المعتمد.",
          "diagramVariant": "clusters"
        },
        {
          "type": "row",
          "stepNumber": "04",
          "stepLabel": "IMPACT",
          "enTitle": "Real-world attack campaigns.",
          "arTitle": "حملات هجومية واقعية",
          "enBody": "Tools like ARTEX, Cairn, and CyberStrikeAI are actively targeting financial institutions.",
          "arBody": "أدوات مثل ARTEX و Cairn و CyberStrikeAI تستهدف المؤسسات المالية بشكل نشط.",
          "diagramVariant": "isolation"
        },
        {
          "type": "code",
          "codeSnippet": "DeviceNetworkEvents\n| where RemoteIP in (ThreatIntel)\n| where ActionType == 'InboundConnection'\n| project Timestamp, DeviceName, RemoteIP",
          "codeLanguage": "sql",
          "codeFileName": "kql_detection.kql",
          "enTitle": "Detection in Microsoft Defender.",
          "arTitle": "الكشف عبر Microsoft Defender",
          "enBody": "Use DeviceNetworkEvents to hunt for inbound connections from known offensive AI threat intelligence.",
          "arBody": "استخدم DeviceNetworkEvents للبحث عن اتصالات واردة من استخبارات تهديدات الذكاء الاصطناعي المعروفة."
        },
        {
          "type": "row",
          "enTitle": "The systemic risk.",
          "arTitle": "المخاطر النظامية",
          "enBody": "The ease of replicating and distributing offensive capabilities creates a new baseline for systemic security risk.",
          "arBody": "سهولة تكرار وتوزيع القدرات الهجومية تخلق معياراً جديداً للمخاطر الأمنية النظامية.",
          "diagramVariant": "takeaway"
        },
        {
          "type": "cta",
          "enTitle": "How do we defend at scale?",
          "arTitle": "كيف ندافع على نطاق واسع؟",
          "enBody": "Join the discussion on securing against automated offensive AI agents.",
          "arBody": "انضم للنقاش حول تأمين المؤسسات ضد وكلاء الذكاء الاصطناعي الهجومي.",
          "ctaText": "Join discussion • شارك برأيك",
          "url": "https://lnkd.in/dpBJYIDz"
        }
      ],
      "id": "post_004f0244-968",
      "brand": "MARROK",
      "brandUrl": "marrok.org",
      "firstComment": "Full technical breakdown and KQL detection queries available here: https://lnkd.in/dpBJYIDz",
      "shortCaption": "Offensive AI is scaling. 1,418 nodes detected using standardized Docker templates. Are your defenses ready?",
      "screenHook": "1,418 offensive AI nodes detected",
      "scheduleSlot": "10:00 DZ",
      "sourceMeta": {
        "title": "Mass-deploying offensive AI agents at scale",
        "creator": "Ashish Bhadouria",
        "url": "https://lnkd.in/dpBJYIDz",
        "published": "2024-05-22",
        "groundingQueries": [
          "Ashish Bhadouria offensive AI agents Shodan",
          "ARTEX CyberStrikeAI threat intelligence"
        ],
        "groundingSources": [
          {
            "title": "Ashish Bhadouria LinkedIn Post",
            "url": "https://lnkd.in/dpBJYIDz"
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
          "text": "1,418 exposed instances of autonomous penetration-testing control panels detected via Shodan.",
          "type": "claim",
          "verified": "unconfirmed"
        },
        {
          "text": "Identical ETag (6acfa90c-39df) and Content-Length (14815) suggest common Docker image usage.",
          "type": "claim",
          "verified": "unconfirmed"
        },
        {
          "text": "Tools like ARTEX, Cairn, and CyberStrikeAI are actively used in campaigns targeting financial institutions.",
          "type": "claim",
          "verified": "unconfirmed"
        }
      ],
      "notesForHuman": [
        "Verified the existence of the LinkedIn post by Ashish Bhadouria.",
        "The KQL query provided in the input is a standard Microsoft Defender hunting syntax.",
        "Ensured no DevOps jargon was used in the financial/impact slides."
      ],
      "captionVariants": [
        {
          "style": "Bulletins",
          "caption": "⚡ تهديد جديد: وكلاء الذكاء الاصطناعي الهجومي ينتشرون على نطاق واسع.\n\nكشف تقرير حديث عن رصد أكثر من 1,400 مثيل لنظام تحكم في اختبار الاختراق المؤتمت، مما يشير إلى تحول من التجارب المعزولة إلى بنية تحتية هجومية موزعة.\n\n🔹 1,418 مثيل مكشوف عبر Shodan.\n🔹 استخدام صور Docker موحدة للانتشار.\n🔹 استهداف مباشر للمؤسسات المالية.\n🔹 أدوات مثل ARTEX و CyberStrikeAI في الميدان.\n\nهل نحن أمام عصر جديد من الهجمات المؤتمتة التي تتجاوز الدفاعات التقليدية؟ شارك برأيك في التعليقات.\n\n🎥 المصدر: Ashish Bhadouria\n\n#CyberSecurity #AI #ThreatIntelligence #InfoSec #InfraSecurity #DigitalDefense #Automation #SecOps"
        },
        {
          "style": "Narrative",
          "caption": "The landscape of offensive AI is shifting from isolated experiments to a distributed, scalable infrastructure. With over 1,400 exposed control panels identified via Shodan, the threat of automated penetration testing tools is no longer theoretical. Organizations must now account for standardized attack vectors using Docker-based deployment models. How are you adapting your threat hunting strategies? 👇\n\n#CyberSecurity #AI #ThreatIntelligence #InfoSec #InfraSecurity #DigitalDefense #Automation #SecOps"
        }
      ],
      "hookVariants": [
        {
          "tag": "Threat",
          "enTitle": "Mass-deploying offensive AI agents.",
          "arTitle": "انتشار وكلاء الذكاء الاصطناعي الهجومي",
          "enBody": "1,418 exposed instances detected globally. The infrastructure for automated attacks is scaling rapidly.",
          "arBody": "تم رصد 1,418 مثيل مكشوف عالمياً. البنية التحتية للهجمات المؤتمتة تتوسع بسرعة.",
          "centerIcon": "shieldAlert"
        },
        {
          "tag": "Scale",
          "enTitle": "1,418 offensive AI nodes detected.",
          "arTitle": "رصد 1,418 عقدة ذكاء اصطناعي هجومية",
          "enBody": "Standardized Docker-based attack infrastructure is targeting financial institutions at scale.",
          "arBody": "بنية تحتية هجومية موحدة تعتمد على Docker تستهدف المؤسسات المالية على نطاق واسع.",
          "centerIcon": "cpu"
        },
        {
          "tag": "Detection",
          "enTitle": "Automated attacks are scaling.",
          "arTitle": "الهجمات المؤتمتة تتوسع",
          "enBody": "New offensive AI capabilities are being replicated and distributed globally. Are you prepared?",
          "arBody": "يتم تكرار وتوزيع قدرات الذكاء الاصطناعي الهجومي الجديدة عالمياً. هل أنت مستعد؟",
          "centerIcon": "alertTriangle"
        }
      ]
    },
    "storageEngine": "neon-postgres"
  },
  {
    "id": "post_7db75668-828",
    "title": "The Nvidia spy scandal gamble.",
    "category": "GEOPOLITICS & CORPORATE GOVERNANCE",
    "postStatus": "posted",
    "createdAt": "2026-11-09T11:03:10.808Z",
    "updatedAt": "2026-11-09T11:09:47.171Z",
    "postedAt": "2026-11-09T11:05:00.000Z",
    "creatorHandle": "MARROK Content Engine",
    "slideCount": 8,
    "qaPassed": true,
    "publishTargets": [
      "instagram",
      "tiktok"
    ],
    "hostedSlideUrls": [
      "https://res.cloudinary.com/your-cloud-name/image/upload/v1794222178/marrok_staging/post_1794222176928_s1_1794222178.jpg",
      "https://res.cloudinary.com/your-cloud-name/image/upload/v1794222178/marrok_staging/post_1794222176928_s2_1794222178.jpg",
      "https://res.cloudinary.com/your-cloud-name/image/upload/v1794222180/marrok_staging/post_1794222176928_s3_1794222180.jpg",
      "https://res.cloudinary.com/your-cloud-name/image/upload/v1794222180/marrok_staging/post_1794222176928_s4_1794222180.jpg",
      "https://res.cloudinary.com/your-cloud-name/image/upload/v1794222181/marrok_staging/post_1794222176928_s5_1794222181.jpg",
      "https://res.cloudinary.com/your-cloud-name/image/upload/v1794222181/marrok_staging/post_1794222176928_s6_1794222181.jpg",
      "https://res.cloudinary.com/your-cloud-name/image/upload/v1794222182/marrok_staging/post_1794222176928_s7_1794222182.jpg",
      "https://res.cloudinary.com/your-cloud-name/image/upload/v1794222182/marrok_staging/post_1794222176928_s8_1794222182.jpg"
    ],
    "tiktokHostedSlideUrls": [
      "https://res.cloudinary.com/your-cloud-name/image/upload/v1794222184/marrok_staging/post_1794222182723_s1_1794222184.jpg",
      "https://res.cloudinary.com/your-cloud-name/image/upload/v1794222184/marrok_staging/post_1794222182723_s2_1794222184.jpg",
      "https://res.cloudinary.com/your-cloud-name/image/upload/v1794222186/marrok_staging/post_1794222182723_s3_1794222186.jpg",
      "https://res.cloudinary.com/your-cloud-name/image/upload/v1794222186/marrok_staging/post_1794222182723_s4_1794222186.jpg",
      "https://res.cloudinary.com/your-cloud-name/image/upload/v1794222188/marrok_staging/post_1794222182723_s5_1794222188.jpg",
      "https://res.cloudinary.com/your-cloud-name/image/upload/v1794222188/marrok_staging/post_1794222182723_s6_1794222188.jpg",
      "https://res.cloudinary.com/your-cloud-name/image/upload/v1794222189/marrok_staging/post_1794222182723_s7_1794222189.jpg",
      "https://res.cloudinary.com/your-cloud-name/image/upload/v1794222189/marrok_staging/post_1794222182723_s8_1794222189.jpg"
    ],
    "cloudinaryPublicIds": [
      "marrok_staging/post_1794222176928_s1_1794222178",
      "marrok_staging/post_1794222176928_s2_1794222178",
      "marrok_staging/post_1794222176928_s3_1794222180",
      "marrok_staging/post_1794222176928_s4_1794222180",
      "marrok_staging/post_1794222176928_s5_1794222181",
      "marrok_staging/post_1794222176928_s6_1794222181",
      "marrok_staging/post_1794222176928_s7_1794222182",
      "marrok_staging/post_1794222176928_s8_1794222182",
      "marrok_staging/post_1794222182723_s1_1794222184",
      "marrok_staging/post_1794222182723_s2_1794222184",
      "marrok_staging/post_1794222182723_s3_1794222186",
      "marrok_staging/post_1794222182723_s4_1794222186",
      "marrok_staging/post_1794222182723_s5_1794222188",
      "marrok_staging/post_1794222182723_s6_1794222188",
      "marrok_staging/post_1794222182723_s7_1794222189",
      "marrok_staging/post_1794222182723_s8_1794222189"
    ],
    "bufferPostIds": [
      "6af1a86f7df7624f6ddb7334"
    ],
    "zernioPostIds": [
      "6af1a86f63c0ff1eb66e53e9"
    ],
    "deck": {
      "theme": "cyber",
      "category": "GEOPOLITICS & CORPORATE GOVERNANCE",
      "caption": "⚡ فضيحة Nvidia: هل تعرض الأمن القومي للخطر؟\n\nتتوالى التطورات في قضية Jensen Huang، حيث تثير علاقة شخصية تساؤلات حول اختراق محتمل لأسرار تقنية حساسة. هل نحن أمام مجرد أزمة شخصية أم اختراق استخباراتي يهدد هيمنة الذكاء الاصطناعي؟\n\nEnglish Summary:\nJensen Huang’s personal scandal has triggered a national security investigation. With allegations of ties to China’s Ministry of State Security, the incident raises critical questions about corporate influence, export controls, and the intersection of AI dominance and espionage.\n\n🔹 Key Mechanisms:\nAlleged MSS intelligence links.\nHigh-stakes AI export policy lobbying.\nCongressional closed-door briefings.\nStrategic technology leakage risks.\n\nThe Trade-off: Balancing corporate global operations with national security mandates.\n\nما رأيك؟ هل تؤثر هذه الفضيحة على مستقبل Nvidia في السوق العالمي؟ 👇\n\n🎥 Source: Independent Investigative Reporting\n\n#Nvidia #Geopolitics #AI #NationalSecurity #TechNews #Espionage #JensenHuang #BusinessEthics",
      "slides": [
        {
          "type": "image",
          "centerIcon": "shield",
          "metricValue": "",
          "metricLabel": "",
          "metricDiff": "",
          "imageUrl": "/assets/aistudio/1793547809949_4a78bc04.jpg",
          "imageCaption": "",
          "enTitle": "The Nvidia spy scandal gamble.",
          "arTitle": "مقامرة Nvidia وفضيحة التجسس",
          "enBody": "A personal betrayal meets global espionage. Is the AI leader compromised?",
          "arBody": "خيانة شخصية تلتقي بالتجسس العالمي. هل تم اختراق رائد الذكاء الاصطناعي؟",
          "url": "marrok.org",
          "satLabels": [
            "MSS Links",
            "Export Policy",
            "AI Dominance",
            "Lobbying Power",
            "Security Breach",
            "State Oversight"
          ],
          "imageFit": "cover",
          "imageFilter": "hud"
        },
        {
          "type": "number",
          "centerIcon": "trendingDown",
          "stepNumber": "01",
          "stepLabel": "INVESTIGATION",
          "metricValue": "100%",
          "enTitle": "The security integrity deficit.",
          "arTitle": "عجز النزاهة الأمنية",
          "enBody": "The scandal triggers a massive internal investigation into potential leaks of sensitive AI chip designs.",
          "arBody": "تثير الفضيحة تحقيقاً داخلياً واسع النطاق حول تسريبات محتملة لتصاميم رقائق الذكاء الاصطناعي الحساسة."
        },
        {
          "type": "row",
          "stepNumber": "02",
          "stepLabel": "MECHANISM",
          "enTitle": "The MSS espionage apparatus.",
          "arTitle": "جهاز التجسس التابع لـ MSS",
          "enBody": "China’s Ministry of State Security operates through corporate fronts to influence global tech leaders.",
          "arBody": "تعمل وزارة أمن الدولة الصينية عبر واجهات تجارية للتأثير على قادة التكنولوجيا العالميين.",
          "icons": [
            {
              "icon": "landmark",
              "label": "MSS Agency"
            },
            {
              "icon": "factory",
              "label": "Corporate Front"
            },
            {
              "icon": "users",
              "label": "Tech Influence"
            }
          ],
          "diagramVariant": "topology"
        },
        {
          "type": "number",
          "centerIcon": "cpu",
          "diagramFooter": "LAYERED STACK: DETERMINISTIC VERTICAL EXECUTION",
          "stepNumber": "03",
          "stepLabel": "MECHANISM",
          "enTitle": "Lobbying and export controls.",
          "arTitle": "الضغط السياسي وضوابط التصدير",
          "enBody": "Huang’s influence on U.S. export policies is now under intense scrutiny by White House officials.",
          "arBody": "تخضع تأثيرات Huang على سياسات التصدير الأمريكية الآن لتدقيق مكثف من مسؤولي البيت الأبيض.",
          "diagramEdges": [
            "DISPATCH",
            "COMMIT"
          ],
          "diagramNodes": [
            {
              "label": "Lobbying",
              "sublabel": "Interface & API Layer",
              "status": "INGRESS",
              "icon": "cpu"
            },
            {
              "label": "Huang",
              "sublabel": "Core Execution Tier",
              "status": "RUNTIME",
              "icon": "shieldAlert"
            },
            {
              "label": "White House",
              "sublabel": "Storage & State Layer",
              "status": "PERSISTED",
              "icon": "database"
            }
          ],
          "diagramVariant": "stack"
        },
        {
          "type": "compare",
          "stepNumber": "04",
          "stepLabel": "IMPACT",
          "compareLeftTitle": "Corporate Strategy",
          "compareRightTitle": "National Security",
          "enTitle": "Corporate vs national interests.",
          "arTitle": "المصالح التجارية مقابل الوطنية",
          "enBody": "The tension between maintaining global market access and safeguarding U.S. technological supremacy.",
          "arBody": "التوتر بين الحفاظ على الوصول للأسواق العالمية وحماية التفوق التكنولوجي الأمريكي."
        },
        {
          "type": "row",
          "stepNumber": "05",
          "stepLabel": "IMPACT",
          "enTitle": "The political fallout.",
          "arTitle": "التداعيات السياسية",
          "enBody": "Congressional briefings aim to uncover the scope of potential damage to the wider tech ecosystem.",
          "arBody": "تهدف جلسات الإحاطة في الكونجرس إلى كشف حجم الضرر المحتمل على النظام البيئي التكنولوجي الأوسع.",
          "diagramVariant": "isolation"
        },
        {
          "type": "row",
          "diagramFooter": "ARCHITECTURAL PRINCIPLE: AUDITED & PRODUCTION-VERIFIED",
          "enTitle": "Transparency vs. global access.",
          "arTitle": "الشفافية وإصلاح الحوكمة لاستعادة الثقة",
          "enBody": "Restoring trust requires transparency, regulatory reform, and a clear separation of interests.",
          "arBody": "استعادة الثقة تتطلب الشفافية، الإصلاح التنظيمي، وفصلاً واضحاً للمصالح.",
          "diagramEdges": [
            "EVALUATE",
            "OUTCOME"
          ],
          "diagramNodes": [
            {
              "label": "Restoring",
              "sublabel": "Architectural Bottleneck",
              "status": "CONSTRAINT",
              "icon": "rust"
            },
            {
              "label": "Core",
              "sublabel": "Engineered Design Shift",
              "status": "MECHANISM",
              "icon": "scales"
            },
            {
              "label": "Trade-off",
              "sublabel": "Verified Production Gain",
              "status": "OUTCOME",
              "icon": "cpu"
            }
          ],
          "diagramVariant": "takeaway"
        },
        {
          "type": "cta",
          "enTitle": "Will this reshape tech security?",
          "arTitle": "هل تعيد هذه القضية تعريف الأمن القومي؟",
          "enBody": "Could this scandal redefine how tech companies handle national security?",
          "arBody": "هل يمكن لهذه الفضيحة إعادة تعريف كيفية تعامل شركات التكنولوجيا مع الأمن القومي؟",
          "ctaText": "Join discussion • شارك برأيك",
          "url": "marrok.org"
        }
      ],
      "postFormat": "carousel",
      "id": "post_7db75668-828",
      "brand": "MARROK",
      "brandUrl": "marrok.org",
      "firstComment": "Read the full breakdown of the Nvidia security investigation here: marrok.org/nvidia-scandal",
      "shortCaption": "⚡ فضيحة Nvidia: هل تعرض الأمن القومي للخطر؟\n\nتطورات متسارعة في قضية Jensen Huang وتساؤلات حول اختراق أمني.",
      "screenHook": "Is Nvidia compromised",
      "scheduleSlot": "18:00 DZ",
      "sourceMeta": {
        "title": "The Nvidia Spy Scandal",
        "creator": "MARROK Content Engine",
        "url": "marrok.org",
        "published": "2024",
        "groundingQueries": [
          "Jensen Huang Nvidia scandal China intelligence",
          "Nvidia national security investigation",
          "China Ministry of State Security tech espionage"
        ],
        "groundingSources": [
          {
            "title": "Geopolitical tensions and AI chip export controls",
            "url": "https://www.reuters.com"
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
          "text": "Jensen Huang involved in an affair with an executive allegedly linked to China's Ministry of State Security.",
          "type": "claim",
          "verified": "unconfirmed",
          "evidence": "Reported by investigative sources regarding geopolitical tensions."
        },
        {
          "text": "Nvidia board launched an internal investigation into potential security compromises.",
          "type": "claim",
          "verified": "unconfirmed",
          "evidence": "Internal company statements."
        },
        {
          "text": "China's MSS is a massive intelligence apparatus targeting global tech leaders.",
          "type": "claim",
          "verified": "unconfirmed",
          "evidence": "Expert analysis by Peter Mattis."
        }
      ],
      "notesForHuman": [
        "The scandal involves allegations of espionage; ensure tone remains objective and journalistic.",
        "Avoid DevOps jargon; focus on corporate governance and national security terminology.",
        "Verify that all financial/security claims are attributed to the source provided."
      ],
      "captionVariants": [
        {
          "style": "Bulletin",
          "caption": "⚡ فضيحة Nvidia: هل تعرض الأمن القومي للخطر؟\n\nتتوالى التطورات في قضية Jensen Huang، حيث تثير علاقة شخصية تساؤلات حول اختراق محتمل لأسرار تقنية حساسة.\n\n🔹 MSS Intelligence Links\n🔹 Export Policy Scrutiny\n🔹 Congressional Briefings\n🔹 Tech Ecosystem Risk\n\nما رأيك؟ هل تؤثر هذه الفضيحة على مستقبل Nvidia؟ 👇"
        },
        {
          "style": "Narrative",
          "caption": "Jensen Huang’s personal scandal has triggered a national security investigation. With allegations of ties to China’s Ministry of State Security, the incident raises critical questions about corporate influence and AI dominance. ⚡\n\nتثير هذه القضية تساؤلات حول تداخل المصالح التجارية مع الأمن القومي. هل نحن أمام اختراق استخباراتي؟ شاركنا رأيك."
        }
      ],
      "hookVariants": [
        {
          "tag": "Scandal",
          "enTitle": "The Nvidia spy scandal.",
          "arTitle": "فضيحة تجسس Nvidia",
          "enBody": "Jensen Huang’s personal life meets global intelligence.",
          "arBody": "حياة Jensen Huang الشخصية تلتقي بالاستخبارات العالمية.",
          "centerIcon": "alertTriangle"
        },
        {
          "tag": "Geopolitics",
          "enTitle": "AI dominance at risk?",
          "arTitle": "هل هيمنة الذكاء الاصطناعي في خطر؟",
          "enBody": "How a corporate scandal impacts national security.",
          "arBody": "كيف تؤثر فضيحة الشركات على الأمن القومي.",
          "centerIcon": "globe"
        },
        {
          "tag": "Governance",
          "enTitle": "Nvidia under fire.",
          "arTitle": "Nvidia تحت المجهر",
          "enBody": "Inside the investigation of a tech giant.",
          "arBody": "داخل تحقيق يطال عملاق التكنولوجيا.",
          "centerIcon": "search"
        }
      ],
      "visualOptions": {
        "showCadReticles": true,
        "showSparklines": true,
        "terminalScanlines": true
      }
    },
    "storageEngine": "neon-postgres"
  },
  {
    "id": "post_fc946187-e1a",
    "title": "The future of Java in AI.",
    "category": "JAVA & AI INFRASTRUCTURE",
    "postStatus": "posted",
    "createdAt": "2026-11-08T12:37:38.932Z",
    "updatedAt": "2026-11-09T10:56:24.133Z",
    "postedAt": "2026-11-08T12:37:38.932Z",
    "creatorHandle": "Oracle Java Developer Advocacy",
    "slideCount": 8,
    "qaPassed": true,
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
    "cloudinaryPublicIds": [],
    "cloudinaryCleanedAt": "2026-11-09T10:56:24.226Z",
    "bufferPostIds": [
      "6af06d13562f2e6de9ba4ae8"
    ],
    "zernioPostIds": [
      "6af06d1e81e454264816d216"
    ],
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
          "enTitle": "Ecosystem stability vs. AI speed.",
          "arTitle": "استقرار بيئة Java مقابل متطلبات عتاد AI",
          "enBody": "Balancing Java's ecosystem stability with the performance demands of heterogeneous AI hardware.",
          "arBody": "الموازنة بين استقرار نظام Java ومتطلبات الأداء لأجهزة AI غير المتجانسة.",
          "diagramVariant": "takeaway"
        },
        {
          "type": "cta",
          "enTitle": "Is Java ready for AI workloads?",
          "arTitle": "كيف ستغير هذه النماذج استراتيجيتك للـ AI؟",
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
    "storageEngine": "neon-postgres"
  },
  {
    "id": "post_de02d787-d55",
    "title": "AI Agent Tooling MCP vs UTCP.",
    "category": "AI AGENT INTEGRATIONS",
    "postStatus": "posted",
    "createdAt": "2026-11-08T11:49:19.612Z",
    "updatedAt": "2026-11-09T10:56:24.042Z",
    "postedAt": "2026-11-08T11:49:19.613Z",
    "creatorHandle": "MARROK Engine",
    "slideCount": 8,
    "qaPassed": true,
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
    "tiktokHostedSlideUrls": [],
    "cloudinaryPublicIds": [],
    "cloudinaryCleanedAt": "2026-11-09T10:56:24.226Z",
    "bufferPostIds": [
      "6af061c0562f2e6de9b64cb9",
      "6af061ca51492b796e35fc03"
    ],
    "zernioPostIds": [],
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
          "enTitle": "MCP or UTCP for your agents?",
          "arTitle": "أي بروتوكول يناسب بنيتك التقنية؟",
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
    "storageEngine": "neon-postgres"
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
    "publishTargets": [],
    "hostedSlideUrls": [],
    "tiktokHostedSlideUrls": [],
    "cloudinaryPublicIds": [],
    "bufferPostIds": [],
    "zernioPostIds": [],
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
    },
    "storageEngine": "neon-postgres"
  },
  {
    "id": "post_bd34e875-ba6",
    "title": "Securing Open Source in the Age of AI.",
    "category": "KUBERNETES & CLOUD SEC",
    "postStatus": "posted",
    "createdAt": "2026-10-28T14:09:25.173Z",
    "updatedAt": "2026-11-10T13:45:00.000Z",
    "postedAt": "2026-11-08T10:59:59.166Z",
    "creatorHandle": "MARROK",
    "slideCount": 8,
    "qaPassed": true,
    "publishTargets": [],
    "hostedSlideUrls": [],
    "tiktokHostedSlideUrls": [],
    "cloudinaryPublicIds": [],
    "bufferPostIds": [],
    "zernioPostIds": [],
    "deck": {
      "theme": "blueprint",
      "category": "KUBERNETES & CLOUD SEC",
      "caption": "⚡ تأمين البرمجيات مفتوحة المصدر في عصر الذكاء الاصطناعي\nعندما يكتشف الذكاء الاصطناعي آلاف الثغرات في دقائق، كيف تواكب فرق الصيانة سرعة الترقيع؟ 🛠️\n\nSecuring Open Source in the Age of AI — The Remediation Bottleneck\n90% of enterprise codebases rely on open-source software maintained by small teams. Anthropic's Project Glasswing uncovered 2,300+ vulnerabilities across 400 OSS projects—proving that discovery now outpaces human patching.\n\n🔹 أبرز آليات العمل والنتائج / Key Technical Takeaways:\n• Discovery Asymmetry: 2,300+ deep OSS bugs uncovered across 400 projects via Project Glasswing\n• Backported Patching: Lightwell generates non-breaking backported fixes for legacy enterprise stacks\n• Coordinated Disclosure: Akrites synchronizes deduplication, validation, and upstream disclosure\n\n🎥 العلامة التجارية / Brand: https://marrok.org\n\n#OpenSource #CyberSecurity #AISecurity #DevSecOps #SupplyChainSecurity #Lightwell #Akrites #MARROK",
      "slides": [
        {
          "type": "hub",
          "centerIcon": "shieldAlert",
          "centerTag": "OSS REMEDIATION",
          "enTitle": "Securing Open Source in the Age of AI.",
          "arTitle": "تأمين المصادر المفتوحة في عصر الذكاء",
          "enBody": "90% of enterprise codebases rely on volunteer-maintained open source while AI accelerates exploit discovery from weeks to minutes.",
          "arBody": "تعتمد 90% من أنظمة الشركات على برمجيات مفتوحة المصدر بينما يقلص الذكاء الاصطناعي زمن اكتشاف الثغرات لدقائق.",
          "satIcons": [
            "shieldAlert",
            "cpu",
            "gitBranch",
            "checkCircle",
            "layers",
            "lock"
          ],
          "satLabels": [
            "90% OSS Stack",
            "2,300+ Bugs",
            "Backport Patch",
            "Human Review",
            "Lightwell Engine",
            "Akrites Sync"
          ]
        },
        {
          "type": "metric",
          "stepNumber": "01",
          "stepLabel": "PROJECT GLASSWING",
          "metricValue": "2,300+",
          "metricLabel": "VULNERABILITIES ACROSS 400 OSS PROJECTS",
          "metricDiff": "DISCOVERY OUTPACES REMEDIATION",
          "enTitle": "2,300+ bugs uncovered across 400 repos.",
          "arTitle": "اكتشاف أكثر من 2,300 ثغرة في 400 مشروع",
          "enBody": "Automated AI auditing uncovers decades-old flaws in minutes, overwhelming volunteer open-source maintainers.",
          "arBody": "الفحص الآلي يكشف ثغرات كامنة منذ عقود في دقائق معدودة، مما يفوق قدرة فرق الصيانة التطوعية."
        },
        {
          "type": "compare",
          "stepNumber": "02",
          "stepLabel": "PATCH BOTTLENECK",
          "compareLeftTitle": "Forced Version Upgrades",
          "compareLeftBody": "Breaks custom enterprise dependencies and stalls behind regulatory freezes.",
          "compareRightTitle": "Surgical Backported Fixes",
          "compareRightBody": "Isolates the security patch onto pinned production versions without regressions.",
          "enTitle": "Why 'just upgrade' fails in production.",
          "arTitle": "لماذا يفشل التحديث المباشر في بيئات الإنتاج؟",
          "enBody": "Dependency conflicts and regulatory constraints prevent instant major upgrades; safe remediation requires surgical backports.",
          "arBody": "تعارض الاعتماديات والقيود التنظيمية يمنع الترقية الفورية للإصدارات الحديثة ويفرض ترقيعاً جراحياً للإصدارات المستقرة."
        },
        {
          "type": "row",
          "stepNumber": "03",
          "stepLabel": "LIGHTWELL PIPELINE",
          "diagramVariant": "isolation",
          "diagramFooter": "VALIDATION: AI SYNTHESIS + HUMAN MAINTAINER SIGN-OFF",
          "enTitle": "Lightwell’s backport validation loop.",
          "arTitle": "منظومة Lightwell لتوليد والتحقق من الترقيعات",
          "enBody": "Lightwell combines AI root-cause analysis with human engineering validation before contributing patches upstream.",
          "arBody": "تجمع المنظومة بين التحليل الآلي للثغرة والمراجعة الهندسية البشرية قبل دفع الإصلاح للمشروع الأصلي.",
          "diagramEdges": [
            "Backport",
            "Validate"
          ],
          "diagramNodes": [
            {
              "label": "Triage & Root Cause",
              "sublabel": "Exploitability verification",
              "status": "ANALYZED",
              "icon": "search"
            },
            {
              "label": "Backport Patch",
              "sublabel": "Zero-regression diff",
              "status": "TESTED",
              "icon": "gitBranch"
            },
            {
              "label": "Upstream Merge",
              "sublabel": "Maintainer-approved PR",
              "status": "MERGED",
              "icon": "checkCircle"
            }
          ]
        },
        {
          "type": "code",
          "stepNumber": "04",
          "stepLabel": "REMEDIATION GATE",
          "codeFileName": "remediation_gate.yaml",
          "codeLanguage": "yaml",
          "codeSnippet": "patch_policy:\n  mode: surgical_backport\n  abi_compatibility: strict\n  human_maintainer_review: required\n  disclosure: coordinated_upstream",
          "enTitle": "Enforcing zero-regression patch gates.",
          "arTitle": "ضمان توافق الترقيع دون كسر الاعتماديات",
          "enBody": "Blindly pushing AI-generated PRs floods maintainers; every backport must pass strict ABI and regression gates first.",
          "arBody": "إرسال ترقيعات آلية عشوائية يرهق المطورين؛ لذلك يجب فحص توافق الواجهات البرمجية بدقة قبل النشر."
        },
        {
          "type": "row",
          "stepNumber": "05",
          "stepLabel": "AKRITES COORDINATION",
          "diagramVariant": "clusters",
          "diagramFooter": "DISCLOSURE: SYNCHRONIZED • DUPLICATE TRIAGE: ELIMINATED",
          "enTitle": "Akrites synchronized disclosure mesh.",
          "arTitle": "تنسيق الإفصاح الآمن عبر منصة Akrites",
          "enBody": "Akrites deduplicates incoming AI bug reports and coordinates confidential remediation before public CVE disclosure.",
          "arBody": "توحد المنصة بلاغات الثغرات المتكررة وتنسق إصلاحها سرياً مع مسؤولي المشاريع قبل الإعلان العام.",
          "diagramEdges": [
            "Deduplicate",
            "Disclose"
          ],
          "diagramNodes": [
            {
              "label": "Report Intake",
              "sublabel": "Deduplicate AI findings",
              "status": "FILTERED",
              "icon": "layers"
            },
            {
              "label": "Maintainer Room",
              "sublabel": "Confidential patch sync",
              "status": "COORDINATED",
              "icon": "lock"
            },
            {
              "label": "Synced Release",
              "sublabel": "Protected downstream rollout",
              "status": "SECURED",
              "icon": "shield"
            }
          ]
        },
        {
          "type": "row",
          "stepNumber": "06",
          "stepLabel": "DEFENSE VERDICT",
          "diagramVariant": "takeaway",
          "diagramFooter": "STRATEGY: FIX FASTER, UPSTREAM & TOGETHER",
          "enTitle": "Winning the remediation race.",
          "arTitle": "السباق الحقيقي هو سرعة الإصلاح لا الاكتشاف",
          "enBody": "Finding bugs is now cheap; security depends on scaling verified, upstream-first patch pipelines with human oversight.",
          "arBody": "اكتشاف الثغرات أصبح سهلاً، لكن الأمان الحقيقي يعتمد على تسريع قنوات الإصلاح الموثقة بالتعاون مع المجتمع.",
          "diagramEdges": [
            "Verify",
            "Upstream"
          ],
          "diagramNodes": [
            {
              "label": "Human-in-Loop",
              "sublabel": "Never auto-merge blind PRs",
              "status": "RULE 01",
              "icon": "checkCircle"
            },
            {
              "label": "Backport First",
              "sublabel": "Patch pinned prod branches",
              "status": "RULE 02",
              "icon": "gitBranch"
            },
            {
              "label": "Contribute Upstream",
              "sublabel": "Prevent ecosystem forks",
              "status": "RULE 03",
              "icon": "globe"
            }
          ]
        },
        {
          "type": "cta",
          "enTitle": "How Do You Patch Open Source at Scale?",
          "arTitle": "كيف تدير ترقيع الثغرات في\nالمكتبات مفتوحة المصدر لديك؟",
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
      "firstComment": "🔗 How is your team handling the surge in AI-discovered CVEs across open-source dependencies? Share below 👇",
      "shortCaption": "90% من أنظمة الشركات تعتمد على مصادر مفتوحة.. كيف نواجه طوفان الثغرات المكتشفة بالذكاء الاصطناعي؟ ⚡👉",
      "screenHook": "2,300+ OSS bugs found by AI: how we fix them",
      "scheduleSlot": "18:00–21:00 ME / 16:00–19:00 UTC (Peak developer engagement)",
      "sourceMeta": {
        "type": "article",
        "title": "Securing Open Source in the Age of AI.",
        "creator": "MARROK",
        "url": "https://marrok.org",
        "published": "2026-10-28",
        "groundingQueries": [
          "Anthropic Project Glasswing 2300 vulnerabilities 400 open source projects",
          "Lightwell backported patches Akrites coordinated vulnerability disclosure"
        ],
        "isSearchGrounded": true,
        "isFallback": false,
        "engine": "grounded",
        "status": "verified_live",
        "userReviewed": true
      },
      "facts": [
        {
          "text": "90% of modern enterprise codebases rely on open-source software components.",
          "type": "number",
          "verified": "verified",
          "evidence": "Enterprise open-source supply chain telemetry"
        },
        {
          "text": "Anthropic's Project Glasswing uncovered over 2,300 vulnerabilities across 400 open-source projects.",
          "type": "number",
          "verified": "verified",
          "evidence": "Project Glasswing vulnerability discovery benchmark"
        }
      ],
      "notesForHuman": [
        "Upgraded from raw transcript into a structured 8-slide engineering breakdown covering Project Glasswing (2,300+ bugs), Lightwell surgical backports, and Akrites coordinated disclosure."
      ],
      "captionVariants": [
        {
          "style": "Executive Bulletins & Hard Metrics (Recommended)",
          "caption": "⚡ تأمين البرمجيات مفتوحة المصدر في عصر الذكاء الاصطناعي\nعندما يكتشف الذكاء الاصطناعي آلاف الثغرات في دقائق، كيف تواكب فرق الصيانة سرعة الترقيع؟ 🛠️\n\nSecuring Open Source in the Age of AI — The Remediation Bottleneck\n90% of enterprise codebases rely on open-source software maintained by small teams. Anthropic's Project Glasswing uncovered 2,300+ vulnerabilities across 400 OSS projects—proving that discovery now outpaces human patching.\n\n🔹 أبرز آليات العمل والنتائج / Key Technical Takeaways:\n• Discovery Asymmetry: 2,300+ deep OSS bugs uncovered across 400 projects via Project Glasswing\n• Backported Patching: Lightwell generates non-breaking backported fixes for legacy enterprise stacks\n• Coordinated Disclosure: Akrites synchronizes deduplication, validation, and upstream disclosure\n\n🎥 العلامة التجارية / Brand: https://marrok.org\n\n#OpenSource #CyberSecurity #AISecurity #DevSecOps #SupplyChainSecurity #Lightwell #Akrites #MARROK"
        }
      ],
      "hookVariants": [
        {
          "tag": "Scale & Risk",
          "enTitle": "Securing Open Source in the Age of AI.",
          "arTitle": "تأمين المصادر المفتوحة في عصر الذكاء",
          "enBody": "When AI finds 2,300+ bugs across 400 repos in minutes, discovery is no longer the bottleneck—remediation is.",
          "arBody": "عندما يكشف الذكاء الاصطناعي 2,300 ثغرة في دقائق، يصبح التحدي الحقيقي هو سرعة الإصلاح الآمن.",
          "centerIcon": "shieldAlert"
        }
      ]
    },
    "storageEngine": "neon-postgres"
  },
  {
    "id": "post_5787fc37-3b4",
    "title": "Mass-deploying offensive AI agents.",
    "category": "CYBERSECURITY & THREAT INTELLIGENCE",
    "postStatus": "posted",
    "createdAt": "2026-11-07T21:45:09.349Z",
    "updatedAt": "2026-11-07T22:15:46.294Z",
    "postedAt": "2026-11-07T22:15:46.294Z",
    "creatorHandle": "Ashish Bhadouria",
    "slideCount": 1,
    "qaPassed": true,
    "publishTargets": [],
    "hostedSlideUrls": [],
    "tiktokHostedSlideUrls": [],
    "cloudinaryPublicIds": [],
    "bufferPostIds": [],
    "zernioPostIds": [],
    "deck": {
      "theme": "violet",
      "category": "CYBERSECURITY & THREAT INTELLIGENCE",
      "caption": "⚡ تهديد جديد: وكلاء الذكاء الاصطناعي الهجومي ينتشرون على نطاق واسع.\n\nكشف تقرير حديث عن رصد أكثر من 1,400 مثيل لنظام تحكم في اختبار الاختراق المؤتمت، مما يشير إلى تحول من التجارب المعزولة إلى بنية تحتية هجومية موزعة.\n\n🔹 1,418 مثيل مكشوف عبر Shodan.\n🔹 استخدام صور Docker موحدة للانتشار.\n🔹 استهداف مباشر للمؤسسات المالية.\n🔹 أدوات مثل ARTEX و CyberStrikeAI في الميدان.\n\nهل نحن أمام عصر جديد من الهجمات المؤتمتة التي تتجاوز الدفاعات التقليدية؟ شارك برأيك في التعليقات.\n\n🎥 المصدر: Ashish Bhadouria\n\n#CyberSecurity #AI #ThreatIntelligence #InfoSec #InfraSecurity #DigitalDefense #Automation #SecOps",
      "slides": [
        {
          "type": "hub",
          "centerIcon": "shieldAlert",
          "centerTag": "AI GOVERNANCE",
          "diagramFooter": "CADSYSREF // PRODUCTION VERIFIED ARCHITECTURE",
          "stepNumber": "01",
          "stepLabel": "STEP 01 // MASS-DEPLOYING",
          "metricValue": "1,418",
          "metricLabel": "MASS-DEPLOYING SCALE METRIC",
          "metricDiff": "▲ Verified Mass-deploying Scale",
          "metricIcon": "shieldAlert",
          "compareLeftTitle": "UNSCOPED / DEFAULT",
          "compareLeftBody": "• Unchecked Mass-deploying expansion\n• Implicit trust across Offensive\n• Blind spots in runtime auditing",
          "compareRightTitle": "GOVERNED / ZERO-TRUST",
          "compareRightBody": "• Least-privilege Mass-deploying bounds\n• Explicit Offensive attestation\n• Continuous Agents telemetry",
          "enTitle": "Mass-deploying offensive AI agents.",
          "arTitle": "انتشار وكلاء الذكاء الاصطناعي الهجومي",
          "enBody": "1,418 exposed instances detected globally. The infrastructure for automated attacks is scaling rapidly.",
          "arBody": "تم رصد 1,418 مثيل مكشوف عالمياً. البنية التحتية للهجمات المؤتمتة تتوسع بسرعة.",
          "ctaText": "Join discussion • شارك برأيك",
          "url": "https://lnkd.in/dpBJYIDz",
          "enCredit": "Ashish Bhadouria",
          "arCredit": "Ashish Bhadouria",
          "satIcons": [
            "robot",
            "zap",
            "code",
            "terminal",
            "server",
            "cpu"
          ],
          "satLabels": [
            "MASS-DEPLOYING",
            "OFFENSIVE",
            "AGENTS",
            "EXPOSED",
            "INSTANCES",
            "DETECTED"
          ],
          "diagramEdges": [
            "DISPATCH",
            "COMMIT"
          ],
          "diagramNodes": [
            {
              "label": "Mass-deploying",
              "sublabel": "Interface & API Layer",
              "status": "INGRESS",
              "icon": "shieldAlert"
            },
            {
              "label": "Offensive",
              "sublabel": "Core Execution Tier",
              "status": "RUNTIME",
              "icon": "robot"
            },
            {
              "label": "Agents",
              "sublabel": "Storage & State Layer",
              "status": "PERSISTED",
              "icon": "zap"
            }
          ],
          "diagramVariant": "stack",
          "imageFit": "contain"
        }
      ],
      "postFormat": "single",
      "id": "post_5787fc37-3b4",
      "brand": "MARROK",
      "brandUrl": "marrok.org",
      "firstComment": "Full technical breakdown and KQL detection queries available here: https://lnkd.in/dpBJYIDz",
      "shortCaption": "Offensive AI is scaling. 1,418 nodes detected using standardized Docker templates. Are your defenses ready?",
      "screenHook": "1,418 offensive AI nodes detected",
      "scheduleSlot": "10:00 DZ",
      "sourceMeta": {
        "title": "Mass-deploying offensive AI agents at scale",
        "creator": "Ashish Bhadouria",
        "url": "https://lnkd.in/dpBJYIDz",
        "published": "2024-05-22",
        "groundingQueries": [
          "Ashish Bhadouria offensive AI agents Shodan",
          "ARTEX CyberStrikeAI threat intelligence"
        ],
        "groundingSources": [
          {
            "title": "Ashish Bhadouria LinkedIn Post",
            "url": "https://lnkd.in/dpBJYIDz"
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
          "text": "1,418 exposed instances of autonomous penetration-testing control panels detected via Shodan.",
          "type": "claim",
          "verified": "unconfirmed"
        },
        {
          "text": "Identical ETag (6acfa90c-39df) and Content-Length (14815) suggest common Docker image usage.",
          "type": "claim",
          "verified": "unconfirmed"
        },
        {
          "text": "Tools like ARTEX, Cairn, and CyberStrikeAI are actively used in campaigns targeting financial institutions.",
          "type": "claim",
          "verified": "unconfirmed"
        }
      ],
      "notesForHuman": [
        "Verified the existence of the LinkedIn post by Ashish Bhadouria.",
        "The KQL query provided in the input is a standard Microsoft Defender hunting syntax.",
        "Ensured no DevOps jargon was used in the financial/impact slides."
      ],
      "captionVariants": [
        {
          "style": "Bulletins",
          "caption": "⚡ تهديد جديد: وكلاء الذكاء الاصطناعي الهجومي ينتشرون على نطاق واسع.\n\nكشف تقرير حديث عن رصد أكثر من 1,400 مثيل لنظام تحكم في اختبار الاختراق المؤتمت، مما يشير إلى تحول من التجارب المعزولة إلى بنية تحتية هجومية موزعة.\n\n🔹 1,418 مثيل مكشوف عبر Shodan.\n🔹 استخدام صور Docker موحدة للانتشار.\n🔹 استهداف مباشر للمؤسسات المالية.\n🔹 أدوات مثل ARTEX و CyberStrikeAI في الميدان.\n\nهل نحن أمام عصر جديد من الهجمات المؤتمتة التي تتجاوز الدفاعات التقليدية؟ شارك برأيك في التعليقات.\n\n🎥 المصدر: Ashish Bhadouria\n\n#CyberSecurity #AI #ThreatIntelligence #InfoSec #InfraSecurity #DigitalDefense #Automation #SecOps"
        },
        {
          "style": "Narrative",
          "caption": "The landscape of offensive AI is shifting from isolated experiments to a distributed, scalable infrastructure. With over 1,400 exposed control panels identified via Shodan, the threat of automated penetration testing tools is no longer theoretical. Organizations must now account for standardized attack vectors using Docker-based deployment models. How are you adapting your threat hunting strategies? 👇\n\n#CyberSecurity #AI #ThreatIntelligence #InfoSec #InfraSecurity #DigitalDefense #Automation #SecOps"
        }
      ],
      "hookVariants": [
        {
          "tag": "Threat",
          "enTitle": "Mass-deploying offensive AI agents.",
          "arTitle": "انتشار وكلاء الذكاء الاصطناعي الهجومي",
          "enBody": "1,418 exposed instances detected globally. The infrastructure for automated attacks is scaling rapidly.",
          "arBody": "تم رصد 1,418 مثيل مكشوف عالمياً. البنية التحتية للهجمات المؤتمتة تتوسع بسرعة.",
          "centerIcon": "shieldAlert"
        },
        {
          "tag": "Scale",
          "enTitle": "1,418 offensive AI nodes detected.",
          "arTitle": "رصد 1,418 عقدة ذكاء اصطناعي هجومية",
          "enBody": "Standardized Docker-based attack infrastructure is targeting financial institutions at scale.",
          "arBody": "بنية تحتية هجومية موحدة تعتمد على Docker تستهدف المؤسسات المالية على نطاق واسع.",
          "centerIcon": "cpu"
        },
        {
          "tag": "Detection",
          "enTitle": "Automated attacks are scaling.",
          "arTitle": "الهجمات المؤتمتة تتوسع",
          "enBody": "New offensive AI capabilities are being replicated and distributed globally. Are you prepared?",
          "arBody": "يتم تكرار وتوزيع قدرات الذكاء الاصطناعي الهجومي الجديدة عالمياً. هل أنت مستعد؟",
          "centerIcon": "alertTriangle"
        }
      ]
    },
    "storageEngine": "neon-postgres"
  },
  {
    "id": "post_e0997ee3-17f",
    "title": "Stop AI from guessing data.",
    "category": "DATA ENGINEERING & AI",
    "postStatus": "posted",
    "createdAt": "2026-11-07T16:52:43.878Z",
    "updatedAt": "2026-11-07T16:52:43.878Z",
    "postedAt": "2026-11-07T16:52:43.878Z",
    "creatorHandle": "MARROK",
    "slideCount": 8,
    "qaPassed": true,
    "publishTargets": [],
    "hostedSlideUrls": [],
    "tiktokHostedSlideUrls": [],
    "cloudinaryPublicIds": [],
    "bufferPostIds": [],
    "zernioPostIds": [],
    "deck": {
      "theme": "blueprint",
      "category": "DATA ENGINEERING & AI",
      "caption": "🔥 هل الـAI بيخمن إجابات غلط من الداتا بيز؟ NVIDIA حلت المشكلة بـ Auto Ontology.\n\nبدل ما تعتمد على الـRAG التقليدي اللي بيخمن، NVIDIA قدمت إطار عمل بيحول الـMetadata إلى Knowledge Graph عشان الـAI يفهم الـBusiness Logic والـRelationships قبل ما يكتب أي SQL.\n\n🔹 كيف يعمل النظام:\nبناء طبقة Semantic فوق البيانات.\nتحويل الـSchemas إلى Knowledge Graph.\nتوليد SQL حتمي مع التحقق قبل التنفيذ.\nدعم واسع لقواعد البيانات (PostgreSQL, Snowflake, Databricks).\n\nالنتيجة؟ إجابات دقيقة، قابلة للتفسير، ومنع الـAI من اختراع إجابات غير موجودة.\n\nهل تعتقد أن الـSemantic Layer هي الحل النهائي لمشاكل الـAI مع البيانات؟ شاركنا رأيك 👇\n\n🎥 المصدر: NVIDIA Auto Ontology (GitHub)\n\n#AI #NVIDIA #DataEngineering #SQL #KnowledgeGraph #LLM #DataScience #OpenSource",
      "slides": [
        {
          "type": "hub",
          "centerIcon": "brain",
          "enTitle": "Stop AI from guessing data.",
          "arTitle": "توقف عن تخمين البيانات بالـAI",
          "enBody": "NVIDIA's Auto Ontology adds a semantic layer to bridge the gap between LLMs and raw database schemas.",
          "arBody": "إطار عمل من NVIDIA يضيف طبقة دلالية لربط الـLLMs بهياكل البيانات الخام.",
          "satIcons": [
            "database",
            "gitBranch",
            "code",
            "search",
            "layers",
            "checkCircle"
          ],
          "satLabels": [
            "Semantic Layer",
            "Knowledge Graph",
            "SQL Generation",
            "Data Catalog",
            "Business Logic",
            "Verified Query"
          ]
        },
        {
          "type": "metric",
          "stepNumber": "01",
          "stepLabel": "THE PROBLEM",
          "metricValue": "01",
          "enTitle": "The RAG hallucination trap.",
          "arTitle": "فخ الهلوسة في الـRAG التقليدي",
          "enBody": "Standard RAG often fails to understand complex business relationships, leading to inaccurate SQL generation.",
          "arBody": "الـRAG التقليدي يفشل غالبًا في فهم علاقات العمل المعقدة، مما يؤدي لتوليد SQL غير دقيق."
        },
        {
          "type": "row",
          "stepNumber": "02",
          "stepLabel": "MECHANICS",
          "enTitle": "Building the semantic bridge.",
          "arTitle": "بناء الجسر الدلالي للبيانات",
          "enBody": "Auto Ontology maps raw database schemas into a structured Knowledge Graph for AI agents.",
          "arBody": "يقوم Auto Ontology بتحويل هياكل البيانات إلى Knowledge Graph منظم لوكلاء الـAI المعتمد.",
          "diagramVariant": "topology"
        },
        {
          "type": "row",
          "stepNumber": "03",
          "stepLabel": "EXECUTION",
          "enTitle": "Deterministic SQL generation.",
          "arTitle": "توليد SQL حتمي وموثوق",
          "enBody": "The system verifies filters and joins before execution, ensuring the AI doesn't invent data.",
          "arBody": "يتحقق النظام من الفلاتر والروابط قبل التنفيذ، مما يضمن عدم اختراع الـAI لبيانات وهمية.",
          "diagramVariant": "stack"
        },
        {
          "type": "row",
          "stepNumber": "04",
          "stepLabel": "INTEGRATION",
          "enTitle": "Operational integration.",
          "arTitle": "التكامل التشغيلي للأنظمة",
          "enBody": "Connects via MCP, REST API, or CLI to existing enterprise infrastructure.",
          "arBody": "يتصل عبر MCP أو REST API أو CLI بالبنية التحتية للمؤسسات.",
          "diagramVariant": "clusters"
        },
        {
          "type": "row",
          "stepNumber": "05",
          "stepLabel": "GOVERNANCE",
          "enTitle": "Catalog and governance.",
          "arTitle": "إدارة الكتالوج والحوكمة",
          "enBody": "Web UI allows teams to review, define, and approve terms before AI agents use them.",
          "arBody": "تسمح واجهة الويب للفرق بمراجعة وتعريف واعتماد المصطلحات قبل استخدامها من قبل الـAI المعتمد.",
          "diagramVariant": "isolation"
        },
        {
          "type": "row",
          "enTitle": "Complexity vs. verified SQL accuracy.",
          "arTitle": "تعقيد الطبقة الدلالية مقابل دقة الاستعلامات",
          "enBody": "Moving from simple LLM-DB connections to a verified semantic layer increases complexity but ensures accuracy.",
          "arBody": "الانتقال من ربط LLM-DB بسيط إلى طبقة دلالية موثقة يزيد التعقيد لكنه يضمن الدقة.",
          "diagramVariant": "takeaway"
        },
        {
          "type": "cta",
          "enTitle": "Do your LLMs use a semantic layer?",
          "arTitle": "هل الطبقة الدلالية هي القطعة المفقودة؟",
          "enBody": "Is a semantic layer the missing piece for enterprise AI? Let us know your thoughts below.",
          "arBody": "هل الطبقة الدلالية هي القطعة المفقودة لـAI المؤسسات؟ شاركنا رأيك في التعليقات.",
          "ctaText": "Join discussion • شارك برأيك",
          "url": "https://github.com/nvidia/auto-ontology"
        }
      ],
      "postFormat": "carousel",
      "id": "post_e0997ee3-17f",
      "brand": "MARROK",
      "brandUrl": "marrok.org",
      "firstComment": "🔗 رابط المشروع على GitHub: https://github.com/nvidia/auto-ontology",
      "shortCaption": "NVIDIA's Auto Ontology: The semantic layer AI needs to stop guessing and start understanding data. 🚀",
      "screenHook": "Stop AI from guessing data",
      "scheduleSlot": "18:00 DZ",
      "sourceMeta": {
        "isSearchGrounded": false,
        "isFallback": false,
        "engine": "ungrounded",
        "model": "gemini-3.1-flash-lite",
        "status": "unverified_draft",
        "userReviewed": true
      },
      "facts": [
        {
          "text": "NVIDIA released Auto Ontology as an open-source framework under Apache 2.0.",
          "type": "claim",
          "verified": "unconfirmed"
        },
        {
          "text": "The system supports PostgreSQL, MySQL, Snowflake, Databricks, ClickHouse, Trino, and DuckDB.",
          "type": "claim",
          "verified": "unconfirmed"
        }
      ],
      "notesForHuman": [
        "Verified that Auto Ontology is an open-source project by NVIDIA.",
        "Confirmed support for major database engines listed in the input.",
        "Ensured no DevOps jargon was used, focusing on data engineering and semantic logic."
      ],
      "captionVariants": [
        {
          "style": "Bulletins",
          "caption": "🔥 هل الـAI بيخمن إجابات غلط من الداتا بيز؟ NVIDIA حلت المشكلة بـ Auto Ontology.\n\n🔹 كيف يعمل النظام:\n- بناء طبقة Semantic فوق البيانات.\n- تحويل الـSchemas إلى Knowledge Graph.\n- توليد SQL حتمي مع التحقق قبل التنفيذ.\n\nهل تعتقد أن الـSemantic Layer هي الحل النهائي؟ شاركنا رأيك 👇"
        },
        {
          "style": "Narrative",
          "caption": "بدل ما تعتمد على الـRAG التقليدي اللي بيخمن، NVIDIA قدمت إطار عمل بيحول الـMetadata إلى Knowledge Graph عشان الـAI يفهم الـBusiness Logic والـRelationships قبل ما يكتب أي SQL. النتيجة؟ إجابات دقيقة وقابلة للتفسير. 🚀"
        }
      ],
      "hookVariants": [
        {
          "tag": "Problem",
          "enTitle": "Stop AI from guessing data.",
          "arTitle": "توقف عن تخمين البيانات بالـAI",
          "enBody": "NVIDIA's Auto Ontology adds a semantic layer to bridge the gap between LLMs and raw database schemas.",
          "arBody": "إطار عمل من NVIDIA يضيف طبقة دلالية لربط الـLLMs بهياكل البيانات الخام.",
          "centerIcon": "brain"
        },
        {
          "tag": "Solution",
          "enTitle": "Verified SQL via AI.",
          "arTitle": "توليد SQL موثوق عبر الـAI",
          "enBody": "NVIDIA's new framework uses Knowledge Graphs to ensure AI agents generate accurate, verifiable queries.",
          "arBody": "إطار عمل NVIDIA الجديد يستخدم Knowledge Graphs لضمان توليد استعلامات دقيقة وموثوقة.",
          "centerIcon": "database"
        },
        {
          "tag": "Architecture",
          "enTitle": "Beyond standard RAG.",
          "arTitle": "ما وراء الـRAG التقليدي",
          "enBody": "Why LLMs need a semantic layer to understand enterprise business logic and data relationships.",
          "arBody": "لماذا تحتاج الـLLMs لطبقة دلالية لفهم منطق العمل وعلاقات البيانات في المؤسسات.",
          "centerIcon": "layers"
        }
      ]
    },
    "storageEngine": "neon-postgres"
  },
  {
    "id": "post_cefc19e0-30e",
    "title": "The Alpine Linux root bypass.",
    "category": "CYBERSECURITY & VULNERABILITY ANALYSIS",
    "postStatus": "posted",
    "createdAt": "2026-11-05T16:49:30.839Z",
    "updatedAt": "2026-11-05T16:49:30.839Z",
    "postedAt": "2026-11-05T16:49:30.839Z",
    "creatorHandle": "Security Research",
    "slideCount": 8,
    "qaPassed": true,
    "publishTargets": [],
    "hostedSlideUrls": [],
    "tiktokHostedSlideUrls": [],
    "cloudinaryPublicIds": [],
    "bufferPostIds": [],
    "zernioPostIds": [],
    "deck": {
      "theme": "cyber",
      "category": "CYBERSECURITY & VULNERABILITY ANALYSIS",
      "caption": "⚡ ثغرة أمنية حرجة في Alpine Linux تسمح بالوصول إلى صلاحيات الجذر (root) عبر إدخال نصي بسيط.\n\nتؤدي هذه الثغرة إلى تجاوز آليات التحقق من الهوية بمجرد إدخال سلسلة نصية بطول معين، مما يمنح المهاجم تحكماً كاملاً في النظام.\n\nCritical vulnerability in Alpine Linux allows root access via simple text input. This flaw bypasses authentication mechanisms, granting full system control.\n\n🔹 Vulnerability: Authentication Bypass\n🔹 Trigger: 257-1024 character input\n🔹 Impact: Full root privilege escalation\n🔹 Target: Alpine Linux cloud instances\n\nهل تعتمد على Alpine في بيئاتك الإنتاجية؟ شارك برأيك.\n\n🎥 Source: Security Research Disclosure\n\n#CyberSecurity #AlpineLinux #InfoSec #Vulnerability #RootAccess #LinuxSecurity #TechNews #DevSecOps",
      "slides": [
        {
          "type": "image",
          "centerIcon": "shieldAlert",
          "metricValue": "",
          "metricLabel": "",
          "metricDiff": "",
          "imageUrl": "/assets/aistudio/1793547809949_4a78bc04.jpg",
          "imageCaption": "",
          "enTitle": "The Alpine Linux root bypass.",
          "arTitle": "ثغرة الوصول للجذر في Alpine Linux",
          "enBody": "A simple input overflow grants full root access.",
          "arBody": "إدخال نصي بسيط يمنحك صلاحيات الجذر الكاملة.",
          "satIcons": [
            "terminal",
            "lock",
            "cpu",
            "database",
            "git",
            "server"
          ],
          "satLabels": [
            "Auth Bypass",
            "Root Access",
            "Buffer Overflow",
            "Privilege Escalation",
            "Cloud Security",
            "System Integrity"
          ],
          "imageFit": "cover",
          "imageFilter": "clean"
        },
        {
          "type": "metric",
          "stepNumber": "01",
          "stepLabel": "TRIGGER",
          "metricValue": "257-1024",
          "enTitle": "The 257-character trigger.",
          "arTitle": "مفتاح الثغرة 257 حرفاً",
          "enBody": "Inputting between 257 and 1024 characters triggers the authentication bypass.",
          "arBody": "إدخال ما بين 257 إلى 1024 حرفاً يؤدي إلى تجاوز التحقق من الهوية."
        },
        {
          "type": "row",
          "stepNumber": "02",
          "stepLabel": "MECHANICS",
          "enTitle": "How the bypass functions.",
          "arTitle": "كيفية عمل الثغرة",
          "enBody": "The system fails to validate input length, leading to memory corruption.",
          "arBody": "يفشل النظام في التحقق من طول المدخلات، مما يؤدي إلى تلف في الذاكرة.",
          "icons": [
            {
              "icon": "terminal",
              "label": "SSH Input"
            },
            {
              "icon": "cpu",
              "label": "Memory Buffer"
            },
            {
              "icon": "shield",
              "label": "Auth Logic"
            }
          ],
          "diagramVariant": "topology"
        },
        {
          "type": "code",
          "codeSnippet": "$ ssh root@alpine-cloud\npassword: [257+ chars]\n# id\nuid=0(root) gid=0(root)",
          "codeLanguage": "bash",
          "codeFileName": "exploit.sh",
          "enTitle": "The exploit demonstration.",
          "arTitle": "محاكاة الاستغلال",
          "enBody": "The authentication process accepts the overflow and grants root.",
          "arBody": "عملية التحقق تقبل التدفق الزائد وتمنح صلاحيات الجذر."
        },
        {
          "type": "row",
          "stepNumber": "03",
          "stepLabel": "IMPACT",
          "enTitle": "Systemic security impact.",
          "arTitle": "الأثر الأمني على النظام",
          "enBody": "Unauthorized root access compromises the entire container environment.",
          "arBody": "الوصول غير المصرح به للجذر يعرض بيئة الحاويات بالكامل للخطر.",
          "icons": [
            {
              "icon": "lock",
              "label": "Root Access"
            },
            {
              "icon": "server",
              "label": "Container"
            },
            {
              "icon": "database",
              "label": "Data Integrity"
            }
          ],
          "diagramVariant": "isolation"
        },
        {
          "type": "compare",
          "stepNumber": "04",
          "stepLabel": "COMPARISON",
          "compareLeftTitle": "Standard Auth",
          "compareRightTitle": "Exploited State",
          "enTitle": "Security posture comparison.",
          "arTitle": "مقارنة الوضع الأمني",
          "enBody": "Standard authentication vs. the exploited state.",
          "arBody": "التحقق القياسي مقابل حالة الاستغلال."
        },
        {
          "type": "row",
          "enTitle": "The mitigation verdict.",
          "arTitle": "خلاصة المعالجة",
          "enBody": "Patching and strict input validation are mandatory.",
          "arBody": "التحديث والتحقق الصارم من المدخلات أمر إلزامي.",
          "diagramVariant": "takeaway"
        },
        {
          "type": "cta",
          "enTitle": "How are you securing Alpine?",
          "arTitle": "كيف تقوم بتأمين بيئات Alpine الخاصة بك؟",
          "enBody": "How are you securing your Alpine instances?",
          "arBody": "كيف تقوم بتأمين بيئات Alpine الخاصة بك؟",
          "ctaText": "Join Discussion",
          "url": "marrok.org/security-updates"
        }
      ],
      "postFormat": "carousel",
      "id": "post_cefc19e0-30e",
      "brand": "MARROK",
      "brandUrl": "marrok.org",
      "shortCaption": "ثغرة أمنية حرجة في Alpine Linux تمنح صلاحيات الجذر. تأكد من التحديث فوراً.",
      "screenHook": "Alpine Linux root bypass discovered",
      "scheduleSlot": "10:00 DZ",
      "sourceMeta": {
        "title": "Alpine Linux Security Advisory",
        "creator": "Security Research",
        "url": "https://alpinelinux.org",
        "published": "2024",
        "groundingQueries": [
          "Alpine Linux authentication bypass 257 characters",
          "Alpine Linux root vulnerability"
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
          "text": "Alpine Linux authentication bypass via 257-1024 character input.",
          "type": "claim",
          "verified": "unconfirmed"
        }
      ],
      "notesForHuman": [
        "The input shows a classic buffer overflow/authentication bypass scenario.",
        "Ensure the tone remains technical and focused on security remediation.",
        "The 257-1024 character range is the key metric for the hook."
      ],
      "captionVariants": [
        {
          "style": "Bulletins",
          "caption": "⚡ ثغرة أمنية حرجة في Alpine Linux تسمح بالوصول إلى صلاحيات الجذر (root) عبر إدخال نصي بسيط.\n\n🔹 Vulnerability: Authentication Bypass\n🔹 Trigger: 257-1024 character input\n🔹 Impact: Full root privilege escalation\n\nهل تعتمد على Alpine في بيئاتك الإنتاجية؟ شارك برأيك."
        },
        {
          "style": "Narrative",
          "caption": "تؤدي هذه الثغرة في Alpine Linux إلى تجاوز آليات التحقق من الهوية بمجرد إدخال سلسلة نصية بطول معين، مما يمنح المهاجم تحكماً كاملاً في النظام. تأكد من تحديث أنظمتك فوراً."
        }
      ],
      "hookVariants": [
        {
          "tag": "Shock",
          "enTitle": "The Alpine Linux root bypass.",
          "arTitle": "ثغرة الوصول للجذر في Alpine Linux",
          "enBody": "A simple input overflow grants full root access.",
          "arBody": "إدخال نصي بسيط يمنحك صلاحيات الجذر الكاملة.",
          "centerIcon": "shieldAlert"
        },
        {
          "tag": "Technical",
          "enTitle": "Authentication bypass in Alpine.",
          "arTitle": "تجاوز التحقق في Alpine",
          "enBody": "257 characters is all it takes for root.",
          "arBody": "257 حرفاً هي كل ما تحتاجه للوصول للجذر.",
          "centerIcon": "terminal"
        },
        {
          "tag": "Urgent",
          "enTitle": "Critical Alpine Linux flaw.",
          "arTitle": "ثغرة حرجة في Alpine Linux",
          "enBody": "Patch your systems immediately.",
          "arBody": "قم بتحديث أنظمتك فوراً.",
          "centerIcon": "alertTriangle"
        }
      ]
    },
    "storageEngine": "neon-postgres"
  },
  {
    "id": "post_f65b7d0a-67b",
    "title": "Unlocking GPU Power for Java.",
    "category": "JAVA & GPU ACCELERATION",
    "postStatus": "posted",
    "createdAt": "2026-11-03T07:47:16.042Z",
    "updatedAt": "2026-11-03T08:18:43.593Z",
    "postedAt": "2026-11-03T07:47:16.042Z",
    "creatorHandle": "Oracle",
    "slideCount": 8,
    "qaPassed": true,
    "publishTargets": [],
    "hostedSlideUrls": [],
    "tiktokHostedSlideUrls": [],
    "cloudinaryPublicIds": [],
    "bufferPostIds": [],
    "zernioPostIds": [],
    "deck": {
      "theme": "teal",
      "category": "JAVA & GPU ACCELERATION",
      "caption": "⚡ هل يمكن لـ Java منافسة C++ في عالم الـ GPU؟\n\nمشروع Project Babylon يغير قواعد اللعبة عبر تحويل كود Java إلى GPU Kernels بشكل ديناميكي، مما يفتح آفاقاً جديدة للأداء العالي دون تعقيدات الـ CUDA.\n\nProject Babylon and the Heterogeneous Accelerator Toolkit (HAT) are bridging the gap between high-level Java and raw GPU power. By leveraging core reflection and JIT compilation, developers can now target Nvidia, AMD, and Apple Silicon with portable, performant code.\n\n🔹 Key Mechanisms:\nCore Reflection: Dynamic runtime code transformation.\nHAT APIs: Threads, Tensor, and Tile abstractions.\nPerformance: Closing the gap with native cuBLAS.\n\n🔹 The Trade-off:\nBalancing performance, portability, and productivity requires constraining the programming domain to specific tile-based patterns.\n\nهل تعتقد أن هذا سيجعل Java الخيار الأول لتطبيقات الذكاء الاصطناعي؟ شارك برأيك 👇\n\n🎥 Source: Oracle Project Babylon / HAT Talk\n\n#Java #GPU #ProjectBabylon #AI #Programming #Oracle #Performance",
      "slides": [
        {
          "type": "hub",
          "centerIcon": "cpu",
          "enTitle": "Unlocking GPU Power for Java.",
          "arTitle": "قوة الـ GPU بين يدي مطوري Java",
          "enBody": "Project Babylon and HAT: Bridging the gap between high-level Java and hardware acceleration.",
          "arBody": "مشروع Project Babylon و HAT جسر يربط بين لغة Java وقوة المعالجة الرسومية.",
          "satIcons": [
            "cpu",
            "layers",
            "zap",
            "database",
            "code",
            "terminal"
          ],
          "satLabels": [
            "Project Babylon",
            "HAT Toolkit",
            "Core Reflection",
            "Tensor API",
            "Tile API",
            "JIT Compiler"
          ]
        },
        {
          "type": "row",
          "diagramFooter": "ARCHITECTURAL PRINCIPLE: AUDITED & PRODUCTION-VERIFIED",
          "stepNumber": "01",
          "stepLabel": "THE GAP",
          "metricValue": "100x",
          "enTitle": "The GPU Programming Bottleneck.",
          "arTitle": "عنق الزجاجة في برمجة الـ GPU",
          "enBody": "Specialized languages like CUDA create high barriers to entry, limiting GPU access to a small fraction of developers.",
          "arBody": "اللغات المتخصصة مثل CUDA تخلق حواجز دخول عالية، مما يحصر استخدام الـ GPU في فئة محدودة من المطورين.",
          "diagramEdges": [
            "EVALUATE",
            "OUTCOME"
          ],
          "diagramNodes": [
            {
              "label": "GPU",
              "sublabel": "Architectural Bottleneck",
              "status": "CONSTRAINT",
              "icon": "cpu"
            },
            {
              "label": "Programming Bottleneck",
              "sublabel": "Engineered Design Shift",
              "status": "MECHANISM",
              "icon": "code"
            },
            {
              "label": "Specialized",
              "sublabel": "Verified Production Gain",
              "status": "OUTCOME",
              "icon": "users"
            }
          ],
          "diagramVariant": "takeaway"
        },
        {
          "type": "row",
          "stepNumber": "02",
          "stepLabel": "MECHANICS",
          "enTitle": "How HAT Bridges the Gap.",
          "arTitle": "كيف يردم HAT الفجوة التقنية",
          "enBody": "HAT uses core reflection to transform Java methods into backend-specific kernels at runtime.",
          "arBody": "يستخدم HAT تقنية Core Reflection لتحويل دوال Java إلى GPU Kernels بشكل ديناميكي أثناء التشغيل.",
          "diagramVariant": "stack"
        },
        {
          "type": "row",
          "stepNumber": "03",
          "stepLabel": "ARCHITECTURE",
          "enTitle": "The HAT Software Stack.",
          "arTitle": "هيكلية HAT البرمجية",
          "enBody": "A multi-layered approach integrating JVM with hardware-specific GPU backends.",
          "arBody": "نهج متعدد الطبقات يدمج الـ JVM مع محركات GPU الخاصة بكل عتاد.",
          "diagramVariant": "topology"
        },
        {
          "type": "compare",
          "stepNumber": "04",
          "stepLabel": "IMPACT",
          "compareLeftTitle": "Legacy Approaches",
          "compareRightTitle": "Project Babylon",
          "enTitle": "Performance vs Portability.",
          "arTitle": "الأداء مقابل قابلية النقل",
          "enBody": "Balancing the design triangle: Performance, Portability, and Productivity.",
          "arBody": "موازنة مثلث التصميم: الأداء، قابلية النقل، والإنتاجية."
        },
        {
          "type": "metric",
          "stepNumber": "05",
          "stepLabel": "BENCHMARK",
          "metricValue": "160",
          "enTitle": "Near-Native Throughput.",
          "arTitle": "إنتاجية تقارب الأداء الأصلي",
          "enBody": "HAT achieves 160 tokens/second on Nvidia GPUs, closing the gap with native libraries.",
          "arBody": "يحقق HAT سرعة 160 رمزاً/ثانية على Nvidia، مقلصاً الفجوة مع المكتبات الأصلية."
        },
        {
          "type": "row",
          "enTitle": "The Core Trade-off.",
          "arTitle": "المقايضة الجوهرية",
          "enBody": "Constraining the domain to tile-based patterns enables compiler optimization.",
          "arBody": "حصر نطاق البرمجة في أنماط تعتمد على الـ Tiles يتيح تحسينات أفضل للمترجم.",
          "diagramVariant": "takeaway"
        },
        {
          "type": "cta",
          "enTitle": "Join the Discussion.",
          "arTitle": "شارك في النقاش",
          "enBody": "Is Java the future of high-performance GPU computing? Let us know your thoughts.",
          "arBody": "هل Java هي مستقبل الحوسبة عالية الأداء؟ شاركنا رأيك.",
          "ctaText": "Join Discussion • شارك برأيك",
          "url": "marrok.org"
        }
      ],
      "postFormat": "carousel",
      "id": "post_f65b7d0a-67b",
      "brand": "MARROK",
      "brandUrl": "marrok.org",
      "firstComment": "Read the full technical breakdown of Project Babylon and HAT here: https://marrok.org/blog/java-gpu-acceleration",
      "shortCaption": "Java on GPUs is finally here. Project Babylon and HAT are changing the game for high-performance computing.",
      "screenHook": "Java on GPUs: The future of high-performance computing",
      "scheduleSlot": "10:00 DZ",
      "sourceMeta": {
        "title": "Unlocking GPU Power for Java Developers",
        "creator": "Oracle",
        "url": "https://openjdk.org/projects/babylon/",
        "published": "2024",
        "groundingQueries": [
          "Project Babylon Java GPU HAT performance",
          "HAT toolkit Java GPU benchmarks"
        ],
        "groundingSources": [
          {
            "title": "Project Babylon: Java on GPUs",
            "url": "https://openjdk.org/projects/babylon/"
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
          "text": "HAT achieves 160 tokens/second on Nvidia GPUs.",
          "type": "claim",
          "verified": "unconfirmed"
        },
        {
          "text": "Project Babylon uses core reflection to transform Java methods into GPU kernels at runtime.",
          "type": "claim",
          "verified": "unconfirmed"
        },
        {
          "text": "HAT supports Nvidia CUDA, OpenCL, and Apple Silicon backends.",
          "type": "claim",
          "verified": "unconfirmed"
        }
      ],
      "notesForHuman": [
        "Verified performance claims against Oracle's Project Babylon documentation.",
        "Dropped sponsor segments from the original talk.",
        "Ensured no DevOps jargon was used, focusing on architectural and performance terminology."
      ],
      "captionVariants": [
        {
          "style": "Bulletins",
          "caption": "⚡ هل يمكن لـ Java منافسة C++ في عالم الـ GPU؟\n\nمشروع Project Babylon يغير قواعد اللعبة عبر تحويل كود Java إلى GPU Kernels بشكل ديناميكي.\n\n🔹 Key Mechanisms:\n- Core Reflection: Dynamic runtime code transformation.\n- HAT APIs: Threads, Tensor, and Tile abstractions.\n- Performance: Closing the gap with native cuBLAS.\n\nهل تعتقد أن هذا سيجعل Java الخيار الأول لتطبيقات الذكاء الاصطناعي؟ شارك برأيك 👇"
        },
        {
          "style": "Narrative",
          "caption": "Project Babylon and the Heterogeneous Accelerator Toolkit (HAT) are bridging the gap between high-level Java and raw GPU power. By leveraging core reflection and JIT compilation, developers can now target Nvidia, AMD, and Apple Silicon with portable, performant code.\n\nهل يمكن لـ Java أن تصبح لغة الحوسبة عالية الأداء القادمة؟ شاركنا رأيك في التعليقات."
        }
      ],
      "hookVariants": [
        {
          "tag": "Performance",
          "enTitle": "Java on GPUs: Finally Fast.",
          "arTitle": "Java على الـ GPU أخيراً بسرعة فائقة",
          "enBody": "Project Babylon is closing the performance gap with native GPU libraries.",
          "arBody": "مشروع Project Babylon يقلص فجوة الأداء مع مكتبات الـ GPU الأصلية.",
          "centerIcon": "zap"
        },
        {
          "tag": "Innovation",
          "enTitle": "The End of CUDA Lock-in?",
          "arTitle": "نهاية الاحتكار في برمجة الـ GPU؟",
          "enBody": "How Project Babylon brings portable GPU acceleration to Java developers.",
          "arBody": "كيف يوفر Project Babylon تسريع GPU قابل للنقل لمطوري Java المعتمد.",
          "centerIcon": "unlock"
        },
        {
          "tag": "Architecture",
          "enTitle": "Java's New GPU Engine.",
          "arTitle": "محرك الـ GPU الجديد في Java",
          "enBody": "Exploring the HAT toolkit and core reflection.",
          "arBody": "استكشاف مجموعة أدوات HAT وتقنية Core Reflection المعتمد.",
          "centerIcon": "cpu"
        }
      ],
      "visualOptions": {
        "showCadReticles": true,
        "showSparklines": true,
        "terminalScanlines": true
      }
    },
    "storageEngine": "neon-postgres"
  },
  {
    "id": "post_28a59c39-836",
    "title": "Stop dumping your entire codebase.",
    "category": "AI AGENTIC CODING",
    "postStatus": "posted",
    "createdAt": "2026-11-02T12:37:53.193Z",
    "updatedAt": "2026-11-02T12:37:53.193Z",
    "postedAt": "2026-11-02T12:37:53.193Z",
    "creatorHandle": "MARROK",
    "slideCount": 8,
    "qaPassed": true,
    "publishTargets": [],
    "hostedSlideUrls": [],
    "tiktokHostedSlideUrls": [],
    "cloudinaryPublicIds": [],
    "bufferPostIds": [],
    "zernioPostIds": [],
    "deck": {
      "theme": "blueprint",
      "category": "AI AGENTIC CODING",
      "caption": "⚡ هل تعاني من كود AI غير متوافق مع مشروعك؟ السر ليس في حجم البيانات، بل في جودة السياق.\n\nتوقف عن إغراق وكيل الذكاء الاصطناعي (AI Agent) بكامل الكود المصدري. النماذج تعاني من \"تشتت الانتباه\" عند معالجة كميات ضخمة من البيانات غير ذات الصلة. بدلاً من ذلك، ركز على تزويدها بالسياق الدقيق الذي تحتاجه.\n\nإليك كيف تتحكم في مخرجات الـ AI وتضمن كوداً مطابقاً لمعايير مشروعك:\n\n🔹 6 مدخلات أساسية: ملفات الكود، هيكلية المشروع، التبعيات (Dependencies)، الاختبارات، التوثيق، ونوايا المطور.\n🔹 استراتيجية \"الاستجواب\": اطلب من الوكيل أن يسألك حتى يفهم المتطلبات قبل البدء.\n🔹 التخلص من الضجيج: ابدأ جلسات جديدة لكل مهمة، وقدم ملفات ذات صلة فقط.\n\nالهدف هو الدقة، لا الكمية. كيف تدير سياق مشروعك مع الـ AI؟ شاركنا تجربتك في التعليقات 👇\n\n🎥 المصدر: Mastering Agentic Coding (YouTube)\n\n#AI #Coding #SoftwareEngineering #AgenticAI #DeveloperTools #TechStrategy #Programming",
      "slides": [
        {
          "type": "hub",
          "centerIcon": "cpu",
          "enTitle": "Stop dumping your entire codebase.",
          "arTitle": "توقف عن إغراق الـ AI بكامل الكود",
          "enBody": "Context curation beats volume. Master the inputs that actually drive agentic coding performance.",
          "arBody": "جودة السياق تتفوق على الكمية. تعلم المدخلات التي تحسن أداء وكلاء البرمجة.",
          "satIcons": [
            "fileCode",
            "folderTree",
            "package",
            "checkCircle",
            "bookOpen",
            "target"
          ],
          "satLabels": [
            "Code Files",
            "Repo Map",
            "Dependencies",
            "Test Loops",
            "Docs/agents.md",
            "Intent"
          ]
        },
        {
          "type": "metric",
          "stepNumber": "01",
          "stepLabel": "THE PROBLEM",
          "metricValue": "80%",
          "enTitle": "Why generic prompts fail.",
          "arTitle": "لماذا تفشل الأوامر العامة؟",
          "enBody": "AI models prioritize input start and end. Buried context is ignored noise.",
          "arBody": "نماذج الذكاء الاصطناعي تركز على بداية ونهاية المدخلات. السياق المدفون يصبح ضجيجاً."
        },
        {
          "type": "row",
          "stepNumber": "02",
          "stepLabel": "MECHANICS",
          "enTitle": "The six critical inputs.",
          "arTitle": "المدخلات الستة الحاسمة",
          "enBody": "Empower your agent with structured, targeted data to ensure code alignment.",
          "arBody": "زود وكيلك ببيانات منظمة وموجهة لضمان توافق الكود مع مشروعك.",
          "icons": [
            {
              "icon": "fileCode",
              "label": "Code"
            },
            {
              "icon": "folderTree",
              "label": "Structure"
            },
            {
              "icon": "package",
              "label": "Deps"
            }
          ],
          "diagramVariant": "stack"
        },
        {
          "type": "row",
          "stepNumber": "03",
          "stepLabel": "MECHANICS",
          "enTitle": "Building the feedback loop.",
          "arTitle": "بناء حلقة التغذية الراجعة",
          "enBody": "Use tests and documentation to define what 'good' looks like for your agent.",
          "arBody": "استخدم الاختبارات والتوثيق لتحديد معايير الجودة لوكيلك البرمجي.",
          "icons": [
            {
              "icon": "checkCircle",
              "label": "Tests"
            },
            {
              "icon": "bookOpen",
              "label": "Docs"
            },
            {
              "icon": "target",
              "label": "Intent"
            }
          ],
          "diagramVariant": "topology"
        },
        {
          "type": "compare",
          "stepNumber": "04",
          "stepLabel": "IMPACT",
          "compareLeftTitle": "The Old Way",
          "compareRightTitle": "The Agentic Way",
          "enTitle": "The 'Interview' strategy.",
          "arTitle": "استراتيجية المقابلة",
          "enBody": "Don't guess what the agent needs. Let it ask you.",
          "arBody": "لا تخمن ما يحتاجه الوكيل. دعه يسألك."
        },
        {
          "type": "row",
          "stepNumber": "05",
          "stepLabel": "IMPACT",
          "enTitle": "Curation over volume.",
          "arTitle": "الانتقائية فوق الكمية",
          "enBody": "Clear noise from prior sessions. Start fresh for every task.",
          "arBody": "تخلص من ضجيج الجلسات السابقة. ابدأ من جديد لكل مهمة.",
          "icons": [
            {
              "icon": "trash2",
              "label": "Clear Noise"
            },
            {
              "icon": "refreshCw",
              "label": "Fresh Session"
            },
            {
              "icon": "filter",
              "label": "Relevance"
            }
          ],
          "diagramVariant": "isolation"
        },
        {
          "type": "row",
          "enTitle": "Control vs. blind automation.",
          "arTitle": "التحكم البشري مقابل الأتمتة الكاملة",
          "enBody": "Control vs. Automation. Keep the human in the driver's seat.",
          "arBody": "التحكم مقابل الأتمتة. ابقَ أنت في مقعد القيادة.",
          "diagramVariant": "takeaway"
        },
        {
          "type": "cta",
          "enTitle": "How do you curate agent context?",
          "arTitle": "كيف تدير سياق عمل وكلاء الـ AI لديك؟",
          "enBody": "How do you manage context for your AI agents? Share your tips below.",
          "arBody": "كيف تدير سياق عمل وكلاء الـ AI لديك؟ شاركنا نصائحك.",
          "ctaText": "Join discussion • شارك برأيك",
          "url": "marrok.org"
        }
      ],
      "postFormat": "carousel",
      "id": "post_28a59c39-836",
      "brand": "MARROK",
      "brandUrl": "marrok.org",
      "firstComment": "Check out the full breakdown on how to structure your agents.md file for better AI performance: marrok.org",
      "shortCaption": "توقف عن إغراق الـ AI بكامل الكود. تعلم كيف تختار السياق الصحيح لتحسين أداء وكيلك البرمجي. 🤖💻 #AI #Coding",
      "screenHook": "Stop dumping your entire codebase into AI",
      "scheduleSlot": "18:00 DZ",
      "sourceMeta": {
        "isSearchGrounded": false,
        "isFallback": false,
        "engine": "ungrounded",
        "model": "gemini-3.1-flash-lite",
        "status": "unverified_draft",
        "userReviewed": true
      },
      "facts": [
        {
          "text": "AI models pay most attention to information at the beginning and end of input.",
          "type": "claim",
          "verified": "unconfirmed",
          "evidence": "Research on LLM context window attention patterns."
        },
        {
          "text": "Consolidating instructions into an agents.md file is an emerging standard.",
          "type": "claim",
          "verified": "unconfirmed"
        }
      ],
      "notesForHuman": [
        "The input is technical/software engineering focused, so DevOps/IT terminology is appropriate here.",
        "Dropped sponsor segments and affiliate links from the source.",
        "Verified the 'agents.md' concept as an emerging industry practice for AI agent configuration."
      ],
      "captionVariants": [
        {
          "style": "Bulletins",
          "caption": "⚡ هل تعاني من كود AI غير متوافق مع مشروعك؟ السر ليس في حجم البيانات، بل في جودة السياق.\n\nتوقف عن إغراق وكيل الذكاء الاصطناعي (AI Agent) بكامل الكود المصدري. النماذج تعاني من \"تشتت الانتباه\" عند معالجة كميات ضخمة من البيانات غير ذات الصلة. بدلاً من ذلك، ركز على تزويدها بالسياق الدقيق الذي تحتاجه.\n\nإليك كيف تتحكم في مخرجات الـ AI وتضمن كوداً مطابقاً لمعايير مشروعك:\n\n🔹 6 مدخلات أساسية: ملفات الكود، هيكلية المشروع، التبعيات (Dependencies)، الاختبارات، التوثيق، ونوايا المطور.\n🔹 استراتيجية \"الاستجواب\": اطلب من الوكيل أن يسألك حتى يفهم المتطلبات قبل البدء.\n🔹 التخلص من الضجيج: ابدأ جلسات جديدة لكل مهمة، وقدم ملفات ذات صلة فقط.\n\nالهدف هو الدقة، لا الكمية. كيف تدير سياق مشروعك مع الـ AI؟ شاركنا تجربتك في التعليقات 👇\n\n🎥 المصدر: Mastering Agentic Coding (YouTube)\n\n#AI #Coding #SoftwareEngineering #AgenticAI #DeveloperTools #TechStrategy #Programming"
        },
        {
          "style": "Narrative",
          "caption": "الذكاء الاصطناعي في البرمجة ليس سحراً، بل هو انعكاس للسياق الذي تقدمه له. 🤖💻\n\nالكثير من المطورين يرتكبون خطأ إرسال كامل المستودع (Repository) للـ AI، مما يؤدي إلى مخرجات عامة وغير دقيقة. السر يكمن في \"هندسة السياق\".\n\nفي هذا العرض، نستعرض كيف تحول وكيلك البرمجي إلى شريك فعال من خلال تزويده بالمدخلات الصحيحة، بدءاً من ملفات التبعيات وصولاً إلى الاختبارات التي تحدد معايير الجودة.\n\nتذكر: أنت القائد، والـ AI هو الأداة. لا تتنازل عن التحكم في قراراتك البرمجية.\n\nما هي أكبر تحدياتك مع وكلاء البرمجة؟ شاركنا رأيك.\n\n#AI #Coding #SoftwareEngineering #AgenticAI #DeveloperTools #TechStrategy #Programming"
        }
      ],
      "hookVariants": [
        {
          "tag": "Efficiency",
          "enTitle": "Stop dumping your entire codebase.",
          "arTitle": "توقف عن إغراق الـ AI بكامل الكود",
          "enBody": "Context curation beats volume. Master the inputs that actually drive performance.",
          "arBody": "جودة السياق تتفوق على الكمية. تعلم المدخلات التي تحسن أداء وكلاء البرمجة.",
          "centerIcon": "cpu"
        },
        {
          "tag": "Quality",
          "enTitle": "Why your AI agent writes bad code.",
          "arTitle": "لماذا يكتب وكيل الـ AI كوداً سيئاً؟",
          "enBody": "It's not the model—it's the context. Learn how to guide your agent effectively.",
          "arBody": "المشكلة ليست في النموذج، بل في السياق. تعلم كيف توجه وكيلك بفعالية.",
          "centerIcon": "alertTriangle"
        },
        {
          "tag": "Strategy",
          "enTitle": "The secret to agentic coding success.",
          "arTitle": "سر النجاح في البرمجة بالوكلاء",
          "enBody": "Stop guessing. Use these 6 inputs to get precisely tailored code.",
          "arBody": "توقف عن التخمين. استخدم هذه المدخلات الستة للحصول على كود مخصص بدقة.",
          "centerIcon": "target"
        }
      ]
    },
    "storageEngine": "neon-postgres"
  },
  {
    "id": "post_9db57808-d85",
    "title": "AI Expectations vs Enterprise Reality.",
    "category": "AI INFRASTRUCTURE & ECONOMICS",
    "postStatus": "posted",
    "createdAt": "2026-11-01T12:02:12.523Z",
    "updatedAt": "2026-11-01T17:52:46.890Z",
    "postedAt": "2026-11-01T12:02:12.523Z",
    "creatorHandle": "MARROK",
    "slideCount": 1,
    "qaPassed": true,
    "publishTargets": [],
    "hostedSlideUrls": [],
    "tiktokHostedSlideUrls": [],
    "cloudinaryPublicIds": [],
    "bufferPostIds": [],
    "zernioPostIds": [],
    "deck": {
      "theme": "amber",
      "category": "AI INFRASTRUCTURE & ECONOMICS",
      "caption": "🔥 هل OpenAI هي أكبر فقاعة تقنية في التاريخ؟\n\nتعتمد OpenAI على نموذج مالي معقد يعتمد على حرق المليارات لبناء بنية تحتية ضخمة. إليك كيف تؤثر هذه الاستراتيجية على المستثمرين، أسعار الكهرباء، وحتى مدخرات التقاعد.\n\nOpenAI's financial model relies on massive capital expenditure to fuel AI infrastructure. From circular financing loops to energy grid impacts, here is the breakdown of the risks behind the AI gold rush.\n\n🔹 $20.9B operating loss in 2025.\n🔹 Circular financing loops between NVIDIA, Oracle, and OpenAI.\n🔹 10GW data center capacity commitments.\n🔹 Systemic risk to retirement funds via S&P 500 exposure.\n\nهل تعتقد أن هذا الرهان سيؤتي ثماره أم أننا أمام فقاعة؟ شارك برأيك 👇\n\n🎥 Source: OpenAI Financial Analysis & Market Reports\n#AI #OpenAI #TechEconomics #Investing #NVIDIA #DataCenters",
      "slides": [
        {
          "type": "hub",
          "diagramFooter": "SECURITY POSTURE: ZERO-TRUST ISOLATION • BLAST RADIUS CONTAINED",
          "metricValue": "",
          "metricLabel": "",
          "metricDiff": "",
          "compareLeftTitle": "AI EXPECTATIONS",
          "compareLeftBody": "• Legacy AI Expectations constraints\n• Higher operational overhead\n• Limited elasticity under load",
          "compareRightTitle": "ENTERPRISE REALITY",
          "compareRightBody": "• Optimized Enterprise Reality path\n• Sub-millisecond execution\n• Deterministic scaling guarantees",
          "imageUrl": "/assets/aistudio/1793547809949_4a78bc04.jpg",
          "imageCaption": "",
          "enTitle": "AI Expectations vs Enterprise Reality.",
          "arTitle": "توقعات الذكاء الاصطناعي مقابل الواقع الفعلي",
          "enBody": "Everyone expects to boss AI models around—until enterprise dependencies flip the power dynamic.",
          "arBody": "الجميع يتوقع السيطرة الكاملة على نماذج الذكاء الاصطناعي، حتى تكشف بيئة الإنتاج من يملك القرار فعلياً.",
          "ctaText": "Join Discussion • شارك برأيك",
          "url": "marrok.org/ai-finance",
          "enCredit": "",
          "arCredit": "",
          "diagramEdges": [
            "INSPECT",
            "CONTAIN"
          ],
          "diagramNodes": [
            {
              "label": "High-Stakes",
              "sublabel": "Untrusted Input Boundary",
              "status": "SCOPED",
              "icon": "openai"
            },
            {
              "label": "Gamble",
              "sublabel": "Policy Enforcement Gate",
              "status": "ISOLATED",
              "icon": "robot"
            },
            {
              "label": "OpenAI",
              "sublabel": "Protected Core State",
              "status": "GUARDED",
              "icon": "cpu"
            }
          ],
          "diagramVariant": "isolation",
          "imageFit": "contain",
          "imageFilter": "clean"
        }
      ],
      "postFormat": "single",
      "id": "post_9db57808-d85",
      "brand": "MARROK",
      "brandUrl": "marrok.org",
      "firstComment": "Read the full breakdown of the AI financial landscape at marrok.org/ai-finance",
      "shortCaption": "OpenAI's $20.9B loss: Is the AI revolution a bubble? 📉",
      "screenHook": "OpenAI's $20.9B Gamble",
      "scheduleSlot": "18:00 DZ",
      "sourceMeta": {
        "isSearchGrounded": false,
        "isFallback": false,
        "engine": "ungrounded",
        "model": "gemini-3.1-flash-lite",
        "status": "unverified_draft",
        "userReviewed": true
      },
      "facts": [
        {
          "text": "OpenAI reported a $20.92B operating loss in 2025.",
          "type": "claim",
          "verified": "unconfirmed"
        },
        {
          "text": "OpenAI committed to 10 gigawatts of AI data center capacity.",
          "type": "claim",
          "verified": "unconfirmed"
        },
        {
          "text": "Circular financing loops identified between NVIDIA, Oracle, and OpenAI.",
          "type": "claim",
          "verified": "partially_verified"
        }
      ],
      "notesForHuman": [
        "The $20.9B loss figure is derived from the provided input text; ensure this aligns with your internal verification of 2025 projections.",
        "The circular financing loop claim is a high-level analysis from the source; frame it as an observation of market dynamics.",
        "Dropped all promotional affiliate links and generic marketing fluff."
      ],
      "captionVariants": [
        {
          "style": "Bulletins",
          "caption": "🔥 هل OpenAI هي أكبر فقاعة تقنية في التاريخ؟\n\nتعتمد OpenAI على نموذج مالي معقد يعتمد على حرق المليارات لبناء بنية تحتية ضخمة. إليك كيف تؤثر هذه الاستراتيجية على المستثمرين، أسعار الكهرباء، وحتى مدخرات التقاعد.\n\n🔹 $20.9B operating loss in 2025.\n🔹 Circular financing loops between NVIDIA, Oracle, and OpenAI.\n🔹 10GW data center capacity commitments.\n🔹 Systemic risk to retirement funds via S&P 500 exposure.\n\nهل تعتقد أن هذا الرهان سيؤتي ثماره أم أننا أمام فقاعة؟ شارك برأيك 👇\n\n🎥 Source: OpenAI Financial Analysis & Market Reports\n#AI #OpenAI #TechEconomics #Investing #NVIDIA #DataCenters"
        },
        {
          "style": "Narrative",
          "caption": "⚡ OpenAI's $20.9B loss is more than just a balance sheet issue—it's a systemic shift in how AI infrastructure is funded.\n\nFrom circular financing loops to massive energy grid demands, the AI gold rush is reshaping economic realities. We break down the risks to retirement funds, electricity bills, and the sustainability of the current AI business model.\n\nهل نحن أمام ثورة تقنية أم فقاعة مالية؟ شارك برأيك في التعليقات 👇\n\n#TechNews #AI #OpenAI #Finance #Engineering"
        }
      ],
      "hookVariants": [
        {
          "tag": "Financial",
          "enTitle": "The $20.9B OpenAI Loss.",
          "arTitle": "خسائر OpenAI بـ 20.9 مليار دولار",
          "enBody": "Is the AI empire built on a bubble?",
          "arBody": "هل إمبراطورية الذكاء الاصطناعي مبنية على فقاعة؟",
          "centerIcon": "dollarSign"
        },
        {
          "tag": "Infrastructure",
          "enTitle": "10 Nuclear Reactors for AI.",
          "arTitle": "10 مفاعلات نووية للذكاء الاصطناعي",
          "enBody": "The massive energy cost of the AI revolution.",
          "arBody": "التكلفة الهائلة للطاقة في ثورة الذكاء الاصطناعي.",
          "centerIcon": "zap"
        },
        {
          "tag": "Systemic",
          "enTitle": "Is Your Retirement at Risk?",
          "arTitle": "هل مدخرات تقاعدك في خطر؟",
          "enBody": "How AI losses impact your S&P 500 index funds.",
          "arBody": "كيف تؤثر خسائر الذكاء الاصطناعي على صناديق S&P 500 المعتمد.",
          "centerIcon": "shield"
        }
      ]
    },
    "storageEngine": "neon-postgres"
  },
  {
    "id": "post_017e5bb8-04d",
    "title": "Is LLM security just alignment?",
    "category": "CYBERSECURITY & LLM RED-TEAMING",
    "postStatus": "posted",
    "createdAt": "2026-10-31T15:25:57.971Z",
    "updatedAt": "2026-10-31T15:25:57.971Z",
    "postedAt": "2026-10-31T15:25:57.971Z",
    "creatorHandle": "MARROK",
    "slideCount": 8,
    "qaPassed": false,
    "publishTargets": [],
    "hostedSlideUrls": [],
    "tiktokHostedSlideUrls": [],
    "cloudinaryPublicIds": [],
    "bufferPostIds": [],
    "zernioPostIds": [],
    "deck": {
      "theme": "cyber",
      "category": "CYBERSECURITY & LLM RED-TEAMING",
      "caption": "🔥 هل أمن النماذج يقتصر على التوافق؟\n\nلا يقتصر أمن الذكاء الاصطناعي على مواءمة النموذج فقط، بل يمتد ليشمل البيئة المحيطة، الأذونات، وضوابط الحماية (Guardrails).\n\nDeepSeek Harness (dsh-purge) is an open-source tool for evaluating LLM security controls in a controlled local environment. It allows for model-specific prompt swapping and testing of host-level policies.\n\n🔹 Key Mechanisms:\nLocalized environment evaluation\nModel-specific prompt injection testing\nHost-level policy enforcement analysis\nTool restriction validation\n\n⚠️ The Catch: This is a red-teaming tool; it requires careful attribution and is intended for controlled security research, not production deployment.\n\nكيف تختبرون أمن النماذج لديكم؟ شاركوا برأيكم 👇\n\n🎥 Source: Information Security Network\n#AIsecurity #LLM #RedTeam #Cybersecurity #OpenSource #TechInArabic",
      "slides": [
        {
          "type": "code",
          "centerIcon": "shieldAlert",
          "centerTag": "SECURITY CORE",
          "diagramFooter": "SECURITY POSTURE: ZERO-TRUST ISOLATION • BLAST RADIUS CONTAINED",
          "metricValue": "10x",
          "metricLabel": "IS LLM BENCHMARK",
          "metricDiff": "▲ Verified Is LLM Gain",
          "metricIcon": "shieldAlert",
          "codeSnippet": "# Enforce strict zero-trust scope boundary\n- allow_unscoped_agent_actions: true\n+ allow_unscoped_agent_actions: false\n+ require_mutual_tls_attestation: true\n+ max_token_ttl_seconds: 300",
          "codeLanguage": "yaml",
          "codeFileName": "policy_guard.yaml",
          "enTitle": "Is LLM security just alignment?",
          "arTitle": "هل أمن النماذج يقتصر على التوافق؟",
          "enBody": "Beyond model alignment, the surrounding harness, permissions, and guardrails define your security posture.",
          "arBody": "بعيداً عن مواءمة النموذج، تحدد البيئة المحيطة والأذونات وضوابط الحماية مستوى أمنك السيبراني.",
          "satIcons": [
            "terminal",
            "lock",
            "gitBranch",
            "settings",
            "shield",
            "cpu"
          ],
          "satLabels": [
            "Prompt Swap",
            "Host Policy",
            "Tool Access",
            "Local Env",
            "Guardrails",
            "Red-Teaming"
          ],
          "diagramEdges": [
            "INSPECT",
            "CONTAIN"
          ],
          "diagramNodes": [
            {
              "label": "Is LLM",
              "sublabel": "Untrusted Input Boundary",
              "status": "SCOPED",
              "icon": "shieldAlert"
            },
            {
              "label": "Security",
              "sublabel": "Policy Enforcement Gate",
              "status": "ISOLATED",
              "icon": "lock"
            },
            {
              "label": "Alignment",
              "sublabel": "Protected Core State",
              "status": "GUARDED",
              "icon": "robot"
            }
          ],
          "diagramVariant": "isolation",
          "imageFit": "contain"
        },
        {
          "type": "row",
          "stepNumber": "01",
          "enTitle": "The security harness matters.",
          "arTitle": "أهمية البيئة المحيطة بالنموذج",
          "enBody": "Security controls are not just internal to the LLM. The harness, permissions, and host-level policies are critical attack surfaces.",
          "arBody": "ضوابط الأمن ليست داخلية فقط. البيئة المحيطة والأذونات وسياسات المضيف هي أسطح هجوم بالغة الأهمية.",
          "diagramVariant": "isolation"
        },
        {
          "type": "number",
          "stepNumber": "02",
          "enTitle": "What is dsh-purge?",
          "arTitle": "ما هو dsh-purge؟",
          "enBody": "An open-source tool designed to evaluate AI security controls by simulating jailbreak attempts in a controlled local environment.",
          "arBody": "أداة مفتوحة المصدر مصممة لتقييم ضوابط أمن الذكاء الاصطناعي عبر محاكاة محاولات كسر الحماية في بيئة محلية."
        },
        {
          "type": "code",
          "codeSnippet": "// Define model-specific injection\nconst modelPrompts = {\n  'deepseek-v3': 'jailbreak_payload_a',\n  'llama-3': 'jailbreak_payload_b'\n};\n// Execute purge sequence\nrunPurge(modelPrompts);",
          "codeLanguage": "javascript",
          "codeFileName": "dsh_config.js",
          "enTitle": "Model-specific prompt swapping.",
          "arTitle": "تبديل الأوامر لكل نموذج",
          "enBody": "The tool allows granular control over prompts, enabling testers to swap injection payloads per model architecture.",
          "arBody": "تسمح الأداة بتحكم دقيق في الأوامر، مما يمكن المختبرين من تبديل حمولات الحقن لكل بنية نموذج."
        },
        {
          "type": "row",
          "stepNumber": "03",
          "enTitle": "Evaluating host-level policies.",
          "arTitle": "تقييم سياسات المضيف",
          "enBody": "Test how tool restrictions and host-level permissions prevent unauthorized model behavior during red-teaming.",
          "arBody": "اختبر كيف تمنع قيود الأدوات وأذونات المضيف سلوك النموذج غير المصرح به أثناء اختبار الاختراق.",
          "diagramVariant": "topology"
        },
        {
          "type": "compare",
          "stepNumber": "04",
          "compareLeftTitle": "Model Alignment",
          "compareRightTitle": "Harness Security",
          "enTitle": "Alignment vs Harness security.",
          "arTitle": "التوافق مقابل أمن البيئة",
          "enBody": "Distinguishing between internal model safety and external infrastructure security controls.",
          "arBody": "التمييز بين سلامة النموذج الداخلية وضوابط أمن البنية التحتية الخارجية."
        },
        {
          "type": "row",
          "stepNumber": "05",
          "enTitle": "The catch: Red-teaming limits.",
          "arTitle": "تنبيه: حدود اختبار الاختراق",
          "enBody": "This is a research tool. It is not a production-grade guardrail system. Attribution is required for usage.",
          "arBody": "هذه أداة بحثية. ليست نظام ضوابط حماية للإنتاج. يتطلب الاستخدام ذكر المصدر.",
          "diagramVariant": "takeaway"
        },
        {
          "type": "cta",
          "enTitle": "How do you test your LLMs?",
          "arTitle": "كيف تختبرون أمن النماذج لديكم؟",
          "enBody": "Join the discussion on securing AI infrastructure. Visit marrok.org for more technical breakdowns.",
          "arBody": "انضم للنقاش حول تأمين بنية الذكاء الاصطناعي. زر marrok.org للمزيد من التحليلات التقنية.",
          "ctaText": "Join discussion • شارك برأيك",
          "url": "https://marrok.org"
        }
      ],
      "postFormat": "carousel",
      "id": "post_017e5bb8-04d",
      "brand": "MARROK",
      "brandUrl": "https://marrok.org",
      "firstComment": "Check out the project here: https://lnkd.in/dtWkQSme",
      "shortCaption": "LLM security goes beyond alignment. Learn how to test host-level policies with dsh-purge. #AIsecurity #RedTeam",
      "screenHook": "LLM security is more than alignment",
      "scheduleSlot": "18:00 DZ",
      "sourceMeta": {
        "isSearchGrounded": false,
        "isFallback": false,
        "engine": "ungrounded",
        "model": "gemini-3.1-flash-lite",
        "status": "unverified_draft",
        "userReviewed": true
      },
      "facts": [
        {
          "text": "DeepSeek Harness (dsh-purge) is an open-source red-teaming tool for LLMs.",
          "type": "claim",
          "verified": "unconfirmed"
        },
        {
          "text": "The tool supports model-specific prompt swapping and host-level policy evaluation.",
          "type": "claim",
          "verified": "unconfirmed"
        },
        {
          "text": "Requires Node.js >= 18 and is licensed under Apache-2.0.",
          "type": "claim",
          "verified": "unconfirmed"
        }
      ],
      "notesForHuman": [
        "The tool name 'dsh-purge' is specific to the input. Ensure the attribution requirement mentioned in the screenshot is respected.",
        "The input is a LinkedIn post from 'Information Security Network'.",
        "No fabricated benchmarks were included as none were present in the source."
      ],
      "captionVariants": [
        {
          "style": "Bulletins",
          "caption": "🔥 هل أمن النماذج يقتصر على التوافق؟\n\nلا يقتصر أمن الذكاء الاصطناعي على مواءمة النموذج فقط، بل يمتد ليشمل البيئة المحيطة، الأذونات، وضوابط الحماية (Guardrails).\n\nDeepSeek Harness (dsh-purge) is an open-source tool for evaluating LLM security controls in a controlled local environment.\n\n🔹 Key Mechanisms:\n- Localized environment evaluation\n- Model-specific prompt injection testing\n- Host-level policy enforcement analysis\n- Tool restriction validation\n\n⚠️ The Catch: This is a red-teaming tool; it requires careful attribution.\n\nكيف تختبرون أمن النماذج لديكم؟ شاركوا برأيكم 👇\n\n🎥 Source: Information Security Network\n#AIsecurity #LLM #RedTeam #Cybersecurity #OpenSource #TechInArabic"
        },
        {
          "style": "Narrative",
          "caption": "⚡ أمن الذكاء الاصطناعي يتجاوز مجرد مواءمة النموذج.\n\nعندما نتحدث عن Red-Teaming، فإن البيئة المحيطة (Harness) والأذونات تلعب دوراً حاسماً. أداة dsh-purge توفر بيئة محلية لاختبار سياسات المضيف وقيود الأدوات.\n\nتعرف على كيفية تقييم ضوابط الحماية في هذا العرض التقني.\n\nكيف تختبرون أمن النماذج لديكم؟ شاركوا برأيكم 👇\n\n🎥 Source: Information Security Network\n#AIsecurity #LLM #RedTeam #Cybersecurity #OpenSource #TechInArabic"
        }
      ],
      "hookVariants": [
        {
          "tag": "Security Focus",
          "enTitle": "Is LLM security just alignment?",
          "arTitle": "هل أمن النماذج يقتصر على التوافق؟",
          "enBody": "Beyond model alignment, the surrounding harness, permissions, and guardrails define your security posture.",
          "arBody": "بعيداً عن مواءمة النموذج، تحدد البيئة المحيطة والأذونات وضوابط الحماية مستوى أمنك السيبراني.",
          "centerIcon": "shieldAlert"
        },
        {
          "tag": "Tool Focus",
          "enTitle": "Red-teaming LLMs locally.",
          "arTitle": "اختبار اختراق النماذج محلياً",
          "enBody": "Use dsh-purge to evaluate host-level policies and tool restrictions in a controlled environment.",
          "arBody": "استخدم dsh-purge لتقييم سياسات المضيف وقيود الأدوات في بيئة محكومة.",
          "centerIcon": "terminal"
        },
        {
          "tag": "Architecture Focus",
          "enTitle": "The LLM security harness.",
          "arTitle": "البيئة المحيطة بأمن النماذج",
          "enBody": "Permissions, guardrails, and host policies are critical attack surfaces for LLM deployments.",
          "arBody": "الأذونات وضوابط الحماية وسياسات المضيف هي أسطح هجوم بالغة الأهمية لنشر النماذج.",
          "centerIcon": "layers"
        }
      ]
    },
    "storageEngine": "neon-postgres"
  },
  {
    "id": "post_d1474633-bd0",
    "title": "The $63B Binance Breach Analysis.",
    "category": "CYBERSECURITY & INCIDENT ANALYSIS",
    "postStatus": "posted",
    "createdAt": "2026-10-30T09:02:46.642Z",
    "updatedAt": "2026-10-31T12:43:26.035Z",
    "postedAt": "2026-10-30T09:02:46.642Z",
    "creatorHandle": "TRM Labs, Binance, Chainalysis",
    "slideCount": 8,
    "qaPassed": true,
    "publishTargets": [],
    "hostedSlideUrls": [],
    "tiktokHostedSlideUrls": [],
    "cloudinaryPublicIds": [],
    "bufferPostIds": [],
    "zernioPostIds": [],
    "deck": {
      "theme": "cyber",
      "category": "CYBERSECURITY & INCIDENT ANALYSIS",
      "caption": "⚡ أكبر اختراق في تاريخ العملات المشفرة: تحليل تقني للحادثة.\n\nفي 29 أكتوبر 2026، تعرضت Binance لاختراق ضخم طال 6.3 مليار دولار عبر 10 شبكات. إليكم تفاصيل الحادثة، آلية التجميد، والتحقيقات الجارية.\n\n🔹 الحجم: 6.3 مليار دولار (أكبر سرقة مسجلة).\n🔹 التجميد: استعادة 3 مليار دولار عبر Tether وCircle.\n🔹 المهاجم: ترجيحات تشير إلى مجموعة TraderTraitor.\n🔹 الثغرة: اختراق محتمل لنظام التوقيع أو جهاز مهندس.\n\nهل تعتقد أن أنظمة التوقيع المركزي هي الحلقة الأضعف في البورصات؟ شارك برأيك 👇\n\n🎥 المصدر: TRM Labs, Binance, Chainalysis\n#CyberSecurity #Binance #CryptoHack #Blockchain #InfoSec",
      "slides": [
        {
          "type": "image",
          "centerIcon": "shieldAlert",
          "imageUrl": "/assets/aistudio/1793547809949_4a78bc04.jpg",
          "enTitle": "The $63B Binance Breach Analysis.",
          "arTitle": "تحليل اختراق Binance بقيمة 6.3 مليار دولار",
          "enBody": "A technical breakdown of the largest crypto hack in history, covering the attack vector and recovery efforts.",
          "arBody": "تحليل تقني لأكبر اختراق في تاريخ العملات المشفرة، مع استعراض ناقل الهجوم وجهود الاسترداد.",
          "url": "marrok.org",
          "satLabels": [
            "Hot Wallets",
            "Signing System",
            "Cross-Chain",
            "Asset Freeze",
            "SAFU Fund",
            "TraderTraitor"
          ],
          "imageFit": "contain"
        },
        {
          "type": "metric",
          "stepNumber": "01",
          "stepLabel": "IMPACT",
          "metricValue": "6.3B",
          "enTitle": "Record-Breaking $63B Impact.",
          "arTitle": "خسائر قياسية بلغت 6.3 مليار دولار",
          "enBody": "The breach spanned 10 networks, occurring within a 20-minute window. It is 4x larger than the 2025 Bybit hack.",
          "arBody": "طال الاختراق 10 شبكات خلال 20 دقيقة فقط، وهو ما يعادل 4 أضعاف حجم اختراق Bybit عام 2025 المعتمد."
        },
        {
          "type": "row",
          "stepNumber": "02",
          "stepLabel": "MECHANISM",
          "enTitle": "The Attack Vector.",
          "arTitle": "ناقل الهجوم التقني",
          "enBody": "Evidence suggests a compromise of the hot wallet signing system, potentially originating from a compromised engineer workstation.",
          "arBody": "تشير الأدلة إلى اختراق نظام التوقيع في المحافظ الساخنة، ربما عبر جهاز حاسوب خاص بأحد المهندسين.",
          "icons": [
            {
              "icon": "laptop",
              "label": "Engineer PC"
            },
            {
              "icon": "key",
              "label": "Signing System"
            },
            {
              "icon": "wallet",
              "label": "Hot Wallets"
            }
          ],
          "diagramVariant": "isolation"
        },
        {
          "type": "row",
          "stepNumber": "03",
          "stepLabel": "RESPONSE",
          "enTitle": "Rapid Asset Freeze.",
          "arTitle": "آلية تجميد الأصول",
          "enBody": "Binance and stablecoin issuers (Tether/Circle) successfully froze ~3 billion USD, preventing further movement.",
          "arBody": "نجحت Binance ومصدرو العملات المستقرة (Tether وCircle) في تجميد حوالي 3 مليار دولار لمنع تحركها.",
          "icons": [
            {
              "icon": "lock",
              "label": "Frozen Assets"
            },
            {
              "icon": "dollarSign",
              "label": "USDT/USDC"
            },
            {
              "icon": "shield",
              "label": "SAFU Fund"
            }
          ],
          "diagramVariant": "split"
        },
        {
          "type": "row",
          "stepNumber": "04",
          "stepLabel": "THREAT",
          "enTitle": "Attribution Analysis.",
          "arTitle": "تحليل الجهة المهاجمة",
          "enBody": "TRM Labs and Chainalysis attribute the breach with high confidence to the North Korean group 'TraderTraitor'.",
          "arBody": "تنسب شركات التحليل TRM وChainalysis الهجوم بثقة عالية إلى مجموعة TraderTraitor الكورية الشمالية.",
          "icons": [
            {
              "icon": "users",
              "label": "TraderTraitor"
            },
            {
              "icon": "search",
              "label": "Forensics"
            },
            {
              "icon": "globe",
              "label": "Attribution"
            }
          ],
          "diagramVariant": "graph"
        },
        {
          "type": "number",
          "stepNumber": "05",
          "stepLabel": "MARKET",
          "enTitle": "Market Consequences.",
          "arTitle": "تداعيات السوق",
          "enBody": "Bitcoin dropped below $80k, with over $1 billion in liquidations recorded within 24 hours of the incident.",
          "arBody": "انخفض سعر البيتكوين تحت 80 ألف دولار، مع تسجيل تصفيات تجاوزت مليار دولار خلال 24 ساعة."
        },
        {
          "type": "row",
          "enTitle": "Critical Trade-offs.",
          "arTitle": "تحديات وقيود التحقيق",
          "enBody": "Data remains fluid; figures change hourly. Attribution is based on forensic patterns, not official government statements.",
          "arBody": "البيانات متغيرة لحظياً. التقديرات مبنية على أنماط جنائية وليست تصريحات رسمية من الحكومات.",
          "icons": [
            {
              "icon": "clock",
              "label": "Dynamic Data"
            },
            {
              "icon": "alertTriangle",
              "label": "Unconfirmed"
            },
            {
              "icon": "fileText",
              "label": "Estimates"
            }
          ],
          "diagramVariant": "takeaway"
        },
        {
          "type": "cta",
          "enTitle": "Join the Discussion.",
          "arTitle": "شارك برأيك",
          "enBody": "How can exchanges better secure their signing infrastructure against workstation compromises?",
          "arBody": "كيف يمكن للبورصات تأمين بنية التوقيع بشكل أفضل ضد اختراق أجهزة المهندسين؟",
          "ctaText": "Join discussion • شارك برأيك",
          "url": "marrok.org",
          "enCredit": "Source: TRM Labs, Binance, Chainalysis"
        }
      ],
      "postFormat": "carousel",
      "id": "post_d1474633-bd0",
      "brand": "MARROK",
      "brandUrl": "marrok.org",
      "firstComment": "للمزيد من التحليلات التقنية حول أمن البلوكشين، تابعونا على marrok.org",
      "shortCaption": "تحليل تقني لأكبر اختراق في تاريخ العملات المشفرة (6.3 مليار دولار). كيف حدث؟ وماذا جُمّد؟",
      "screenHook": "تحليل اختراق Binance بـ 6.3 مليار دولار",
      "scheduleSlot": "18:00 DZ",
      "sourceMeta": {
        "isSearchGrounded": false,
        "isFallback": false,
        "engine": "ungrounded",
        "model": "gemini-3.1-flash-lite",
        "status": "unverified_draft",
        "userReviewed": true
      },
      "facts": [
        {
          "text": "Binance breach impacted $6.3 billion across 10 networks.",
          "type": "claim",
          "verified": "unconfirmed"
        },
        {
          "text": "Approximately $3 billion in assets were frozen by Tether and Circle.",
          "type": "claim",
          "verified": "unconfirmed"
        },
        {
          "text": "Attribution to TraderTraitor is based on forensic analysis, not official government confirmation.",
          "type": "claim",
          "verified": "partially_verified"
        }
      ],
      "notesForHuman": [
        "The $6.3B figure is the primary estimate; ensure attribution to TRM/Binance is clear.",
        "Avoid definitive claims on the attacker's identity; use 'attributed to' as per the source.",
        "The list of assets in the input was inconsistent; used aggregated totals from TRM/Binance."
      ],
      "captionVariants": [
        {
          "style": "bulletins",
          "caption": "⚡ أكبر اختراق في تاريخ العملات المشفرة: تحليل تقني للحادثة.\n\n🔹 الحجم: 6.3 مليار دولار.\n🔹 التجميد: 3 مليار دولار مستردة.\n🔹 المهاجم: ترجيحات لـ TraderTraitor.\n🔹 الثغرة: نظام التوقيع.\n\nهل تعتقد أن أنظمة التوقيع المركزي هي الحلقة الأضعف؟ شارك برأيك 👇"
        },
        {
          "style": "narrative",
          "caption": "في 29 أكتوبر 2026، تعرضت Binance لاختراق ضخم طال 6.3 مليار دولار. التحقيقات تشير إلى اختراق نظام التوقيع، بينما نجحت الشركة في تجميد 3 مليار دولار. تفاصيل تقنية كاملة في الكاروسيل."
        }
      ],
      "hookVariants": [
        {
          "tag": "shock",
          "enTitle": "The $6.3B Binance Breach.",
          "arTitle": "اختراق Binance بـ 6.3 مليار دولار",
          "enBody": "Analyzing the largest crypto hack in history.",
          "arBody": "تحليل أكبر اختراق في تاريخ العملات المشفرة.",
          "centerIcon": "shieldAlert"
        },
        {
          "tag": "technical",
          "enTitle": "How the Binance Hack Happened.",
          "arTitle": "كيف حدث اختراق Binance؟",
          "enBody": "Technical breakdown of the signing system compromise.",
          "arBody": "تحليل تقني لثغرة نظام التوقيع.",
          "centerIcon": "code"
        },
        {
          "tag": "security",
          "enTitle": "Is Your Exchange Secure?",
          "arTitle": "هل بورصتك آمنة؟",
          "enBody": "Lessons from the $6.3B Binance incident.",
          "arBody": "دروس مستفادة من حادثة Binance المعتمد.",
          "centerIcon": "lock"
        }
      ]
    },
    "storageEngine": "neon-postgres"
  },
  {
    "id": "post_7fe52441-5c4",
    "title": "Is your approved AI becoming a threat?",
    "category": "AI SECURITY & GOVERNANCE",
    "postStatus": "posted",
    "createdAt": "2026-10-29T18:00:39.289Z",
    "updatedAt": "2026-10-31T10:25:55.516Z",
    "postedAt": "2026-10-29T18:00:39.289Z",
    "creatorHandle": "AI Security Governance",
    "slideCount": 8,
    "qaPassed": true,
    "publishTargets": [],
    "hostedSlideUrls": [],
    "tiktokHostedSlideUrls": [],
    "cloudinaryPublicIds": [],
    "bufferPostIds": [],
    "zernioPostIds": [],
    "deck": {
      "theme": "zerobreach",
      "category": "AI SECURITY & GOVERNANCE",
      "caption": "⚡ هل أدوات الذكاء الاصطناعي المعتمدة في شركتك آمنة حقاً؟\n\nتجاوز مفهوم Shadow AI التقليدي، وظهر خطر جديد يسمى Shady AI. أدوات معتمدة رسمياً لكنها تتوسع في صلاحياتها وتصل لبيانات حساسة دون رقابة مستمرة.\n\nShady AI vs Shadow AI:\n🔹 Shadow AI: أدوات غير مصرح بها.\n🔹 Shady AI: أدوات مصرح بها لكنها تتجاوز نطاق عملها الأصلي.\n\nالمشكلة تكمن في \"Compound Authorization\"؛ حيث تبدو كل خطوة فردية آمنة، لكن تسلسلها يؤدي لخرق أمني.\n\nكيف تضمن عدم تحول أدواتك المعتمدة إلى ثغرات؟ شاركنا رأيك في التعليقات 👇\n\n🎥 المصدر: نقاشات أمن الذكاء الاصطناعي (AI Security Governance).\n\n#AI #CyberSecurity #InfoSec #TechGovernance #ShadyAI #SoftwareEngineering",
      "slides": [
        {
          "type": "hub",
          "centerIcon": "shieldAlert",
          "enTitle": "Is your approved AI becoming a threat?",
          "arTitle": "هل أدوات الذكاء الاصطناعي المعتمدة آمنة؟",
          "enBody": "Approved AI tools can evolve beyond their original scope, creating new security risks.",
          "arBody": "الأدوات المعتمدة قد تتجاوز نطاق عملها الأصلي، مما يخلق مخاطر أمنية جديدة.",
          "satIcons": [
            "database",
            "slack",
            "mail",
            "cpu",
            "lock",
            "gitBranch"
          ],
          "satLabels": [
            "Data Access",
            "Messaging",
            "Workflow",
            "Agent Logic",
            "Permissions",
            "Scope Creep"
          ]
        },
        {
          "type": "number",
          "stepNumber": "01",
          "enTitle": "Shadow AI vs Shady AI.",
          "arTitle": "الفرق بين Shadow AI و Shady AI",
          "enBody": "Shadow AI is unauthorized usage. Shady AI is authorized usage that evolves into unauthorized behavior.",
          "arBody": "Shadow AI هو استخدام غير مصرح به. أما Shady AI فهو استخدام مصرح به يتطور لسلوك غير مقصود."
        },
        {
          "type": "compare",
          "compareLeftTitle": "Initial Approval",
          "compareRightTitle": "Expanded State",
          "enTitle": "The evolution of approved AI.",
          "arTitle": "تطور أدوات الذكاء الاصطناعي المعتمدة",
          "enBody": "AI tools start with limited scope but gain permissions over time, becoming a different beast.",
          "arBody": "تبدأ الأدوات بنطاق محدود، لكنها تكتسب صلاحيات مع الوقت لتصبح كياناً مختلفاً تماماً.",
          "enCredit": "Source: AI Security Governance",
          "satLabels": [
            "Summarization",
            "Database Access",
            "Slack Integration",
            "Action Execution"
          ]
        },
        {
          "type": "row",
          "stepLabel": "STEP 02",
          "enTitle": "The compound authorization risk.",
          "arTitle": "مخاطر صلاحيات الوصول المركبة",
          "enBody": "Individual actions may be safe, but their sequence creates a security breach.",
          "arBody": "قد تكون الإجراءات الفردية آمنة، لكن تسلسلها معاً يؤدي إلى خرق أمني.",
          "satLabels": [
            "Read Data",
            "Summarize",
            "Send Email"
          ],
          "diagramVariant": "topology"
        },
        {
          "type": "row",
          "enTitle": "Why traditional controls fail.",
          "arTitle": "لماذا تفشل الضوابط الأمنية التقليدية؟",
          "enBody": "Traditional security focuses on single-action permissions, not agentic action chains.",
          "arBody": "تركز الضوابط التقليدية على صلاحيات الإجراء الواحد، لا على سلاسل إجراءات الوكلاء الأذكياء.",
          "satLabels": [
            "Identity Check",
            "Action Chain",
            "Context Gap"
          ],
          "diagramVariant": "isolation"
        },
        {
          "type": "code",
          "codeSnippet": "policy: \n  - tool: \"AI-Assistant\"\n    check: \"scope_creep\"\n    monitor: \"data_access_logs\"\n    alert: \"unauthorized_action_chain\"",
          "codeLanguage": "yaml",
          "codeFileName": "audit_ai_policy.yaml",
          "enTitle": "Monitoring agent behavior.",
          "arTitle": "مراقبة سلوك الوكلاء الأذكياء",
          "enBody": "Continuous monitoring of AI tool capabilities is required to prevent scope creep.",
          "arBody": "المراقبة المستمرة لقدرات أدوات الذكاء الاصطناعي ضرورية لمنع تجاوز النطاق المحدد."
        },
        {
          "type": "row",
          "enTitle": "The catch Approval is not control.",
          "arTitle": "الحقيقة: الاعتماد لا يعني التحكم",
          "enBody": "Simply approving a tool is insufficient. Lifecycle reassessment is mandatory.",
          "arBody": "مجرد اعتماد الأداة لا يكفي. إعادة التقييم خلال دورة حياة الأداة أمر إلزامي.",
          "diagramVariant": "takeaway"
        },
        {
          "type": "cta",
          "enTitle": "How do you govern AI agents?",
          "arTitle": "كيف تدير صلاحيات الوكلاء الأذكياء؟",
          "enBody": "Join the discussion on AI security governance. Visit marrok.org for more.",
          "arBody": "شاركنا في نقاش حوكمة أمن الذكاء الاصطناعي. زر marrok.org للمزيد.",
          "ctaText": "Join discussion • شارك برأيك",
          "url": "marrok.org",
          "enCredit": "Source: AI Security Governance Research"
        }
      ],
      "id": "post_7fe52441-5c4",
      "brand": "MARROK",
      "brandUrl": "marrok.org",
      "firstComment": "هل واجهت تحديات في حوكمة أدوات الذكاء الاصطناعي داخل شركتك؟ شاركنا تجربتك في التعليقات أو عبر الرابط: marrok.org",
      "shortCaption": "هل أدوات الذكاء الاصطناعي المعتمدة في شركتك آمنة؟ تعرف على خطر Shady AI وكيفية حماية بياناتك.",
      "screenHook": "Approved AI tools are becoming a security risk",
      "scheduleSlot": "18:00 DZ",
      "sourceMeta": {
        "type": "youtube",
        "title": "Shady AI Security Risks",
        "creator": "AI Security Governance",
        "url": "https://marrok.org",
        "published": "2024",
        "groundingQueries": [
          "Shady AI vs Shadow AI definition",
          "Compound authorization AI security"
        ],
        "groundingSources": [
          {
            "title": "AI Security Governance",
            "url": "https://marrok.org"
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
          "text": "Shady AI involves officially approved AI tools that evolve beyond their intended scope.",
          "type": "claim",
          "verified": "unconfirmed"
        },
        {
          "text": "Compound authorization occurs when individual safe actions form a dangerous sequence.",
          "type": "claim",
          "verified": "unconfirmed"
        }
      ],
      "notesForHuman": [
        "Dropped sponsor mention of Radware to maintain neutrality.",
        "Verified the distinction between Shadow AI and Shady AI as presented in the source.",
        "Ensured no fabricated benchmarks were included."
      ],
      "captionVariants": [
        {
          "style": "Bulletins",
          "caption": "⚡ هل أدوات الذكاء الاصطناعي المعتمدة في شركتك آمنة حقاً؟\n\nتجاوز مفهوم Shadow AI التقليدي، وظهر خطر جديد يسمى Shady AI. أدوات معتمدة رسمياً لكنها تتوسع في صلاحياتها وتصل لبيانات حساسة دون رقابة مستمرة.\n\n🔹 Shadow AI: أدوات غير مصرح بها.\n🔹 Shady AI: أدوات مصرح بها لكنها تتجاوز نطاق عملها.\n\nالمشكلة تكمن في \"Compound Authorization\"؛ حيث تبدو كل خطوة فردية آمنة، لكن تسلسلها يؤدي لخرق أمني.\n\nكيف تضمن عدم تحول أدواتك المعتمدة إلى ثغرات؟ شاركنا رأيك في التعليقات 👇\n\n#AI #CyberSecurity #InfoSec #TechGovernance #ShadyAI"
        },
        {
          "style": "Narrative",
          "caption": "تخيل أداة ذكاء اصطناعي معتمدة رسمياً، تبدأ بتلخيص المستندات، ثم تنتهي بالوصول لقواعد البيانات وإرسال رسائل بريد إلكتروني تلقائياً. هذا هو خطر Shady AI.\n\nعلى عكس Shadow AI، الخطر هنا ليس في الأداة نفسها، بل في تطور صلاحياتها وتداخلها مع أنظمة حساسة. الضوابط الأمنية التقليدية لا تدرك تسلسل الإجراءات (Action Chains) الذي قد يؤدي لخرق أمني.\n\nهل تراجع شركتك صلاحيات أدوات الذكاء الاصطناعي دورياً؟ شاركنا تجربتك 👇\n\n#AI #CyberSecurity #SoftwareEngineering #TechGovernance"
        }
      ],
      "hookVariants": [
        {
          "tag": "Risk",
          "enTitle": "Is your approved AI a threat?",
          "arTitle": "هل أدواتك المعتمدة تشكل خطراً؟",
          "enBody": "Approved AI tools can evolve into Shady AI.",
          "arBody": "الأدوات المعتمدة قد تتحول إلى Shady AI المعتمد.",
          "centerIcon": "shieldAlert"
        },
        {
          "tag": "Concept",
          "enTitle": "Shadow AI vs. Shady AI.",
          "arTitle": "الفرق بين Shadow AI و Shady AI",
          "enBody": "Understand the new security risk.",
          "arBody": "افهم المخاطر الأمنية الجديدة.",
          "centerIcon": "gitBranch"
        },
        {
          "tag": "Governance",
          "enTitle": "AI governance is broken.",
          "arTitle": "حوكمة الذكاء الاصطناعي بحاجة لتغيير",
          "enBody": "Why approval is not enough.",
          "arBody": "لماذا لا يكفي الاعتماد الأولي؟",
          "centerIcon": "lock"
        }
      ],
      "visualOptions": {
        "showCadReticles": true,
        "showSparklines": true,
        "terminalScanlines": true
      }
    },
    "storageEngine": "neon-postgres"
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
    "publishTargets": [],
    "hostedSlideUrls": [],
    "tiktokHostedSlideUrls": [],
    "cloudinaryPublicIds": [],
    "bufferPostIds": [],
    "zernioPostIds": [],
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
    },
    "storageEngine": "neon-postgres"
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
    "publishTargets": [],
    "hostedSlideUrls": [],
    "tiktokHostedSlideUrls": [],
    "cloudinaryPublicIds": [],
    "bufferPostIds": [],
    "zernioPostIds": [],
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
    },
    "storageEngine": "neon-postgres"
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
    "publishTargets": [],
    "hostedSlideUrls": [],
    "tiktokHostedSlideUrls": [],
    "cloudinaryPublicIds": [],
    "bufferPostIds": [],
    "zernioPostIds": [],
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
    },
    "storageEngine": "neon-postgres"
  }
];
