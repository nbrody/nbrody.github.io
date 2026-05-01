/* =============================================================
   Math 21 — 3D matrix transformation viewer (three.js, lazy-loaded)

   Author syntax in markdown:
     <div data-demo="transform-3d"
          data-config='{"matrix":[[1,0,0],[0,2,0],[0,0,1]]}'></div>

   Config:
     matrix:   3×3 array, the transformation applied to a unit cube
     showOriginal:  bool, also show wireframe of the original cube (default true)
   ============================================================= */

(function () {
  "use strict";

  const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js";
  const ORBIT_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/controls/OrbitControls.js";

  let threeLoading = null;
  function loadThree() {
    if (window.THREE && window.THREE.OrbitControls) return Promise.resolve();
    if (threeLoading) return threeLoading;
    threeLoading = new Promise((resolve, reject) => {
      const s1 = document.createElement("script");
      s1.src = THREE_URL;
      s1.onload = () => {
        const s2 = document.createElement("script");
        s2.src = ORBIT_URL;
        s2.onload = resolve;
        s2.onerror = reject;
        document.head.appendChild(s2);
      };
      s1.onerror = reject;
      document.head.appendChild(s1);
    });
    return threeLoading;
  }

  function mount(host, config) {
    const M = config.matrix || [[1,0,0],[0,1,0],[0,0,1]];
    const showOriginal = config.showOriginal !== false;

    host.classList.add("demo-3d");
    host.innerHTML = `
      <div class="demo-3d-canvas"></div>
      <div class="demo-3d-status">Loading 3D viewer…</div>
      <div class="demo-3d-hint">Drag to orbit · scroll to zoom</div>
    `;
    const canvas = host.querySelector(".demo-3d-canvas");
    const status = host.querySelector(".demo-3d-status");

    let renderer, scene, camera, controls, transformedMesh, raf;

    loadThree().then(() => {
      const W = canvas.clientWidth || 480;
      const H = 360;
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(W, H);
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      canvas.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
      camera.position.set(4, 3, 5);
      camera.lookAt(0, 0, 0);

      // Lights
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const dir = new THREE.DirectionalLight(0xffffff, 0.7);
      dir.position.set(3, 5, 4);
      scene.add(dir);

      // Axes
      const axes = new THREE.AxesHelper(2);
      scene.add(axes);

      // Grid plane
      const grid = new THREE.GridHelper(6, 6, 0xcccccc, 0xeeeeee);
      grid.rotation.x = Math.PI / 2; // lay it on the xy-plane
      scene.add(grid);

      // Original wireframe cube
      if (showOriginal) {
        const geom = new THREE.BoxGeometry(1, 1, 1);
        geom.translate(0.5, 0.5, 0.5);
        const wf = new THREE.LineSegments(
          new THREE.EdgesGeometry(geom),
          new THREE.LineBasicMaterial({ color: 0x837e72 })
        );
        scene.add(wf);
      }

      // Transformed cube
      const geom2 = new THREE.BoxGeometry(1, 1, 1);
      geom2.translate(0.5, 0.5, 0.5);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x7a1f2b, transparent: true, opacity: 0.45,
        roughness: 0.7
      });
      transformedMesh = new THREE.Mesh(geom2, mat);
      // Apply matrix
      const m4 = new THREE.Matrix4().set(
        M[0][0], M[0][1], M[0][2], 0,
        M[1][0], M[1][1], M[1][2], 0,
        M[2][0], M[2][1], M[2][2], 0,
        0, 0, 0, 1
      );
      transformedMesh.applyMatrix4(m4);
      scene.add(transformedMesh);

      const wf2 = new THREE.LineSegments(
        new THREE.EdgesGeometry(geom2),
        new THREE.LineBasicMaterial({ color: 0x7a1f2b })
      );
      wf2.applyMatrix4(m4);
      scene.add(wf2);

      // Orbit controls
      if (THREE.OrbitControls) {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
      }

      status.style.display = "none";

      function tick() {
        raf = requestAnimationFrame(tick);
        if (controls) controls.update();
        renderer.render(scene, camera);
      }
      tick();
    }).catch((e) => {
      status.textContent = "Could not load 3D viewer.";
      console.error("[Math 21] three.js load failed", e);
    });

    return {
      destroy() {
        if (raf) cancelAnimationFrame(raf);
        if (renderer) {
          renderer.dispose && renderer.dispose();
          if (renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
          }
        }
      }
    };
  }

  window.DemoRegistry.register("transform-3d", mount);
})();
