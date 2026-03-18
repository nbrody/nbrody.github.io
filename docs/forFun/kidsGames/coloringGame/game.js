const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 1200;
const STAGE_ASPECT = CANVAS_WIDTH / CANVAS_HEIGHT;

const COLORS = [
    { id: "rainbow", label: "Rainbow", mode: "rainbow" },
    { id: "red", label: "Red", hex: "#ff6b6b", mode: "solid" },
    { id: "orange", label: "Orange", hex: "#ff9f43", mode: "solid" },
    { id: "yellow", label: "Yellow", hex: "#ffd93d", mode: "solid" },
    { id: "green", label: "Green", hex: "#61d095", mode: "solid" },
    { id: "teal", label: "Teal", hex: "#4ecdc4", mode: "solid" },
    { id: "blue", label: "Blue", hex: "#5b8cff", mode: "solid" },
    { id: "purple", label: "Purple", hex: "#b084f5", mode: "solid" },
    { id: "pink", label: "Pink", hex: "#ff7eb6", mode: "solid" },
];

const BRUSHES = [
    { id: "small", label: "Small", radius: 16, dotClass: "size-small" },
    { id: "medium", label: "Medium", radius: 28, dotClass: "size-medium" },
    { id: "large", label: "Large", radius: 44, dotClass: "size-large" },
];

