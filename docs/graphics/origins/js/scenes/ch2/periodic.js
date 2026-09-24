// periodic.js — a periodic table drawn on the 2D layer, each cell tinted by
// where that element was made (after Jennifer Johnson's "origin of the
// elements" table): the Big Bang, stellar fusion and supernovae, or
// neutron-star collisions. The elements our supernova just scattered light up.

// [symbol, period (row), group (column)] for the 18-column main table.
const LAYOUT = `
H 1 1|He 1 18
Li 2 1|Be 2 2|B 2 13|C 2 14|N 2 15|O 2 16|F 2 17|Ne 2 18
Na 3 1|Mg 3 2|Al 3 13|Si 3 14|P 3 15|S 3 16|Cl 3 17|Ar 3 18
K 4 1|Ca 4 2|Sc 4 3|Ti 4 4|V 4 5|Cr 4 6|Mn 4 7|Fe 4 8|Co 4 9|Ni 4 10|Cu 4 11|Zn 4 12|Ga 4 13|Ge 4 14|As 4 15|Se 4 16|Br 4 17|Kr 4 18
Rb 5 1|Sr 5 2|Y 5 3|Zr 5 4|Nb 5 5|Mo 5 6|Tc 5 7|Ru 5 8|Rh 5 9|Pd 5 10|Ag 5 11|Cd 5 12|In 5 13|Sn 5 14|Sb 5 15|Te 5 16|I 5 17|Xe 5 18
Cs 6 1|Ba 6 2|La 6 3|Hf 6 4|Ta 6 5|W 6 6|Re 6 7|Os 6 8|Ir 6 9|Pt 6 10|Au 6 11|Hg 6 12|Tl 6 13|Pb 6 14|Bi 6 15|Po 6 16|At 6 17|Rn 6 18
Fr 7 1|Ra 7 2|Ac 7 3|Rf 7 4|Db 7 5|Sg 7 6|Bh 7 7|Hs 7 8|Mt 7 9|Ds 7 10|Rg 7 11|Cn 7 12|Nh 7 13|Fl 7 14|Mc 7 15|Lv 7 16|Ts 7 17|Og 7 18`
  .trim().split(/\n|\|/).map((s) => {
    const [sym, r, c] = s.trim().split(' ');
    return { sym, row: +r, col: +c };
  });

const ORIGIN = {
  bigbang: { color: [0.45, 0.7, 1.0], label: 'Big Bang' },
  stars: { color: [1.0, 0.75, 0.35], label: 'Stars & supernovae' },
  mergers: { color: [0.8, 0.5, 1.0], label: 'Neutron-star collisions' },
  none: { color: [0.5, 0.5, 0.55], label: '' },
};
const originOf = (sym, row, col) => {
  if (sym === 'H' || sym === 'He') return 'bigbang';
  if (row >= 7 || sym === 'Tc' || sym === 'Pm') return 'none';
  if (row <= 3 || (row === 4 && col <= 12) || sym === 'Ga' || sym === 'Ge') return 'stars';
  return 'mergers';
};

// elements present in our supernova's debris
const PRESENT = new Set(['H', 'He', 'C', 'N', 'O', 'Ne', 'Mg', 'Si', 'S', 'Fe', 'P']);

export function drawPeriodicTable(R, { alpha, highlight, cx, cy, width }) {
  if (alpha <= 0.01) return;
  const g = R.begin2D();
  const cell = width / 18;
  const x0 = cx - width / 2, y0 = cy - cell * 3.9;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const e of LAYOUT) {
    const o = ORIGIN[originOf(e.sym, e.row, e.col)];
    const x = x0 + (e.col - 1) * cell, y = y0 + (e.row - 1) * cell;
    const lit = PRESENT.has(e.sym) ? highlight : 0;
    const [r, gg, b] = o.color.map((v) => Math.round(v * 255));
    g.fillStyle = `rgba(${r},${gg},${b},${alpha * (0.07 + 0.3 * lit)})`;
    g.fillRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
    g.strokeStyle = `rgba(${r},${gg},${b},${alpha * (0.22 + 0.6 * lit)})`;
    g.lineWidth = 1;
    g.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
    g.font = `${lit > 0.5 ? 600 : 400} ${Math.round(cell * 0.36)}px "Avenir Next", "Helvetica Neue", sans-serif`;
    g.fillStyle = `rgba(255,255,255,${alpha * (0.3 + 0.65 * lit)})`;
    g.fillText(e.sym, x + cell / 2, y + cell / 2 + 1);
  }
  // legend, in the notch above the transition metals
  g.textAlign = 'left';
  g.font = `400 ${Math.round(cell * 0.34)}px "Avenir Next", "Helvetica Neue", sans-serif`;
  const lx = x0 + cell * 3.6;
  ['bigbang', 'stars', 'mergers'].forEach((key, k) => {
    const o = ORIGIN[key];
    const ly = y0 + cell * (0.75 + k * 0.72);
    const [r, gg, b] = o.color.map((v) => Math.round(v * 255));
    g.fillStyle = `rgba(${r},${gg},${b},${alpha * 0.85})`;
    g.fillRect(lx, ly - cell * 0.13, cell * 0.26, cell * 0.26);
    g.fillStyle = `rgba(235,240,255,${alpha * 0.72})`;
    g.fillText(o.label, lx + cell * 0.45, ly + 1);
  });
}
