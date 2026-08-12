/**
 * MosaicFractal - Infinite Recursive Photo Mosaic Generator
 *
 * Rendering model:
 *  - Every photo has a precomputed grid mapping (which photo best matches each cell).
 *  - A tile drawn smaller than REVEAL_START × viewport is a plain photo.
 *  - Between REVEAL_START and REVEAL_END it crossfades into its own mosaic.
 *  - Past REVEAL_END it is fully a mosaic; past RECURSE_AT we stop using the
 *    cached mosaic bitmap and recurse into live child tiles.
 *  - When a single tile grows to cover the whole viewport, the view is
 *    "re-based" onto it (it becomes the new root), so zoom depth is unlimited
 *    and float precision never degrades.
 */

class MosaicFractal {
    constructor() {
        // Photo storage
        this.photos = [];           // {thumbnail, display, dataUrl}
        this.mainPhotoIndex = -1;
        this.photoColors = [];      // Average color for each photo {r,g,b,css}

        // Canvas and rendering
        this.canvas = document.getElementById('mosaic-canvas');
        this.ctx = this.canvas.getContext('2d');

        // View state (all in device/canvas pixels)
        this.zoom = 1;
        this.zoomTarget = 1;
        this.anchorX = 0;           // zoom anchor point on canvas
        this.anchorY = 0;
        this.panX = 0;
        this.panY = 0;
        this.baseSize = 800;        // world size of the root mosaic
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Mosaic settings / data
        this.gridSize = 10;
        this.tileMappings = null;   // per photo: gridSize² best-match photo indices
        this.cellColors = null;     // per photo: gridSize² average cell colors
        this.mosaicCache = new Map(); // photoIndex -> pre-rendered mosaic canvas (LRU)
        this.cacheSize = 1024;
        this.tilesRendered = 0;

        // Re-basing stack for infinite zoom: {photoIndex, row, col} per level
        this.depthStack = [];
        this.rootPhotoIndex = -1;

        // Tunables (fractions of the viewport's smaller dimension)
        this.REVEAL_START = 0.45;   // tile starts fading into a mosaic
        this.REVEAL_END = 1.0;      // tile is fully a mosaic (fills the viewport)
        this.RECURSE_AT = 1.6;      // switch from cached bitmap to live children
        this.TINT_ALPHA = 0.32;     // color-correction tint strength on tiles
        this.MIN_ZOOM = 0.35;
        this.MAX_ZOOM = 1e9;
        this.CACHE_LIMIT = 24;      // max cached mosaic bitmaps
        this.THUMB_SIZE = 256;
        this.DISPLAY_SIZE = 640;

        // Render loop
        this.needsRender = false;
        this.viewerActive = false;

        // DOM elements
        this.uploadArea = document.getElementById('upload-area');
        this.fileInput = document.getElementById('file-input');
        this.photoGrid = document.getElementById('photo-grid');
        this.mainPhotoSelector = document.getElementById('main-photo-selector');
        this.selectedMainDiv = document.getElementById('selected-main');
        this.generateBtn = document.getElementById('generate-btn');
        this.uploadSection = document.getElementById('upload-section');
        this.viewerSection = document.getElementById('viewer-section');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.photoCountSpan = document.querySelector('.photo-count');

        // Info displays
        this.zoomDisplay = document.getElementById('zoom-display');
        this.depthDisplay = document.getElementById('depth-display');
        this.tilesDisplay = document.getElementById('tiles-display');
        this.gridDisplay = document.getElementById('grid-display');

        // Settings
        this.settingsPanel = document.getElementById('settings-panel');
        this.gridSizeInput = document.getElementById('grid-size-input');
        this.gridSizeValue = document.getElementById('grid-size-value');

        this.init();
    }

    init() {
        this.setupUploadHandlers();
        this.setupViewerHandlers();
        this.setupButtonHandlers();
        this.setupSettingsHandlers();
        requestAnimationFrame(() => this.tick());
    }

    // ------------------------------------------------------------------
    // Upload / photo management
    // ------------------------------------------------------------------

