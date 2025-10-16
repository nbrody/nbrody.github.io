/**
 * UI module: Gutter rendering, event handlers, and interaction logic
 */

import { faceColorJS } from './palette.js';

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

// Render gutter with color-coded face IDs
export function renderGutter(lineCount, faceIds, paletteMode) {
    const gutter = document.getElementById('vector-gutter');
    if (!gutter) return;
    const { lineHeight, paddingTop } = getTextareaMetrics();
    gutter.style.paddingTop = paddingTop + 'px';
    gutter.innerHTML = '';
    for (let i = 0; i < lineCount; i++) {
        const div = document.createElement('div');
        div.className = 'box';
        div.style.height = lineHeight + 'px';
        div.dataset.line = String(i);
        const fid = (faceIds && Number.isFinite(faceIds[i])) ? faceIds[i] : null;
        if (fid === null) {
            div.style.background = 'transparent';
            div.title = `Line ${i + 1}`;
        } else {
            div.style.background = faceColorJS(fid, paletteMode);
            div.title = `Line ${i + 1} → face ${fid}`;
        }
        gutter.appendChild(div);
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
    if (!Number.isFinite(fid) || fid < 0) { metaEl.textContent = ''; return; }
    const meta = (facesMetaById && facesMetaById[fid]) ? facesMetaById[fid] : null;

    let lineTxt = '';
    if (lineIndexHint !== null && lineIndexHint >= 0) {
        const lines = (document.getElementById('vectors').value || '').split('\n').filter(l => l.trim() !== '');
        if (lines[lineIndexHint]) lineTxt = lines[lineIndexHint].trim();
    }

    const parts = [];
    parts.push(`Face ${fid}`);
    if (lineTxt) parts.push(`from line: ${lineTxt}`);
    if (meta) {
        if (meta.word) parts.push(`word: ${meta.word}`);
        if (meta.matrix) parts.push(`matrix: ${meta.matrix}`);
    } else {
        parts.push('(no metadata)');
    }
    metaEl.textContent = parts.join('\n');
}

// Setup panel pager
export function setupPager() {
    let pageIndex = 0; // 0..3
    const pages = [
        document.getElementById('page-1'),
        document.getElementById('page-2'),
        document.getElementById('page-3'),
        document.getElementById('page-4')
    ];
    const leftBtn = document.getElementById('page-left');
    const rightBtn = document.getElementById('page-right');

    function showPage(i) {
        pageIndex = Math.max(0, Math.min(3, i));
        pages.forEach((p, idx) => { if (p) p.classList.toggle('active', idx === pageIndex); });
        if (leftBtn) leftBtn.disabled = (pageIndex === 0);
        if (rightBtn) rightBtn.disabled = (pageIndex === 3);
    }

    if (leftBtn) leftBtn.addEventListener('click', () => showPage(pageIndex - 1));
    if (rightBtn) rightBtn.addEventListener('click', () => showPage(pageIndex + 1));
    showPage(0);
}

// Setup panel collapse/expand
export function setupPanelToggle() {
    const panel = document.getElementById('control-panel');
    const toggleBtn = document.getElementById('toggle-panel-btn');
    let panelVisible = true;

    toggleBtn.addEventListener('click', () => {
        panelVisible = !panelVisible;
        if (panelVisible) {
            panel.style.transform = 'translateX(0)';
            toggleBtn.title = 'Collapse control panel';
        } else {
            panel.style.transform = 'translateX(110%)';
            toggleBtn.title = 'Expand control panel';
        }
    });
}
