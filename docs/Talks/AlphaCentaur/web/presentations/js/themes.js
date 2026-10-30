// Color palettes, font pairings, the font catalog, and the CSS that turns a
// deck theme into --pz-* custom properties. Elements refer to theme colors by
// token ("accent") so a palette change restyles the whole deck at once.

export const COLOR_TOKENS = ['bg', 'surface', 'text', 'muted', 'accent', 'accent2'];
export const COLOR_LABELS = {
  bg: 'Background', surface: 'Surface', text: 'Text', muted: 'Muted', accent: 'Accent', accent2: 'Accent 2',
};

export const PALETTES = [
  { id: 'midnight', name: 'Midnight', colors: { bg: '#0b1020', surface: '#18203a', text: '#e9edf8', muted: '#97a3c4', accent: '#7c9cff', accent2: '#f6a85b' } },
  { id: 'paper', name: 'Paper', colors: { bg: '#faf7f0', surface: '#efe8d9', text: '#211e1a', muted: '#736d62', accent: '#b0452a', accent2: '#2f6c8f' } },
  { id: 'ocean', name: 'Harbor', colors: { bg: '#f4f8f9', surface: '#e2eef0', text: '#152c3e', muted: '#5f7987', accent: '#087e6c', accent2: '#d9822b' } },
  { id: 'chalk', name: 'Chalkboard', colors: { bg: '#1f2d26', surface: '#2a3b32', text: '#f2f0e6', muted: '#a9b8aa', accent: '#f2d36b', accent2: '#8fd3e8' } },
  { id: 'swiss', name: 'Swiss', colors: { bg: '#ffffff', surface: '#f0f0f0', text: '#111111', muted: '#6b6b6b', accent: '#e63323', accent2: '#1d4ed8' } },
  { id: 'aurora', name: 'Aurora', colors: { bg: '#130f20', surface: '#1f1933', text: '#f5f1ff', muted: '#aaa1c8', accent: '#c084fc', accent2: '#34d399' } },
  { id: 'solar', name: 'Solarized', colors: { bg: '#fdf6e3', surface: '#eee8d5', text: '#073642', muted: '#657b83', accent: '#268bd2', accent2: '#d33682' } },
  { id: 'ember', name: 'Ember', colors: { bg: '#1a1412', surface: '#2a201c', text: '#f7ede6', muted: '#b9a499', accent: '#ff7a45', accent2: '#ffd166' } },
  { id: 'vaporwave', name: 'Vaporwave', colors: { bg: '#1d1135', surface: '#2c1a52', text: '#fbeaff', muted: '#b9a3d9', accent: '#ff71ce', accent2: '#01cdfe' } },
  { id: 'cyberpunk', name: 'Cyberpunk', colors: { bg: '#0a0b10', surface: '#151824', text: '#e8f6ff', muted: '#8a9bb0', accent: '#fcee0a', accent2: '#00f0ff' } },
  { id: 'parchment', name: 'Parchment', colors: { bg: '#f3e7c9', surface: '#e8d6ab', text: '#3b2a1a', muted: '#7a6248', accent: '#8b2e1a', accent2: '#2f4a6b' } },
];

// Google Fonts families. `spec` is the css2 axis request; families without
// italics only ask for weights so the request never 400s.
export const FONTS = {
  'Inter': { spec: 'ital,wght@0,400;0,500;0,700;1,400;1,700', fallback: 'system-ui, sans-serif' },
  'Source Sans 3': { spec: 'ital,wght@0,400;0,600;0,700;1,400', fallback: 'system-ui, sans-serif' },
  'IBM Plex Sans': { spec: 'ital,wght@0,400;0,500;0,700;1,400', fallback: 'system-ui, sans-serif' },
  'Space Grotesk': { spec: 'wght@400;500;700', fallback: 'system-ui, sans-serif' },
  'Nunito Sans': { spec: 'ital,wght@0,400;0,700;1,400', fallback: 'system-ui, sans-serif' },
  'Quicksand': { spec: 'wght@400;500;700', fallback: 'system-ui, sans-serif' },
  'Fraunces': { spec: 'ital,wght@0,400;0,600;0,800;1,400', fallback: 'Georgia, serif' },
  'Playfair Display': { spec: 'ital,wght@0,400;0,700;1,400', fallback: 'Georgia, serif' },
  'EB Garamond': { spec: 'ital,wght@0,400;0,600;0,700;1,400', fallback: 'Georgia, serif' },
  'IM Fell English': { spec: 'ital@0;1', fallback: '"Hoefler Text", Georgia, serif' },
  'Source Serif 4': { spec: 'ital,wght@0,400;0,600;0,700;1,400', fallback: 'Georgia, serif' },
  'STIX Two Text': { spec: 'ital,wght@0,400;0,600;0,700;1,400', fallback: 'Georgia, serif' },
  'Lora': { spec: 'ital,wght@0,400;0,600;0,700;1,400', fallback: 'Georgia, serif' },
  'JetBrains Mono': { spec: 'ital,wght@0,400;0,700;1,400', fallback: 'ui-monospace, monospace' },
  'IBM Plex Mono': { spec: 'ital,wght@0,400;0,600;1,400', fallback: 'ui-monospace, monospace' },
};
// Families that need no download.
export const SYSTEM_FONTS = {
  'System UI': 'system-ui, -apple-system, "Segoe UI", sans-serif',
  'Georgia': 'Georgia, "Times New Roman", serif',
  'Helvetica': '"Helvetica Neue", Helvetica, Arial, sans-serif',
  'Menlo': 'Menlo, Consolas, monospace',
};

