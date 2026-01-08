document.addEventListener('DOMContentLoaded', () => {
    const solveBtn = document.getElementById('solve-btn');
    const stopBtn = document.getElementById('stop-btn');
    const logContainer = document.getElementById('logs');
    const resultsGrid = document.getElementById('results-list');

    // Progress UI elements
    const currDepth = document.getElementById('curr-depth');
    const currBeam = document.getElementById('curr-beam');
    const bestScore = document.getElementById('best-score');
    const bestWord = document.getElementById('best-word');

    let eventSource = null;

    function addLog(message, type = '') {
        const div = document.createElement('div');
        div.className = `log-entry ${type}`;
        div.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logContainer.appendChild(div);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    function addResult(result) {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `
            <div class="result-header">
                <span class="depth-badge">Depth ${result.depth}</span>
            </div>
            <span class="result-word">${result.word}</span>
            <div class="matrix-display">
                \\[ ${result.matrix} \\]
            </div>
        `;
        resultsGrid.prepend(card);
        MathJax.typesetPromise([card]);
    }

    solveBtn.addEventListener('click', () => {
        const p = document.getElementById('p').value;
        const beam = document.getElementById('beam').value;
        const depth = document.getElementById('depth').value;
        const minlen = document.getElementById('minlen').value;
        const stop = document.getElementById('stop').value;
        const samples = document.getElementById('samples').value;

        // Reset UI
        resultsGrid.innerHTML = '';
        logContainer.innerHTML = '';
        addLog(`Starting search for p=${p}...`, 'info');

        solveBtn.disabled = true;
        stopBtn.disabled = false;

        const url = `/solve?p=${p}&beam=${beam}&depth=${depth}&minlen=${minlen}&stop=${stop}&samples=${samples}`;
        eventSource = new EventSource(url);

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'progress') {
                currDepth.textContent = data.depth;
                currBeam.textContent = data.beam_size;
                bestScore.textContent = data.best_score.toFixed(2);
                bestWord.textContent = data.best_word || '-';
            } else if (data.type === 'found') {
                addLog(`FOUND relation: ${data.word}`, 'success');
                addResult(data);
            } else if (data.type === 'error') {
                addLog(`ERROR: ${data.message}`, 'error');
                eventSource.close();
            }
        };

        eventSource.onerror = () => {
            addLog('Search complete or disconnected.', 'info');
            eventSource.close();
            solveBtn.disabled = false;
            stopBtn.disabled = true;
        };
    });

    stopBtn.addEventListener('click', () => {
        if (eventSource) {
            eventSource.close();
            addLog('Search stopped by user.', 'warning');
            solveBtn.disabled = false;
            stopBtn.disabled = true;
        }
    });
});
