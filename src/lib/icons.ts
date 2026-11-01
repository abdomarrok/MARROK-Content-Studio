
export const MARROK_LOGO_PATHS = {
  center: { x: 353.8, y: 383.45 },
  viewBox: { x: 234, y: 263, width: 240, height: 240 },
  pathMain: 'M274.593 292.356c7.516 5.431 22.212 18.846 29.88 25.433l57.733 49.435a550 550 0 0 1 15.149-12.803l58.963.067c-24.81 22.418-50.647 43.634-75.56 66.436a4749 4749 0 0 1-50.139-42.56c-.49 31.044-.044 63.633-.034 94.782l.559.69c2.697.605 31.529.368 36.393.367l94.175-.029c-.007-10.958-.07-24.17.056-35.333.016-1.404 1.697-2.216 2.734-2.827 1.817 1.933.945 36.549.911 41.792l-137.518.095c-10.902-8.575-22.944-19.229-33.51-28.38.113-51.464-.857-105.95.208-157.165',
  pathRightBottom: 'M444.828 364.305c1.139 1.844.571 50.643.56 56.415-14.46 11.842-28.334 26.13-42.456 37.258-1.332-1.635-.761-50.857-.751-57.199 6.602-6.024 14.215-12.152 21.015-18.098 6.797-5.943 14.531-13.018 21.632-18.376',
  pathAccent: 'M444.698 298.519c1.651 2.305.913 33.331.893 38.505-13.853.389-29.377-.003-43.353-.082l-.6-.273-.018-.815c9.066-9.55 32.459-28.681 43.078-37.335',
  pathLeftFrame: 'm262.154 289 2.641.632c1.169 1.916.549 37.2.541 41.855l.154 142.47c6.939.09 15.094-.806 21.911.376 1.926.334 2.769 1.824 3.711 3.441l-29.021.05.221-120.184c-.048-21.851-.844-47.135-.158-68.64m25.763.486c13.492-.132 148.331-.571 150.082.271l-.288 1.158c-3.695 2.973-17.296 2.033-22.397 2.047l-33.877.044c-28.986-.004-58.103.059-87.096-.034-3.672-.012-3.662-.558-6.424-3.486',
};

