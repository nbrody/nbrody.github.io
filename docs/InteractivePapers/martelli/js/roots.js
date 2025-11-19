export function plotRoots() {
    const canvas = document.getElementById('rootsCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = 150;

    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Draw axes
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.stroke();

    // Draw unit circle
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, scale, 0, 2 * Math.PI);
    ctx.stroke();

    // Label axes
    ctx.fillStyle = '#666';
    ctx.font = '14px Arial';
    ctx.fillText('Re', width - 30, centerY - 10);
    ctx.fillText('Im', centerX + 10, 20);

    // Calculate and plot the 5 fifth roots of unity
    const roots = [];
    for (let k = 0; k < 5; k++) {
        const angle = (2 * Math.PI * k) / 5;
        const x = Math.cos(angle);
        const y = Math.sin(angle);
        roots.push({ x, y, angle, k });
    }

    // Draw lines connecting roots to form pentagon
    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const root = roots[i];
        const x = centerX + root.x * scale;
        const y = centerY - root.y * scale;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.closePath();
    ctx.stroke();

    // Plot the roots
    roots.forEach((root, index) => {
        const x = centerX + root.x * scale;
        const y = centerY - root.y * scale;

        // Different color for ζ₅⁰ = 1 (not a root of our polynomial)
        if (index === 0) {
            ctx.fillStyle = '#95a5a6';
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, 2 * Math.PI);
            ctx.fill();
            ctx.fillStyle = '#666';
            ctx.fillText('1', x + 12, y + 5);
        } else {
            // Roots of z^4 + z^3 + z^2 + z + 1
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.arc(x, y, 7, 0, 2 * Math.PI);
            ctx.fill();

            // Label with ζ_5^k
            ctx.fillStyle = '#2c3e50';
            ctx.font = 'italic 14px Times New Roman';
            const baseText = 'ζ';
            const baseWidth = ctx.measureText(baseText).width;
            ctx.fillText(baseText, x + 12, y + 5);

            // Draw subscript 5
            ctx.font = 'italic 10px Times New Roman';
            const subWidth = ctx.measureText('5').width;
            ctx.fillText('5', x + 12 + baseWidth, y + 8);

            // Draw superscript k if not 1
            if (index !== 1) {
                ctx.font = 'italic 10px Times New Roman';
                ctx.fillText(toSuperscript(index), x + 12 + baseWidth + subWidth, y + 2);
            }
        }
    });

    // Add title
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('Roots of the 5th Cyclotomic Polynomial', centerX - 150, 30);
}

function toSuperscript(num) {
    const superscripts = '⁰¹²³⁴⁵⁶⁷⁸⁹';
    return num.toString().split('').map(d => superscripts[d]).join('');
}
