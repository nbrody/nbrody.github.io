import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { formatQuaternion, QMath } from '../quaternionPackage/projectiveQuaternion.js';

let genScene, genCamera, genRenderer, genControls;
let activeHighlightMesh = null;
let currentVisKeys = [];
let currentGenerators = {};
let highlightedKey = null;

const SVG_NS = 'http://www.w3.org/2000/svg';

const H = (tag, props = {}, kids = []) => {
    const el = document.createElement(tag);
    const { style, ...rest } = props;
    Object.entries(rest).forEach(([k, v]) => {
        if (k === 'className') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('data-')) el.setAttribute(k, v);
        else el[k] = v;
    });
    if (style) Object.entries(style).forEach(([k, v]) => el.style[k] = v);
    kids.forEach(k => el.append(k));
    return el;
};

const S = (tag, attrs = {}) => {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    return el;
};

function getContrastColor(hexcolor) {
    if (!hexcolor || hexcolor.startsWith('hsl')) return 'white';
    hexcolor = hexcolor.replace("#", "");
    var r = parseInt(hexcolor.substr(0, 2), 16);
    var g = parseInt(hexcolor.substr(2, 2), 16);
    var b = parseInt(hexcolor.substr(4, 2), 16);
    var yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? 'black' : 'white';
}

export function initGeneratorVis(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    genScene = new THREE.Scene();
    genCamera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    genCamera.position.z = 15;

    genRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    genRenderer.setSize(container.clientWidth, container.clientHeight);
    genRenderer.setPixelRatio(window.devicePixelRatio);
    container.innerHTML = '';
    container.appendChild(genRenderer.domElement);

    genControls = new OrbitControls(genCamera, genRenderer.domElement);
    genControls.enableDamping = true;
    genControls.dampingFactor = 0.05;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    genScene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(5, 10, 7.5);
    genScene.add(directionalLight);

    const axesHelper = new THREE.AxesHelper(10);
    genScene.add(axesHelper);

    // Add raycaster for interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    genRenderer.domElement.addEventListener('click', (event) => {
        const rect = genRenderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, genCamera);
        const pointsObj = genScene.children.find(obj => obj instanceof THREE.Points);
        if (!pointsObj) return;

        const intersects = raycaster.intersectObject(pointsObj);
        if (intersects.length > 0) {
            const index = intersects[0].index;
            if (index >= 0 && index < currentVisKeys.length) {
                highlightGenerator(currentVisKeys[index], currentGenerators);
            }
        } else {
            highlightGenerator(null, currentGenerators);
        }
    });

    animate();
}

function animate() {
    requestAnimationFrame(animate);
    if (genControls) genControls.update();
    if (genRenderer && genScene && genCamera) genRenderer.render(genScene, genCamera);
}

export function drawGenerators(generators, xySolutions) {
    const container = document.getElementById('generators-container');
    if (!container) return;
    container.innerHTML = '';

    currentGenerators = generators;

    const genKeys = Object.keys(generators);
    if (genKeys.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #7f8c8d;">Compute generators first.</p>';
        return;
    }

    const genByPrime = {};
    genKeys.forEach(key => {
        const prime = generators[key].prime;
        if (!genByPrime[prime]) genByPrime[prime] = [];
        genByPrime[prime].push(key);
    });

    Object.keys(genByPrime).sort((a, b) => a - b).forEach(prime => {
        const pinwheel = createPinwheel(parseInt(prime), genByPrime[prime], generators, xySolutions[prime]);
        container.appendChild(pinwheel);
    });

    visualizeGeneratorsIn3D(generators);
}

