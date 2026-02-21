// ═══════════════════════════════════════════════════════
// UI wiring: toggles, sliders, coordinate display
// ═══════════════════════════════════════════════════════

export function setupUI(renderer) {
    const coordsDisplay = document.getElementById('coordsDisplay');

    // ─── Toggle switches ───
    function setupToggle(id, initial, callback) {
        const el = document.getElementById(id);
        const track = el.querySelector('.toggle-track');
        let state = initial;
        track.classList.toggle('active', state);
        el.addEventListener('click', () => {
            state = !state;
            track.classList.toggle('active', state);
            callback(state);
        });
    }

    setupToggle('toggleRays', true, val => {
        renderer.showRays = val;
        renderer.needsRender = true;
    });
    setupToggle('toggleExtensions', true, val => {
        renderer.showExtensions = val;
        renderer.needsRender = true;
    });
    setupToggle('toggleRegions', true, val => {
        renderer.showRegions = val;
        renderer.needsRender = true;
    });
    setupToggle('toggleBoundary', true, val => {
        renderer.showBoundary = val;
        renderer.needsRender = true;
    });

    // ─── Parametrization select ───
    document.getElementById('paramSelect').addEventListener('change', e => {
        renderer.currentParam = parseInt(e.target.value);
        renderer.centerX = 0; renderer.centerY = 0;
        renderer.zoom = renderer.currentParam === 0 ? 0.3 : 0.5;
        renderer.needsRender = true;
    });

    // ─── Depth slider ───
    const depthSlider = document.getElementById('depthSlider');
    const depthVal = document.getElementById('depthVal');
    depthSlider.addEventListener('input', e => {
        depthVal.textContent = e.target.value;
    });
    depthSlider.addEventListener('change', () => {
        renderer.buildProgram(parseInt(depthSlider.value));
    });

    // ─── Coordinate display on mousemove ───
    window.addEventListener('mousemove', e => {
        const c = renderer.cssToComplex(e.clientX, e.clientY);
        const label = renderer.currentParam === 0 ? '\u03C1' : 'z';
        const sign = c.y >= 0 ? '+' : '\u2212';
        coordsDisplay.textContent = `${label} = ${c.x.toFixed(4)} ${sign} ${Math.abs(c.y).toFixed(4)}i`;
    });

    window.addEventListener('resize', () => { renderer.needsRender = true; });
}