export const FONT_PAIRS = [
  { id: 'modern', name: 'Modern', heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono' },
  { id: 'scholar', name: 'Scholar', heading: 'STIX Two Text', body: 'STIX Two Text', mono: 'IBM Plex Mono' },
  { id: 'editorial', name: 'Editorial', heading: 'Fraunces', body: 'Source Sans 3', mono: 'JetBrains Mono' },
  { id: 'classic', name: 'Classic', heading: 'Playfair Display', body: 'Source Serif 4', mono: 'IBM Plex Mono' },
  { id: 'garamond', name: 'Garamond', heading: 'EB Garamond', body: 'EB Garamond', mono: 'IBM Plex Mono' },
  { id: 'antique', name: 'Antique', heading: 'IM Fell English', body: 'EB Garamond', mono: 'IBM Plex Mono' },
  { id: 'technical', name: 'Technical', heading: 'Space Grotesk', body: 'IBM Plex Sans', mono: 'IBM Plex Mono' },
  { id: 'friendly', name: 'Friendly', heading: 'Quicksand', body: 'Nunito Sans', mono: 'JetBrains Mono' },
  { id: 'system', name: 'System', heading: 'Helvetica', body: 'System UI', mono: 'Menlo' },
];

export const FONT_ROLES = ['heading', 'body', 'mono'];

export function defaultTheme() {
  const p = PALETTES[0], f = FONT_PAIRS[0];
  return { palette: p.id, colors: { ...p.colors }, fontPair: f.id, fonts: { heading: f.heading, body: f.body, mono: f.mono } };
}

export function fontStack(family) {
  if (!family) return 'system-ui, sans-serif';
  if (SYSTEM_FONTS[family]) return SYSTEM_FONTS[family];
  const f = FONTS[family];
  return `"${family}", ${f ? f.fallback : 'system-ui, sans-serif'}`;
}

export function googleFontURL(family) {
  const f = FONTS[family];
  if (!f) return null;
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:${f.spec}&display=swap`;
}

// A color value is either a theme token or a literal CSS color.
export function cssColor(v) {
  if (!v || v === 'none') return 'transparent';
  return COLOR_TOKENS.includes(v) ? `var(--pz-${v})` : v;
}
// A font value is either a role ("heading") or a family name.
export function cssFont(v) {
  return FONT_ROLES.includes(v) ? `var(--pz-font-${v})` : fontStack(v);
}
export function resolveColor(theme, v) {
  if (!v || v === 'none') return null;
  return COLOR_TOKENS.includes(v) ? theme.colors[v] : v;
}

export function themeVars(theme) {
  const c = theme.colors, f = theme.fonts;
  return COLOR_TOKENS.map(t => `--pz-${t}:${c[t]}`).join(';')
    + `;--pz-font-heading:${fontStack(f.heading)};--pz-font-body:${fontStack(f.body)};--pz-font-mono:${fontStack(f.mono)}`;
}

// Is a color dark?  Used to pick contrasting chrome (placeholder ink, etc.).
export function isDark(hex) {
  const m = /^#?([0-9a-f]{6})/i.exec(hex || '');
  if (!m) return false;
  const n = parseInt(m[1], 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

export const DEFAULT_MACROS = String.raw`\newcommand{\N}{\mathbb{N}}
\newcommand{\Z}{\mathbb{Z}}
\newcommand{\Q}{\mathbb{Q}}
\newcommand{\R}{\mathbb{R}}
\newcommand{\C}{\mathbb{C}}
\newcommand{\HH}{\mathbb{H}}
\newcommand{\SL}{\mathrm{SL}}
\newcommand{\PSL}{\mathrm{PSL}}
\newcommand{\GL}{\mathrm{GL}}
\newcommand{\PGL}{\mathrm{PGL}}
\newcommand{\SO}{\mathrm{SO}}
\newcommand{\Aut}{\mathrm{Aut}}
\newcommand{\Hom}{\mathrm{Hom}}
\newcommand{\abs}[1]{\left|#1\right|}`;