function createPinwheel(prime, keys, generators, xy) {
    const sortByP1Label = (ks) => {
        return ks.sort((a, b) => {
            const labelA = generators[a].p1Label;
            const labelB = generators[b].p1Label;
            if (labelA === '∞') return -1;
            if (labelB === '∞') return 1;
            return parseInt(labelA) - parseInt(labelB);
        });
    };

    const sortedKeys = sortByP1Label(keys);
    const numGens = sortedKeys.length;
    const size = 350;
    const centerX = size / 2;
    const centerY = size / 2;
    const innerRadius = 35;
    const outerRadius = 130;

    const pinwheelDiv = H('div', {
        className: 'pinwheel-prime-group',
        style: {
            display: 'inline-block',
            margin: '10px',
            textAlign: 'center'
        }
    });

    if (xy) {
        const solutionText = H('div', {
            style: { fontSize: '11px', color: 'var(--text-color)', marginBottom: '5px', fontWeight: 'bold' }
        });
        solutionText.innerHTML = `\\( x^2 + y^2 \\equiv -1 \\pmod{${prime}} \\): (${xy.x}, ${xy.y})`;
        pinwheelDiv.appendChild(solutionText);
    }

    const svg = S('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` });

    const centerCircle = S('circle', { cx: centerX, cy: centerY, r: innerRadius, fill: '#3498db', stroke: '#2c3e50', 'stroke-width': 2 });
    svg.appendChild(centerCircle);

    const centerText = S('text', { x: centerX, y: centerY, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: 'white', 'font-size': '20', 'font-weight': 'bold' });
    centerText.textContent = `${prime}`;
    svg.appendChild(centerText);

    sortedKeys.forEach((key, i) => {
        const gen = generators[key];
        const angle = -Math.PI / 2 - (2 * Math.PI * i) / numGens;

        const innerX = centerX + innerRadius * Math.cos(angle);
        const innerY = centerY + innerRadius * Math.sin(angle);
        const outerX = centerX + outerRadius * Math.cos(angle);
        const outerY = centerY + outerRadius * Math.sin(angle);

        svg.appendChild(S('line', { x1: innerX, y1: innerY, x2: outerX, y2: outerY, stroke: '#bdc3c7', 'stroke-width': 1.5 }));

        const midX = centerX + (innerRadius + outerRadius) / 2 * Math.cos(angle);
        const midY = centerY + (innerRadius + outerRadius) / 2 * Math.sin(angle);
        const p1Text = S('text', { x: midX, y: midY, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#7f8c8d', 'font-size': '12', 'font-weight': 'bold' });
        p1Text.textContent = gen.p1Label || '?';
        svg.appendChild(p1Text);

        const badgeWidth = 80;
        const badgeHeight = 25;
        const foreignObj = S('foreignObject', { x: outerX - badgeWidth / 2, y: outerY - badgeHeight / 2, width: badgeWidth, height: badgeHeight });

        const pillContainer = document.createElement('div');
        pillContainer.style = 'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;';

        const pill = document.createElement('span');
        pill.innerHTML = `\\( ${formatQuaternion(gen.q)} \\)`;
        pill.className = 'generator-pill';
        pill.style = `background-color: ${gen.color}; color: ${getContrastColor(gen.color)}; padding: 2px 8px; border-radius: 999px; font-weight: 600; font-size: 10px; border: 1.5px solid #2c3e50; cursor: pointer; white-space: nowrap;`;
        pill.setAttribute('data-key', key);
        pill.onclick = (e) => {
            e.stopPropagation();
            highlightGenerator(key, generators);
        };

        pillContainer.appendChild(pill);
        foreignObj.appendChild(pillContainer);
        svg.appendChild(foreignObj);
    });

    pinwheelDiv.appendChild(svg);
    if (window.MathJax) MathJax.typesetPromise([pinwheelDiv]);
    return pinwheelDiv;
}

function visualizeGeneratorsIn3D(generators) {
    if (!genScene) return;

    genScene.children.slice().forEach(child => {
        if (!child.isAxesHelper && !child.isLight) {
            genScene.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }
    });

    const pointsArray = [];
    const colors = [];
    currentVisKeys = [];

    let maxCoord = 0;
    Object.entries(generators).forEach(([key, gen]) => {
        const [w, x, y, z] = gen.q;
        pointsArray.push(x, y, z);
        colors.push(new THREE.Color(gen.color));
        currentVisKeys.push(key);
        maxCoord = Math.max(maxCoord, Math.abs(x), Math.abs(y), Math.abs(z));
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pointsArray, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors.flatMap(c => [c.r, c.g, c.b]), 3));

    const material = new THREE.PointsMaterial({ size: 0.5, vertexColors: true, transparent: true, opacity: 0.8, sizeAttenuation: true });
    const pointsMesh = new THREE.Points(geometry, material);
    genScene.add(pointsMesh);

    genCamera.position.z = Math.max(15, maxCoord * 2.5);
}

export function highlightGenerator(key, generators) {
    if (highlightedKey === key) highlightedKey = null;
    else highlightedKey = key;

    document.querySelectorAll('.generator-pill').forEach(el => {
        if (highlightedKey && el.getAttribute('data-key') === highlightedKey) {
            el.classList.add('selected');
            el.style.boxShadow = '0 0 10px #f1c40f';
            el.style.borderColor = '#f1c40f';
        } else {
            el.classList.remove('selected');
            el.style.boxShadow = 'none';
            el.style.borderColor = '#2c3e50';
        }
    });

    if (activeHighlightMesh) {
        genScene.remove(activeHighlightMesh);
        activeHighlightMesh.geometry.dispose();
        activeHighlightMesh.material.dispose();
        activeHighlightMesh = null;
    }

    if (highlightedKey && generators[highlightedKey]) {
        const gen = generators[highlightedKey];
        const [w, x, y, z] = gen.q;

        const geom = new THREE.SphereGeometry(0.6, 32, 32);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 });
        activeHighlightMesh = new THREE.Mesh(geom, mat);
        activeHighlightMesh.position.set(x, y, z);
        genScene.add(activeHighlightMesh);
    }
}

export function handleGeneratorResize(containerId) {
    const container = document.getElementById(containerId);
    if (!container || !genRenderer || !genCamera) return;
    genCamera.aspect = container.clientWidth / container.clientHeight;
    genCamera.updateProjectionMatrix();
    genRenderer.setSize(container.clientWidth, container.clientHeight);
}