export const ICONS_REGISTRY: Record<string, { label: string; svgInner: string }> = {
  gitMerge: {
    label: 'Git Merge',
    svgInner: `
      <circle cx="18" cy="18" r="6" />
      <circle cx="18" cy="46" r="6" />
      <circle cx="46" cy="28" r="6" />
      <path d="M18 24v16" />
      <path d="M18 36c4 0 16 0 24-4" />
    `,
  },
  shieldAlert: {
    label: 'Shield Alert',
    svgInner: `
      <path d="M32 8s16 4 20 8v16c0 14-20 24-20 24S12 46 12 32V16c4-4 20-8 20-8z" />
      <line x1="32" y1="22" x2="32" y2="34" />
      <circle cx="32" cy="42" r="2.5" fill="currentColor" />
    `,
  },
  binary: {
    label: 'Binary Code',
    svgInner: `
      <rect x="14" y="14" width="14" height="20" rx="6" />
      <line x1="42" y1="14" x2="42" y2="34" />
      <line x1="36" y1="18" x2="42" y2="14" />
      <rect x="36" y="30" width="14" height="20" rx="6" />
      <line x1="20" y1="36" x2="20" y2="52" />
    `,
  },
  codeFile: {
    label: 'Code File',
    svgInner: `
      <path d="M38 8H16a4 4 0 0 0-4 4v40a4 4 0 0 0 4 4h32a4 4 0 0 0 4-4V22z" />
      <polyline points="38 8 38 22 52 22" />
      <polyline points="24 38 18 43 24 48" />
      <polyline points="34 38 40 43 34 48" />
    `,
  },
  search: {
    label: 'Search',
    svgInner: `
      <circle cx="28" cy="28" r="16" />
      <line x1="40" y1="40" x2="52" y2="52" />
    `,
  },
  database: {
    label: 'Database',
    svgInner: `
      <ellipse cx="32" cy="18" rx="20" ry="8" />
      <path d="M12 18v14c0 4.4 9 8 20 8s20-3.6 20-8V18" />
      <path d="M12 32v14c0 4.4 9 8 20 8s20-3.6 20-8V32" />
    `,
  },
  server: {
    label: 'Server Rack',
    svgInner: `
      <rect x="12" y="12" width="40" height="16" rx="4" />
      <rect x="12" y="36" width="40" height="16" rx="4" />
      <circle cx="20" cy="20" r="2.5" fill="currentColor" />
      <circle cx="20" cy="44" r="2.5" fill="currentColor" />
      <line x1="28" y1="20" x2="44" y2="20" />
      <line x1="28" y1="44" x2="44" y2="44" />
    `,
  },
  funnel: {
    label: 'Funnel / Filter',
    svgInner: `
      <polygon points="10 14 54 14 38 34 38 50 26 54 26 34 10 14" />
    `,
  },
  alerts: {
    label: 'Alerts',
    svgInner: `
      <path d="M32 10L10 48h44L32 10z" />
      <line x1="32" y1="24" x2="32" y2="34" />
      <circle cx="32" cy="42" r="2.5" fill="currentColor" />
    `,
  },
  lifecycle: {
    label: 'Lifecycle / Loop',
    svgInner: `
      <path d="M48 24A18 18 0 1 0 50 36" />
      <polyline points="40 14 50 24 50 14" />
    `,
  },
  eyeRisk: {
    label: 'Eye / Risk',
    svgInner: `
      <path d="M8 32s9-16 24-16 24 16 24 16-9 16-24 16-24-16-24-16z" />
      <circle cx="32" cy="32" r="7" />
    `,
  },
  gauge: {
    label: 'Gauge / Speed',
    svgInner: `
      <path d="M12 40a22 22 0 1 1 40 0" />
      <line x1="32" y1="38" x2="44" y2="26" />
      <circle cx="32" cy="38" r="4" fill="currentColor" />
    `,
  },
  lightbulb: {
    label: 'Lightbulb / Lesson',
    svgInner: `
      <path d="M22 36c-4-4-6-9-6-15a16 16 0 1 1 32 0c0 6-2 11-6 15" />
      <path d="M24 44h16" />
      <path d="M26 50h12" />
      <line x1="32" y1="26" x2="32" y2="36" />
    `,
  },
  cpu: {
    label: 'CPU / Microchip',
    svgInner: `
      <rect x="18" y="18" width="28" height="28" rx="6" />
      <rect x="25" y="25" width="14" height="14" rx="2" />
      <line x1="24" y1="8" x2="24" y2="18" />
      <line x1="32" y1="8" x2="32" y2="18" />
      <line x1="40" y1="8" x2="40" y2="18" />
      <line x1="24" y1="46" x2="24" y2="56" />
      <line x1="32" y1="46" x2="32" y2="56" />
      <line x1="40" y1="46" x2="40" y2="56" />
      <line x1="8" y1="24" x2="18" y2="24" />
      <line x1="8" y1="32" x2="18" y2="32" />
      <line x1="8" y1="40" x2="18" y2="40" />
      <line x1="46" y1="24" x2="56" y2="24" />
      <line x1="46" y1="32" x2="56" y2="32" />
      <line x1="46" y1="40" x2="56" y2="40" />
    `,
  },
  clock: {
    label: 'Clock / Timer',
    svgInner: `
      <circle cx="32" cy="32" r="22" />
      <polyline points="32 18 32 32 42 32" />
    `,
  },
  scales: {
    label: 'Scales of Justice / Trade-off',
    svgInner: `
      <line x1="32" y1="12" x2="32" y2="52" />
      <line x1="16" y1="20" x2="48" y2="20" />
      <path d="M12 36l4-16 4 16c0 3-3.6 5-8 5s-8-2-8-5z" />
      <path d="M44 36l4-16 4 16c0 3-3.6 5-8 5s-8-2-8-5z" />
      <line x1="22" y1="52" x2="42" y2="52" />
    `,
  },
  robot: {
    label: 'AI Robot Agent',
    svgInner: `
      <rect x="14" y="20" width="36" height="30" rx="8" />
      <line x1="32" y1="10" x2="32" y2="20" />
      <circle cx="32" cy="9" r="3" fill="currentColor" />
      <circle cx="24" cy="32" r="3" fill="currentColor" />
      <circle cx="40" cy="32" r="3" fill="currentColor" />
      <line x1="24" y1="42" x2="40" y2="42" />
      <line x1="8" y1="35" x2="14" y2="35" />
      <line x1="50" y1="35" x2="56" y2="35" />
    `,
  },
  calculator: {
    label: 'Calculator',
    svgInner: `
      <rect x="14" y="10" width="36" height="44" rx="6" />
      <rect x="20" y="16" width="24" height="10" rx="2" />
      <circle cx="22" cy="34" r="2.5" fill="currentColor" />
      <circle cx="32" cy="34" r="2.5" fill="currentColor" />
      <circle cx="42" cy="34" r="2.5" fill="currentColor" />
      <circle cx="22" cy="44" r="2.5" fill="currentColor" />
      <circle cx="32" cy="44" r="2.5" fill="currentColor" />
      <circle cx="42" cy="44" r="2.5" fill="currentColor" />
    `,
  },
  gradCap: {
    label: 'Graduation Cap',
    svgInner: `
      <polygon points="32 12 56 24 32 36 8 24 32 12" />
      <path d="M16 28v14c0 6 7.2 10 16 10s16-4 16-10V28" />
      <line x1="56" y1="24" x2="56" y2="44" />
      <circle cx="56" cy="45" r="2" fill="currentColor" />
    `,
  },
  brain: {
    label: 'Brain / Intelligence',
    svgInner: `
      <path d="M26 16a8 8 0 0 0-14 8 8 8 0 0 0-2 6 8 8 0 0 0 4 7 8 8 0 0 0 0 7 8 8 0 0 0 8 4h4" />
      <path d="M38 16a8 8 0 0 1 14 8 8 8 0 0 1 2 6 8 8 0 0 1-4 7 8 8 0 0 1 0 7 8 8 0 0 1-8 4h-4" />
      <path d="M32 14v34" />
    `,
  },
  changesets: {
    label: 'Changesets',
    svgInner: `
      <line x1="12" y1="32" x2="52" y2="32" />
      <circle cx="32" cy="32" r="7" />
    `,
  },
  users: {
    label: 'Users / Team',
    svgInner: `
      <circle cx="32" cy="22" r="7" />
      <path d="M18 46c0-6.6 6.3-12 14-12s14 5.4 14 12" />
    `,
  },
  terminal: {
    label: 'Terminal',
    svgInner: `
      <rect x="10" y="12" width="44" height="40" rx="6" />
      <polyline points="18 24 26 32 18 40" />
      <line x1="30" y1="40" x2="42" y2="40" />
    `,
  },
  lock: {
    label: 'Security Lock',
    svgInner: `
      <rect x="14" y="26" width="36" height="28" rx="6" />
      <path d="M22 26V18a10 10 0 0 1 20 0v8" />
      <circle cx="32" cy="40" r="3" fill="currentColor" />
    `,
  },
  zap: {
    label: 'Speed / Latency / Zap',
    svgInner: `
      <polygon points="36 6 16 36 32 36 28 58 48 28 32 28 36 6" />
    `,
  },
  layers: {
    label: 'Architecture Layers',
    svgInner: `
      <polygon points="32 10 54 22 32 34 10 22 32 10" />
      <polyline points="10 32 32 44 54 32" />
      <polyline points="10 42 32 54 54 42" />
    `,
  },
  cloud: {
    label: 'Cloud Native / AWS',
    svgInner: `
      <path d="M46 44a12 12 0 0 0 2-23.8 18 18 0 0 0-34.8 4.6A10 10 0 0 0 16 44h30z" />
    `,
  },
  box: {
    label: 'Docker / Container / Pod',
    svgInner: `
      <path d="M52 20L32 9 12 20v24l20 11 20-11V20z" />
      <line x1="32" y1="9" x2="32" y2="55" />
      <polyline points="12 20 32 31 52 20" />
    `,
  },
  bug: {
    label: 'Bug / Vulnerability / Defect',
    svgInner: `
      <rect x="22" y="22" width="20" height="24" rx="10" />
      <path d="M26 14l-4-6" /><path d="M38 14l4-6" />
      <path d="M14 26l8 4" /><path d="M50 26l-8 4" />
      <path d="M12 36h10" /><path d="M42 36h10" />
      <path d="M14 46l8-4" /><path d="M50 46l-8-4" />
    `,
  },
  gitBranch: {
    label: 'Git Branch / Workflow',
    svgInner: `
      <line x1="18" y1="12" x2="18" y2="52" />
      <circle cx="18" cy="18" r="6" /><circle cx="18" cy="46" r="6" /><circle cx="46" cy="18" r="6" />
      <path d="M46 24c0 12-28 10-28 22" />
    `,
  },
  network: {
    label: 'Network / Mesh / Traffic',
    svgInner: `
      <circle cx="32" cy="14" r="6" /><circle cx="14" cy="48" r="6" /><circle cx="50" cy="48" r="6" />
      <line x1="32" y1="20" x2="14" y2="42" /><line x1="32" y1="20" x2="50" y2="42" /><line x1="20" y1="48" x2="44" y2="48" />
    `,
  },
  key: {
    label: 'API Key / Secret / Auth',
    svgInner: `
      <circle cx="24" cy="32" r="12" /><line x1="36" y1="32" x2="52" y2="32" />
      <line x1="44" y1="32" x2="44" y2="40" /><line x1="50" y1="32" x2="50" y2="38" />
    `,
  },
  activity: {
    label: 'Activity / Pulse / Health',
    svgInner: `
      <polyline points="10 34 22 34 28 14 36 50 42 34 54 34" />
    `,
  },
  hardDrive: {
    label: 'Hard Drive / Storage / SSD',
    svgInner: `
      <rect x="12" y="16" width="40" height="32" rx="6" />
      <line x1="12" y1="36" x2="52" y2="36" />
      <circle cx="42" cy="42" r="2.5" fill="currentColor" />
      <circle cx="34" cy="42" r="2.5" fill="currentColor" />
    `,
  },
  arrowRightLeft: {
    label: 'Compare / Migration / Exchange',
    svgInner: `
      <polyline points="44 14 52 22 44 30" /><line x1="12" y1="22" x2="52" y2="22" />
      <polyline points="20 34 12 42 20 50" /><line x1="52" y1="42" x2="12" y2="42" />
    `,
  },
  checkCircle: {
    label: 'Success / Validated',
    svgInner: `
      <circle cx="32" cy="32" r="22" />
      <polyline points="22 32 29 39 42 24" />
    `,
  },
  xCircle: {
    label: 'Failure / Legacy / Flaw',
    svgInner: `
      <circle cx="32" cy="32" r="22" />
      <line x1="23" y1="23" x2="41" y2="41" />
      <line x1="41" y1="23" x2="23" y2="41" />
    `,
  },
  dollarSign: {
    label: 'Capital / Currency',
    svgInner: `
      <line x1="32" y1="8" x2="32" y2="56" />
      <path d="M44 18H26a8 8 0 0 0 0 16h12a8 8 0 0 1 0 16H18" />
    `,
  },
  landmark: {
    label: 'Bank / Institution / Gov',
    svgInner: `
      <polygon points="32 8 54 20 10 20 32 8" />
      <line x1="16" y1="20" x2="16" y2="46" />
      <line x1="26" y1="20" x2="26" y2="46" />
      <line x1="38" y1="20" x2="38" y2="46" />
      <line x1="48" y1="20" x2="48" y2="46" />
      <line x1="10" y1="52" x2="54" y2="52" />
      <line x1="12" y1="46" x2="52" y2="46" />
    `,
  },
  factory: {
    label: 'Power Plant / Infrastructure',
    svgInner: `
      <path d="M10 52V28l14 8V28l14 8V14h16v38H10z" />
      <line x1="20" y1="44" x2="20" y2="52" />
      <line x1="32" y1="44" x2="32" y2="52" />
      <line x1="46" y1="26" x2="46" y2="34" />
    `,
  },
  trendingDown: {
    label: 'Loss / Deficit / Risk',
    svgInner: `
      <polyline points="54 44 34 24 24 34 10 20" />
      <polyline points="40 44 54 44 54 30" />
    `,
  },
  trendingUp: {
    label: 'Valuation / Growth',
    svgInner: `
      <polyline points="54 20 34 40 24 30 10 44" />
      <polyline points="40 20 54 20 54 34" />
    `,
  },
  marrok: {
    label: 'MARROK Core',
    svgInner: `
    <rect
      width="64"
      height="64"
      rx="14"
      fill="#0D0D0D"
    />

    <g transform="translate(32, 32) scale(0.22) translate(-353.8, -383.45)">
      <path
        fill="#ffffff"
        d="${MARROK_LOGO_PATHS.pathMain}"
      />

      <path
        fill="#ffffff"
        d="${MARROK_LOGO_PATHS.pathRightBottom}"
      />

      <path
        fill="#364bde"
        d="${MARROK_LOGO_PATHS.pathAccent}"
      />

      <path
        fill="#ffffff"
        d="${MARROK_LOGO_PATHS.pathLeftFrame}"
      />
    </g>
  `,
  },
};

