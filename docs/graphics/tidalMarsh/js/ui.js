// UI helpers — sliders and presets for the marsh simulator.

export const PRESETS = {
    bairIsland: {
        label: 'Bair Island',
        K: 0.18, m: 0.55, n: 1.0, D: 0.18, U: 0.0014, seaLevel: 0.0,
    },
    youngDelta: {
        label: 'Young delta',
        K: 0.22, m: 0.55, n: 1.05, D: 0.10, U: 0.0010, seaLevel: 0.0,
    },
    mature: {
        label: 'Mature marsh',
        K: 0.10, m: 0.50, n: 1.0, D: 0.30, U: 0.0020, seaLevel: 0.05,
    },
    finegrained: {
        label: 'Fine creeks',
        K: 0.28, m: 0.65, n: 1.0, D: 0.06, U: 0.0010, seaLevel: 0.0,
    },
    badlands: {
        label: 'Badlands',
        K: 0.30, m: 0.50, n: 1.25, D: 0.05, U: 0.0006, seaLevel: -0.2,
    },
    drowning: {
        label: 'Drowning',
        K: 0.16, m: 0.55, n: 1.0, D: 0.20, U: 0.0006, seaLevel: 0.20,
    },
};

export function makeSlider(parent, opts) {
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
        set(v) { input.value = String(v); update(); },
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
