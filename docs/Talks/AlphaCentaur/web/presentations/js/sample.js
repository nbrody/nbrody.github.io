// The tour deck: a short presentation that shows off each feature.

import { newDeck, makeText, makeMath, makeShape, makeApplet, makeSlide } from './model.js';
import { PALETTES, FONT_PAIRS } from './themes.js';
import { APPLETS } from './applets.js';

const T = String.raw;

export function sampleDeck() {
  const deck = newDeck('A tour of alphaPresent');
  const pal = PALETTES.find(p => p.id === 'midnight'), fp = FONT_PAIRS.find(f => f.id === 'editorial');
  deck.theme = { palette: pal.id, colors: { ...pal.colors }, fontPair: fp.id, fonts: { heading: fp.heading, body: fp.body, mono: fp.mono } };

  const title = makeSlide([
    makeShape('rect', { x: 166, y: 318, w: 120, h: 12, extra: { radius: 6, fill: 'accent' } }),
    makeText({ role: 'eyebrow', x: 160, y: 250, w: 1200, h: 40, html: '<p>alphaPresent · alphaCentaur</p>' }),
    makeText({ role: 'title', x: 160, y: 360, w: 1500, h: 120, html: '<p>Slides that are web pages</p>' }),
    makeText({ role: 'subtitle', x: 160, y: 520, w: 1300, h: 70, html: '<p>Text, LaTeX, images, shapes and live applets — saved as one fullPage.js HTML file.</p>' }),
  ], { bg: { kind: 'gradient', color: 'bg', color2: 'surface', angle: 160 }, notes: 'Welcome! Press N while presenting to show these notes; F for fullscreen.' });

  const mathSlide = makeSlide([
    makeText({ role: 'heading', x: 140, y: 96, w: 1640, h: 90, html: '<p>Write mathematics anywhere</p>' }),
    makeText({
      role: 'body', x: 140, y: 250, w: 1640, h: 560,
      html: T`<ul><li>Inline math in any text box: $\SL_2(\Z)$ acts on $\HH^2$ by $z \mapsto \frac{az+b}{cz+d}$.</li><li>Display math gets its own line: $$\sum_{n\ge 1} \frac{1}{n^2} = \frac{\pi^2}{6}$$</li><li>Deck-wide macros live in <b>Design → Math</b>.</li><li>Each bullet on this slide appears on its own click.</li></ul>`,
      extra: { build: 1, buildBy: 'paragraph', anim: 'rise' },
    }),
  ], { notes: 'Builds: select a box, Format → Build → "On click", then "By paragraph".' });

  const theorem = makeSlide([
    makeText({ role: 'eyebrow', x: 160, y: 200, w: 1600, h: 40, align: 'center', html: '<p>Theorem (Sanov, 1947)</p>' }),
    makeShape('rect', { x: 260, y: 290, w: 1400, h: 340, extra: { radius: 28, fill: 'surface' } }),
    makeMath({ x: 300, y: 320, w: 1320, h: 280, size: 76, tex: T`\left\langle \begin{pmatrix} 1 & 2 \\ 0 & 1 \end{pmatrix},\ \begin{pmatrix} 1 & 0 \\ 2 & 1 \end{pmatrix} \right\rangle \;\cong\; F_2` }),
    makeText({ role: 'caption', x: 260, y: 690, w: 1400, h: 50, align: 'center', html: T`<p>The two matrices generate a free group — ping-pong on the cones $|x|>|y|$ and $|y|>|x|$.</p>` }),
  ]);

  const A = makeShape('arrow', { x: 760, y: 360, w: 400, h: 40, extra: { stroke: 'accent', strokeW: 6, build: 1, anim: 'wipe' } });
  const B = makeShape('arrow', { x: 760, y: 680, w: 400, h: 40, extra: { stroke: 'accent2', strokeW: 6, build: 2, anim: 'wipe' } });
  B.rot = 180;
  const diagram = makeSlide([
    makeText({ role: 'heading', x: 140, y: 80, w: 1640, h: 90, html: '<p>Arrange anything</p>' }),
    makeShape('ellipse', { x: 300, y: 330, w: 440, h: 420, extra: { fill: '#7c9cff33', stroke: 'accent', strokeW: 4 } }),
    makeShape('ellipse', { x: 1180, y: 330, w: 440, h: 420, extra: { fill: '#f6a85b33', stroke: 'accent2', strokeW: 4 } }),
    makeText({ role: 'heading', x: 470, y: 490, w: 100, h: 90, align: 'center', html: '<p>$Y$</p>' }),
    makeText({ role: 'heading', x: 1350, y: 490, w: 100, h: 90, align: 'center', html: '<p>$X$</p>' }),
    A, B,
    makeText({ role: 'body', x: 760, y: 290, w: 400, h: 60, align: 'center', html: T`<p>$A^{\pm 1}(Y) \subset X$</p>`, extra: { build: 1 } }),
    makeText({ role: 'body', x: 760, y: 730, w: 400, h: 60, align: 'center', html: T`<p>$B^{\pm 1}(X) \subset Y$</p>`, extra: { build: 2 } }),
    makeText({ role: 'caption', x: 140, y: 900, w: 1640, h: 50, align: 'center', html: '<p>Drag to move · smart guides snap to edges and centers · round handle rotates · arrows appear on click</p>' }),
  ]);

  const ford = APPLETS.find(a => a.id === 'ford');
  const applet = makeSlide([
    makeText({ role: 'heading', x: 120, y: 120, w: 640, h: 90, html: '<p>Live applets</p>' }),
    makeText({ role: 'body', x: 120, y: 260, w: 640, h: 400, html: '<p>Any HTML and JavaScript, running in a sandbox on the slide.</p><p>Applets read the deck colors as CSS variables, so they follow the theme.</p><p>While editing, double-click an applet to use it.</p>' }),
    makeApplet(ford.code, ford.name, { x: 820, y: 150, w: 980, h: 780 }),
  ], { notes: 'Insert → Applet has starters; Edit code opens a live editor. Your own tools can go in as web embeds.' });

  const design = makeSlide([
    makeText({ role: 'eyebrow', x: 160, y: 390, w: 1600, h: 40, html: '<p>Make it yours</p>' }),
    makeText({ role: 'title', x: 160, y: 450, w: 1600, h: 120, html: '<p>Themes, fonts, layouts</p>' }),
    makeText({ role: 'subtitle', x: 160, y: 610, w: 1500, h: 70, html: '<p>The Design tab has palettes and font pairings; every color is still yours to change.</p>' }),
  ], { section: true, sectionTitle: 'Design', bg: { kind: 'gradient', color: 'surface', color2: 'bg', angle: 210 } });

  const end = makeSlide([
    makeText({ role: 'heading', x: 140, y: 96, w: 1640, h: 90, html: '<p>Present, then export</p>' }),
    makeText({ role: 'body', x: 140, y: 250, w: 1640, h: 300, html: '<ul><li><b>Present</b> plays the exact file you will export.</li><li><b>File → Save</b> writes one <code>.html</code> that reopens here for editing.</li><li>The <b>self-contained</b> download bundles fonts, KaTeX and fullPage.js for talks without Wi-Fi.</li></ul>' }),
    makeText({ role: 'caption', x: 140, y: 900, w: 1640, h: 50, html: '<p>In the deck: → or Space next · ← back · N notes · F fullscreen · type a number and Enter to jump</p>' }),
  ]);

  deck.slides = [title, mathSlide, theorem, diagram, applet, design, end];
  return deck;
}