// Curated map of top tech brand logos from shared single source of truth
import { KNOWN_TECH_LOGOS, TECH_ICONS_LIST } from './techLogos.ts';
export { KNOWN_TECH_LOGOS, TECH_ICONS_LIST };



/**
 * Returns the authentic MARROK vector logo SVG with custom theme accent and rounded rectangle background.
 * Matches specs/marrok-logo-square-source.svg exactly with razor-sharp white geometry and themed accent polygon.
 */
export function getMarrokLogoSvg(accentColor = '#364bde', options?: { bg?: string; rx?: number }): string {
  const bg = options?.bg ?? '#0D0D0D';
  const rx = options?.rx ?? 40;
  const bgRect = bg !== 'transparent' ? `<rect x="234" y="263" width="240" height="240" rx="${rx}" fill="${bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="234 263 240 240">
    ${bgRect}
    <path fill="#ffffff" d="${MARROK_LOGO_PATHS.pathMain}"/>
    <path fill="#ffffff" d="${MARROK_LOGO_PATHS.pathRightBottom}"/>
    <path fill="${accentColor || '#364bde'}" d="${MARROK_LOGO_PATHS.pathAccent}"/>
    <path fill="#ffffff" d="${MARROK_LOGO_PATHS.pathLeftFrame}"/>
  </svg>`.trim();
}

