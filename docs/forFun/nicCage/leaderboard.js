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
            cageifyAllBtn.textContent = isGlobalCaged ? 'Un-Cage Everyone' : 'Cageify Everyone';

            const overlays = document.querySelectorAll('.cage-overlay');
            const selfies = document.querySelectorAll('.selfie-img');

            overlays.forEach(overlay => {
                overlay.style.opacity = isGlobalCaged ? '1' : '0';
            });

            selfies.forEach(img => {
                if (isGlobalCaged) {
                    // Shrunk down (~35% width), bottom-aligned, shifted right
                    // User request: "Translate down farther, and slightly farther to the right. Align the bottoms"
                    img.style.transform = 'scale(0.4) translate(35%, 35%)';
                } else {
                    img.style.transform = 'none';
                }
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

            context.save();
            // Apply vintage filter to match the template style
            context.filter = 'sepia(0.3) contrast(1.1) brightness(0.9)';

            // Draw the video frame nicely cropped to fill the WHOLE canvas
            context.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);

            context.restore();

            // CAPTURE RAW SELFIE FOR GALLERY (Before adding template)
            // This is what will be shown in the gallery initially
            const rawSelfieUrl = canvas.toDataURL('image/jpeg', 0.7);

            // CLEAR CANVAS to prepare for "Souvenir" composition
            context.clearRect(0, 0, canvas.width, canvas.height);

            // 1b. Redraw Video with "Cageify" transform for the Poster
            // Transform: scale(0.4) translate(35%, 35%)
            // Center-based logic conversion:
            // Scale 0.4 keeps center. Top-left moves to 0.3W, 0.3H.
            // Translate 35% adds 0.35W, 0.35H.
            // Final Dest: X=0.65W, Y=0.65H, W=0.4W, H=0.4H.
            const destX = canvas.width * 0.65;
            const destY = canvas.height * 0.65;
            const destW = canvas.width * 0.4;
            const destH = canvas.height * 0.4;

            context.save();
            context.filter = 'sepia(0.3) contrast(1.1) brightness(0.9)';
            context.drawImage(video, sx, sy, sWidth, sHeight, destX, destY, destW, destH);
            context.restore();

            // 2. Draw Template ON TOP (The hole in the template reveals the photo)
            context.drawImage(template, 0, 0);

            // Export (Result View shows the full poster)
            posterFinal.src = canvas.toDataURL('image/png');
            posterFinal.style.display = 'block';

            cameraStep.classList.add('hidden');
            resultStep.classList.remove('hidden');

            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }

            // Save the raw selfie to the gallery
            saveToGallery(rawSelfieUrl);
        };

        template.onerror = () => {
            alert("Identification Template Error (nicCageTemplate.png missing).");
        };
    });

    // --- ACTIONS ---
    downloadBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `NIC_CAGE_HUNT_VICTORY_${agentName.toUpperCase()}.png`;
        link.href = canvas.toDataURL();
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
    function saveToGallery(imageData) {
        let gallery = JSON.parse(localStorage.getItem('agentGallery') || '[]');
        gallery.push({ name: agentName, image: imageData, date: Date.now() }); // Push to end (chronological)
        if (gallery.length > 32) gallery.shift(); // Remove oldest if full, keeping newest? Or keep oldest?
        // "First person... at the top". If I push, they are at the bottom of the array.
        // Wait, display loop order matters. Currently forEach iterates 0..N.
        // If I use push(), index 0 is first person. Index 0 displays first.
        // So push() + forEach() = First person at top.
        // Previous code was unshift(), so Newest was index 0.
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
        gallery.forEach(entry => {
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
            imgContainer.style.overflow = 'hidden'; // Keep transformed image inside bounds

            // Raw Selfie
            const img = document.createElement('img');
            img.src = entry.image;
            img.classList.add('selfie-img');
            img.style.width = '100%';
            img.style.display = 'block';
            img.style.borderRadius = '3px';
            img.style.transition = 'transform 0.5s ease'; // Smooth move
            img.style.transformOrigin = 'center center';

            // Cage Overlay (Hidden by default)
            const overlay = document.createElement('img');
            overlay.src = 'nicCageTemplate.png';
            overlay.classList.add('cage-overlay');
            overlay.style.position = 'absolute';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.3s ease';
            overlay.style.pointerEvents = 'none';

            imgContainer.appendChild(img);
            imgContainer.appendChild(overlay);

            // Name
            const nameP = document.createElement('p');
            nameP.style.fontSize = '0.7rem';
            nameP.style.color = 'var(--primary-gold)';
            nameP.style.marginTop = '5px';
            nameP.textContent = entry.name;

            card.appendChild(imgContainer);
            card.appendChild(nameP);

            galleryGrid.appendChild(card);
        });
    }

    function finalizeDossier() {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        saveToGallery(dataUrl);
    }
});
