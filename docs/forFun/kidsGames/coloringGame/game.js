// ──────── Coloring Book Game ────────

// ── Color Palette ──
const COLORS = [
    { name: 'Red', hex: '#ff6b6b' },
    { name: 'Coral', hex: '#ff8a5c' },
    { name: 'Orange', hex: '#ffa502' },
    { name: 'Sunflower', hex: '#ffd32a' },
    { name: 'Yellow', hex: '#fff200' },
    { name: 'Lime', hex: '#7bed9f' },
    { name: 'Green', hex: '#2ed573' },
    { name: 'Forest', hex: '#26de81' },
    { name: 'Teal', hex: '#4ecdc4' },
    { name: 'Sky', hex: '#70a1ff' },
    { name: 'Blue', hex: '#5352ed' },
    { name: 'Purple', hex: '#a29bfe' },
    { name: 'Violet', hex: '#8854d0' },
    { name: 'Pink', hex: '#f78fb3' },
    { name: 'Hot Pink', hex: '#fd79a8' },
    { name: 'Brown', hex: '#cd8c52' },
    { name: 'Tan', hex: '#f5cd79' },
    { name: 'Gray', hex: '#a4b0be' },
    { name: 'Dark', hex: '#57606f' },
    { name: 'White', hex: '#ffffff' },
];

