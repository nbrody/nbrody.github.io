/**
 * UI module: Gutter rendering, event handlers, and interaction logic
 */

import { faceColorJS } from './palette.js';
import { formatMatrix2x2 } from '../../../../../assets/js/algebraicFormatter.js';

// Get textarea metrics for gutter alignment
export function getTextareaMetrics() {
    const ta = document.getElementById('vectors');
    const cs = window.getComputedStyle(ta);
    let lh = parseFloat(cs.lineHeight);
    if (isNaN(lh)) {
        const fs = parseFloat(cs.fontSize) || 16;
        lh = 1.5 * fs; // Tailwind leading-6 ≈ 1.5
    }
    const padTop = parseFloat(cs.paddingTop) || 0;
    return { lineHeight: lh, paddingTop: padTop };
}

// Render gutter with color-coded face IDs and LaTeX words
export function renderGutter(lineCount, faceIds, wordsByLine, paletteMode) {
    const gutter = document.getElementById('vector-gutter');
    if (!gutter) return;
    const { lineHeight, paddingTop } = getTextareaMetrics();
    gutter.style.paddingTop = paddingTop + 'px';
    gutter.innerHTML = '';
    for (let i = 0; i < lineCount; i++) {
        const div = document.createElement('div');
        div.className = 'box';
        div.style.cssText = `position:relative; height:${lineHeight}px; width:100%; cursor:pointer;`;
        div.dataset.line = String(i);
        const fid = (faceIds && Number.isFinite(faceIds[i])) ? faceIds[i] : null;
        const word = (wordsByLine && wordsByLine[i]) ? wordsByLine[i] : '';

        if (fid === null) {
            div.style.background = 'transparent';
            div.title = `Line ${i + 1}`;
        } else {
            div.style.background = faceColorJS(fid, paletteMode);
            div.title = `Line ${i + 1} → face ${fid}`;
        }

        // Add word display if present
        if (word) {
            const wordSpan = document.createElement('span');
            wordSpan.className = 'gutter-word';
            wordSpan.style.cssText = 'position:absolute; left:4px; top:50%; transform:translateY(-50%); font-size:11px; color:#000000; white-space:nowrap; max-width:72px; overflow:hidden; text-overflow:ellipsis;';
            // Wrap word in \(...\) delimiters for inline LaTeX rendering via MathJax
            wordSpan.textContent = `\\(${word}\\)`;
            div.appendChild(wordSpan);
        }

        gutter.appendChild(div);
    }

    // Render LaTeX if MathJax is available
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
        MathJax.typesetPromise([gutter]).catch(err => console.warn('MathJax typeset error:', err));
    }
}

// Highlight specific faces in the gutter
export function highlightGutterFaces(faceIdsArray, currentFaceIdsByLine) {
    const gutter = document.getElementById('vector-gutter');
    if (!gutter) return;
    // Clear all
    [...gutter.children].forEach(ch => ch.style.outline = 'none');
    if (!Array.isArray(faceIdsArray) || faceIdsArray.length === 0) return;
    // Map face IDs to input line indices and outline them
    faceIdsArray.forEach(fid => {
        const lineIndex = currentFaceIdsByLine.findIndex(x => x === fid);
        if (lineIndex !== -1 && gutter.children[lineIndex]) {
            gutter.children[lineIndex].style.outline = '2px solid white';
        }
    });
}

// Display face metadata
export function showFaceMeta(faceId, lineIndexHint, facesMetaById) {
    const metaEl = document.getElementById('selected-face-meta');
    if (!metaEl) return;
    const fid = Number(faceId);
    if (!Number.isFinite(fid) || fid < 0) {
        metaEl.innerHTML = '';
        return;
    }
    const meta = (facesMetaById && facesMetaById[fid]) ? facesMetaById[fid] : null;

    let lineTxt = '';
    if (lineIndexHint !== null && lineIndexHint >= 0) {
        const lines = (document.getElementById('vectors').value || '').split('\n').filter(l => l.trim() !== '');
        if (lines[lineIndexHint]) lineTxt = lines[lineIndexHint].trim();
    }

    const parts = [];
    parts.push(`<div><strong>Face ${fid}</strong></div>`);

    if (lineTxt) {
        parts.push(`<div class="text-xs mt-1">Vector: <code>${lineTxt}</code></div>`);
    }

    if (meta) {
        if (meta.word) {
            parts.push(`<div class="mt-2 clickable-isometry" data-face-id="${fid}" title="Click to animate isometry">Word: <span class="cursor-pointer hover:text-indigo-400">\\(${meta.word}\\)</span></div>`);
        }
        if (meta.matrix) {
            const matrixLatex = formatMatrixLatex(meta.matrix);
            parts.push(`<div class="mt-2 clickable-isometry" data-face-id="${fid}" title="Click to animate isometry">Matrix: <div class="cursor-pointer hover:bg-gray-800 p-2 rounded">\\[${matrixLatex}\\]</div></div>`);
        }
    } else {
        parts.push('<div class="text-xs text-gray-400 mt-1">(no metadata)</div>');
    }

    metaEl.innerHTML = parts.join('');

    // Render LaTeX with MathJax if available
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
        MathJax.typesetPromise([metaEl]).catch(err => console.warn('MathJax typeset error:', err));
    }
}

