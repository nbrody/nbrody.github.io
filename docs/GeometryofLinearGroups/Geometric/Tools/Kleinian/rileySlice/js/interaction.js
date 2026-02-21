// ═══════════════════════════════════════════════════════
// Input handling: mouse, touch, keyboard
// ═══════════════════════════════════════════════════════

export function setupInteraction(canvas, renderer) {
    let isDragging = false;
    let lastX = 0, lastY = 0;

    // ─── Mouse ───
    canvas.addEventListener('mousedown', e => {
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
    });

    window.addEventListener('mouseup', () => { isDragging = false; });

    window.addEventListener('mousemove', e => {
        if (isDragging) {
            renderer.pan(e.clientX - lastX, e.clientY - lastY);
            lastX = e.clientX;
            lastY = e.clientY;
        }
    });

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        renderer.zoomAt(e.clientX, e.clientY, factor);
    }, { passive: false });

    // ─── Touch ───
    let touchStartDist = 0;
    let initialZoom = 0;

    canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        if (e.touches.length === 1) {
            isDragging = true;
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            isDragging = false;
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            touchStartDist = Math.sqrt(dx * dx + dy * dy);
            initialZoom = renderer.zoom;
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        if (e.touches.length === 1 && isDragging) {
            renderer.pan(
                e.touches[0].clientX - lastX,
                e.touches[0].clientY - lastY
            );
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
        } else if (e.touches.length === 2 && touchStartDist > 0) {
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            renderer.zoom = Math.max(0.01, Math.min(initialZoom * (dist / touchStartDist), 1e8));
            renderer.needsRender = true;
        }
    }, { passive: false });

    canvas.addEventListener('touchend', e => {
        e.preventDefault();
        if (e.touches.length === 1) {
            isDragging = true;
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
        } else {
            isDragging = false;
        }
    }, { passive: false });

    window.addEventListener('resize', () => { renderer.needsRender = true; });
}