const PAGES = [
    {
        id: "duck",
        emoji: "🦆",
        name: "Duck Pond",
        accent: "#ffd37d",
        art: `
            <circle cx="145" cy="130" r="58" />
            <path d="M145 20 V0 M90 40 L64 14 M200 40 L226 14 M60 130 H20 M270 130 H230 M90 220 L62 248 M200 220 L228 248" />
            <ellipse cx="430" cy="430" rx="210" ry="150" />
            <circle cx="640" cy="290" r="115" />
            <path d="M730 300 Q820 300 860 340 Q820 380 730 382 Q766 342 730 300 Z" />
            <path d="M342 430 Q432 356 520 430 Q430 502 342 430 Z" />
            <circle cx="672" cy="266" r="12" fill="#26334d" />
            <path d="M356 570 Q348 652 322 716" />
            <path d="M474 570 Q486 648 502 716" />
            <path d="M74 635 Q236 604 366 632" />
            <path d="M530 642 Q688 614 894 650" />
            <path d="M120 696 Q260 676 416 700" />
            <path d="M540 704 Q710 684 930 710" />
            <path d="M614 360 Q654 372 680 400" />
        `,
    },
    {
        id: "fish",
        emoji: "🐠",
        name: "Happy Fish",
        accent: "#8de0d8",
        art: `
            <ellipse cx="420" cy="370" rx="240" ry="158" />
            <path d="M652 370 L860 232 L860 508 Z" />
            <path d="M346 224 Q402 146 492 156 Q560 164 620 228" />
            <path d="M346 516 Q418 586 514 574 Q582 566 640 514" />
            <circle cx="308" cy="338" r="20" />
            <circle cx="312" cy="338" r="8" fill="#26334d" />
            <path d="M236 424 Q304 466 362 434" />
            <path d="M446 236 Q448 370 444 520" />
            <path d="M536 262 Q534 372 532 482" />
            <path d="M624 286 Q620 372 620 456" />
            <path d="M208 628 Q264 566 252 494" />
            <path d="M246 648 Q316 572 306 468" />
            <path d="M788 632 Q732 564 740 494" />
            <path d="M826 648 Q758 566 768 462" />
            <circle cx="770" cy="146" r="24" />
            <circle cx="832" cy="96" r="36" />
            <circle cx="886" cy="164" r="18" />
            <path d="M70 706 Q216 676 346 698 Q472 718 616 696 Q760 674 928 706" />
        `,
    },
    {
        id: "flower",
        emoji: "🌼",
        name: "Sunny Flower",
        accent: "#ffcb6a",
        art: `
            <circle cx="500" cy="300" r="88" />
            <circle cx="500" cy="132" r="86" />
            <circle cx="650" cy="196" r="86" />
            <circle cx="650" cy="362" r="86" />
            <circle cx="500" cy="468" r="86" />
            <circle cx="350" cy="362" r="86" />
            <circle cx="350" cy="196" r="86" />
            <path d="M500 388 V694" />
            <path d="M500 512 Q408 468 320 500 Q284 520 258 562 Q326 578 396 562 Q462 548 500 520" />
            <path d="M500 586 Q594 542 676 574 Q720 592 748 634 Q666 646 600 632 Q544 618 500 594" />
            <path d="M0 706 Q154 674 326 696 Q492 716 658 698 Q814 680 1000 706" />
            <path d="M122 154 Q170 104 224 144 Q262 172 254 228 Q198 228 162 214 Q128 198 122 154 Z" />
            <path d="M178 150 Q232 108 280 150" />
            <circle cx="182" cy="164" r="10" fill="#26334d" />
            <circle cx="230" cy="164" r="10" fill="#26334d" />
        `,
    },
    {
        id: "rocket",
        emoji: "🚀",
        name: "Rocket Ride",
        accent: "#ff9d8a",
        art: `
            <path d="M500 86 Q610 166 610 338 V520 H390 V338 Q390 166 500 86 Z" />
            <circle cx="500" cy="264" r="72" />
            <path d="M390 360 L270 470 L390 492" />
            <path d="M610 360 L730 470 L610 492" />
            <path d="M446 520 L398 672 Q452 640 500 712 Q548 640 602 672 L554 520" />
            <path d="M454 520 Q468 584 500 622 Q532 584 546 520" />
            <path d="M420 198 H580" />
            <path d="M408 428 H592" />
            <path d="M130 134 L148 176 L194 180 L158 208 L170 252 L130 226 L90 252 L102 208 L66 180 L112 176 Z" />
            <path d="M828 194 L842 228 L878 232 L850 254 L860 290 L828 272 L796 290 L806 254 L778 232 L814 228 Z" />
            <path d="M200 604 L214 638 L250 642 L222 664 L232 700 L200 682 L168 700 L178 664 L150 642 L186 638 Z" />
        `,
    },
    {
        id: "car",
        emoji: "🚗",
        name: "Road Trip",
        accent: "#9bc4ff",
        art: `
            <path d="M154 462 V354 Q154 316 192 316 H342 L420 224 H658 Q716 224 754 278 L810 354 H846 Q894 354 894 402 V462 Z" />
            <path d="M314 316 L396 250 H626 Q676 250 714 308" />
            <circle cx="300" cy="462" r="92" />
            <circle cx="300" cy="462" r="38" />
            <circle cx="742" cy="462" r="92" />
            <circle cx="742" cy="462" r="38" />
            <path d="M446 340 H578" />
            <path d="M624 338 H748" />
            <path d="M820 392 H860" />
            <path d="M116 604 Q228 588 338 602 Q448 616 564 600 Q684 584 812 604 Q908 618 1000 606" />
            <path d="M152 120 Q184 70 248 78 Q298 82 324 122 Q372 88 426 102 Q494 118 498 188 Q468 212 420 208 H200 Q146 208 126 176 Q114 156 116 132 Z" />
        `,
    },
    {
        id: "house",
        emoji: "🏡",
        name: "Cozy House",
        accent: "#ffc48f",
        art: `
            <path d="M186 328 L500 100 L814 328" />
            <rect x="236" y="328" width="528" height="292" rx="8" />
            <rect x="440" y="438" width="124" height="182" rx="14" />
            <rect x="292" y="392" width="108" height="108" rx="10" />
            <path d="M346 392 V500 M292 446 H400" />
            <rect x="600" y="392" width="108" height="108" rx="10" />
            <path d="M654 392 V500 M600 446 H708" />
            <rect x="628" y="184" width="64" height="110" rx="8" />
            <path d="M124 706 Q280 678 432 696 Q600 716 764 694 Q882 678 1000 708" />
            <path d="M118 610 Q92 548 118 482 Q146 420 212 402" />
            <path d="M104 502 Q56 490 40 438 Q30 400 46 370 Q66 334 108 334 Q134 286 192 300 Q240 312 252 356 Q314 360 332 410 Q348 452 326 498 Q302 548 242 548 H132 Q106 548 94 532" />
            <circle cx="148" cy="176" r="54" />
            <path d="M148 72 V42 M90 96 L68 74 M206 96 L228 74 M60 176 H28 M268 176 H236 M94 234 L70 258 M202 234 L226 258" />
        `,
    },
];

const pageLayers = {};
let currentPageId = PAGES[0].id;
let currentColorId = "red";
let currentBrushId = "large";
let isDrawing = false;
let lastPoint = null;
let rainbowHue = 0;

