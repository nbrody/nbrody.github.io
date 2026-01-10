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

    // Step 1: Name Entry
    nextBtn.addEventListener('click', () => {
        agentName = agentNameInput.value.trim();
        if (!agentName) {
            alert("Please enter your name, Agent.");
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

            // 2. Draw Template ON TOP (The hole in the template reveals the photo)
            context.drawImage(template, 0, 0);

            // Export
            posterFinal.src = canvas.toDataURL('image/png');
            posterFinal.style.display = 'block';

            cameraStep.classList.add('hidden');
            resultStep.classList.remove('hidden');

            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }

            finalizeDossier();
        };

        template.onerror = () => {
            alert("Identification Template Error (nicCageTemplate.png missing).");
        };
    });

    // --- ACTIONS ---
    downloadBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `AGENT_FILE_${agentName.toUpperCase()}_CLEARANCE.png`;
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

    restartBtn.addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    // --- STORAGE ---
    function saveToGallery(imageData) {
        let gallery = JSON.parse(localStorage.getItem('agentGallery') || '[]');
        gallery.unshift({ name: agentName, image: imageData, date: Date.now() });
        if (gallery.length > 32) gallery.pop();
        localStorage.setItem('agentGallery', JSON.stringify(gallery));
    }

    function loadGallery() {
        const gallery = JSON.parse(localStorage.getItem('agentGallery') || '[]');
        galleryGrid.innerHTML = '';
        if (gallery.length === 0) {
            galleryGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; opacity: 0.5;">REGISTRY EMPTY</p>';
            return;
        }
        gallery.forEach(entry => {
            const card = document.createElement('div');
            card.style.background = 'rgba(0,0,0,0.4)';
            card.style.padding = '10px';
            card.style.borderRadius = '5px';
            card.style.border = '1px solid var(--primary-gold)';
            card.innerHTML = `<img src="${entry.image}" style="width:100%;"><p style="font-size:0.7rem; color:var(--primary-gold); margin-top:5px;">${entry.name}</p>`;
            galleryGrid.appendChild(card);
        });
    }

    function finalizeDossier() {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        saveToGallery(dataUrl);
    }
});
