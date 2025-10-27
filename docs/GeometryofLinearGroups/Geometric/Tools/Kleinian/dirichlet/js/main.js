// main.js
// Main entry point: initializes the application

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as ThreeCSGModule from 'https://esm.run/three-csg-ts';

// Import our modules
import { initScene, animate, onCanvasClick, getSceneObjects } from './rendering.js';
import { setupPanelUI, showLatexInMessageBox } from './ui.js';

// Make CSG available globally
const CSG = ThreeCSGModule.CSG || ThreeCSGModule.default || ThreeCSGModule;
window.CSG = CSG;

// Make THREE available globally for other scripts
window.THREE = THREE;
window.OrbitControls = OrbitControls;

// Initialize the application
function init() {
  const viewer = document.getElementById('viewer');

  // Initialize scene
  initScene(viewer);

  // Setup panel UI
  setupPanelUI();

  // Enable canvas click handler for wall picking
  const sceneObjects = getSceneObjects();
  if (sceneObjects.renderer) {
    sceneObjects.renderer.domElement.addEventListener('click', (event) => {
      onCanvasClick(event, showLatexInMessageBox);
    });
  }

  // Expose floor globally for UI access
  window.floor = sceneObjects.floor;

  // Start animation loop
  animate();
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
