import { buildGroup, createTransitions } from './groups.js';
import { Simulation } from './simulation.js';
import { makePalette, cssColor } from './palettes.js';
import { createFieldGeometry } from './lattice.js';

const $ = id => document.getElementById(id);
const canvas = $('sim');
const context = canvas.getContext('2d', { alpha: false });
let group, simulation, transitions, imageData, colors, selectedGenerators = [];
let fieldGeometry, geometryKey = '';
let groupSignature = '';
let paletteOffset = 0;
let running = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let previousTime = 0, accumulator = 0, lastStats = 0, noticeTimer;
let painting = false, previousPoint = null;

const presets = {
  classic: { family: 'cyclic', n: 12, neighborhood: 'vonNeumann', radius: 1, threshold: 1, initial: 'random', palette: 'mineral', help: 'Twelve colors chase one another across a random field.' },
  spirals: { family: 'cyclic', n: 10, neighborhood: 'moore', radius: 1, threshold: 1, initial: 'spirals', palette: 'tide', help: 'Two planted spiral seeds send out competing waves.' },
  waves: { family: 'cyclic', n: 8, neighborhood: 'moore', radius: 3, threshold: 5, initial: 'random', palette: 'ember', help: 'A wider neighborhood grows broad, interlocking waves.' },
  eisenstein: { family: 'cyclic', n: 12, neighborhood: 'eisenstein', radius: 1, threshold: 1, initial: 'random', palette: 'ember', help: 'Twelve colors spread across six neighbors on the Eisenstein lattice.' },
  quaternion: { family: 'quaternion', n: 8, neighborhood: 'vonNeumann', radius: 1, threshold: 1, initial: 'random', palette: 'botanical', help: 'Eight quaternion states compete through multiplication by i and j.' },
};

