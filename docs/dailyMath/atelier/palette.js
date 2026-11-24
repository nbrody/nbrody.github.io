/* Daily Math Atelier — dual-mode OKLCH / mineral palette & color utilities */
(function (root) {
  'use strict';
  const DM = (root.DM = root.DM || {});

  const THEMES = {
    light: {
      mode: 'light',
      name: 'Museum Parchment',
      bg: '#f5f1e8',
      bgAlt: '#ece5d7',
      surface: '#fbf8f2',
      ink: '#1c1915',
      ink2: '#4c463d',
      muted: '#665e52',
      hairline: '#d6cebf',
      hairlineStrong: '#b5aa96',
      cobalt: '#1f4e96',
      vermilion: '#b83b28',
      verdigris: '#1b7365',
      ochre: '#9e6211',
      plum: '#6c3d8c',
      slate: '#4a5d73',
      ok: '#1b7365',
      bad: '#b83b28',
      categorical: ['#1f4e96', '#b83b28', '#1b7365', '#9e6211', '#6c3d8c', '#4a5d73'],
    },
    dark: {
      mode: 'dark',
      name: 'Observatory Obsidian',
      bg: '#0a0c12',
      bgAlt: '#131826',
      surface: '#121621',
      ink: '#eeeae0',
      ink2: '#b7b3a8',
      muted: '#918d83',
      hairline: '#232938',
      hairlineStrong: '#394257',
      cobalt: '#76a9fa',
      vermilion: '#f27c68',
      verdigris: '#5ed4be',
      ochre: '#e8b85c',
      plum: '#c299f2',
      slate: '#8ea2ba',
      ok: '#5ed4be',
      bad: '#f27c68',
      categorical: ['#76a9fa', '#f27c68', '#5ed4be', '#e8b85c', '#c299f2', '#8ea2ba'],
    },
  };

  function clamp01(t) {
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }

  function hexToRgb(hex) {
    if (Array.isArray(hex)) return hex.slice(0, 3);
    const h = String(hex).replace('#', '').trim();
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(rgb) {
    const c = rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'));
    return '#' + c.join('');
  }

  function rgba(color, alpha = 1) {
    const [r, g, b] = Array.isArray(color) ? color : hexToRgb(color);
    const a = clamp01(alpha);
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a.toFixed(4)})`;
  }

  // sRGB <-> linear <-> OKLab (Bjorn Ottosson 2020)
  function srgbToLin(c) {
    const u = c / 255;
    return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
  }

  function linToSrgb(u) {
    const v = u <= 0 ? 0 : u >= 1 ? 1 : u;
    const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(s * 255)));
  }

  function rgbToOklab(rgb) {
    const r = srgbToLin(rgb[0]);
    const g = srgbToLin(rgb[1]);
    const b = srgbToLin(rgb[2]);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
  }

  function oklabToRgb(lab) {
    const l_ = lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2];
    const m_ = lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2];
    const s_ = lab[0] - 0.0894841775 * lab[1] - 1.2914855480 * lab[2];
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;
    return [
      linToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
    ];
  }

  function mix(colorA, colorB, t) {
    const u = clamp01(t);
    const a = rgbToOklab(hexToRgb(colorA));
    const b = rgbToOklab(hexToRgb(colorB));
    return oklabToRgb([
      a[0] + (b[0] - a[0]) * u,
      a[1] + (b[1] - a[1]) * u,
      a[2] + (b[2] - a[2]) * u,
    ]);
  }

  function luminance(color) {
    const [r, g, b] = hexToRgb(color);
    return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
  }

  function contrastRatio(c1, c2) {
    const l1 = luminance(c1);
    const l2 = luminance(c2);
    const hi = Math.max(l1, l2);
    const lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  const RAMP_STOPS = {
    light: {
      mineral: ['#ece5d7', '#94b0cf', '#1f4e96', '#1b7365', '#9e6211'],
      thermal: ['#fbf8f2', '#e8b85c', '#d16a38', '#b83b28', '#521518'],
      phase:   ['#1f4e96', '#1b7365', '#9e6211', '#b83b28', '#6c3d8c', '#1f4e96'],
      diverge: ['#1f4e96', '#7fa1cc', '#ece5d7', '#d47c68', '#b83b28'],
    },
    dark: {
      mineral: ['#131826', '#28456c', '#5ed4be', '#76a9fa', '#eeeae0'],
      thermal: ['#131826', '#5e232a', '#b83b28', '#e8b85c', '#fbf6e9'],
      phase:   ['#76a9fa', '#5ed4be', '#e8b85c', '#f27c68', '#c299f2', '#76a9fa'],
      diverge: ['#76a9fa', '#34588c', '#1a2030', '#9c4338', '#f27c68'],
    },
  };

  function resolveMode(mode) {
    if (mode === 'light' || mode === 'dark') return mode;
    if (DM.currentTheme) return DM.currentTheme();
    return 'light';
  }

  function ramp(t, name = 'mineral', mode) {
    const m = resolveMode(mode);
    const stops = (RAMP_STOPS[m] && RAMP_STOPS[m][name]) || RAMP_STOPS[m].mineral;
    const u = name === 'phase' ? (((t % 1) + 1) % 1) : clamp01(t);
    const scaled = u * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(scaled));
    return mix(stops[i], stops[i + 1], scaled - i);
  }

  function palette(mode) {
    return THEMES[resolveMode(mode)];
  }

  DM.THEMES = THEMES;
  DM.hexToRgb = hexToRgb;
  DM.rgbToHex = rgbToHex;
  DM.rgba = rgba;
  DM.mix = mix;
  DM.luminance = luminance;
  DM.contrastRatio = contrastRatio;
  DM.ramp = ramp;
  DM.palette = palette;
})(typeof window !== 'undefined' ? window : globalThis);
