// scenes.js — the scene library: complete, launchable states of the whole rig.
//
// A scene is a held look (the same vocabulary as the shows), a formation for the
// 30 truss sticks, and every optional device, given as panel control values.
// Launching one always moves smoothly: colour and intensity crossfade, heads
// pan/tilt at motor speed, sticks travel and flip at hoist speed, and devices
// come and go on their own travel — tubes rise out of the deck or grow out of
// the truss, balls fly in from the grid, the projection screen flies in.
//
// Stick formations: `kin` takes the usual shape/h/amp/roll/period plus
//   flip     — 0…1, how far each stick turns toward vertical (1 = straight up)
//   flipMode — all | alt | lattice | outer | inner | fan (see engine FLIP_MODES)
//   flipWave — a flip that rolls through the rows over time
//
// Thumbnails live in scenes/<id>.webp; regenerate them with
//   node docs/graphics/scripts/lightDesigner-scene-thumbs.mjs   (repo served on :8124)

import { L, K, merge, cyc } from './shows.js';

/** Every scene starts from this: nothing extra. */
export const DEVICE_BASE = {
  laserOn: false, tubesOn: false, ballCount: '0', blindersOn: false, strobesOn: false, liquidOn: false, co2On: false,
};

const s = (id, name, look, devices = {}, extra = {}) => ({ id, name, look, devices, ...extra });
const withKin = (look, kin) => merge(look, { kin });

