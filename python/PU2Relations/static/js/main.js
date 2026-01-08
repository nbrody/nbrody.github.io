document.addEventListener('DOMContentLoaded', () => {
    const solveBtn = document.getElementById('solve-btn');
    const stopBtn = document.getElementById('stop-btn');
    const logs = document.getElementById('logs');
    const resultsList = document.getElementById('results-list');

    // Status elements
    const iterEl = document.getElementById('curr-iter');
    const depthEl = document.getElementById('curr-depth');
    const scoreEl = document.getElementById('best-score');
    const wordEl = document.getElementById('best-word');
    const matrixEl = document.getElementById('best-matrix');

    let eventSource = null;

    function addLog(msg, type = '') {
        const div = document.createElement('div');
        div.className = `log-entry ${type}`;
        div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logs.appendChild(div);
        logs.scrollTop = logs.scrollHeight;
    }

    function addResult(res) {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `
            <div class="res-header">
                <span class="badge">Relation found at depth ${res.depth}</span>
                <span class="scalar" style="font-size: 0.75rem; color: #94a3b8">Scalar: ${res.scalar}</span>
            </div>
            <span class="res-word">${res.word}</span>
            <div class="res-matrix">
                \\[ ${res.matrix} \\]
            </div>
        `;
        resultsList.prepend(card);
        MathJax.typesetPromise([card]);
    }

    solveBtn.addEventListener('click', () => {
        const params = {
            x: document.getElementById('x').value,
            y: document.getElementById('y').value,
            a: document.getElementById('a').value,
            b: document.getElementById('b').value,
            c: document.getElementById('c').value,
            d: document.getElementById('d').value,
            beam: document.getElementById('beam').value,
            stop: document.getElementById('stop').value,
            max_iter: document.getElementById('max_iter').value,
            random_rate: document.getElementById('random_rate').value
        };

        // Reset
        resultsList.innerHTML = '';
        logs.innerHTML = '';
        addLog('Starting search...', 'info');

        solveBtn.disabled = true;
        stopBtn.disabled = false;

        const qs = new URLSearchParams(params).toString();
        eventSource = new EventSource(`/solve?${qs}`);

        eventSource.onmessage = (e) => {
            const data = JSON.parse(e.data);

            if (data.type === 'progress') {
                iterEl.textContent = data.iter;
                depthEl.textContent = data.depth;
                scoreEl.textContent = data.score.toFixed(2);
                wordEl.textContent = data.word;
                if (data.matrix) {
                    matrixEl.innerHTML = `\\[ ${data.matrix} \\]`;
                    MathJax.typesetPromise([matrixEl]);
                }
            } else if (data.type === 'found') {
                addLog('FOUND relation!', 'success');
                addResult(data);
            } else if (data.type === 'error') {
                addLog(`ERROR: ${data.message}`, 'error');
                eventSource.close();
            } else if (data.type === 'log') {
                addLog(data.message);
            }
        };

        eventSource.onerror = () => {
            addLog('Connection closed or completed.');
            eventSource.close();
            solveBtn.disabled = false;
            stopBtn.disabled = true;
        };
    });

    stopBtn.addEventListener('click', () => {
        if (eventSource) {
            eventSource.close();
            addLog('Search stopped by user.');
            solveBtn.disabled = false;
            stopBtn.disabled = true;
        }
    });
});