const paintCanvas = document.getElementById("paint-canvas");
const paintCtx = paintCanvas.getContext("2d");
const pictureStrip = document.getElementById("picture-strip");
const colorPalette = document.getElementById("color-palette");
const sizePicker = document.getElementById("size-picker");
const lineArt = document.getElementById("line-art");
const stageFrame = document.getElementById("stage-frame");
const stageFit = document.getElementById("stage-fit");
const pageEmoji = document.getElementById("page-emoji");
const pageName = document.getElementById("page-name");
const helperBubble = document.getElementById("helper-bubble");
const clearButton = document.getElementById("clear-btn");
const surpriseButton = document.getElementById("surprise-btn");

function createLayer() {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return { canvas, ctx };
}

function getPage(pageId) {
    return PAGES.find((page) => page.id === pageId);
}

function getColor(colorId) {
    return COLORS.find((color) => color.id === colorId);
}

function getBrush(brushId) {
    return BRUSHES.find((brush) => brush.id === brushId);
}

function buildPictureStrip() {
    pictureStrip.innerHTML = "";

    PAGES.forEach((page) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "picture-btn";
        button.dataset.page = page.id;
        button.style.setProperty("--page-accent", page.accent);
        button.setAttribute("aria-label", page.name);
        button.innerHTML = `
            <span class="picture-emoji" aria-hidden="true">${page.emoji}</span>
            <span class="picture-label">${page.name}</span>
        `;
        button.addEventListener("click", () => setPage(page.id));
        pictureStrip.appendChild(button);
    });
}

function buildPalette() {
    colorPalette.innerHTML = "";

    COLORS.forEach((color) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `color-btn${color.mode === "rainbow" ? " rainbow" : ""}`;
        button.dataset.color = color.id;
        button.setAttribute("aria-label", color.label);
        button.title = color.label;

        if (color.mode === "solid") {
            button.style.background = color.hex;
        }

        button.addEventListener("click", () => setColor(color.id));
        colorPalette.appendChild(button);
    });
}

function buildSizePicker() {
    sizePicker.innerHTML = "";

    BRUSHES.forEach((brush) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "size-btn";
        button.dataset.brush = brush.id;
        button.setAttribute("aria-label", brush.label);
        button.title = brush.label;
        button.innerHTML = `<span class="size-dot ${brush.dotClass}" aria-hidden="true"></span>`;
        button.addEventListener("click", () => setBrush(brush.id));
        sizePicker.appendChild(button);
    });
}

function buildLineArt(page) {
    return `
        <svg viewBox="0 0 1000 750" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
            <g fill="none" stroke="#26334d" stroke-width="24" stroke-linecap="round" stroke-linejoin="round">
                ${page.art}
            </g>
        </svg>
    `;
}

function syncPageButtons() {
    document.querySelectorAll(".picture-btn").forEach((button) => {
        button.classList.toggle("active", button.dataset.page === currentPageId);
    });
}

function syncColorButtons() {
    document.querySelectorAll(".color-btn").forEach((button) => {
        const isActive = button.dataset.color === currentColorId;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });
}

function syncBrushButtons() {
    document.querySelectorAll(".size-btn").forEach((button) => {
        const isActive = button.dataset.brush === currentBrushId;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });
}

function redrawVisibleLayer() {
    paintCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    paintCtx.drawImage(pageLayers[currentPageId].canvas, 0, 0);
}

function setPage(pageId) {
    const page = getPage(pageId);
    if (!page) return;

    currentPageId = pageId;
    lineArt.innerHTML = buildLineArt(page);
    pageEmoji.textContent = page.emoji;
    pageName.textContent = page.name;
    stageFrame.style.setProperty("--page-accent", page.accent);
    stageFrame.classList.remove("page-flash");
    void stageFrame.offsetWidth;
    stageFrame.classList.add("page-flash");
    syncPageButtons();
    redrawVisibleLayer();
}

function setColor(colorId) {
    if (!getColor(colorId)) return;
    currentColorId = colorId;
    syncColorButtons();
}

function setBrush(brushId) {
    if (!getBrush(brushId)) return;
    currentBrushId = brushId;
    syncBrushButtons();
}

function clearCurrentPage() {
    const { ctx } = pageLayers[currentPageId];
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    redrawVisibleLayer();
}

