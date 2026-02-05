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

/**
 * Setup the control panel UI
 * @param {Object} handlers - Event handlers for various controls
 */
export function setupControlPanel(handlers) {
    const {
        onOpacityChange,
        onPolyhedronOpacity,
        onWallsOpacity,
        onCayleyToggle,
        onTiedyeToggle,
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

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const content = document.getElementById(`tab-${tabId}`);
            if (content) content.classList.add('active');
        });
    });

    // Collapse button
    const collapseBtn = document.getElementById('collapse-btn');
    const panel = document.getElementById('control-panel');
    const isometryControls = document.getElementById('isometry-controls');
    if (collapseBtn && panel) {
        collapseBtn.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            // Hide isometry buttons when panel is collapsed
            if (isometryControls) {
                isometryControls.style.display = panel.classList.contains('collapsed') ? 'none' : 'flex';
            }
        });
    }

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

    // Cayley toggle
    const toggleCayleyBtn = document.getElementById('toggle-cayley');
    if (toggleCayleyBtn && onCayleyToggle) {
        toggleCayleyBtn.addEventListener('click', () => {
            onCayleyToggle(toggleCayleyBtn);
        });
    }

    // Slider button helper - handles both click and drag
    function setupSliderButton(btnId, initialValue, onChange) {
        const btn = document.getElementById(btnId);
        if (!btn) return;

        let value = initialValue;
        let isDragging = false;
        let startX = 0;
        let startValue = 0;
        let hasMoved = false;

        const updateVisual = (val) => {
            btn.style.setProperty('--fill', `${val * 100}%`);
            btn.classList.toggle('active', val > 0);
        };

        updateVisual(value);

        btn.addEventListener('mousedown', (e) => {
            isDragging = true;
            hasMoved = false;
            startX = e.clientX;
            startValue = value;
            btn.classList.add('dragging');
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            if (Math.abs(dx) > 5) hasMoved = true;

            const btnWidth = btn.offsetWidth;
            const sensitivity = 1.5; // How many pixels = full range
            const delta = dx / (btnWidth * sensitivity);
            value = Math.max(0, Math.min(1, startValue + delta));

            updateVisual(value);
            onChange(value, false); // false = still dragging
        });

        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            btn.classList.remove('dragging');

            if (!hasMoved) {
                // Click: toggle between 0 and 1
                value = value > 0.5 ? 0 : 1;
                updateVisual(value);
            }
            onChange(value, true); // true = drag ended
        });

        // Touch support
        btn.addEventListener('touchstart', (e) => {
            isDragging = true;
            hasMoved = false;
            startX = e.touches[0].clientX;
            startValue = value;
            btn.classList.add('dragging');
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const dx = e.touches[0].clientX - startX;
            if (Math.abs(dx) > 5) hasMoved = true;

            const btnWidth = btn.offsetWidth;
            const sensitivity = 1.5;
            const delta = dx / (btnWidth * sensitivity);
            value = Math.max(0, Math.min(1, startValue + delta));

            updateVisual(value);
            onChange(value, false);
        }, { passive: true });

        document.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            btn.classList.remove('dragging');

            if (!hasMoved) {
                value = value > 0.5 ? 0 : 1;
                updateVisual(value);
            }
            onChange(value, true);
        });

        return { getValue: () => value, setValue: (v) => { value = v; updateVisual(v); } };
    }

    // Polyhedron opacity slider
    if (onPolyhedronOpacity) {
        setupSliderButton('slider-polyhedron', 1.0, (val, ended) => {
            onPolyhedronOpacity(val);
        });
    }

    // Walls opacity slider
    if (onWallsOpacity) {
        setupSliderButton('slider-walls', 0.0, (val, ended) => {
            onWallsOpacity(val);
        });
    }

    // Tie-Dye toggle (GLSL folding effect)
    const toggleTiedyeBtn = document.getElementById('toggle-tiedye');
    if (toggleTiedyeBtn && onTiedyeToggle) {
        toggleTiedyeBtn.addEventListener('click', () => {
            onTiedyeToggle(toggleTiedyeBtn);
        });
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
            const c = parseInt(faceCountInput.value);
            if (!isNaN(c) && c > 0) {
                onFaceCountChange(c);
            }
        });
    }

    // Word length input
    const wordLengthInput = document.getElementById('wordLength');
    if (wordLengthInput && onWordLengthChange) {
        wordLengthInput.addEventListener('change', () => {
            const depth = parseInt(wordLengthInput.value) || 6;
            onWordLengthChange(depth);
        });
    }

    // Keyboard shortcut to toggle panel (H key)
    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'h' && !e.target.matches('input, textarea, [contenteditable]')) {
            if (panel) {
                panel.classList.toggle('collapsed');
                // Hide isometry buttons when panel is collapsed
                if (isometryControls) {
                    isometryControls.style.display = panel.classList.contains('collapsed') ? 'none' : 'flex';
                }
            }
        }
    });

    // Return reference to auto-rotate button for external updates
    return { autoRotateBtn };
}

/**
 * Update toggle button visual state
 */
export function updateToggleBtn(btn, active) {
    if (!btn) return;
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
