const canvas = document.getElementById('uhpCanvas');
const ctx = canvas.getContext('2d');

const primeInput = document.getElementById('primeInput');
const applyBtn = document.getElementById('applyBtn');
const depthInput = document.getElementById('depthInput');
const depthVal = document.getElementById('depthVal');
const tileInput = document.getElementById('tileInput');
const tileVal = document.getElementById('tileVal');
const extraMatricesInput = document.getElementById('extraMatricesInput');
const addSBtn = document.getElementById('addSBtn');
const clearExtrasBtn = document.getElementById('clearExtrasBtn');
const clickStatusEl = document.getElementById('clickStatus');
const showTilingInput = document.getElementById('showTilingInput');
const includeABInput = document.getElementById('includeABInput');
const includeDiagPInput = document.getElementById('includeDiagPInput');
const fillTilesInput = document.getElementById('fillTilesInput');
const showOrbitInput = document.getElementById('showOrbitInput');
const showIOrbitInput = document.getElementById('showIOrbitInput');
const showIHullInput = document.getElementById('showIHullInput');
const showConvexCoreInput = document.getElementById('showConvexCoreInput');
const showPSLOrbitInput = document.getElementById('showPSLOrbitInput');
const showGridInput = document.getElementById('showGridInput');
const resetViewBtn = document.getElementById('resetViewBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const statsEl = document.getElementById('stats');
const legendItemA = document.getElementById('legendItemA');
const legendItemB = document.getElementById('legendItemB');
const legendItemOrbitA = document.getElementById('legendItemOrbitA');
const legendItemOrbitB = document.getElementById('legendItemOrbitB');

const EPS = 1e-10;
const INF_HEIGHT = 90;
const MAX_SUBGROUP_ELEMENTS = 3200;
const MAX_ORBIT_AXES = 1800;
const MAX_ORBIT_I_POINTS = 2400;
const CLICK_RADIUS_PX = 12;

const I = [1, 0, 0, 1];
const S = [0, -1, 1, 0];
const ST = [0, -1, 1, 1];
const T = [1, 1, 0, 1];
const T_INV = [1, -1, 0, 1];
const I_BASE = { re: 0, im: 1 };
const OMEGA_BASE = { re: -0.5, im: Math.sqrt(3) / 2 };

const FUNDAMENTAL_VERTICES = [
    { re: -0.5, im: INF_HEIGHT },
    { re: -0.5, im: Math.sqrt(3) / 2 },
    { re: 0.5, im: Math.sqrt(3) / 2 },
    { re: 0.5, im: INF_HEIGHT }
];

const state = {
    width: 0,
    height: 0,
    scale: 130,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
    p: 3,
    depth: 3,
    tileCount: 1400,
    extraMatrices: [],
    extraMatrixWarnings: [],
    hasExtraS: false,
    showTiling: true,
    includeAB: true,
    includeDiagP: false,
    fillTiles: true,
    showOrbit: false,
    showIOrbit: false,
    showIHull: true,
    showConvexCore: true,
    showPSLOrbit: true,
    showGrid: true,
    tilingCache: [],
    tilingCacheCount: -1,
    pslOrbitCache: [],
    pslOrbitCounts: { i: 0, omega: 0 },
    pslOrbitCacheCount: -1,
    model: null,
    renderQueued: false,
    dragPx: 0
};