function notify(message) {
  $('notice').textContent = message;
  $('notice').classList.add('visible');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => $('notice').classList.remove('visible'), 2600);
}
function custom() {
  $('preset').value = 'custom';
  $('presetHelp').textContent = 'Your own combination of states, neighborhood, and initial conditions.';
}
function boundedInput(id) {
  const input = $(id);
  const value = Math.round(Number(input.value));
  const fallback = input.defaultValue ? Number(input.defaultValue) : Number(input.min);
  input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), input.value === '' || !Number.isFinite(value) ? fallback : value)));
  return Number(input.value);
}
function groupParameters() {
  const family = $('groupFamily').value;
  return { family, n: family === 'cyclic' ? Number($('states').value) : boundedInput('groupN'), m: boundedInput('groupM') };
}
function updateGroupInputs(resetParameter = false) {
  const family = $('groupFamily').value;
  $('states').disabled = family !== 'cyclic';
  $('groupMWrap').hidden = family !== 'product';
  $('groupNWrap').hidden = !['product', 'dihedral', 'symmetric'].includes(family);
  // Studio keeps native panels hidden, so explicitly omit inapplicable fields.
  $('states').toggleAttribute('data-studio-ignore', family !== 'cyclic');
  $('groupMWrap').toggleAttribute('data-studio-ignore', $('groupMWrap').hidden);
  $('groupNWrap').toggleAttribute('data-studio-ignore', $('groupNWrap').hidden);
  const range = family === 'dihedral' ? [3, 16, 6, 'Polygon sides n'] : family === 'symmetric' ? [3, 4, 3, 'Permutation degree n'] : [2, 8, 4, 'Second factor n'];
  $('groupN').min = range[0]; $('groupN').max = range[1];
  $('groupNLabel').textContent = range[3];
  if (resetParameter) $('groupN').value = range[2];
  boundedInput('groupN');
}
function renderGenerators() {
  const canonical = group.generators.map(g => g.id);
  const displayOrder = [...canonical, ...group.labels.map((_, i) => i).filter(i => i !== group.identity && !canonical.includes(i))];
  $('generators').replaceChildren(...displayOrder.map(id => {
    const label = document.createElement('label');
    label.className = 'generator';
    label.htmlFor = `generator-${id}`;
    const input = document.createElement('input');
    input.type = 'checkbox'; input.id = `generator-${id}`; input.value = id;
    input.checked = selectedGenerators.includes(id);
    input.addEventListener('change', () => {
      selectedGenerators = [...$('generators').querySelectorAll('input:checked')].map(el => Number(el.value));
      configureRule(); custom();
    });
    label.append(input, document.createTextNode(group.labels[id]));
    return label;
  }));
  // Priority is exactly the order of the displayed generator chips.
  selectedGenerators = displayOrder.filter(id => selectedGenerators.includes(id));
}
function populateStateControls() {
  for (const id of ['brushState', 'inspectState']) {
    const options = group.labels.map((label, i) => new Option(label, String(i)));
    if (id === 'brushState') options.unshift(new Option('Random colors', '-1'));
    $(id).replaceChildren(...options);
  }
}
function rebuildGroup() {
  const parameters = groupParameters();
  group = buildGroup(parameters);
  groupSignature = JSON.stringify(parameters);
  selectedGenerators = group.generators.map(g => g.id);
  renderGenerators(); populateStateControls();
  $('groupName').textContent = group.name;
  $('groupOrder').textContent = `${group.order} elements`;
  $('fieldLabel').textContent = group.name;
  $('statesOut').textContent = group.order;
  $('states').title = $('groupFamily').value === 'cyclic' ? 'Number of cyclic states' : 'Group order is set in Advanced settings';
  $('stateCount').textContent = `${group.order} colors`;
  transitions = createTransitions(group, selectedGenerators, $('multiplication').value);
  refreshPalette(); createSimulation(); updateRuleText();
}
function ruleOptions() {
  const radius = Number($('radius').value);
  const neighborhood = $('neighborhood').value;
  const neighbors = neighborhood === 'eisenstein' ? 3 * radius * (radius + 1)
    : neighborhood === 'moore' ? (2 * radius + 1) ** 2 - 1 : 2 * radius * (radius + 1);
  $('threshold').max = neighbors;
  if (Number($('threshold').value) > neighbors) $('threshold').value = neighbors;
  $('radiusOut').value = radius;
  $('thresholdOut').value = $('threshold').value;
  $('neighborsHelp').textContent = `At least ${$('threshold').value} of ${neighbors} neighbors must share an allowed successor state.`;
  $('latticeHelp').textContent = neighborhood === 'eisenstein'
    ? 'ℤ[ω], with ω = exp(2πi/3). Each site has six nearest neighbors; hexagons show its cell. Radius counts lattice steps. Opposite edges meet when wrapped.'
    : neighborhood === 'moore'
      ? 'Square cells with eight surrounding neighbors. Radius uses square rings.'
      : 'Square cells with four nearest neighbors. Radius counts lattice steps.';
  return { transitions, neighborhood, radius, threshold: Number($('threshold').value), boundary: $('boundary').value };
}
function createSimulation() {
  const width = Number($('resolution').value), height = width * 3 / 4;
  simulation = new Simulation({ width, height, order: group.order, ...ruleOptions(), seed: boundedInput('seed'), initial: $('initial').value });
  prepareFieldRendering();
  accumulator = 0;
  render(); updateStatistics();
}
function prepareFieldRendering() {
  const { width, height, neighborhood } = simulation;
  const eisenstein = neighborhood === 'eisenstein';
  const key = `${width}:${height}:${eisenstein}`;
  if (key !== geometryKey) {
    fieldGeometry = createFieldGeometry(width, height, neighborhood);
    canvas.width = fieldGeometry.width;
    canvas.height = fieldGeometry.height;
    imageData = context.createImageData(canvas.width, canvas.height);
    $('stage').style.aspectRatio = `${canvas.width} / ${canvas.height}`;
    geometryKey = key;
    previousPoint = null;
  }
  $('gridReadout').textContent = `${width} × ${height}${eisenstein ? ' · ℤ[ω]' : ''}`;
  $('fieldLabel').textContent = `${group.name}${eisenstein ? ' · Eisenstein lattice' : ''}`;
  canvas.setAttribute('aria-label', `Interactive cellular automaton on ${eisenstein ? 'the Eisenstein triangular lattice' : 'a square lattice'}. Drag to paint cells; use Space to pause and N to advance one generation.`);
}
function configureRule() {
  transitions = createTransitions(group, selectedGenerators, $('multiplication').value);
  simulation.configure(ruleOptions());
  prepareFieldRendering();
  updateRuleText();
  // An old activity value describes the previous rule until the next step.
  simulation.activity = 0;
  render(); updateStatistics();
}
function generatedSubgroupSize() {
  const seen = new Set([group.identity]), queue = [group.identity];
  for (let i = 0; i < queue.length; i++) {
    for (const generator of selectedGenerators) {
      const next = group.multiply(queue[i], generator);
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return seen.size;
}
function updateRuleText() {
  const classic = $('groupFamily').value === 'cyclic' && selectedGenerators.length === 1 && selectedGenerators[0] === 1;
  const threshold = Number($('threshold').value);
  $('ruleSummary').textContent = classic
    ? `Each cell watches its neighbors. If ${threshold === 1 ? 'at least one has' : `at least ${threshold} have`} the next color in the cycle, the cell takes that color. All cells update together.`
    : `Each color is an element of ${group.name}. A cell adopts an allowed successor when at least ${threshold} ${threshold === 1 ? 'neighbor has' : 'neighbors have'} that state. The most common eligible successor wins; updates are simultaneous.`;
  if (simulation.neighborhood === 'eisenstein') {
    $('ruleSummary').textContent += ' The sites form the Eisenstein lattice ℤ[ω], with six equally spaced nearest neighbors.';
  }
  const subgroupSize = generatedSubgroupSize();
  $('generatorHint').textContent = selectedGenerators.length === 0
    ? 'No generators selected: all cells keep their state.'
    : `${selectedGenerators.length} selected · generates ${subgroupSize === group.order ? 'the full group' : `a subgroup of ${subgroupSize} elements`}. Priority follows display order.`;
  const right = $('multiplication').value === 'right';
  $('groupFormula').textContent = `g → ${right ? 'g · s' : 's · g'},   s ∈ S`;
  updateTransitionPreview();
}
function updateTransitionPreview() {
  const from = Number($('inspectState').value);
  const next = transitions[from] || [];
  $('transitionPreview').textContent = `${group.labels[from]} → ${next.length ? next.map(i => group.labels[i]).join('  or  ') : 'stays put'}`;
}
function refreshPalette() {
  colors = makePalette($('palette').value, group.order, $('reverse').checked, paletteOffset % group.order);
  for (const id of ['palettePreview', 'populationBar']) {
    $(id).replaceChildren(...colors.map((color, i) => {
      const swatch = document.createElement('span');
      swatch.style.background = cssColor(color);
      swatch.title = group.labels[i];
      return swatch;
    }));
  }
  if (simulation && simulation.order === group.order) { render(); updateStatistics(); }
}
function render() {
  const data = imageData.data, cells = simulation.cells;
  const indices = fieldGeometry.cellIndices;
  const length = indices ? indices.length : cells.length;
  const background = [18, 41, 44];
  for (let i = 0, pixel = 0; i < length; i++, pixel += 4) {
    const cell = indices ? indices[i] : i;
    const color = cell < 0 ? background : colors[cells[cell]];
    data[pixel] = color[0]; data[pixel + 1] = color[1]; data[pixel + 2] = color[2]; data[pixel + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);
}
function updateStatistics() {
  $('generation').textContent = simulation.generation.toLocaleString();
  $('activity').replaceChildren(document.createTextNode((simulation.activity * 100).toFixed(1)), Object.assign(document.createElement('span'), { textContent: '%' }));
  const counts = simulation.counts();
  const pieces = $('populationBar').children;
  for (let i = 0; i < counts.length; i++) {
    const percent = 100 * counts[i] / simulation.cells.length;
    pieces[i].style.width = `${percent}%`;
    pieces[i].title = `${group.labels[i]}: ${percent.toFixed(1)}% (${counts[i]} cells)`;
  }
  $('populationBar').setAttribute('aria-label', `State populations: ${Array.from(counts, (count, i) => `${group.labels[i]}: ${(100 * count / simulation.cells.length).toFixed(1)}%`).join(', ')}`);
}
function setRunning(value) {
  running = value; accumulator = 0;
  $('playBtn').innerHTML = running ? 'Ⅱ <span>Pause</span>' : '▶ <span>Play</span>';
  $('playBtn').setAttribute('aria-label', running ? 'Pause simulation' : 'Play simulation');
  $('runStatus').textContent = running ? 'RUNNING' : 'PAUSED';
  $('liveDot').classList.toggle('paused', !running);
  updateStatistics();
}
function restart(newSeed = false) {
  if (newSeed) {
    const random = new Uint32Array(1); crypto.getRandomValues(random);
    $('seed').value = random[0];
  }
  simulation.reset({ seed: boundedInput('seed'), initial: $('initial').value });
  accumulator = 0; render(); updateStatistics();
  notify(newSeed ? `New field · seed ${$('seed').value}` : `Restarted · seed ${$('seed').value}`);
}
function applyPreset(key) {
  const preset = presets[key];
  if (!preset) return;
  $('groupFamily').value = preset.family;
  $('states').value = preset.n;
  updateGroupInputs(true);
  for (const id of ['neighborhood', 'radius', 'initial', 'palette']) $(id).value = preset[id];
  // Expand the range before assigning a preset's threshold.
  $('threshold').max = 80; $('threshold').value = preset.threshold;
  $('boundary').value = 'wrap'; $('multiplication').value = 'right';
  $('reverse').checked = false; paletteOffset = 0;
  $('presetHelp').textContent = preset.help;
  if (preset.family !== 'cyclic') $('advanced').open = true;
  rebuildGroup();
  notify('Experiment ready · generation 0');
}

$('playBtn').addEventListener('click', () => setRunning(!running));
$('stepBtn').addEventListener('click', () => { setRunning(false); simulation.step(); render(); updateStatistics(); });
$('reseedBtn').addEventListener('click', () => restart(true));
$('restartBtn').addEventListener('click', () => restart());
$('preset').addEventListener('change', () => applyPreset($('preset').value));
$('states').addEventListener('input', () => { rebuildGroup(); custom(); });
$('speed').addEventListener('input', () => { $('speedOut').value = `${$('speed').value} / sec`; accumulator = 0; });
for (const id of ['neighborhood', 'boundary']) $(id).addEventListener('change', () => { configureRule(); custom(); });
for (const id of ['radius', 'threshold']) $(id).addEventListener('input', () => { configureRule(); custom(); });
for (const id of ['palette', 'reverse']) $(id).addEventListener('change', refreshPalette);
$('shiftPalette').addEventListener('click', () => { paletteOffset = (paletteOffset + 1) % group.order; refreshPalette(); });
$('resolution').addEventListener('change', () => { createSimulation(); notify('Grid resized · restarted from the same seed'); });
$('initial').addEventListener('change', () => { restart(); custom(); });
$('seed').addEventListener('change', () => boundedInput('seed'));
$('brushSize').addEventListener('input', () => { $('brushSizeOut').value = `${$('brushSize').value} cells`; });
$('groupFamily').addEventListener('change', () => { updateGroupInputs(true); rebuildGroup(); custom(); notify('Group changed · field restarted'); });
for (const id of ['groupM', 'groupN']) {
  const update = normalize => {
    if (normalize) boundedInput(id);
    if ($(id).value === '' || !$(id).checkValidity()) return;
    if (JSON.stringify(groupParameters()) !== groupSignature) { rebuildGroup(); custom(); }
  };
  $(id).addEventListener('input', () => update(false));
  $(id).addEventListener('change', () => update(true));
}
$('defaultGenerators').addEventListener('click', () => { selectedGenerators = group.generators.map(g => g.id); renderGenerators(); configureRule(); custom(); });
$('multiplication').addEventListener('change', () => { configureRule(); custom(); });
$('inspectState').addEventListener('change', updateTransitionPreview);

// Convert pointer coordinates through object-fit:contain; ignore letterboxed areas.
function cellPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
  const left = rect.left + (rect.width - canvas.width * scale) / 2;
  const top = rect.top + (rect.height - canvas.height * scale) / 2;
  const x = (event.clientX - left) / scale, y = (event.clientY - top) / scale;
  return fieldGeometry.cellAt(x, y);
}
function paint(event) {
  const point = cellPoint(event);
  if (!point) { previousPoint = null; return; }
  const from = previousPoint || point;
  const dx = point.x - from.x, dy = point.y - from.y;
  const distance = simulation.neighborhood === 'eisenstein' ? Math.sqrt(dx * dx - dx * dy + dy * dy) : Math.hypot(dx, dy);
  const radius = Number($('brushSize').value);
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 2)));
  const state = event.shiftKey ? -1 : Number($('brushState').value);
  for (let i = 1; i <= steps; i++) simulation.paint(Math.floor(from.x + (point.x - from.x) * i / steps), Math.floor(from.y + (point.y - from.y) * i / steps), radius, state);
  previousPoint = point; render(); updateStatistics();
}
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !cellPoint(event)) return;
  painting = true; previousPoint = null;
  canvas.setPointerCapture(event.pointerId); canvas.focus({ preventScroll: true }); paint(event);
});
canvas.addEventListener('pointermove', event => { if (painting) paint(event); });
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { painting = false; previousPoint = null; });
function focusMode() {
  const focused = document.body.classList.toggle('focus-mode');
  $('restoreBtn').hidden = !focused;
  (focused ? $('restoreBtn') : $('focusBtn')).focus({ preventScroll: true });
}
$('focusBtn').addEventListener('click', focusMode);
$('restoreBtn').addEventListener('click', focusMode);
$('saveBtn').addEventListener('click', () => {
  const lattice = simulation.neighborhood === 'eisenstein' ? 'eisenstein' : 'square';
  const filename = `cyclic-${lattice}-${$('groupFamily').value}-seed-${simulation.seed}-generation-${simulation.generation}.png`;
  const output = document.createElement('canvas');
  const exportScale = lattice === 'eisenstein' ? 1 : 4;
  output.width = canvas.width * exportScale; output.height = canvas.height * exportScale;
  const ctx = output.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, output.width, output.height);
  output.toBlob(blob => {
    if (!blob) { notify('Image could not be saved'); return; }
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    notify('Saved the current field as a PNG');
  });
});
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.target.closest?.('input,select,textarea,[contenteditable=true]')) return;
  if (event.key === ' ' && event.target.closest?.('button,summary,a')) return;
  const key = event.key.toLowerCase();
  if (![' ', 'r', 'n', 'h', 'escape'].includes(key)) return;
  event.preventDefault();
  if (key === ' ') setRunning(!running);
  if (key === 'r') restart(true);
  if (key === 'n') $('stepBtn').click();
  if (key === 'h' || (key === 'escape' && document.body.classList.contains('focus-mode'))) focusMode();
});
document.addEventListener('visibilitychange', () => { previousTime = 0; accumulator = 0; });

function frame(time) {
  const elapsed = previousTime ? Math.min(100, time - previousTime) : 0;
  previousTime = time;
  if (running && !document.hidden) {
    const interval = 1000 / Number($('speed').value);
    accumulator += elapsed;
    let steps = 0;
    const start = performance.now();
    while (accumulator >= interval && steps < 6) {
      simulation.step(); accumulator -= interval; steps++;
      // Bound work per frame for larger neighborhoods on slower devices.
      if (performance.now() - start > 14) { accumulator = Math.min(accumulator, interval); break; }
    }
    if (steps) render();
    if (time - lastStats > 200) { updateStatistics(); lastStats = time; }
  }
  requestAnimationFrame(frame);
}
updateGroupInputs(); rebuildGroup(); setRunning(running);
requestAnimationFrame(frame);
