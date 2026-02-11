// =============================================================================
// app.js — Application Controller
// =============================================================================
// Depends on math.js:       isPrime()
// Depends on construct.js:  constructGroup(p)
// Depends on hyperbolic.js: HyperbolicCanvas
// Depends on topology.js:   TopologyPanel
// Depends on algebra.js:    AlgebraPanel
//
// Exports:
//   App — prototype-based controller that wires UI to computation and rendering
// =============================================================================

// ---------------------------------------------------------------------------
// Helper: find the next prime >= n
// ---------------------------------------------------------------------------
function nextPrime(n) {
    var candidate = n;
    while (!isPrime(candidate)) {
        candidate++;
        if (candidate > 100000) return null; // safety bound
    }
    return candidate;
}

// ---------------------------------------------------------------------------
// Helper: find the previous prime <= n (returns 2 if n <= 2)
// ---------------------------------------------------------------------------
function prevPrime(n) {
    if (n <= 2) return 2;
    var candidate = n;
    while (!isPrime(candidate)) {
        candidate--;
        if (candidate < 2) return 2;
    }
    return candidate;
}

// ---------------------------------------------------------------------------
// App constructor
// ---------------------------------------------------------------------------

/**
 * Application controller. Manages state, UI event binding, and orchestrates
 * computation and rendering across the three panels.
 */
function App() {
    this.p = null;
    this.groupData = null;

    // Panel instances (created in init)
    this.hyperbolicCanvas = null;
    this.topologyPanel = null;
    this.algebraPanel = null;

    // DOM element references (resolved in init)
    this._input = null;
    this._computeBtn = null;
    this._prevBtn = null;
    this._nextBtn = null;
    this._errorMsg = null;
    this._loadingMsg = null;
    this._verified = false;
}

// ---------------------------------------------------------------------------
// init — set up panels, bind events, load initial prime from URL hash
// ---------------------------------------------------------------------------

App.prototype.init = function() {
    var self = this;

    // Resolve DOM elements
    this._input = document.getElementById('prime-input');
    this._computeBtn = document.getElementById('compute-btn');
    this._prevBtn = document.getElementById('prev-prime-btn');
    this._nextBtn = document.getElementById('next-prime-btn');
    this._errorMsg = document.getElementById('error-msg');
    this._loadingMsg = document.getElementById('loading-msg');

    // Create panel instances
    var canvas = document.getElementById('hyperbolic-canvas');
    this.hyperbolicCanvas = new HyperbolicCanvas(canvas);

    var topologyContainer = document.getElementById('topology-svg');
    this.topologyPanel = new TopologyPanel(topologyContainer);

    var algebraContainer = document.getElementById('algebra-content');
    this.algebraPanel = new AlgebraPanel(algebraContainer);

    // Bind: Compute button
    this._computeBtn.addEventListener('click', function() {
        self._computeFromInput();
    });

    // Bind: Enter key in input field
    this._input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            self._computeFromInput();
        }
    });

    // Bind: Prev / Next prime buttons
    if (this._prevBtn) {
        this._prevBtn.addEventListener('click', function() {
            self._stepPrime(-1);
        });
    }
    if (this._nextBtn) {
        this._nextBtn.addEventListener('click', function() {
            self._stepPrime(1);
        });
    }

    // Bind: Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Skip if an input element is focused
        var tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            self._stepPrime(1);
        } else if (e.key === '-') {
            e.preventDefault();
            self._stepPrime(-1);
        } else if (e.key === '1') {
            e.preventDefault();
            var hp = document.getElementById('hyperbolic-panel');
            if (hp) hp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (e.key === '2') {
            e.preventDefault();
            var tp = document.getElementById('topology-panel');
            if (tp) tp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (e.key === '3') {
            e.preventDefault();
            var ap = document.getElementById('algebra-panel');
            if (ap) ap.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });

    // Bind: URL hash changes (back/forward navigation)
    window.addEventListener('hashchange', function() {
        var p = self._readHash();
        if (p !== null && p !== self.p) {
            self._input.value = p;
            self.setPrime(p);
        }
    });

    // Read initial prime from URL hash (default p=2)
    var initialP = this._readHash();
    if (initialP === null) {
        initialP = 2;
    }
    this._input.value = initialP;
    this.setPrime(initialP);
};

// ---------------------------------------------------------------------------
// setPrime — validate, compute, and render
// ---------------------------------------------------------------------------