export const SCENES = [
  s('hush', 'Blue Hush',
    merge(L.dark({ cycCol: K.blue }), L.wash({ col: K.royal, dim: 0.4 }), L.floorUp({ col: K.blue, dim: 0.3, rate: 32 }), { kin: { shape: 'flat', h: 11 } }),
    {}, { bpm: 96, thumbCam: 'low' }),
  s('curtain', 'Teal Curtain',
    merge(L.curtain({ col: K.teal, alt: K.cyan, dim: 0.75, ripple: 14, rate: 16, kin: { shape: 'arch', h: 10, amp: 1.4 } }), L.floorUp({ col: K.blue, dim: 0.35 })),
    {}, { thumbCam: 'angle' }),
  s('magentaX', 'Magenta X',
    merge(L.converge({ col: K.magenta, alt: K.uv, dim: 0.95, circle: 10, rate: 8, kin: { shape: 'vee', h: 10.5, amp: 1, roll: 0.25 } }), L.floorUp({ col: K.uv, dim: 0.6, rate: 8 }))),
  s('goldSweep', 'Gold Sweep',
    merge(L.sweep({ col: K.gold, alt: K.amber, dim: 1, swing: 28, rate: 4, cycCol: K.amber, kin: { shape: 'wave', h: 9.5, amp: 1.4, period: 16, roll: 0.25 } }), L.floorUp({ col: K.gold, dim: 0.8, rate: 4 })),
    { blindersOn: true, blinderMode: 'phrase' }),
  s('smiles', 'Smiles & Frowns',
    merge(L.fan({ col: K.lime, alt: K.cyan, dim: 0.9, tilt: 38, fan: 45, zoom: 3.5, chase: { w: 'square', rate: 2, spread: 360, by: 'pod' }, kin: { shape: 'vee', h: 9.5, amp: 0.6, roll: 0.38 } }), L.floorUp({ col: K.magenta, dim: 0.6, rate: 4 })),
    { tubesOn: true, tubeLayout: 'truss', tubeLook: 'follow', tubeColor: 'rig' }),
  s('rainbowPeak', 'Rainbow Peak',
    L.peak({ col: K.red, alt: K.cyan, rate: 1, hueSpread: 300 }),
    { strobesOn: true, strobeMode: 'show', laserOn: true, laserPattern: 'fan', laserColor: 'rainbow' }, { bpm: 128 }),
  s('starfield', 'Starfield',
    merge(L.rain({ col: K.ice, dim: 0.7, rate: 1, zoom: 1.2, kin: { shape: 'breathe', h: 12, amp: 0.8, period: 96 } }), L.dark({ floor: 0, cycCol: K.blue, cycDim: 0.12 })),
    { ballCount: '1', ballColor: 'white', ballSpin: 1.2 }, { bpm: 80 }),
  s('laserSky', 'Liquid Sky',
    merge(L.dark({ col: K.green, cycCol: K.green }), L.wash({ col: K.teal, dim: 0.25, g: 'pods', zoom: 26 }), { kin: { shape: 'flat', h: 11.5 } }),
    { laserOn: true, laserPattern: 'sky', laserColor: 'green', tubesOn: true, tubeLayout: 'curtain', tubeLook: 'rain', tubeColor: 'fixed', tubeFixed: '#10ff48' }, { bpm: 124 }),
  s('co2Drop', 'The Drop',
    L.peak({ col: K.white, alt: K.gold, rate: 0.5 }),
    { co2On: true, co2Mode: 'phrase', strobesOn: true, strobeMode: 'phrase', blindersOn: true, blinderMode: 'phrase' }, { bpm: 132 }),
  s('dome', 'Violet Dome',
    merge(L.fan({ col: K.violet, alt: K.uv, dim: 0.85, tilt: 30, fan: 20, zoom: 4, chase: { rate: 8, by: 'pod' }, kin: { shape: 'arch', h: 9.8, amp: 2, roll: -0.3 } }), L.floorUp({ col: K.uv, dim: 0.5 })),
    {}, { thumbCam: 'foh' }),
  s('columns', 'Standing Columns',
    merge({
      // sticks stood straight up; heads aimed up and out through the grid like searchlights
      layers: [{ g: 'pods', col: K.ice, alt: K.royal, dim: 0.85, aim: 'sky', spread: [60, 0, 20], spreadPod: [0, 0, -25], zoom: 2.6, frost: 0.05 }],
      fx: [{ g: 'pods', a: 'dim', w: 'sin', rate: 8, size: 0.6, spread: 360, by: 'x' }, { g: 'pods', a: 'tilt', w: 'sin', rate: 16, size: 10, spread: 360, by: 'pod' }],
      kin: { shape: 'arch', h: 8.8, amp: 0.8, flip: 1, flipMode: 'all' },
      cyc: cyc(K.black, K.royal, 0.25),
    }, L.floorUp({ col: K.royal, dim: 0.5 })),
    {}, { thumbCam: 'angle' }),
  s('ringTilt', 'Tilting Rows',
    L.ballyhoo({ col: K.magenta, alt: K.orange, dim: 0.9, size: 18, rate: 8, zoom: 3.5, tilt: 25, kin: { shape: 'wave', h: 10, amp: 0.8, period: 32, roll: 0.35, flipWave: 0.3, flipMode: 'alt' } }),
    {}, { thumbCam: 'angle' }),
  s('sunset', 'Sunset Arches',
    withKin(L.sunrise({ col: K.amber, sun: K.gold, dim: 0.85 }), { shape: 'twist', h: 10, amp: 0.8, period: 64, roll: -0.3 }),
    { liquidOn: true, liquidPalette: 'classic', liquidLevel: 0.45 }, { bpm: 92 }),
  s('portal', 'Portal Tunnel',
    // outer sticks stood up as legs: each row becomes a frame, the rows a tunnel; beams spiral down it
    merge(L.tunnel({ col: K.green, alt: K.teal, dim: 0.85, size: 9, rate: 8, target: 'cyc', kin: { shape: 'rake', h: 9.2, amp: -1.3, flip: 1, flipMode: 'outer' } }), L.floorUp({ col: K.teal, dim: 0.5 })),
    {}, { thumbCam: 'foh' }),
  s('diamonds', 'Diamond Lattice',
    L.split({ left: K.magenta, right: K.cyan, dim: 0.9, rate: 4, kin: { shape: 'flat', h: 9.8, flip: 0.5, flipMode: 'lattice' } }),
    { tubesOn: true, tubeLayout: 'columns', tubeLook: 'chase', tubeColor: 'rainbow' }),
  s('popWall', 'Pop-Art Rows',
    L.funk({ a: K.lime, b: K.magenta, rate: 1, kin: { shape: 'flat', h: 7.8, amp: 0 } }),
    { tubesOn: true, tubeLayout: 'truss', tubeLook: 'wave', tubeColor: 'rainbow' }, { bpm: 112 }),
  s('wallSplit', 'The Rig Splits',
    withKin(L.peak({ col: K.white, alt: K.cyan, rate: 1 }), { shape: 'chaos', h: 9.5, amp: 1.6, period: 16, roll: 0.35, flipWave: 0.45, flipMode: 'alt' }),
    { strobesOn: true, strobeMode: 'show' }),
  s('sphere', 'Sphere Spiral',
    merge(L.converge({ col: K.red, alt: K.gold, dim: 0.9, circle: 18, rate: 4, point: 'air', kin: { shape: 'breathe', h: 9.8, amp: 1, period: 32, roll: -0.25, flipWave: 0.35, flipMode: 'fan' } }), { fx: [{ g: 'pods', a: 'hue', w: 'saw', rate: 32, size: 180, spread: 360, by: 'pod' }] }),
    { laserOn: true, laserPattern: 'tunnel', laserColor: 'rgb' }),
  s('sixtyseven', 'Liquid ’67',
    merge(L.wash({ col: K.warm, dim: 0.35, g: 'pods', zoom: 30 }), L.specials({ col: K.warm, dim: 0.6 }), { cyc: cyc(K.amber, K.black, 0.1), kin: { shape: 'flat', h: 11 } }),
    { liquidOn: true, liquidPalette: 'classic', liquidLevel: 0.8, ballCount: '1', ballColor: 'rig' }, { bpm: 84 }),
  s('disco', 'Disco Inferno',
    merge(L.fan({ col: K.pink, alt: K.gold, dim: 0.8, tilt: 50, fan: 45, zoom: 4, chase: { w: 'square', rate: 1, spread: 360, by: 'x', size: 0.8 }, kin: { shape: 'breathe', h: 10.5, amp: 0.5, period: 16 } })),
    { ballCount: '3', ballColor: 'rainbow', tubesOn: true, tubeLayout: 'canopy', tubeLook: 'sparkle', tubeColor: 'white' }, { bpm: 120 }),
  s('blackout', 'Blackout',
    { layers: [], kin: { shape: 'flat', h: 11 } }),
];