let cachedMarrokLogoPaths2D: {
  pMain: Path2D;
  pRight: Path2D;
  pAccent: Path2D;
  pFrame: Path2D;
} | null = null;

function getMarrokLogoPaths2D() {
  if (!cachedMarrokLogoPaths2D && typeof Path2D !== 'undefined') {
    cachedMarrokLogoPaths2D = {
      pMain: new Path2D(MARROK_LOGO_PATHS.pathMain),
      pRight: new Path2D(MARROK_LOGO_PATHS.pathRightBottom),
      pAccent: new Path2D(MARROK_LOGO_PATHS.pathAccent),
      pFrame: new Path2D(MARROK_LOGO_PATHS.pathLeftFrame),
    };
  }
  return cachedMarrokLogoPaths2D;
}

/**
 * Renders the authentic MARROK vector logo badge directly using Path2D vector geometry.
 * Completely synchronous with zero image latency, scaled from true dead-center (353.8, 383.45).
 */
export function drawMarrokVectorBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  accentColor = '#364bde',
  bgColor = '#0D0D0D',
  borderRadius = size * 0.22
): void {
  // 1. Dark OLED rounded background plate
  if (bgColor && bgColor !== 'transparent') {
    ctx.save();
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    const half = size / 2;
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(cx - half, cy - half, size, size, borderRadius);
    } else {
      ctx.rect(cx - half, cy - half, size, size);
    }
    ctx.fill();
    ctx.restore();
  }

  // 2. Direct vector paths scaled from true dead-center (353.8, 383.45)
  // Scaling by size / 240 preserves the exact 240x240 viewBox proportions
  const scale = size / 240;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-MARROK_LOGO_PATHS.center.x, -MARROK_LOGO_PATHS.center.y);

  const paths = getMarrokLogoPaths2D();
  if (paths) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fill(paths.pMain);
    ctx.fill(paths.pRight);
    ctx.fill(paths.pFrame);

    ctx.fillStyle = accentColor;
    ctx.fill(paths.pAccent);
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(262, 289, 182, 185);
    ctx.fillStyle = accentColor;
    ctx.fillRect(400, 298, 45, 38);
  }

  ctx.restore();
}

