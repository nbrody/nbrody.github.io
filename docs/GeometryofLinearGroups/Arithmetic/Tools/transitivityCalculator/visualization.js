// Visualization of ℝℙ¹ interval covering

function visualizeIntervalCovering(coveringWords) {
    console.log('=== VISUALIZATION START ===');
    console.log('visualizeIntervalCovering called with', coveringWords.length, 'words');
    console.log('Words:', coveringWords);

    const vizDiv = document.getElementById('visualization');
    if (!vizDiv) {
        console.error('Visualization div not found!');
        return;
    }

    const canvas = document.getElementById('rp1Canvas');
    if (!canvas) {
        console.error('Canvas not found!');
        return;
    }

    console.log('Canvas found, dimensions:', canvas.width, 'x', canvas.height);

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    console.log('Canvas cleared');

    // Set up coordinate system
    // Map ℝℙ¹ to horizontal axis
    // We'll use a mapping that puts ∞ at both ends (topological circle)
    // Or use a linear scale with ∞ in the middle

    const margin = 80;
    const plotWidth = width - 2 * margin;
    const plotHeight = height - 100;

    // Draw the line representing ℝℙ¹
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin, height - 50);
    ctx.lineTo(width - margin, height - 50);
    ctx.stroke();

    // Add tick marks and labels
    const tickPositions = [
        { val: -Infinity, x: margin, label: '-∞' },
        { val: -2, x: margin + plotWidth * 0.2, label: '-2' },
        { val: -1, x: margin + plotWidth * 0.3, label: '-1' },
        { val: 0, x: margin + plotWidth * 0.5, label: '0' },
        { val: 1, x: margin + plotWidth * 0.7, label: '1' },
        { val: 2, x: margin + plotWidth * 0.8, label: '2' },
        { val: Infinity, x: width - margin, label: '+∞' }
    ];

    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#333';

    for (const tick of tickPositions) {
        // Draw tick
        ctx.beginPath();
        ctx.moveTo(tick.x, height - 50);
        ctx.lineTo(tick.x, height - 45);
        ctx.stroke();

        // Draw label
        ctx.fillText(tick.label, tick.x, height - 25);
    }

    // Map value to x coordinate
    function valueToX(val) {
        if (val === Infinity) return width - margin;
        if (val === -Infinity) return margin;

        // Use atan to compress infinite range to [-π/2, π/2]
        // Then map to [margin, width-margin]
        const angle = Math.atan(val);
        const normalized = (angle + Math.PI/2) / Math.PI; // Map to [0, 1]
        return margin + normalized * plotWidth;
    }

    // Assign colors to words
    const colors = [
        '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
        '#1abc9c', '#e67e22', '#34495e', '#95a5a6', '#d35400'
    ];

    // Draw intervals at different heights to avoid overlap
    const bandHeight = 30;
    const maxBands = Math.min(coveringWords.length, 8);
    const verticalSpacing = plotHeight / (maxBands + 1);

    coveringWords.forEach((wordData, idx) => {
        const {word, intervals} = wordData;
        const color = colors[idx % colors.length];
        const yBase = height - 50 - (idx + 1) * verticalSpacing;

        for (const interval of intervals) {
            let xStart, xEnd;

            if (interval.description.includes('< -1')) {
                xStart = valueToX(-10); // Represent -∞
                xEnd = valueToX(-1);
            } else if (interval.description.includes('-1') && interval.description.includes('< 0')) {
                xStart = valueToX(-1);
                xEnd = valueToX(0);
            } else if (interval.description.includes('0') && interval.description.includes('< 1')) {
                xStart = valueToX(0);
                xEnd = valueToX(1);
            } else if (interval.description.includes('\\geq 1')) {
                xStart = valueToX(1);
                xEnd = valueToX(10); // Represent +∞
            } else if (interval.description.includes('infty') && !interval.description.includes('-')) {
                // Just infinity point
                xStart = valueToX(10);
                xEnd = valueToX(10);
            } else {
                continue;
            }

            // Draw filled rectangle for interval
            ctx.fillStyle = color + '80'; // Add transparency
            ctx.fillRect(xStart, yBase - bandHeight/2, xEnd - xStart, bandHeight);

            // Draw border
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(xStart, yBase - bandHeight/2, xEnd - xStart, bandHeight);

            // Draw label
            ctx.font = 'bold 13px Arial';
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const labelX = (xStart + xEnd) / 2;

            // Format word for display
            let displayWord = word;
            // Make it more compact
            displayWord = displayWord.replace(/\cdot/g, '');

            ctx.fillText('$' + displayWord + '$', labelX, yBase);
        }
    });

    // Add title
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.fillText('Interval Covering of ℝℙ¹', width / 2, 30);

    // Show the visualization
    console.log('Setting visualization div to display: block');
    vizDiv.style.display = 'block';
    console.log('Visualization div display:', vizDiv.style.display);
    console.log('=== VISUALIZATION COMPLETE ===');
}
