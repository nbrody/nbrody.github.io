document.addEventListener('DOMContentLoaded', () => {
    const entryStep = document.getElementById('entry-step');
    const cameraStep = document.getElementById('camera-step');
    const resultStep = document.getElementById('result-step');

    const nextBtn = document.getElementById('next-to-camera');
    const captureBtn = document.getElementById('capture-btn');
    const downloadBtn = document.getElementById('download-btn');
    const restartBtn = document.getElementById('restart-btn');

    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const posterFinal = document.getElementById('poster-final');
    const agentNameInput = document.getElementById('agent-name');

    let stream = null;
    let agentName = "";

    // Global Cageify Logic
    const cageifyAllBtn = document.getElementById('cageify-all-btn');
    let isGlobalCaged = false;

    if (cageifyAllBtn) {
        cageifyAllBtn.addEventListener('click', () => {
            isGlobalCaged = !isGlobalCaged;
            cageifyAllBtn.textContent = isGlobalCaged ? 'Un-Cage' : 'Cageify Everyone';

            const souvenirs = document.querySelectorAll('.souvenir-img');
            souvenirs.forEach(img => {
                img.style.opacity = isGlobalCaged ? '1' : '0';
            });
        });
    }

    // Step 1: Name Entry
    nextBtn.addEventListener('click', () => {
        agentName = agentNameInput.value.trim();
        if (!agentName) {
            alert("Please enter your name to claim victory.");
            return;
        }

        entryStep.classList.add('hidden');
        cameraStep.classList.remove('hidden');
        startCamera();
    });

    // Step 2: Camera Logic
    async function startCamera() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' },
                audio: false
            });
            video.srcObject = stream;
        } catch (err) {
            console.error("Error accessing camera:", err);
            alert("Could not access camera. Please ensure permissions are granted.");
        }
    }

    // Step 3: Capture & Composite
    captureBtn.addEventListener('click', () => {
        const context = canvas.getContext('2d');

        const template = new Image();
        template.src = 'nicCageTemplate.png'; // Using the PNG with transparency

        // Hardcoded Calibration Values (Success)
        const CAL_X = 0.39;
        const CAL_Y = 0.51;
        const CAL_SCALE = 0.50;

        template.onload = () => {
            canvas.width = template.width;
            canvas.height = template.height;

            // 1. Draw User Photo (Behind Template) - FILL THE CANVAS
            // We want the video to cover the entire template area, matching the preview
            const vWidth = video.videoWidth;
            const vHeight = video.videoHeight;
            const targetAspect = canvas.width / canvas.height;

            let sx, sy, sWidth, sHeight;
            if (vWidth / vHeight > targetAspect) {
                // Video is wider than canvas: crop sides
                sHeight = vHeight;
                sWidth = vHeight * targetAspect;
                sx = (vWidth - sWidth) / 2;
                sy = 0;
            } else {
                // Video is taller than canvas: crop top/bottom
                sWidth = vWidth;
                sHeight = vWidth / targetAspect;
                sx = 0;
                sy = (vHeight - sHeight) / 2;
            }

            // Capture raw photo initial (full size)
            context.save();
            context.filter = 'sepia(0.3) contrast(1.1) brightness(0.9)';
            context.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
            context.restore();

            const rawSelfieUrl = canvas.toDataURL('image/jpeg', 0.7);
            const rawSelfieImg = new Image();

            rawSelfieImg.onload = () => {
                // Clear and Redraw with Transform for Composition
                context.clearRect(0, 0, canvas.width, canvas.height);

                // 1b. Redraw Photo with Transform
                const destW = canvas.width * CAL_SCALE;
                const destH = canvas.height * CAL_SCALE;
                const destX = canvas.width * CAL_X;
                const destY = canvas.height * CAL_Y;

                context.drawImage(rawSelfieImg, 0, 0, rawSelfieImg.width, rawSelfieImg.height, destX, destY, destW, destH);

                // 2. Draw Template ON TOP
                context.drawImage(template, 0, 0);

                // Export Souvenir
                const souvenirUrl = canvas.toDataURL('image/png');
                posterFinal.src = souvenirUrl;
                posterFinal.style.display = 'block';

                // Save to Gallery (Both images)
                saveToGallery(rawSelfieUrl, souvenirUrl);
            };
            rawSelfieImg.src = rawSelfieUrl;

            cameraStep.classList.add('hidden');
            resultStep.classList.remove('hidden');

            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };

        template.onerror = () => {
            alert("Identification Template Error (nicCageTemplate.png missing).");
        };
    });

    // --- ACTIONS ---
    downloadBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `NIC_CAGE_HUNT_VICTORY_${agentName.toUpperCase()}.png`;
        link.href = posterFinal.src;
        link.click();
    });

    const viewGalleryBtn = document.getElementById('view-gallery-btn');
    const backBtn = document.getElementById('back-from-gallery');
    const galleryStep = document.getElementById('gallery-step');
    const galleryGrid = document.getElementById('gallery-grid');

    viewGalleryBtn.addEventListener('click', () => {
        resultStep.classList.add('hidden');
        galleryStep.classList.remove('hidden');
        loadGallery();
    });

    backBtn.addEventListener('click', () => {
        galleryStep.classList.add('hidden');
        resultStep.classList.remove('hidden');
    });

    const clearGalleryBtn = document.getElementById('clear-gallery-btn');
    clearGalleryBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to PURGE the entire Hall of Fame? This cannot be undone.")) {
            localStorage.removeItem('agentGallery');
            loadGallery();
        }
    });

    restartBtn.addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    // --- STORAGE ---
    function saveToGallery(selfieData, souvenirData) {
        let gallery = JSON.parse(localStorage.getItem('agentGallery') || '[]');
        gallery.push({
            name: agentName,
            selfie: selfieData,
            souvenir: souvenirData,
            date: Date.now()
        });

        // Keep last 50
        if (gallery.length > 50) gallery.shift();

        localStorage.setItem('agentGallery', JSON.stringify(gallery));
    }

    function loadGallery() {
        const gallery = JSON.parse(localStorage.getItem('agentGallery') || '[]');
        galleryGrid.innerHTML = '';

        // Reset global toggle when reloading gallery
        isGlobalCaged = false;
        if (cageifyAllBtn) cageifyAllBtn.textContent = 'Cageify Everyone';

        if (gallery.length === 0) {
            galleryGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; opacity: 0.5;">REGISTRY EMPTY</p>';
            return;
        }

        // Show oldest first (chronological)
        gallery.forEach((entry, index) => {
            const card = document.createElement('div');
            card.style.position = 'relative';
            card.style.background = 'rgba(0,0,0,0.4)';
            card.style.padding = '10px';
            card.style.borderRadius = '5px';
            card.style.border = '1px solid var(--primary-gold)';

            // Container for image + overlay
            const imgContainer = document.createElement('div');
            imgContainer.style.position = 'relative';
            imgContainer.style.width = '100%';
            imgContainer.style.aspectRatio = '3/4'; // Enforce aspect ratio to avoid jumps
            imgContainer.style.overflow = 'hidden';

            // 1. Raw Selfie (Base)
            // Use 'image' property for legacy support, 'selfie' for new
            const selfieSrc = entry.selfie || entry.image;

            const img = document.createElement('img');
            img.src = selfieSrc;
            img.classList.add('selfie-img');
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.display = 'block';
            img.style.borderRadius = '3px';

            // 2. Souvenir (Overlay, toggleable)
            // If legacy entry has no souvenir, maybe generate one on fly? typically hard.
            // Just show nothing or fallback.
            const souvenirSrc = entry.souvenir;

            imgContainer.appendChild(img);

            if (souvenirSrc) {
                const souvenirImg = document.createElement('img');
                souvenirImg.src = souvenirSrc;
                souvenirImg.classList.add('souvenir-img'); // Hook for toggle
                souvenirImg.style.position = 'absolute';
                souvenirImg.style.top = '0';
                souvenirImg.style.left = '0';
                souvenirImg.style.width = '100%';
                souvenirImg.style.height = '100%';
                souvenirImg.style.objectFit = 'contain'; // Souvenir preserves its ratio
                souvenirImg.style.opacity = '0'; // Hidden by default
                souvenirImg.style.transition = 'opacity 0.5s ease';
                imgContainer.appendChild(souvenirImg);
            }

            // Details: Rank, Name, Time
            const detailsDiv = document.createElement('div');
            detailsDiv.style.marginTop = '10px';
            detailsDiv.style.display = 'flex';
            detailsDiv.style.justifyContent = 'space-between';
            detailsDiv.style.alignItems = 'end';

            const leftInfo = document.createElement('div');
            leftInfo.style.fontFamily = 'Cinzel, serif';
            leftInfo.innerHTML = `
                <span style="font-size: 1.2rem; font-weight: bold; color: var(--primary-gold); margin-right: 5px;">#${index + 1}</span>
                <span style="font-size: 1rem; color: var(--primary-gold);">${entry.name}</span>
            `;

            const rightInfo = document.createElement('div');
            const dateStr = entry.date ? new Date(entry.date).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }) : '';
            rightInfo.textContent = dateStr;
            rightInfo.style.fontSize = '0.7rem';
            rightInfo.style.color = 'rgba(212, 175, 55, 0.7)';

            detailsDiv.appendChild(leftInfo);
            detailsDiv.appendChild(rightInfo);

            card.appendChild(imgContainer);
            card.appendChild(detailsDiv);

            galleryGrid.appendChild(card);
        });
    }

});