// ── Stencil Definitions ──
// Each stencil has regions (fillable) and outlines (decorative, non-interactive)
const STENCILS = {

    // ─── BUTTERFLY ───
    butterfly: {
        viewBox: '0 0 600 500',
        regions: [
            // Left upper wing
            { id: 'b-luw', d: 'M300,200 C280,170 240,100 180,80 C120,60 60,80 50,140 C40,200 80,250 140,260 C180,265 260,240 300,220 Z' },
            // Left lower wing
            { id: 'b-llw', d: 'M300,220 C260,250 180,290 140,320 C100,350 70,380 80,420 C90,460 140,470 190,440 C240,410 280,350 300,300 Z' },
            // Right upper wing
            { id: 'b-ruw', d: 'M300,200 C320,170 360,100 420,80 C480,60 540,80 550,140 C560,200 520,250 460,260 C420,265 340,240 300,220 Z' },
            // Right lower wing
            { id: 'b-rlw', d: 'M300,220 C340,250 420,290 460,320 C500,350 530,380 520,420 C510,460 460,470 410,440 C360,410 320,350 300,300 Z' },
            // Body
            { id: 'b-body', d: 'M290,160 Q295,150 300,140 Q305,150 310,160 L312,400 Q306,420 300,425 Q294,420 288,400 Z' },
            // Left wing inner spot
            { id: 'b-lis', d: 'M220,160 C200,140 170,140 160,160 C150,180 170,200 190,200 C210,200 230,180 220,160 Z' },
            // Right wing inner spot
            { id: 'b-ris', d: 'M380,160 C400,140 430,140 440,160 C450,180 430,200 410,200 C390,200 370,180 380,160 Z' },
            // Left wing lower spot
            { id: 'b-lls', d: 'M180,330 C160,320 140,330 140,350 C140,370 160,380 180,370 C200,360 200,340 180,330 Z' },
            // Right wing lower spot
            { id: 'b-rls', d: 'M420,330 C440,320 460,330 460,350 C460,370 440,380 420,370 C400,360 400,340 420,330 Z' },
        ],
        outlines: [
            // Antennae
            { d: 'M300,160 C290,120 260,70 240,50' },
            { d: 'M300,160 C310,120 340,70 360,50' },
            // Antennae tips
            { d: 'M240,50 C235,42 232,38 238,35 C244,32 248,38 244,46' },
            { d: 'M360,50 C365,42 368,38 362,35 C356,32 352,38 356,46' },
        ]
    },

    // ─── DINOSAUR ───
    dinosaur: {
        viewBox: '0 0 600 500',
        regions: [
            // Body
            { id: 'd-body', d: 'M180,280 C180,230 200,180 260,170 C320,160 380,170 420,200 C460,230 480,280 470,330 C460,380 420,400 360,410 C300,420 220,410 190,380 C170,360 180,320 180,280 Z' },
            // Head
            { id: 'd-head', d: 'M420,200 C440,170 470,140 510,130 C550,120 570,140 570,170 C570,200 550,230 520,240 C490,250 460,240 440,230 C430,220 420,210 420,200 Z' },
            // Tail
            { id: 'd-tail', d: 'M190,340 C160,330 130,310 100,320 C70,330 50,370 40,400 C35,420 50,430 70,420 C90,410 120,380 160,380 C180,380 190,370 190,340 Z' },
            // Left front leg
            { id: 'd-lfl', d: 'M280,400 C275,420 270,450 265,470 C260,485 275,490 285,480 C290,470 295,440 300,420 C300,410 290,400 280,400 Z' },
            // Right front leg
            { id: 'd-rfl', d: 'M350,405 C345,425 340,455 335,475 C330,490 345,495 355,485 C360,475 365,445 370,425 C370,415 360,405 350,405 Z' },
            // Left back leg
            { id: 'd-lbl', d: 'M210,380 C205,400 200,430 195,460 C190,480 205,485 215,475 C220,465 225,435 230,410 C230,400 220,385 210,380 Z' },
            // Right back leg
            { id: 'd-rbl', d: 'M420,380 C415,400 410,435 405,465 C400,480 415,490 425,480 C430,468 435,435 440,405 C440,395 430,385 420,380 Z' },
            // Belly
            { id: 'd-belly', d: 'M240,300 C260,340 320,360 380,340 C400,330 410,310 400,290 C380,280 340,300 300,310 C260,315 240,310 240,300 Z' },
            // Back plates
            { id: 'd-p1', d: 'M260,170 C262,148 275,130 290,128 C300,130 295,155 285,170 Z' },
            { id: 'd-p2', d: 'M310,163 C315,135 330,115 348,112 C358,116 350,148 340,165 Z' },
            { id: 'd-p3', d: 'M365,172 C372,148 388,130 405,130 C412,136 403,160 395,180 Z' },
        ],
        outlines: [
            // Eye
            { d: 'M530,155 C535,155 540,160 538,165 C536,170 530,170 528,165 C526,160 528,155 530,155 Z' },
            // Mouth
            { d: 'M540,185 C555,190 565,195 560,200' },
            // Nostril
            { d: 'M560,165 C563,163 565,166 563,168' },
        ]
    },

    // ─── HOUSE ───
    house: {
        viewBox: '0 0 600 500',
        regions: [
            // Main wall
            { id: 'h-wall', d: 'M120,230 L480,230 L480,440 L120,440 Z' },
            // Roof
            { id: 'h-roof', d: 'M100,230 L300,80 L500,230 Z' },
            // Door
            { id: 'h-door', d: 'M260,320 L340,320 L340,440 L260,440 Z' },
            // Left window
            { id: 'h-lwin', d: 'M150,270 L230,270 L230,340 L150,340 Z' },
            // Right window
            { id: 'h-rwin', d: 'M370,270 L450,270 L450,340 L370,340 Z' },
            // Chimney
            { id: 'h-chim', d: 'M400,80 L440,80 L440,170 L400,170 Z' },
            // Chimney smoke cloud 1
            { id: 'h-sm1', d: 'M415,70 C400,55 405,35 420,30 C435,25 445,40 440,55 C438,63 425,72 415,70 Z' },
            // Chimney smoke cloud 2
            { id: 'h-sm2', d: 'M430,35 C425,20 435,5 450,5 C465,5 470,20 462,30 C458,36 438,38 430,35 Z' },
            // Sun
            { id: 'h-sun', d: 'M80,60 C80,35 100,20 120,20 C140,20 155,35 155,60 C155,85 140,100 120,100 C100,100 80,85 80,60 Z' },
            // Ground / grass
            { id: 'h-grass', d: 'M0,440 L600,440 L600,500 L0,500 Z' },
            // Doorstep
            { id: 'h-step', d: 'M250,440 L350,440 L350,460 L250,460 Z' },
            // Left bush
            { id: 'h-lbush', d: 'M60,440 C50,420 65,395 90,390 C115,385 140,400 145,420 C148,435 140,440 120,440 Z' },
            // Right bush
            { id: 'h-rbush', d: 'M460,440 C450,420 465,395 490,390 C515,385 540,400 545,420 C548,435 540,440 520,440 Z' },
        ],
        outlines: [
            // Door knob
            { d: 'M325,385 C330,385 333,390 330,395 C327,398 322,395 325,385 Z' },
            // Window cross left
            { d: 'M190,270 L190,340' },
            { d: 'M150,305 L230,305' },
            // Window cross right
            { d: 'M410,270 L410,340' },
            { d: 'M370,305 L450,305' },
            // Path
            { d: 'M280,440 C275,460 260,490 240,500' },
            { d: 'M320,440 C325,460 340,490 360,500' },
        ]
    },

    // ─── ROCKET ───
    rocket: {
        viewBox: '0 0 600 500',
        regions: [
            // Main body
            { id: 'r-body', d: 'M260,60 C260,60 250,100 245,160 L240,280 L240,380 L360,380 L360,280 L355,160 C350,100 340,60 340,60 C320,20 280,20 260,60 Z' },
            // Nose cone window
            { id: 'r-window', d: 'M280,130 C280,110 290,100 300,100 C310,100 320,110 320,130 C320,150 310,160 300,160 C290,160 280,150 280,130 Z' },
            // Left fin
            { id: 'r-lfin', d: 'M240,300 C220,310 180,350 170,400 C165,420 180,430 200,420 C220,410 240,390 240,380 Z' },
            // Right fin
            { id: 'r-rfin', d: 'M360,300 C380,310 420,350 430,400 C435,420 420,430 400,420 C380,410 360,390 360,380 Z' },
            // Bottom fin center
            { id: 'r-bfin', d: 'M270,380 L300,440 L330,380 Z' },
            // Flame outer
            { id: 'r-flout', d: 'M250,380 C250,410 260,445 270,460 C280,475 290,490 300,500 C310,490 320,475 330,460 C340,445 350,410 350,380 C340,395 320,400 300,400 C280,400 260,395 250,380 Z' },
            // Flame inner
            { id: 'r-flin', d: 'M275,390 C278,410 285,440 295,465 C298,470 302,470 305,465 C315,440 322,410 325,390 C318,398 310,402 300,402 C290,402 282,398 275,390 Z' },
            // Body stripe top
            { id: 'r-stripe1', d: 'M248,200 L352,200 L354,220 L247,220 Z' },
            // Body stripe bottom
            { id: 'r-stripe2', d: 'M242,330 L358,330 L359,350 L241,350 Z' },
            // Stars
            { id: 'r-star1', d: 'M80,80 L88,100 L110,100 L92,112 L100,135 L80,120 L60,135 L68,112 L50,100 L72,100 Z' },
            { id: 'r-star2', d: 'M520,150 L526,165 L542,165 L530,174 L535,190 L520,180 L505,190 L510,174 L498,165 L514,165 Z' },
            { id: 'r-star3', d: 'M100,350 L106,365 L122,365 L110,374 L115,390 L100,380 L85,390 L90,374 L78,365 L94,365 Z' },
        ],
        outlines: [
            // Rivets
            { d: 'M290,240 C292,238 296,238 296,242 C296,246 292,246 290,242 Z' },
            { d: 'M304,240 C306,238 310,238 310,242 C310,246 306,246 304,242 Z' },
            { d: 'M290,270 C292,268 296,268 296,272 C296,276 292,276 290,272 Z' },
            { d: 'M304,270 C306,268 310,268 310,272 C310,276 306,276 304,272 Z' },
        ]
    },

    // ─── FISH (Underwater Scene) ───
    fish: {
        viewBox: '0 0 600 500',
        regions: [
            // Big fish body
            { id: 'f-body', d: 'M150,200 C180,150 260,120 340,140 C400,155 430,190 440,230 C450,270 430,310 380,330 C320,355 240,340 190,310 C150,285 130,245 150,200 Z' },
            // Big fish tail
            { id: 'f-tail', d: 'M150,200 C120,170 90,140 70,120 C65,150 70,190 80,220 C70,230 65,270 70,310 C90,290 120,260 150,230 C148,220 148,210 150,200 Z' },
            // Big fish eye
            { id: 'f-eye', d: 'M370,200 C380,195 390,200 390,210 C390,220 380,225 370,220 C360,215 360,205 370,200 Z' },
            // Big fish fin top
            { id: 'f-ftop', d: 'M250,140 C260,100 290,80 310,90 C320,98 305,130 290,145 Z' },
            // Big fish fin bottom
            { id: 'f-fbot', d: 'M260,330 C265,360 280,385 300,380 C310,375 300,350 285,330 Z' },
            // Big fish stripe 1
            { id: 'f-s1', d: 'M280,155 C275,180 275,230 280,260 C290,265 300,255 305,240 C310,210 310,180 305,165 C300,155 290,152 280,155 Z' },
            // Big fish stripe 2
            { id: 'f-s2', d: 'M220,175 C215,200 218,260 225,290 C235,295 245,280 248,260 C252,230 250,195 245,180 C240,172 230,170 220,175 Z' },
            // Small fish body
            { id: 'f-sm-body', d: 'M430,360 C445,340 480,330 510,340 C530,348 540,365 535,385 C528,405 505,415 480,410 C455,405 425,385 430,360 Z' },
            // Small fish tail
            { id: 'f-sm-tail', d: 'M430,360 C415,345 400,330 390,320 C393,345 398,365 400,380 C395,388 393,405 400,415 C410,400 418,385 430,375 Z' },
            // Water / background
            { id: 'f-water', d: 'M0,0 L600,0 L600,500 L0,500 Z' },
            // Seaweed 1
            { id: 'f-sw1', d: 'M80,500 C75,470 90,440 85,410 C80,380 95,350 90,330 C95,315 100,325 95,345 C100,375 85,405 90,435 C95,460 85,480 90,500 Z' },
            // Seaweed 2
            { id: 'f-sw2', d: 'M520,500 C515,475 530,450 525,420 C520,395 535,370 530,350 C535,340 540,350 535,365 C540,390 525,415 530,440 C535,465 525,485 530,500 Z' },
            // Bubble 1
            { id: 'f-bub1', d: 'M450,180 C450,168 460,160 470,160 C480,160 490,168 490,180 C490,192 480,200 470,200 C460,200 450,192 450,180 Z' },
            // Bubble 2
            { id: 'f-bub2', d: 'M460,120 C460,112 466,106 474,106 C482,106 488,112 488,120 C488,128 482,134 474,134 C466,134 460,128 460,120 Z' },
            // Bubble 3
            { id: 'f-bub3', d: 'M438,140 C438,135 442,131 447,131 C452,131 456,135 456,140 C456,145 452,149 447,149 C442,149 438,145 438,140 Z' },
            // Starfish
            { id: 'f-star', d: 'M300,460 L308,475 L325,478 L313,490 L318,500 L300,492 L282,500 L287,490 L275,478 L292,475 Z' },
        ],
        outlines: [
            // Small fish eye
            { d: 'M510,365 C513,362 518,365 516,369 C514,373 509,370 510,365 Z' },
            // Mouth of big fish
            { d: 'M420,250 C430,255 435,260 432,265' },
            // Small fish mouth
            { d: 'M530,375 C535,378 536,382 533,384' },
            // Sand bottom texture
            { d: 'M0,480 C40,475 80,478 120,476 C160,474 200,478 240,476 C280,474 320,478 360,477 C400,476 440,479 480,477 C520,475 560,478 600,476' },
        ]
    }
};

