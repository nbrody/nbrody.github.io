/**
 * Control Panel UI module
 * Handles all UI interactions for the Kleinian group visualizer
 */

import * as THREE from 'three';

// Color palettes for the polyhedron faces
// mode: 0 = cosine palette, 1 = monochrome
// offset: vec3 phase offset for cosine palette
// freq: frequency multiplier for color variation
export const colorPalettes = {
    rainbow: {
        name: 'Rainbow',
        mode: 0,
        offset: new THREE.Vector3(0, 2, 4),
        freq: 0.5
    },
    ocean: {
        name: 'Ocean',
        mode: 0,
        offset: new THREE.Vector3(3.5, 4.5, 5.0),
        freq: 0.4
    },
    sunset: {
        name: 'Sunset',
        mode: 0,
        offset: new THREE.Vector3(0.0, 1.0, 2.5),
        freq: 0.3
    },
    forest: {
        name: 'Forest',
        mode: 0,
        offset: new THREE.Vector3(2.0, 0.5, 3.5),
        freq: 0.35
    },
    monochrome: {
        name: 'Monochrome',
        mode: 1,
        offset: new THREE.Vector3(0, 0, 0),
        freq: 0.5
    },
    neon: {
        name: 'Neon',
        mode: 0,
        offset: new THREE.Vector3(0.5, 2.0, 4.0),
        freq: 0.7
    },
    pastel: {
        name: 'Pastel',
        mode: 0,
        offset: new THREE.Vector3(0.0, 2.0, 4.0),
        freq: 0.4
    },
    fire: {
        name: 'Fire',
        mode: 0,
        offset: new THREE.Vector3(0.0, 0.8, 1.5),
        freq: 0.25
    }
};

// Current palette (used by shader)
let currentPalette = 'rainbow';

export function getCurrentPalette() {
    return currentPalette;
}

export function getPaletteSettings() {
    return colorPalettes[currentPalette];
}

/** Read the same finite integer limits shown in the form, including on Render. */
export function readBoundedInteger(input, fallback) {
    const raw = input.value.trim();
    const parsed = raw === '' ? NaN : Number(raw);
    const min = input.min === '' ? -Infinity : Number(input.min);
    const max = input.max === '' ? Infinity : Number(input.max);
    const value = Math.max(min, Math.min(max, Number.isFinite(parsed) ? Math.trunc(parsed) : fallback));
    input.value = String(value);
    return value;
}

/**
 * Setup the control panel UI
 * @param {Object} handlers - Event handlers for various controls
 */
