// UI wiring — sliders, buttons, presets, brush.

export const PRESETS = {
    spots:       { F: 0.0367, k: 0.0649, label: 'Spots' },
    mitosis:     { F: 0.0280, k: 0.0620, label: 'Mitosis' },
    coral:       { F: 0.0545, k: 0.0620, label: 'Coral' },
    fingerprint: { F: 0.0400, k: 0.0600, label: 'Fingerprint' },
    maze:        { F: 0.0290, k: 0.0570, label: 'Maze' },
    waves:       { F: 0.0140, k: 0.0450, label: 'Waves' },
    worms:       { F: 0.0780, k: 0.0610, label: 'Worms' },
    holes:       { F: 0.0390, k: 0.0580, label: 'Holes' },
};

export function makeSlider(parent, opts) {
    // opts: { name, sub, min, max, step, value, format, onChange }
    const row = document.createElement('div');
    row.className = 'slider-row';

    const name = document.createElement('span');
    name.className = 'name';
    name.innerHTML = opts.name + (opts.sub ? `<sub>${opts.sub}</sub>` : '');
    row.appendChild(name);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(opts.min);
    input.max = String(opts.max);
    input.step = String(opts.step);
    input.value = String(opts.value);
    row.appendChild(input);

    const val = document.createElement('span');
    val.className = 'val';
    row.appendChild(val);

    const fmt = opts.format || ((v) => v.toFixed(3));
    const update = () => {
        const v = parseFloat(input.value);
        val.textContent = fmt(v);
        opts.onChange?.(v);
    };
    input.addEventListener('input', update);
    update();

    parent.appendChild(row);

    return {
        set(v) {
            input.value = String(v);
            update();
        },
        get() { return parseFloat(input.value); },
    };
}

export function buildPresetButtons(parent, onPick) {
    parent.innerHTML = '';
    for (const [key, val] of Object.entries(PRESETS)) {
        const b = document.createElement('button');
        b.textContent = val.label;
        b.dataset.preset = key;
        b.addEventListener('click', () => onPick(key, val));
        parent.appendChild(b);
    }
}