// ── State ──
let currentColor = COLORS[0].hex;
let currentStencil = 'butterfly';
let isEraser = false;

// ── DOM ──
const svg = document.getElementById('coloring-canvas');
const palette = document.getElementById('color-palette');
const eraserBtn = document.getElementById('eraser-btn');
const clearBtn = document.getElementById('clear-btn');
const saveBtn = document.getElementById('save-btn');

// ── Init ──
function init() {
    buildPalette();
    loadStencil(currentStencil);
    bindStencilPicker();
    bindTools();
}

// ── Build Color Palette ──
function buildPalette() {
    palette.innerHTML = '';
    COLORS.forEach((c, i) => {
        const swatch = document.createElement('button');
        swatch.className = 'color-swatch' + (i === 0 ? ' active' : '');
        swatch.style.background = c.hex;
        if (c.hex === '#ffffff') {
            swatch.style.border = '4px solid #ddd';
        }
        swatch.title = c.name;
        swatch.setAttribute('aria-label', c.name);
        swatch.addEventListener('click', () => selectColor(c.hex, swatch));
        palette.appendChild(swatch);
    });
}

// ── Select Color ──
function selectColor(hex, el) {
    currentColor = hex;
    isEraser = false;
    eraserBtn.classList.remove('active');
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
}

