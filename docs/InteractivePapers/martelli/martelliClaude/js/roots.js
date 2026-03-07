/**
 * roots.js — Interactive visualization of the 5th roots of unity
 * on the unit circle in the complex plane.
 */

export function plotRoots() {
    const canvas = document.getElementById('rootsCanvas');
    if (!canvas) return;

    // High-DPI support
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth || 500;
    const displayHeight = canvas.clientHeight || 500;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const width = displayWidth;
    const height = displayHeight;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.3;

    // Colors
    const bgColor = 'rgba(10, 10, 30, 0.0)';
    const gridColor = 'rgba(255, 255, 255, 0.06)';
    const axisColor = 'rgba(255, 255, 255, 0.15)';
    const circleColor = 'rgba(167, 139, 250, 0.25)';
    const edgeColor = 'rgba(96, 165, 250, 0.4)';
    const rootColor = '#a78bfa';
    const rootColorHighlight = '#60a5fa';
    const textColor = '#e8e8f0';
    const mutedColor = '#6a6a8a';

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let i = -2; i <= 2; i++) {
        if (i === 0) continue;
        ctx.beginPath();
        ctx.moveTo(centerX + i * radius, 0);
        ctx.lineTo(centerX + i * radius, height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, centerY + i * radius);
        ctx.lineTo(width, centerY + i * radius);
        ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = mutedColor;
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Re', width - 28, centerY - 8);
    ctx.fillText('Im', centerX + 8, 18);

    // Unit circle
    ctx.strokeStyle = circleColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);

    // Compute roots
    const roots = [];
    for (let k = 0; k < 5; k++) {
        const angle = (2 * Math.PI * k) / 5;
        roots.push({
            x: Math.cos(angle),
            y: Math.sin(angle),
            k
        });
    }

    // Pentagon fill
    ctx.fillStyle = 'rgba(96, 165, 250, 0.04)';
    ctx.beginPath();
    roots.forEach((r, i) => {
        const px = centerX + r.x * radius;
        const py = centerY - r.y * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();

    // Pentagon edges
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    roots.forEach((r, i) => {
        const px = centerX + r.x * radius;
        const py = centerY - r.y * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();

    // Draw roots
    roots.forEach((root, idx) => {
        const px = centerX + root.x * radius;
        const py = centerY - root.y * radius;

        // Glow
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, 16);
        const color = idx === 0 ? mutedColor : rootColor;
        gradient.addColorStop(0, color + '40');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(px, py, 16, 0, 2 * Math.PI);
        ctx.fill();

        // Dot
        ctx.fillStyle = idx === 0 ? mutedColor : rootColor;
        ctx.beginPath();
        ctx.arc(px, py, idx === 0 ? 5 : 6, 0, 2 * Math.PI);
        ctx.fill();

        // Border
        ctx.strokeStyle = idx === 0 ? 'rgba(106,106,138,0.5)' : 'rgba(167,139,250,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label
        ctx.fillStyle = textColor;
        ctx.font = '14px Inter, sans-serif';
        ctx.textAlign = 'left';

        const labelOffset = 14;
        let lx = px + labelOffset;
        let ly = py - 8;

        // Adjust positions for overlapping labels
        if (idx === 0) {
            lx = px + labelOffset;
            ly = py + 5;
            ctx.fillStyle = mutedColor;
            ctx.fillText('1', lx, ly);
        } else {
            const superscripts = ['', '', '²', '³', '⁴'];
            const label = idx === 1 ? 'ζ₅' : 'ζ₅' + superscripts[idx];
            ctx.fillText(label, lx, ly);
        }
    });

    // Title
    ctx.fillStyle = textColor;
    ctx.font = '600 15px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Roots of Φ₅(z) = z⁴ + z³ + z² + z + 1', centerX, 28);

    // Annotation for golden ratio connection
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = mutedColor;
    ctx.fillText('ζ₅ + ζ₅⁻¹ = φ (golden ratio)', centerX, height - 12);
}