export function setupControlPanel(handlers) {
    const {
        onOpacityChange,
        onPolyhedronOpacity,
        onWallsOpacity,
        onAutoRotateToggle,
        onResetCamera,
        onFaceCountChange,
        onWordLengthChange,
        onPaletteChange,
        controls,
        mesh,
        cayleyGroup,
        material
    } = handlers;

    // Tab switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    const tablist = document.querySelector('.tab-navigation');
    // The refresh/collapse actions are siblings, so keep the tablist role on
    // a dedicated wrapper rather than including those actions in it.
    if (tablist) {
        const tabs = document.createElement('div');
        tabs.className = 'panel-tabs';
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', 'Visualization controls');
        tablist.prepend(tabs);
        tabBtns.forEach(btn => tabs.appendChild(btn));
    }
    function activateTab(btn, focus = false) {
        tabBtns.forEach(b => {
            const active = b === btn;
            b.classList.toggle('active', active);
            b.setAttribute('aria-selected', String(active));
            b.tabIndex = active ? 0 : -1;
        });
        tabContents.forEach(c => c.classList.toggle('active', c.id === `tab-${btn.dataset.tab}`));
        if (focus) btn.focus();
    }
    tabBtns.forEach((btn, i) => {
        btn.id = `tab-button-${btn.dataset.tab}`;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-controls', `tab-${btn.dataset.tab}`);
        const content = document.getElementById(`tab-${btn.dataset.tab}`);
        content?.setAttribute('role', 'tabpanel');
        content?.setAttribute('aria-labelledby', btn.id);
        btn.addEventListener('click', () => activateTab(btn));
        btn.addEventListener('keydown', e => {
            let next;
            if (e.key === 'ArrowRight') next = (i + 1) % tabBtns.length;
            if (e.key === 'ArrowLeft') next = (i + tabBtns.length - 1) % tabBtns.length;
            if (e.key === 'Home') next = 0;
            if (e.key === 'End') next = tabBtns.length - 1;
            if (next === undefined) return;
            e.preventDefault();
            activateTab(tabBtns[next], true);
        });
    });
    if (tabBtns.length) activateTab([...tabBtns].find(b => b.classList.contains('active')) || tabBtns[0]);

    const collapseBtn = document.getElementById('collapse-btn');
    const panel = document.getElementById('control-panel');
    const isometryControls = document.getElementById('isometry-controls');
    function syncPanel() {
        const collapsed = panel.classList.contains('collapsed');
        collapseBtn?.setAttribute('aria-expanded', String(!collapsed));
        if (collapseBtn) {
            collapseBtn.title = collapsed ? 'Expand panel (H)' : 'Collapse panel (H)';
            collapseBtn.setAttribute('aria-label', collapseBtn.title);
            collapseBtn.querySelector('.collapse-icon').textContent = collapsed ? '+' : '×';
        }
        if (isometryControls) isometryControls.style.display = collapsed ? 'none' : 'flex';
    }
    // Keep the picture centred in the space the panel leaves free.
    const reportLayout = () => {
        if (!handlers.onPanelLayout || !panel) return;
        const collapsed = panel.classList.contains('collapsed');
        handlers.onPanelLayout(collapsed ? 0 : panel.getBoundingClientRect().width + 24);
    };
    function togglePanel() { panel.classList.toggle('collapsed'); syncPanel(); reportLayout(); }
    if (panel) syncPanel();
    if (collapseBtn && panel) collapseBtn.addEventListener('click', togglePanel);

    // Opacity slider for polyhedron
    const opacitySlider = document.getElementById('polyhedron-opacity');
    if (opacitySlider && onOpacityChange) {
        opacitySlider.addEventListener('input', () => {
            const opacity = parseFloat(opacitySlider.value);
            onOpacityChange(opacity);
        });
    }

    // Color palette dropdown
    const paletteSelect = document.getElementById('color-palette-select');
    if (paletteSelect) {
        // Populate dropdown
        Object.keys(colorPalettes).forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = colorPalettes[key].name;
            paletteSelect.appendChild(opt);
        });

        paletteSelect.addEventListener('change', () => {
            currentPalette = paletteSelect.value;
            if (onPaletteChange) {
                onPaletteChange(currentPalette);
            }
        });
    }

    // Cayley mode selector (Off / S / T)
    const cayleyOpts = document.querySelectorAll('.cayley-opt');
    if (cayleyOpts.length && handlers.onCayleyModeChange) {
        cayleyOpts.forEach(btn => {
            btn.addEventListener('click', () => {
                cayleyOpts.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                handlers.onCayleyModeChange(btn.dataset.mode);
            });
        });
    }

    // Dual mode selector (Off / S / T) — tiling walls dual to the Cayley graph
    const dualOpts = document.querySelectorAll('.dual-opt');
    if (dualOpts.length && handlers.onDualModeChange) {
        dualOpts.forEach(btn => {
            btn.addEventListener('click', () => {
                dualOpts.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                handlers.onDualModeChange(btn.dataset.mode);
            });
        });
    }

    // Dual tiling opacity (live)
    const dualOpacityInput = document.getElementById('dual-opacity');
    if (dualOpacityInput && handlers.onDualOpacityChange) {
        dualOpacityInput.addEventListener('input', () => {
            handlers.onDualOpacityChange(parseFloat(dualOpacityInput.value));
        });
    }

    // Slider button helper - handles both click and drag
    function setupSliderButton(btnId, initialValue, onChange) {
        const btn = document.getElementById(btnId);
        if (!btn) return;

        let value = initialValue;
        let pointerId = null;
        let startX = 0;
        let startValue = 0;
        let moved = false;
        const label = btn.textContent.trim();
        const output = document.createElement('span');
        output.className = 'slider-value';
        output.setAttribute('aria-hidden', 'true');
        btn.appendChild(output);
        btn.setAttribute('role', 'slider');
        btn.setAttribute('aria-label', `${label} opacity`);
        btn.setAttribute('aria-valuemin', '0');
        btn.setAttribute('aria-valuemax', '100');
        btn.title = 'Drag to adjust · click to toggle · arrow keys for 5% steps';
        const updateVisual = val => {
            btn.style.setProperty('--fill', `${val * 100}%`);
            btn.classList.toggle('active', val > 0);
            const percent = Math.round(val * 100);
            output.textContent = `${percent}%`;
            btn.setAttribute('aria-valuenow', String(percent));
            btn.setAttribute('aria-valuetext', `${percent}%`);
        };
        const commit = (next, ended = true) => {
            value = Math.max(0, Math.min(1, next));
            updateVisual(value);
            onChange(value, ended);
        };
        updateVisual(value);
        btn.addEventListener('pointerdown', e => {
            if (!e.isPrimary || e.button !== 0) return;
            pointerId = e.pointerId;
            startX = e.clientX;
            startValue = value;
            moved = false;
            btn.setPointerCapture(pointerId);
            btn.classList.add('dragging');
            btn.focus();
        });
        btn.addEventListener('pointermove', e => {
            if (e.pointerId !== pointerId) return;
            const dx = e.clientX - startX;
            if (Math.abs(dx) > 5) moved = true;
            if (moved) commit(startValue + dx / (Math.max(1, btn.offsetWidth) * 1.5), false);
        });
        const endDrag = e => {
            if (e.pointerId !== pointerId) return;
            pointerId = null;
            btn.classList.remove('dragging');
            // A cancelled gesture must never become an accidental toggle.
            if (e.type === 'pointercancel') commit(startValue);
            else commit(moved ? value : (value > 0.5 ? 0 : 1));
        };
        btn.addEventListener('pointerup', endDrag);
        btn.addEventListener('pointercancel', endDrag);
        btn.addEventListener('lostpointercapture', e => {
            if (e.pointerId !== pointerId) return;
            pointerId = null;
            btn.classList.remove('dragging');
            commit(value);
        });
        btn.addEventListener('keydown', e => {
            const steps = { ArrowRight: 0.05, ArrowUp: 0.05, ArrowLeft: -0.05,
                ArrowDown: -0.05, PageUp: 0.1, PageDown: -0.1 };
            let next;
            if (e.key in steps) next = value + steps[e.key];
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = 1;
            else return;
            e.preventDefault();
            commit(next);
        });
        // Keyboard/assistive activation generates a click with detail=0;
        // pointer clicks were already handled by pointerup.
        btn.addEventListener('click', e => { if (e.detail === 0) commit(value > 0.5 ? 0 : 1); });
        return { getValue: () => value, setValue: v => { value = v; updateVisual(v); } };
    }

    // Polyhedron / walls opacity sliders (setters returned for programmatic use)
    const sliders = {};
    if (onPolyhedronOpacity) {
        sliders.polyhedron = setupSliderButton('slider-polyhedron', 1.0, (val) => onPolyhedronOpacity(val));
    }
    if (onWallsOpacity) {
        sliders.walls = setupSliderButton('slider-walls', 0.0, (val) => onWallsOpacity(val));
    }

    // Auto-rotate toggle
    const autoRotateBtn = document.getElementById('auto-rotate');
    if (autoRotateBtn && onAutoRotateToggle) {
        autoRotateBtn.addEventListener('click', () => {
            onAutoRotateToggle(autoRotateBtn);
        });
    }

    // Reset camera
    const resetCameraBtn = document.getElementById('reset-camera');
    if (resetCameraBtn && onResetCamera) {
        resetCameraBtn.addEventListener('click', () => {
            onResetCamera(autoRotateBtn);
        });
    }

    // Face count input
    const faceCountInput = document.getElementById('face-count-input');
    if (faceCountInput && onFaceCountChange) {
        faceCountInput.addEventListener('change', () => {
            onFaceCountChange(readBoundedInteger(faceCountInput, 96));
        });
    }

    // Word length input
    const wordLengthInput = document.getElementById('wordLength');
    if (wordLengthInput && onWordLengthChange) {
        wordLengthInput.addEventListener('change', () => {
            const depth = readBoundedInteger(wordLengthInput, 8);
            onWordLengthChange(depth);
        });
    }

    // Keyboard shortcut to toggle panel (H key)
    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'h' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey &&
            !e.target.closest('input, textarea, select, [contenteditable]') && panel) {
            togglePanel();
        }
    });

    return { autoRotateBtn, sliders };
}

/**
 * Update toggle button visual state
 */
export function updateToggleBtn(btn, active) {
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(active));
    if (active) {
        btn.classList.add('active');
    } else {
        btn.classList.remove('active');
    }
}

/**
 * Create isometry control buttons
 */
export function updateIsometryButtons(matrices, onAnimateIsometry) {
    const container = document.getElementById('isometry-controls');
    if (!container) return;
    container.innerHTML = '';

    matrices.forEach((_, idx) => {
        const btn = document.createElement('button');
        btn.className = 'isometry-btn';
        btn.setAttribute('data-gen', idx);
        // Use the dollar-sign delimiter which is simpler
        btn.innerHTML = `$g_{${idx + 1}}$`;
        btn.addEventListener('click', (e) => onAnimateIsometry(idx, e));
        container.appendChild(btn);
    });

    // Trigger MathJax to render the button labels
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([container]);
    }
}