// ── Load Stencil ──
function loadStencil(name) {
    const stencil = STENCILS[name];
    if (!stencil) return;

    currentStencil = name;
    svg.setAttribute('viewBox', stencil.viewBox);
    svg.innerHTML = '';

    // Draw regions (fillable areas) — draw in order; the fish water goes behind everything
    stencil.regions.forEach(region => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', region.d);
        path.setAttribute('id', region.id);
        path.classList.add('region');
        path.addEventListener('click', () => fillRegion(path));
        path.addEventListener('touchend', (e) => {
            e.preventDefault();
            fillRegion(path);
        });
        svg.appendChild(path);
    });

    // Draw outlines (decorative, non-interactive)
    if (stencil.outlines) {
        stencil.outlines.forEach(outline => {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', outline.d);
            path.classList.add('outline-only');
            svg.appendChild(path);
        });
    }

    // Update stencil picker buttons
    document.querySelectorAll('.stencil-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.stencil === name);
    });
}

// ── Fill a Region ──
function fillRegion(pathEl) {
    if (isEraser) {
        pathEl.style.fill = 'white';
        pathEl.style.transition = 'fill 0.15s ease';
    } else {
        pathEl.style.fill = currentColor;
        pathEl.style.transition = 'fill 0.15s ease';
        // Fun pop animation
        pathEl.style.transform = 'scale(1.03)';
        pathEl.style.transformOrigin = 'center';
        setTimeout(() => { pathEl.style.transform = 'scale(1)'; }, 150);
    }
}

