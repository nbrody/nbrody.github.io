/**
 * MosaicFractal - Infinite Recursive Photo Mosaic Generator
 * Creates fractal-like zoom into photo mosaics
 */

class MosaicFractal {
    constructor() {
        // Photo storage
        this.photos = [];
        this.mainPhotoIndex = -1;
        this.photoColors = []; // Average color for each photo

        // Canvas and rendering
        this.canvas = document.getElementById('mosaic-canvas');
        this.ctx = this.canvas.getContext('2d');

        // View state
        this.zoom = 1;
        this.panX = 0;  // Pan offset in screen pixels
        this.panY = 0;
        this.baseSize = 800;  // World size of the mosaic
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Mosaic settings
        this.gridSize = 10; // 10x10 grid
        this.zoomThreshold = 8; // When to switch to sub-mosaic
        this.maxDepth = 10;
        this.currentDepth = 0;
        this.tilesRendered = 0;

        // Depth stack for infinite zoom
        this.depthStack = []; // Stack of {photoIndex, zoom, offsetX, offsetY}

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
    }

    setupUploadHandlers() {
        // Click to upload
        this.uploadArea.addEventListener('click', () => {
            this.fileInput.click();
        });

        // File input change
        this.fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });

        // Drag and drop
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

    setupViewerHandlers() {
        const container = document.getElementById('mosaic-container');

        // Mouse wheel zoom
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
            this.zoomAt(mouseX, mouseY, zoomFactor);
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

            const dx = e.clientX - this.lastMouseX;
            const dy = e.clientY - this.lastMouseY;

            // Pan in screen space (not world space)
            this.panX += dx;
            this.panY += dy;

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;

            this.render();
        });

        document.addEventListener('mouseup', () => {
            this.isDragging = false;
            document.getElementById('mosaic-container').style.cursor = 'grab';
        });

        // Touch support
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
                const dx = e.touches[0].clientX - lastTouchX;
                const dy = e.touches[0].clientY - lastTouchY;

                // Pan in screen space
                this.panX += dx;
                this.panY += dy;

                lastTouchX = e.touches[0].clientX;
                lastTouchY = e.touches[0].clientY;

                this.render();
            } else if (e.touches.length === 2) {
                const distance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );

                const rect = this.canvas.getBoundingClientRect();
                const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
                const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

                const zoomFactor = distance / lastTouchDistance;
                this.zoomAt(centerX, centerY, zoomFactor);

                lastTouchDistance = distance;
            }
        }, { passive: false });
    }

    setupButtonHandlers() {
        this.generateBtn.addEventListener('click', () => {
            this.generateMosaic();
        });

        document.getElementById('reset-view').addEventListener('click', () => {
            this.resetView();
        });

        document.getElementById('back-to-upload').addEventListener('click', () => {
            this.viewerSection.classList.add('hidden');
            this.uploadSection.classList.remove('hidden');
        });
    }

    setupSettingsHandlers() {
        // Grid size slider
        this.gridSizeInput.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.gridSizeValue.textContent = `${value}×${value}`;
        });
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

    loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const reader = new FileReader();

            reader.onload = (e) => {
                img.onload = () => {
                    // Create thumbnail canvas
                    const thumbSize = 200;
                    const canvas = document.createElement('canvas');
                    canvas.width = thumbSize;
                    canvas.height = thumbSize;
                    const ctx = canvas.getContext('2d');

                    // Center crop
                    const size = Math.min(img.width, img.height);
                    const sx = (img.width - size) / 2;
                    const sy = (img.height - size) / 2;

                    ctx.drawImage(img, sx, sy, size, size, 0, 0, thumbSize, thumbSize);

                    resolve({
                        original: img,
                        thumbnail: canvas,
                        dataUrl: canvas.toDataURL('image/jpeg', 0.8)
                    });
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
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

        // Click to select as main
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

        // Update visual selection
        document.querySelectorAll('.photo-item').forEach((item, i) => {
            item.classList.toggle('selected-main', i === index);

            // Add/remove main badge
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

        // Update selected main display
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

        // Show/hide elements based on photo count
        if (count >= 2) {
            this.mainPhotoSelector.classList.remove('hidden');
            this.settingsPanel.classList.remove('hidden');
            this.generateBtn.classList.remove('hidden');
        } else {
            this.mainPhotoSelector.classList.add('hidden');
            this.settingsPanel.classList.add('hidden');
            this.generateBtn.classList.add('hidden');
        }

        // Enable generate button only if main photo is selected
        this.generateBtn.disabled = this.mainPhotoIndex < 0 || count < 2;
    }

    async generateMosaic() {
        this.loadingOverlay.classList.remove('hidden');
        document.getElementById('loading-status').textContent = 'Analyzing colors...';

        // Allow UI to update
        await new Promise(r => setTimeout(r, 50));

        // Calculate average colors for all photos
        this.photoColors = await this.calculatePhotoColors();

        document.getElementById('loading-status').textContent = 'Building tile map...';
        await new Promise(r => setTimeout(r, 50));

        // Setup canvas - mosaic fills exactly at zoom=1
        const size = Math.min(800, window.innerWidth - 80);
        this.canvas.width = size;
        this.canvas.height = size;
        this.baseSize = size;  // World size matches canvas size

        // Use user's selected grid size
        this.gridSize = parseInt(this.gridSizeInput.value);

        // Pre-compute tile mappings for each photo
        document.getElementById('loading-status').textContent = 'Mapping tiles...';
        await new Promise(r => setTimeout(r, 50));
        this.tileMappings = this.computeAllTileMappings();

        // Reset view state
        this.resetViewState();

        // Initialize depth stack with main photo
        this.depthStack = [{
            photoIndex: this.mainPhotoIndex,
            zoom: 1,
            panX: 0,
            panY: 0
        }];

        // Update UI
        this.gridDisplay.textContent = `${this.gridSize}×${this.gridSize}`;

        // Render initial mosaic
        this.render();

        // Switch to viewer
        this.loadingOverlay.classList.add('hidden');
        this.uploadSection.classList.add('hidden');
        this.viewerSection.classList.remove('hidden');

        // Hide zoom hint after a delay
        setTimeout(() => {
            document.getElementById('zoom-hint').style.opacity = '0';
        }, 3000);
    }

    async calculatePhotoColors() {
        const colors = [];

        for (const photo of this.photos) {
            // Calculate average color over the whole image
            const thumb = photo.thumbnail;
            const ctx = thumb.getContext('2d');
            const imageData = ctx.getImageData(0, 0, thumb.width, thumb.height);
            const data = imageData.data;

            let r = 0, g = 0, b = 0;
            const pixelCount = data.length / 4;

            for (let i = 0; i < data.length; i += 4) {
                r += data[i];
                g += data[i + 1];
                b += data[i + 2];
            }

            colors.push({
                r: Math.round(r / pixelCount),
                g: Math.round(g / pixelCount),
                b: Math.round(b / pixelCount)
            });
        }

        return colors;
    }

    /**
     * Pre-compute tile mappings for all photos.
     * For each photo, we divide it into a grid and find the best matching photo for each cell.
     */
    computeAllTileMappings() {
        const mappings = [];

        for (let photoIdx = 0; photoIdx < this.photos.length; photoIdx++) {
            const photo = this.photos[photoIdx];
            const thumb = photo.thumbnail;
            const ctx = thumb.getContext('2d');
            const tileMap = [];

            // Get all candidate photos (excluding this one)
            const candidates = this.photos
                .map((_, i) => i)
                .filter(i => i !== photoIdx);

            // If no candidates (shouldn't happen with 2+ photos), use self
            if (candidates.length === 0) {
                for (let row = 0; row < this.gridSize; row++) {
                    tileMap[row] = [];
                    for (let col = 0; col < this.gridSize; col++) {
                        tileMap[row][col] = photoIdx;
                    }
                }
                mappings.push(tileMap);
                continue;
            }

            // Sample each grid cell and find best match
            const cellWidth = thumb.width / this.gridSize;
            const cellHeight = thumb.height / this.gridSize;

            for (let row = 0; row < this.gridSize; row++) {
                tileMap[row] = [];
                for (let col = 0; col < this.gridSize; col++) {
                    // Get average color of this cell
                    const sx = Math.floor(col * cellWidth);
                    const sy = Math.floor(row * cellHeight);
                    const sw = Math.max(1, Math.floor(cellWidth));
                    const sh = Math.max(1, Math.floor(cellHeight));

                    const imageData = ctx.getImageData(sx, sy, sw, sh);
                    const data = imageData.data;

                    let r = 0, g = 0, b = 0;
                    const pixelCount = data.length / 4;

                    for (let i = 0; i < data.length; i += 4) {
                        r += data[i];
                        g += data[i + 1];
                        b += data[i + 2];
                    }

                    const targetColor = {
                        r: Math.round(r / pixelCount),
                        g: Math.round(g / pixelCount),
                        b: Math.round(b / pixelCount)
                    };

                    // Find best matching photo
                    tileMap[row][col] = this.findBestMatch(targetColor, candidates);
                }
            }

            mappings.push(tileMap);
        }

        return mappings;
    }

    resetViewState() {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.currentDepth = 0;
    }

    resetView() {
        this.resetViewState();
        this.depthStack = [{
            photoIndex: this.mainPhotoIndex,
            zoom: 1,
            panX: 0,
            panY: 0
        }];
        this.render();
    }

    zoomAt(x, y, factor) {
        // Get mouse position relative to canvas in CSS pixels, then scale to canvas pixels
        const canvasX = x / this.canvas.offsetWidth * this.canvas.width;
        const canvasY = y / this.canvas.offsetHeight * this.canvas.height;

        // Calculate the world position under the cursor before zoom
        const worldX = (canvasX - this.panX) / this.zoom;
        const worldY = (canvasY - this.panY) / this.zoom;

        // Apply zoom
        const newZoom = Math.max(0.5, Math.min(this.zoom * factor, 10000));

        // Adjust pan so the world point stays under the cursor
        this.panX = canvasX - worldX * newZoom;
        this.panY = canvasY - worldY * newZoom;

        this.zoom = newZoom;

        this.render();
    }

    render() {
        this.tilesRendered = 0;
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Calculate effective zoom for depth transitions
        this.currentDepth = Math.floor(Math.log(this.zoom) / Math.log(this.zoomThreshold));
        this.currentDepth = Math.max(0, Math.min(this.currentDepth, this.maxDepth));

        // The mosaic lives in world space from (0,0) to (baseSize, baseSize)
        // At zoom=1 and pan=(0,0), it fills the canvas exactly
        this.renderMosaicRecursive(
            this.mainPhotoIndex,
            0, 0,
            this.baseSize,
            0
        );

        // Update displays
        this.zoomDisplay.textContent = `${Math.round(this.zoom * 100)}%`;
        this.depthDisplay.textContent = this.currentDepth;
        this.tilesDisplay.textContent = this.tilesRendered;
    }

    renderMosaicRecursive(photoIndex, worldX, worldY, worldSize, depth) {
        // Transform world coordinates to screen coordinates
        // screen = world * zoom + pan
        const screenX = worldX * this.zoom + this.panX;
        const screenY = worldY * this.zoom + this.panY;
        const screenSize = worldSize * this.zoom;

        // Culling: skip if tile is off screen
        if (screenX + screenSize < 0 || screenX > this.canvas.width ||
            screenY + screenSize < 0 || screenY > this.canvas.height) {
            return;
        }

        // If tile is too small, skip
        if (screenSize < 2) {
            return;
        }

        const tileSize = worldSize / this.gridSize;
        const tileSizeScreen = tileSize * this.zoom;

        // Decide whether to draw as single image or subdivide
        // Subdivide when tiles are big enough to see detail
        const shouldSubdivide = tileSizeScreen > 15 && depth < this.maxDepth;

        if (!shouldSubdivide) {
            // Draw the photo as a single tile
            this.drawPhoto(photoIndex, screenX, screenY, screenSize);
            return;
        }

        // Get the pre-computed tile mapping for this photo
        const tileMap = this.tileMappings[photoIndex];

        // Subdivide into grid and draw mosaic
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const tileWorldX = worldX + col * tileSize;
                const tileWorldY = worldY + row * tileSize;

                // Get the photo that should fill this tile (from pre-computed map)
                const tilePhotoIndex = tileMap[row][col];

                // Recursively render this tile
                this.renderMosaicRecursive(
                    tilePhotoIndex,
                    tileWorldX, tileWorldY,
                    tileSize,
                    depth + 1
                );
            }
        }
    }

    drawPhoto(photoIndex, x, y, size) {
        if (photoIndex < 0 || photoIndex >= this.photos.length) return;

        const photo = this.photos[photoIndex];
        this.ctx.drawImage(photo.thumbnail, x, y, size, size);
        this.tilesRendered++;
    }

    findBestMatch(targetColor, candidateIndices) {
        let bestIndex = candidateIndices[0];
        let bestDist = Infinity;

        for (const i of candidateIndices) {
            const c = this.photoColors[i];
            // Use weighted Euclidean distance (human perception weights)
            const dr = c.r - targetColor.r;
            const dg = c.g - targetColor.g;
            const db = c.b - targetColor.b;
            // Weight green more (human eyes are more sensitive to green)
            const dist = 2 * dr * dr + 4 * dg * dg + 3 * db * db;

            if (dist < bestDist) {
                bestDist = dist;
                bestIndex = i;
            }
        }

        return bestIndex;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.mosaicFractal = new MosaicFractal();
});
