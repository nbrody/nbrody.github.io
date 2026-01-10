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

        // Template Dimensions
        const template = new Image();
        template.src = 'nicCageTemplate.jpeg';

        template.onload = () => {
            canvas.width = template.width;
            canvas.height = template.height;

            // Target coordinates for the 'green figure' area in nicCageTemplate.jpeg
            const photoX = canvas.width * 0.28;
            const photoY = canvas.height * 0.15;
            const photoW = canvas.width * 0.44;
            const photoH = canvas.height * 0.65;

            const vWidth = video.videoWidth;
            const vHeight = video.videoHeight;
            const targetAspect = photoW / photoH;

            let sx, sy, sWidth, sHeight;
            if (vWidth / vHeight > targetAspect) {
                sHeight = vHeight;
                sWidth = vHeight * targetAspect;
                sx = (vWidth - sWidth) / 2;
                sy = 0;
            } else {
                sWidth = vWidth;
                sHeight = vWidth / targetAspect;
                sx = 0;
                sy = (vHeight - sHeight) / 2;
            }

            // 1. Draw Template Background first
            context.drawImage(template, 0, 0);

            // 2. Create Silhouette Clip path to overlay the photo onto the figure
            context.save();
            context.beginPath();

            // Exact match for the SVG Guide Path (normalized to 100 in guide, so divide by 100)
            const mapX = (val) => photoX + (val / 100) * photoW;
            const mapY = (val) => photoY + (val / 100) * photoH;

            // Head (Ellipse) - matching SVG cx:50, cy:32, rx:18, ry:22 approx
            const headX = mapX(50);
            const headY = mapY(32);
            const headRx = (18 / 100) * photoW;
            const headRy = (22 / 100) * photoH;
            context.ellipse(headX, headY, headRx, headRy, 0, 0, Math.PI * 2);

            // Body/Shoulders - matching SVG Path: M 15,90 C 15,70 25,62 50,62 C 75,62 85,70 85,90 L 15,90 Z
            context.moveTo(mapX(15), mapY(90));
            context.bezierCurveTo(mapX(15), mapY(70), mapX(25), mapY(62), mapX(50), mapY(62));
            context.bezierCurveTo(mapX(75), mapY(62), mapX(85), mapY(70), mapX(85), mapY(90));
            context.lineTo(mapX(15), mapY(90));
            context.closePath();

            context.clip();

            // Apply vintage filter to the captured face
            context.filter = 'sepia(0.3) contrast(1.1) brightness(0.9)';
            context.drawImage(video, sx, sy, sWidth, sHeight, photoX, photoY, photoW, photoH);
            context.restore();

            // 3. Draw Name - Registry line (Adjusted to sit clean on the template line)
            context.font = `bold ${canvas.height * 0.045}px 'Cinzel', serif`;
            context.fillStyle = '#2a1a10';
            context.textAlign = 'left';
            context.fillText(agentName.toUpperCase(), canvas.width * 0.35, canvas.height * 0.635);

            // Show result
            posterFinal.src = canvas.toDataURL('image/png');
            posterFinal.style.display = 'block';

            cameraStep.classList.add('hidden');
            resultStep.classList.remove('hidden');

            // Stop camera
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }

            // Save to gallery
            finalizeDossier();
        };

        template.onerror = () => {
            alert("Agent template not found. Using basic layout.");
            canvas.width = 600;
            canvas.height = 800;
            context.fillStyle = '#f4e4bc';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.strokeStyle = '#d4af37';
            context.lineWidth = 10;
            context.strokeRect(10, 10, 580, 780);

            context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 50, 50, 500, 500);
            context.font = "40px 'Cinzel'";
            context.fillStyle = "#000";
            context.fillText("AGENT: " + agentName, 50, 650);

            posterFinal.src = canvas.toDataURL('image/png');
            posterFinal.style.display = 'block';

            cameraStep.classList.add('hidden');
            resultStep.classList.remove('hidden');
        };
    });

    // Step 4: Download
    downloadBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `Agent_${agentName.replace(/\s+/g, '_')}_Dossier.png`;
        link.href = canvas.toDataURL();
        link.click();
    });

    // Step 5: Gallery Switching Logic
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

    // --- GLOBAL GALLERY LOGIC ---
    function saveToGallery(imageData) {
        let gallery = JSON.parse(localStorage.getItem('agentGallery') || '[]');
        gallery.unshift({
            name: agentName,
            image: imageData,
            date: new Date().toLocaleDateString()
        });
        if (gallery.length > 24) gallery.pop();
        localStorage.setItem('agentGallery', JSON.stringify(gallery));
    }

    function loadGallery() {
        const gallery = JSON.parse(localStorage.getItem('agentGallery') || '[]');
        galleryGrid.innerHTML = '';

        if (gallery.length === 0) {
            galleryGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; opacity: 0.5;">No agents recorded yet...</p>';
            return;
        }

        gallery.forEach(entry => {
            const item = document.createElement('div');
            item.className = 'agent-photo';
            item.style.background = 'rgba(255,255,255,0.05)';
            item.style.padding = '10px';
            item.style.borderRadius = '8px';
            item.style.border = '1px solid var(--glass-border)';
            item.style.textAlign = 'center';

            const img = document.createElement('img');
            img.src = entry.image;
            img.style.width = '100%';
            img.style.borderRadius = '4px';
            img.style.marginBottom = '8px';

            const label = document.createElement('div');
            label.textContent = entry.name;
            label.style.fontFamily = "'Cinzel', serif";
            label.style.fontSize = '0.7rem';
            label.style.color = 'var(--primary-gold)';

            item.appendChild(img);
            item.appendChild(label);
            galleryGrid.appendChild(item);
        });
    }

    function finalizeDossier() {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
        saveToGallery(dataUrl);
    }
});