// ── Stencil Picker ──
function bindStencilPicker() {
    document.querySelectorAll('.stencil-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            loadStencil(btn.dataset.stencil);
        });
    });
}

// ── Tools ──
function bindTools() {
    // Eraser
    eraserBtn.addEventListener('click', () => {
        isEraser = !isEraser;
        eraserBtn.classList.toggle('active', isEraser);
        if (isEraser) {
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        }
    });

    // Clear all
    clearBtn.addEventListener('click', () => {
        document.querySelectorAll('.region').forEach(r => {
            r.style.fill = 'white';
            r.style.transition = 'fill 0.3s ease';
        });
        showToast('🧹 All cleared!');
    });

    // Save as image
    saveBtn.addEventListener('click', () => saveSVGAsImage());
}

// ── Save SVG as PNG ──
function saveSVGAsImage() {
    const svgClone = svg.cloneNode(true);
    // Remove hover outlines for clean export
    svgClone.querySelectorAll('.outline-only').forEach(el => {
        el.style.fill = 'none';
    });

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgClone);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.onload = () => {
        ctx.fillStyle = '#fffef7';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);

        const link = document.createElement('a');
        link.download = `coloring-${currentStencil}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('💾 Saved!');
    };
    img.src = url;
}

// ── Toast ──
function showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// ── Start ──
init();