App.prototype.setPrime = function(p) {
    var self = this;

    // Clear previous error
    this._showError('');

    // Validate input
    if (typeof p !== 'number' || isNaN(p) || p < 2) {
        this._showError('Please enter a number \u2265 2');
        return;
    }

    p = Math.floor(p);

    if (p > 10000) {
        this._showError('p must be \u2264 10,000 (SL2Z uses Number, not BigInt)');
        return;
    }

    if (!isPrime(p)) {
        this._showError('p must be a prime number (2, 3, 5, 7, 11, ...)');
        return;
    }

    // Show loading indicator
    this._showLoading(true);

    // Add panel-updating class for smooth transition
    var panels = document.querySelectorAll('.panel');
    for (var i = 0; i < panels.length; i++) {
        panels[i].classList.add('panel-updating');
    }

    // Use setTimeout so the loading indicator paints before heavy computation
    setTimeout(function() {
        try {
            var groupData = constructGroup(p);

            self.p = p;
            self.groupData = groupData;

            // Update URL hash
            self._updateHash(p);

            // Render all panels
            self.hyperbolicCanvas.fitToGroup(groupData);
            self.hyperbolicCanvas.render(groupData);
            self.topologyPanel.render(groupData);
            self.algebraPanel.render(groupData);

            // Log verification on first successful load
            if (!self._verified) {
                self._verified = true;
                self._logVerification();
            }

        } catch (err) {
            self._showError(err.message || 'An error occurred during computation.');
        } finally {
            self._showLoading(false);

            // Remove panel-updating class after render (defer to next frame for visible fade-in)
            requestAnimationFrame(function() {
                for (var j = 0; j < panels.length; j++) {
                    panels[j].classList.remove('panel-updating');
                }
            });
        }
    }, 10);
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Read the prime input field and call setPrime.
 */
App.prototype._computeFromInput = function() {
    var raw = this._input.value.trim();
    var p = parseInt(raw, 10);
    if (isNaN(p)) {
        this._showError('Please enter a number \u2265 2');
        return;
    }
    this.setPrime(p);
};

/**
 * Step to the next or previous prime.
 * @param {number} direction — +1 for next, -1 for previous
 */
App.prototype._stepPrime = function(direction) {
    var current = parseInt(this._input.value, 10);
    if (isNaN(current) || current < 2) current = 2;

    var p;
    if (direction > 0) {
        p = nextPrime(current + 1);
    } else {
        p = prevPrime(current - 1);
    }

    if (p === null) {
        this._showError('No prime found in range');
        return;
    }

    this._input.value = p;
    this.setPrime(p);
};

/**
 * Display an error message (or clear it).
 * @param {string} msg
 */
App.prototype._showError = function(msg) {
    if (this._errorMsg) {
        this._errorMsg.textContent = msg;
    }
};

/**
 * Show or hide the loading indicator.
 * @param {boolean} visible
 */
App.prototype._showLoading = function(visible) {
    if (this._loadingMsg) {
        this._loadingMsg.style.display = visible ? 'inline' : 'none';
    }
    if (this._computeBtn) {
        this._computeBtn.disabled = visible;
    }
};

/**
 * Read the prime value from the URL hash. Returns a number or null.
 * Expected format: #p=<number>
 */
App.prototype._readHash = function() {
    var hash = window.location.hash;
    if (!hash) return null;
    var match = hash.match(/p=(\d+)/);
    if (!match) return null;
    var val = parseInt(match[1], 10);
    return isNaN(val) ? null : val;
};

/**
 * Update the URL hash to reflect the current prime.
 * @param {number} p
 */
App.prototype._updateHash = function(p) {
    var newHash = '#p=' + p;
    if (window.location.hash === newHash) return;
    if (window.history && window.history.pushState) {
        window.history.pushState(null, '', newHash);
    } else {
        window.location.hash = 'p=' + p;
    }
};

// ---------------------------------------------------------------------------
// Console verification — self-test after initial render
// ---------------------------------------------------------------------------

App.prototype._logVerification = function() {
    if (!this.p || !this.groupData) return;

    console.log('Convex Cocompact Webapp loaded.');
    console.log('  p =', this.p,
        '| A trace =', this.groupData.A.trace(),
        '| B trace =', this.groupData.B.trace());
    console.log('  Genus:', this.groupData.extendedSurface.topology.genus,
        '| Boundaries:', this.groupData.extendedSurface.topology.boundaries);
};