    setupUploadHandlers() {
        this.uploadArea.addEventListener('click', () => {
            this.fileInput.click();
        });

        this.fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });

        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('drag-over');
        });

        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('drag-over');
        });

        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('drag-over');
            this.handleFiles(e.dataTransfer.files);
        });
    }

    async loadExamplePhotos() {
        const exampleImages = [];
        for (let i = 1; i <= 25; i++) {
            exampleImages.push(`test_images/img${String(i).padStart(2, '0')}.jpg`);
        }

        const btn = document.getElementById('load-example-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="btn-icon">⏳</span> Loading...';
        btn.disabled = true;

        this.photos = [];
        this.mainPhotoIndex = -1;
        this.photoGrid.innerHTML = '';

        for (const src of exampleImages) {
            try {
                const photo = await this.loadImageFromUrl(src);
                this.photos.push(photo);
                this.addPhotoToGrid(photo, this.photos.length - 1);
            } catch (err) {
                console.warn('Could not load example image:', src, err);
            }
        }

        if (this.photos.length > 0) {
            this.selectMainPhoto(0);
        }

        btn.innerHTML = originalText;
        btn.disabled = false;

        this.updateUI();
    }

    loadImageFromUrl(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(this.processImage(img));
            img.onerror = reject;
            img.src = url;
        });
    }

    loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const reader = new FileReader();

            reader.onload = (e) => {
                img.onload = () => resolve(this.processImage(img));
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Center-crop an image into two square canvases: a small thumbnail
     * (color analysis + tiny tiles) and a larger display version (big
     * on-screen draws). The original Image is not retained.
     */
    processImage(img) {
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;

        const makeSquare = (dim) => {
            const canvas = document.createElement('canvas');
            canvas.width = dim;
            canvas.height = dim;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, sx, sy, size, size, 0, 0, dim, dim);
            return canvas;
        };

        const thumbnail = makeSquare(this.THUMB_SIZE);
        const display = makeSquare(Math.min(this.DISPLAY_SIZE, size));

        return {
            thumbnail,
            display,
            dataUrl: thumbnail.toDataURL('image/jpeg', 0.8)
        };
    }

    async handleFiles(files) {
        const remainingSlots = 100 - this.photos.length;
        const filesToProcess = Array.from(files).slice(0, remainingSlots);

        for (const file of filesToProcess) {
            if (!file.type.startsWith('image/')) continue;

            try {
                const photo = await this.loadImage(file);
                this.photos.push(photo);
                this.addPhotoToGrid(photo, this.photos.length - 1);
            } catch (err) {
                console.error('Error loading image:', err);
            }
        }

        this.updateUI();
    }

    addPhotoToGrid(photo, index) {
        const item = document.createElement('div');
        item.className = 'photo-item';
        item.dataset.index = index;

        const img = document.createElement('img');
        img.src = photo.dataUrl;
        img.alt = `Photo ${index + 1}`;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '×';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removePhoto(index);
        });

        item.appendChild(img);
        item.appendChild(removeBtn);

        item.addEventListener('click', () => {
            this.selectMainPhoto(index);
        });

        this.photoGrid.appendChild(item);
    }

    removePhoto(index) {
        this.photos.splice(index, 1);

        if (this.mainPhotoIndex === index) {
            this.mainPhotoIndex = -1;
        } else if (this.mainPhotoIndex > index) {
            this.mainPhotoIndex--;
        }

        this.rebuildPhotoGrid();
        this.updateUI();
    }

    rebuildPhotoGrid() {
        this.photoGrid.innerHTML = '';
        this.photos.forEach((photo, index) => {
            this.addPhotoToGrid(photo, index);
        });

        if (this.mainPhotoIndex >= 0) {
            this.selectMainPhoto(this.mainPhotoIndex);
        }
    }

    selectMainPhoto(index) {
        this.mainPhotoIndex = index;

        document.querySelectorAll('.photo-item').forEach((item, i) => {
            item.classList.toggle('selected-main', i === index);

            let badge = item.querySelector('.main-badge');
            if (i === index) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'main-badge';
                    badge.textContent = 'MAIN';
                    item.appendChild(badge);
                }
            } else if (badge) {
                badge.remove();
            }
        });

        this.selectedMainDiv.innerHTML = '';
        const img = document.createElement('img');
        img.src = this.photos[index].dataUrl;
        const label = document.createElement('span');
        label.textContent = `Photo ${index + 1} selected as main image`;
        this.selectedMainDiv.appendChild(img);
        this.selectedMainDiv.appendChild(label);

        this.updateUI();
    }

    updateUI() {
        const count = this.photos.length;
        this.photoCountSpan.textContent = `${count} / 100 photos`;

        if (count >= 2) {
            this.mainPhotoSelector.classList.remove('hidden');
            this.settingsPanel.classList.remove('hidden');
            this.generateBtn.classList.remove('hidden');
        } else {
            this.mainPhotoSelector.classList.add('hidden');
            this.settingsPanel.classList.add('hidden');
            this.generateBtn.classList.add('hidden');
        }

        this.generateBtn.disabled = this.mainPhotoIndex < 0 || count < 2;
    }

    // ------------------------------------------------------------------
    // Viewer input
    // ------------------------------------------------------------------

    /** Convert a client-space point to canvas (device pixel) coordinates. */
    toCanvasPoint(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) * (this.canvas.width / rect.width),
            y: (clientY - rect.top) * (this.canvas.height / rect.height)
        };
    }

    setupViewerHandlers() {
        const container = document.getElementById('mosaic-container');

        // Wheel / trackpad zoom: adjust the target, the tick loop eases toward it
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const p = this.toCanvasPoint(e.clientX, e.clientY);
            this.anchorX = p.x;
            this.anchorY = p.y;
            const k = e.ctrlKey ? 0.01 : 0.0022; // ctrl+wheel = trackpad pinch
            this.zoomTarget = Math.min(this.zoomTarget * Math.exp(-e.deltaY * k), this.MAX_ZOOM);
        }, { passive: false });

        // Double-click to dive
        container.addEventListener('dblclick', (e) => {
            const p = this.toCanvasPoint(e.clientX, e.clientY);
            this.anchorX = p.x;
            this.anchorY = p.y;
            this.zoomTarget = Math.min(this.zoomTarget * 6, this.MAX_ZOOM);
        });

        // Pan with mouse drag
        container.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            container.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;

            const scale = this.canvas.width / this.canvas.getBoundingClientRect().width;
            this.panX += (e.clientX - this.lastMouseX) * scale;
            this.panY += (e.clientY - this.lastMouseY) * scale;

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;

            this.needsRender = true;
        });

        document.addEventListener('mouseup', () => {
            this.isDragging = false;
            container.style.cursor = 'grab';
        });

        // Touch: one finger pans, two fingers pinch-zoom (applied immediately)
        let lastTouchDistance = 0;
        let lastTouchX = 0;
        let lastTouchY = 0;

        container.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                lastTouchX = e.touches[0].clientX;
                lastTouchY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                lastTouchDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
            }
        });

        container.addEventListener('touchmove', (e) => {
            e.preventDefault();

            if (e.touches.length === 1) {
                const scale = this.canvas.width / this.canvas.getBoundingClientRect().width;
                this.panX += (e.touches[0].clientX - lastTouchX) * scale;
                this.panY += (e.touches[0].clientY - lastTouchY) * scale;

                lastTouchX = e.touches[0].clientX;
                lastTouchY = e.touches[0].clientY;

                this.needsRender = true;
            } else if (e.touches.length === 2) {
                const distance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );

                const p = this.toCanvasPoint(
                    (e.touches[0].clientX + e.touches[1].clientX) / 2,
                    (e.touches[0].clientY + e.touches[1].clientY) / 2
                );

                this.applyZoom(p.x, p.y, distance / lastTouchDistance);
                this.zoomTarget = this.zoom;
                this.needsRender = true;

                lastTouchDistance = distance;
            }
        }, { passive: false });

        window.addEventListener('resize', () => this.handleResize());
    }

    setupButtonHandlers() {
        this.generateBtn.addEventListener('click', () => {
            this.generateMosaic();
        });

        document.getElementById('reset-view').addEventListener('click', () => {
            this.resetView();
        });

        document.getElementById('back-to-upload').addEventListener('click', () => {
            this.viewerActive = false;
            this.viewerSection.classList.add('hidden');
            this.uploadSection.classList.remove('hidden');
        });
    }

    setupSettingsHandlers() {
        this.gridSizeInput.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.gridSizeValue.textContent = `${value}×${value}`;
        });

        document.getElementById('load-example-btn').addEventListener('click', () => {
            this.loadExamplePhotos();
        });
    }

    handleResize() {
        if (!this.viewerActive) return;

        const cssSize = Math.min(800, window.innerWidth - 80);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const newSize = Math.round(cssSize * dpr);
        const scale = newSize / this.canvas.width;
        if (scale === 1) return;

        this.canvas.width = newSize;
        this.canvas.height = newSize;
        this.canvas.style.width = cssSize + 'px';
        this.canvas.style.height = cssSize + 'px';

        // Keep the same view: screen positions scale with the canvas
        this.zoom *= scale;
        this.zoomTarget *= scale;
        this.panX *= scale;
        this.panY *= scale;
        this.needsRender = true;
    }

    // ------------------------------------------------------------------
    // Mosaic generation (color analysis + tile mapping)
    // ------------------------------------------------------------------

    async generateMosaic() {
        this.loadingOverlay.classList.remove('hidden');
        const status = document.getElementById('loading-status');
        status.textContent = 'Analyzing colors...';
        await new Promise(r => setTimeout(r, 50));

        this.gridSize = parseInt(this.gridSizeInput.value);
        this.photoColors = this.calculatePhotoColors();

        status.textContent = 'Mapping tiles...';
        await new Promise(r => setTimeout(r, 50));
        await this.computeMappings(status);

        // Setup canvas at device resolution; the mosaic fills it at zoom = 1
        const cssSize = Math.min(800, window.innerWidth - 80);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.round(cssSize * dpr);
        this.canvas.height = this.canvas.width;
        this.canvas.style.width = cssSize + 'px';
        this.canvas.style.height = cssSize + 'px';
        this.baseSize = this.canvas.width;
        this.cacheSize = Math.max(768, Math.min(2048, this.canvas.width));
        this.mosaicCache.clear();

        this.resetView();
        this.gridDisplay.textContent = `${this.gridSize}×${this.gridSize}`;

        this.loadingOverlay.classList.add('hidden');
        this.uploadSection.classList.add('hidden');
        this.viewerSection.classList.remove('hidden');
        this.viewerActive = true;
        this.needsRender = true;

        const hint = document.getElementById('zoom-hint');
        hint.style.opacity = '1';
        setTimeout(() => { hint.style.opacity = '0'; }, 4000);
    }

    calculatePhotoColors() {
        const colors = [];

        for (const photo of this.photos) {
            const thumb = photo.thumbnail;
            const ctx = thumb.getContext('2d');
            const data = ctx.getImageData(0, 0, thumb.width, thumb.height).data;

            let r = 0, g = 0, b = 0;
            const pixelCount = data.length / 4;

            for (let i = 0; i < data.length; i += 4) {
                r += data[i];
                g += data[i + 1];
                b += data[i + 2];
            }

            r = Math.round(r / pixelCount);
            g = Math.round(g / pixelCount);
            b = Math.round(b / pixelCount);
            colors.push({ r, g, b, css: `rgb(${r},${g},${b})` });
        }

        return colors;
    }

    /**
     * For every photo, compute the average color of each grid cell (read the
     * thumbnail's pixels once per photo) and pick the best-matching photo for
     * each cell, with a mild diversity rule so neighbors aren't all the same.
     */
    async computeMappings(statusEl) {
        const g = this.gridSize;
        this.tileMappings = [];
        this.cellColors = [];

        for (let photoIdx = 0; photoIdx < this.photos.length; photoIdx++) {
            const thumb = this.photos[photoIdx].thumbnail;
            const ctx = thumb.getContext('2d');
            const data = ctx.getImageData(0, 0, thumb.width, thumb.height).data;
            const W = thumb.width;

            const candidates = this.photos
                .map((_, i) => i)
                .filter(i => i !== photoIdx);
            if (candidates.length === 0) candidates.push(photoIdx);

            const tileMap = [];
            const colorMap = [];

            for (let row = 0; row < g; row++) {
                tileMap[row] = [];
                colorMap[row] = [];

                const y0 = Math.floor(row * W / g);
                const y1 = Math.max(y0 + 1, Math.floor((row + 1) * W / g));

                for (let col = 0; col < g; col++) {
                    const x0 = Math.floor(col * W / g);
                    const x1 = Math.max(x0 + 1, Math.floor((col + 1) * W / g));

                    let r = 0, gr = 0, b = 0, n = 0;
                    for (let y = y0; y < y1; y++) {
                        let i = (y * W + x0) * 4;
                        for (let x = x0; x < x1; x++, i += 4) {
                            r += data[i];
                            gr += data[i + 1];
                            b += data[i + 2];
                            n++;
                        }
                    }

                    r = Math.round(r / n);
                    gr = Math.round(gr / n);
                    b = Math.round(b / n);
                    colorMap[row][col] = { r, g: gr, b, css: `rgb(${r},${gr},${b})` };

                    const left = col > 0 ? tileMap[row][col - 1] : -1;
                    const top = row > 0 ? tileMap[row - 1][col] : -1;
                    tileMap[row][col] = this.pickTile(colorMap[row][col], candidates, left, top);
                }
            }

            this.tileMappings.push(tileMap);
            this.cellColors.push(colorMap);

            if (photoIdx % 8 === 7) {
                statusEl.textContent = `Mapping tiles... ${photoIdx + 1}/${this.photos.length}`;
                await new Promise(r => setTimeout(r, 0));
            }
        }
    }

    /**
     * Find the best color match among candidates, preferring not to repeat
     * the photo used directly above or to the left (within a distance
     * tolerance) so flat regions don't tile with one repeated photo.
     */
    pickTile(target, candidates, leftIdx, topIdx) {
        // Track the top three matches in one pass
        let i1 = -1, d1 = Infinity, i2 = -1, d2 = Infinity, i3 = -1, d3 = Infinity;

        for (const i of candidates) {
            const c = this.photoColors[i];
            const dr = c.r - target.r;
            const dg = c.g - target.g;
            const db = c.b - target.b;
            // Weighted for human perception (green counts most)
            const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;

            if (d < d1) {
                i3 = i2; d3 = d2;
                i2 = i1; d2 = d1;
                i1 = i; d1 = d;
            } else if (d < d2) {
                i3 = i2; d3 = d2;
                i2 = i; d2 = d;
            } else if (d < d3) {
                i3 = i; d3 = d;
            }
        }

        const tolerance = d1 * 2.5 + 500;
        for (const [idx, dist] of [[i1, d1], [i2, d2], [i3, d3]]) {
            if (idx >= 0 && idx !== leftIdx && idx !== topIdx && dist <= tolerance) {
                return idx;
            }
        }
        return i1;
    }

    // ------------------------------------------------------------------
    // View state: reset, eased zoom, re-basing
    // ------------------------------------------------------------------

    resetView() {
        this.zoom = 1;
        this.zoomTarget = 1;
        this.panX = 0;
        this.panY = 0;
        this.depthStack = [];
        this.rootPhotoIndex = this.mainPhotoIndex;
        this.anchorX = this.canvas.width / 2;
        this.anchorY = this.canvas.height / 2;
        this.needsRender = true;
    }

    /** Zoom by `factor` keeping the canvas point (x, y) fixed. */
    applyZoom(x, y, factor) {
        const worldX = (x - this.panX) / this.zoom;
        const worldY = (y - this.panY) / this.zoom;

        // Local zoom stays clamped; re-basing keeps it small in practice, but
        // zooming at an exact tile corner can't re-base, so cap it hard here
        this.zoom = Math.min(this.zoom * factor, this.MAX_ZOOM);

        this.panX = x - worldX * this.zoom;
        this.panY = y - worldY * this.zoom;
    }

    /**
     * Re-base the coordinate system so zoom stays in a numerically safe
     * range no matter how deep the dive goes:
     *  - If the root no longer covers the viewport, pop back to its parent
     *    (so neighboring tiles reappear when panning/zooming out).
     *  - If a single child tile covers the whole viewport, make it the root.
     */
    updateBase() {
        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const g = this.gridSize;
        const B = this.baseSize;
        const covers = (x, y, s) => x <= 0.5 && y <= 0.5 && x + s >= cw - 0.5 && y + s >= ch - 0.5;

        // Pop while the current root doesn't cover the viewport
        while (this.depthStack.length && !covers(this.panX, this.panY, B * this.zoom)) {
            const frame = this.depthStack.pop();
            const oldZoom = this.zoom;
            this.zoom = oldZoom * g;
            this.zoomTarget *= g;
            this.panX -= frame.col * B * oldZoom;
            this.panY -= frame.row * B * oldZoom;
            this.rootPhotoIndex = frame.photoIndex;
        }

        // Push while the child tile under the viewport center covers it
        while (this.zoom >= g * 0.999) {
            const u = (cw / 2 - this.panX) / (B * this.zoom);
            const v = (ch / 2 - this.panY) / (B * this.zoom);
            const col = Math.floor(u * g);
            const row = Math.floor(v * g);
            if (col < 0 || col >= g || row < 0 || row >= g) break;

            const cellS = B * this.zoom / g;
            const cx = this.panX + col * cellS;
            const cy = this.panY + row * cellS;
            if (!covers(cx, cy, cellS)) break;

            this.depthStack.push({ photoIndex: this.rootPhotoIndex, row, col });
            this.rootPhotoIndex = this.tileMappings[this.rootPhotoIndex][row][col];
            this.panX = cx;
            this.panY = cy;
            this.zoom /= g;
            this.zoomTarget /= g;
        }

        // At the true root, don't let the mosaic shrink away entirely
        if (this.depthStack.length === 0) {
            this.zoomTarget = Math.max(this.zoomTarget, this.MIN_ZOOM);
            this.zoom = Math.max(this.zoom, this.MIN_ZOOM * 0.7);
        }
    }

    /** rAF loop: ease zoom toward its target, re-base, render when dirty. */
    tick() {
        if (this.viewerActive) {
            const ratio = this.zoomTarget / this.zoom;
            if (Math.abs(Math.log(ratio)) > 0.002) {
                this.applyZoom(this.anchorX, this.anchorY, Math.pow(ratio, 0.22));
                this.needsRender = true;
            }

            if (this.needsRender) {
                this.needsRender = false;
                this.updateBase();
                this.render();
            }
        }

        requestAnimationFrame(() => this.tick());
    }

    // ------------------------------------------------------------------
    // Rendering
    // ------------------------------------------------------------------

    render() {
        this.tilesRendered = 0;
        this.ctx.fillStyle = '#12121f';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.drawNode(this.rootPhotoIndex, 0, 0, this.baseSize, null, 0);

        // Cumulative magnification across all re-based levels
        const magnification = this.zoom * Math.pow(this.gridSize, this.depthStack.length);
        this.zoomDisplay.textContent = this.formatZoom(magnification);
        this.depthDisplay.textContent = this.depthStack.length;
        this.tilesDisplay.textContent = this.tilesRendered;
    }

    formatZoom(m) {
        if (m < 10) return m.toFixed(2) + '×';
        if (m < 10000) return Math.round(m).toLocaleString() + '×';
        return m.toExponential(1).replace('e+', 'e') + '×';
    }

    /**
     * Draw one tile (a photo occupying a world-space square), choosing its
     * representation by on-screen size:
     *   tiny         -> flat average-color rect
     *   small        -> plain photo (+ parent's color-correction tint)
     *   reveal band  -> cached mosaic crossfaded with the photo
     *   huge         -> recurse into visible child tiles
     */
    drawNode(photoIndex, worldX, worldY, worldSize, tint, depth) {
        const sx = worldX * this.zoom + this.panX;
        const sy = worldY * this.zoom + this.panY;
        const ss = worldSize * this.zoom;

        // Culling
        if (sx + ss < 0 || sy + ss < 0 || sx > this.canvas.width || sy > this.canvas.height) {
            return;
        }
        if (ss < 1) return;

        const ctx = this.ctx;

        // Sub-pixel tiles: a flat rect of the photo's average color
        if (ss < 2.5) {
            ctx.fillStyle = this.photoColors[photoIndex].css;
            ctx.fillRect(sx, sy, ss, ss);
            this.tilesRendered++;
            return;
        }

        const V = Math.min(this.canvas.width, this.canvas.height);
        const revealStart = this.REVEAL_START * V;
        const revealEnd = this.REVEAL_END * V;

        // Below the reveal threshold: just the photo
        if (ss <= revealStart) {
            this.drawPhoto(photoIndex, sx, sy, ss);
            this.applyTint(tint, sx, sy, ss, 1);
            return;
        }

        // t: 0 = still a photo, 1 = fully a mosaic
        const t = Math.min(1, (ss - revealStart) / (revealEnd - revealStart));

        if (ss <= this.RECURSE_AT * V || depth > 14) {
            // One draw call from the pre-rendered mosaic bitmap
            ctx.drawImage(this.getMosaicCache(photoIndex), sx, sy, ss, ss);
            this.tilesRendered++;
        } else {
            // Live recursion into only the visible child tiles
            const g = this.gridSize;
            const cellW = worldSize / g;
            const cellS = ss / g;
            const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
            const c0 = clamp(Math.floor(-sx / cellS), 0, g - 1);
            const c1 = clamp(Math.ceil((this.canvas.width - sx) / cellS), 0, g);
            const r0 = clamp(Math.floor(-sy / cellS), 0, g - 1);
            const r1 = clamp(Math.ceil((this.canvas.height - sy) / cellS), 0, g);

            const tileMap = this.tileMappings[photoIndex];
            const colorMap = this.cellColors[photoIndex];

            for (let row = r0; row < r1; row++) {
                for (let col = c0; col < c1; col++) {
                    this.drawNode(
                        tileMap[row][col],
                        worldX + col * cellW,
                        worldY + row * cellW,
                        cellW,
                        colorMap[row][col],
                        depth + 1
                    );
                }
            }
        }

        // Crossfade: overlay the plain photo, fading out as the mosaic resolves
        if (t < 1) {
            ctx.globalAlpha = 1 - t;
            this.drawPhoto(photoIndex, sx, sy, ss);
            ctx.globalAlpha = 1;
        }

        // The parent's color-correction tint also fades as this tile takes over
        this.applyTint(tint, sx, sy, ss, 1 - t);
    }

    /** Draw a photo, picking the resolution tier that fits its screen size. */
    drawPhoto(photoIndex, x, y, size) {
        const photo = this.photos[photoIndex];
        const source = size > this.THUMB_SIZE ? photo.display : photo.thumbnail;
        this.ctx.drawImage(source, x, y, size, size);
        this.tilesRendered++;
    }

    /** Translucent overlay nudging a tile toward its target cell color. */
    applyTint(tint, x, y, size, strength) {
        if (!tint || strength <= 0.02) return;
        const ctx = this.ctx;
        ctx.globalAlpha = this.TINT_ALPHA * strength;
        ctx.fillStyle = tint.css;
        ctx.fillRect(x, y, size, size);
        ctx.globalAlpha = 1;
    }

    /**
     * Get (or lazily build) the pre-rendered mosaic bitmap for a photo.
     * This is the workhorse: at typical zoom levels an entire gridSize²
     * mosaic is a single drawImage from this cache.
     */
    getMosaicCache(photoIndex) {
        let cached = this.mosaicCache.get(photoIndex);
        if (cached) {
            // Refresh LRU order
            this.mosaicCache.delete(photoIndex);
            this.mosaicCache.set(photoIndex, cached);
            return cached;
        }

        const size = this.cacheSize;
        const g = this.gridSize;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const tileMap = this.tileMappings[photoIndex];
        const colorMap = this.cellColors[photoIndex];

        for (let row = 0; row < g; row++) {
            const y0 = Math.round(row * size / g);
            const y1 = Math.round((row + 1) * size / g);

            for (let col = 0; col < g; col++) {
                const x0 = Math.round(col * size / g);
                const x1 = Math.round((col + 1) * size / g);
                const photo = this.photos[tileMap[row][col]];
                const source = (x1 - x0) > this.THUMB_SIZE ? photo.display : photo.thumbnail;

                ctx.drawImage(source, x0, y0, x1 - x0, y1 - y0);

                // Bake in the color-correction tint so the parent image reads
                ctx.globalAlpha = this.TINT_ALPHA;
                ctx.fillStyle = colorMap[row][col].css;
                ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
                ctx.globalAlpha = 1;
            }
        }

        this.mosaicCache.set(photoIndex, canvas);
        if (this.mosaicCache.size > this.CACHE_LIMIT) {
            this.mosaicCache.delete(this.mosaicCache.keys().next().value);
        }

        return canvas;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.mosaicFractal = new MosaicFractal();
});