function surprisePage() {
    const choices = PAGES.filter((page) => page.id !== currentPageId);
    const randomPage = choices[Math.floor(Math.random() * choices.length)];
    setPage(randomPage.id);
}

function fitStage() {
    const bounds = stageFit.getBoundingClientRect();
    const maxWidth = Math.max(0, bounds.width - 4);
    const maxHeight = Math.max(0, bounds.height - 4);

    if (!maxWidth || !maxHeight) return;

    let frameWidth = maxWidth;
    let frameHeight = frameWidth / STAGE_ASPECT;

    if (frameHeight > maxHeight) {
        frameHeight = maxHeight;
        frameWidth = frameHeight * STAGE_ASPECT;
    }

    stageFrame.style.width = `${Math.floor(frameWidth)}px`;
    stageFrame.style.height = `${Math.floor(frameHeight)}px`;
}

function getCanvasPoint(event) {
    const rect = paintCanvas.getBoundingClientRect();
    return {
        x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
        y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    };
}

function getStrokeStyle() {
    const color = getColor(currentColorId);
    if (!color) return "#ff6b6b";

    if (color.mode === "rainbow") {
        rainbowHue = (rainbowHue + 12) % 360;
        return `hsl(${rainbowHue} 90% 62%)`;
    }

    return color.hex;
}

function drawCircle(context, point, radius, fillStyle) {
    context.save();
    context.fillStyle = fillStyle;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
}

function drawSegment(from, to) {
    const brush = getBrush(currentBrushId);
    const radius = brush ? brush.radius : 28;
    const strokeStyle = getStrokeStyle();
    const contexts = [paintCtx, pageLayers[currentPageId].ctx];

    contexts.forEach((context) => {
        context.save();
        context.strokeStyle = strokeStyle;
        context.lineWidth = radius * 2;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
        context.restore();
    });
}

function stampPoint(point) {
    const brush = getBrush(currentBrushId);
    const radius = brush ? brush.radius : 28;
    const fillStyle = getStrokeStyle();
    drawCircle(paintCtx, point, radius, fillStyle);
    drawCircle(pageLayers[currentPageId].ctx, point, radius, fillStyle);
}

function startDrawing(event) {
    event.preventDefault();
    helperBubble.classList.add("hidden");
    isDrawing = true;
    lastPoint = getCanvasPoint(event);
    stampPoint(lastPoint);

    if (paintCanvas.setPointerCapture) {
        paintCanvas.setPointerCapture(event.pointerId);
    }
}

function moveDrawing(event) {
    if (!isDrawing) return;
    event.preventDefault();

    const nextPoint = getCanvasPoint(event);
    drawSegment(lastPoint, nextPoint);
    lastPoint = nextPoint;
}

function endDrawing(event) {
    if (!isDrawing) return;
    isDrawing = false;
    lastPoint = null;

    if (paintCanvas.releasePointerCapture) {
        try {
            paintCanvas.releasePointerCapture(event.pointerId);
        } catch (error) {
            // Safari can throw if capture is already released.
        }
    }
}

function bindCanvas() {
    paintCanvas.addEventListener("pointerdown", startDrawing);
    paintCanvas.addEventListener("pointermove", moveDrawing);
    paintCanvas.addEventListener("pointerup", endDrawing);
    paintCanvas.addEventListener("pointercancel", endDrawing);
    paintCanvas.addEventListener("pointerleave", endDrawing);
}

function initLayers() {
    PAGES.forEach((page) => {
        pageLayers[page.id] = createLayer();
    });
}

function bindActions() {
    clearButton.addEventListener("click", clearCurrentPage);
    surpriseButton.addEventListener("click", surprisePage);
    stageFrame.addEventListener("animationend", () => {
        stageFrame.classList.remove("page-flash");
    });
}

function preventGestureZoom() {
    document.addEventListener("gesturestart", (event) => event.preventDefault());
    document.addEventListener("gesturechange", (event) => event.preventDefault());
}

function init() {
    initLayers();
    buildPictureStrip();
    buildPalette();
    buildSizePicker();
    bindCanvas();
    bindActions();
    preventGestureZoom();
    setColor(currentColorId);
    setBrush(currentBrushId);
    setPage(currentPageId);
    fitStage();

    if ("ResizeObserver" in window) {
        const observer = new ResizeObserver(() => fitStage());
        observer.observe(stageFit);
    }

    window.addEventListener("resize", fitStage);
    window.addEventListener("orientationchange", fitStage);
}

init();