// Helper function to format matrix object as LaTeX
// Now uses algebraic formatter for exact expressions
function formatMatrixLatex(matrix) {
    return formatMatrix2x2(matrix);
}

// Setup tab navigation
export function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    function showTab(tabName) {
        // Update buttons
        tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update content
        tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabName}`);
        });
    }

    // Add click handlers to tab buttons
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            showTab(btn.dataset.tab);
        });
    });

    // Show first tab by default
    showTab('group');
}

// Setup panel collapse/expand
export function setupPanelToggle() {
    const panel = document.getElementById('control-panel');
    const collapseBtn = document.getElementById('collapse-btn');
    // Also support the floating toggle button if it exists (though we removed it in HTML, keeping for safety)
    const toggleBtn = document.getElementById('toggle-panel-btn');

    if (collapseBtn) {
        collapseBtn.addEventListener('click', () => {
            const isCollapsed = panel.classList.contains('collapsed');
            if (isCollapsed) {
                panel.classList.remove('collapsed');
                collapseBtn.title = 'Collapse panel';
            } else {
                panel.classList.add('collapsed');
                collapseBtn.title = 'Expand panel';
            }
        });
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const isCollapsed = panel.classList.contains('collapsed');
            if (isCollapsed) {
                panel.classList.remove('collapsed');
            } else {
                panel.classList.add('collapsed');
            }
        });
    }
}

// 3D Label Overlay Management
let _currentLabelFaceId = -1;
let _currentLabelMeta = null;

export function showFaceLabel3D(faceId, facesMetaById, position3D, camera, renderer) {
    const overlay = document.getElementById('face-label-overlay');
    const content = document.getElementById('face-label-content');
    if (!overlay || !content) return;

    const fid = Number(faceId);
    if (!Number.isFinite(fid) || fid < 0) {
        hideFaceLabel3D();
        return;
    }

    _currentLabelFaceId = fid;
    const meta = (facesMetaById && facesMetaById[fid]) ? facesMetaById[fid] : null;
    _currentLabelMeta = meta;

    // Build label content
    const parts = [];
    parts.push(`<div class="text-sm font-semibold">Face ${fid}</div>`);

    if (meta) {
        if (meta.word) {
            parts.push(`<div class="mt-1 text-xs">\\(${meta.word}\\)</div>`);
        }
        if (meta.matrix) {
            const matrixLatex = formatMatrixLatex(meta.matrix);
            parts.push(`<div class="mt-1 text-xs">\\(${matrixLatex}\\)</div>`);
        }
    }

    content.innerHTML = parts.join('');

    // Position the overlay
    updateFaceLabelPosition(position3D, camera, renderer);
    overlay.classList.remove('hidden');

    // Render LaTeX
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
        MathJax.typesetPromise([content]).catch(err => console.warn('MathJax typeset error:', err));
    }
}

export function updateFaceLabelPosition(position3D, camera, renderer) {
    const overlay = document.getElementById('face-label-overlay');
    if (!overlay || _currentLabelFaceId < 0) return;

    // Project 3D position to screen coordinates
    const vector = position3D.clone();
    vector.project(camera);

    const canvas = renderer.domElement;
    const widthHalf = canvas.clientWidth / 2;
    const heightHalf = canvas.clientHeight / 2;

    const x = (vector.x * widthHalf) + widthHalf;
    const y = -(vector.y * heightHalf) + heightHalf;

    // Position with offset so it doesn't cover the face
    overlay.style.left = `${x + 20}px`;
    overlay.style.top = `${y - 30}px`;
}

export function hideFaceLabel3D() {
    const overlay = document.getElementById('face-label-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
    _currentLabelFaceId = -1;
    _currentLabelMeta = null;
}

export function getCurrentLabelFaceId() {
    return _currentLabelFaceId;
}