export function getIconSvg(iconName: string, strokeColor = '#13131E', strokeWidth = 4.2): string {
  const lower = iconName.toLowerCase().trim();
  if (lower === 'marrok' || lower === 'marroklogo') {
    return getMarrokLogoSvg(strokeColor === '#13131E' ? '#364bde' : strokeColor);
  }
  const icon = ICONS_REGISTRY[iconName] || ICONS_REGISTRY.gitMerge;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">
      ${icon.svgInner}
    </svg>
  `.trim();
}

export function getIconDataUrl(iconName: string, strokeColor = '#13131E', strokeWidth = 4.2): string {
  const lower = iconName.toLowerCase().trim();
  if (lower === 'marrok' || lower === 'marroklogo') {
    const svg = getMarrokLogoSvg(strokeColor === '#13131E' ? '#364bde' : strokeColor);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  // Check if iconName is already a data URL or blob URL
  if (iconName.startsWith('data:') || iconName.startsWith('blob:')) {
    return iconName;
  }
  // Check if iconName is a direct web URL
  if (iconName.startsWith('http://') || iconName.startsWith('https://')) {
    const colorParam = strokeColor ? `&color=${encodeURIComponent(strokeColor)}` : '';
    return `/api/proxy-image?url=${encodeURIComponent(iconName)}${colorParam}`;
  }
  // Check if iconName is a known tech logo
  if (KNOWN_TECH_LOGOS[lower]) {
    const colorParam = strokeColor ? `&color=${encodeURIComponent(strokeColor)}` : '';
    return `/api/proxy-image?url=${encodeURIComponent(KNOWN_TECH_LOGOS[lower])}${colorParam}`;
  }
  const svg = getIconSvg(iconName, strokeColor, strokeWidth);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
