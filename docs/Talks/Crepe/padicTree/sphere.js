/**
 * SphereView — Three.js visualization of the tree folded onto S²
 *
 * Each tree vertex maps to a point on S² via the action of its
 * SO(3) group element on the north pole N = (0,0,1).
 * The fold animation smoothly wraps the flat disk tree onto the sphere.
 */

class SphereView {
    constructor(container, treeViz) {
        this.container = container;
        this.treeViz = treeViz;
        this.foldProgress = 0;
        this.foldTarget = 0;
        this.active = false;
        this.pulseTime = -1; // -1 = not pulsing
        this.maxLevel = 0;
        this.decompState = { active: false, progress: 0, target: 0, phase: 0 };

        // ── Scene ──
        this.scene = new THREE.Scene();

        // ── Camera ──
        this.camera = new THREE.PerspectiveCamera(
            45, container.clientWidth / container.clientHeight, 0.1, 100
        );
        this.camera.position.set(0, 0, 3.2);
        this.camera.lookAt(0, 0, 0);

        // ── Renderer ──
        this.renderer = new THREE.WebGLRenderer({
            alpha: true, antialias: true
        });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setClearColor(0x060a14, 1);
        this.renderer.domElement.style.cssText =
            'position:absolute;inset:0;width:100%;height:100%;' +
            'pointer-events:none;opacity:0;z-index:5;' +
            'transition:opacity 0.5s ease;';
        container.appendChild(this.renderer.domElement);

        // ── Controls ──
        this.controls = new THREE.OrbitControls(
            this.camera, this.renderer.domElement
        );
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.enablePan = false;
        this.controls.minDistance = 1.5;
        this.controls.maxDistance = 8;

        // ── Lighting ──
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(3, 4, 5);
        this.scene.add(dirLight);

        // ── Sphere group (for rotations) ──
        this.sphereGroup = new THREE.Group();
        this.scene.add(this.sphereGroup);
        this.currentQuat = new THREE.Quaternion();
        this.targetQuat = new THREE.Quaternion();
        this.rotAnimating = false;

        // ── Wireframe sphere ──
        const wireGeom = new THREE.SphereGeometry(0.998, 32, 24);
        this.wireMesh = new THREE.Mesh(wireGeom, new THREE.MeshBasicMaterial({
            color: 0x7c8aff, wireframe: true, transparent: true, opacity: 0,
        }));
        this.sphereGroup.add(this.wireMesh);

        // ── Build geometry ──
        this._buildGeometry();

        // ── Resize ──
        window.addEventListener('resize', () => this._resize());

        // ── Animation loop ──
        this._animate();
    }

    _resize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        // Sync resolution uniform for edge billboard shader
        if (this.edgeLines && this.edgeLines.material.uniforms.resolution) {
            this.edgeLines.material.uniforms.resolution.value.set(w, h);
        }
    }

    _buildGeometry() {
        const nodes = this.treeViz.nodes;
        const N = nodes.length;

        this.flatPos = new Float32Array(N * 3);
        this.spherePos = new Float32Array(N * 3);

        for (let i = 0; i < N; i++) {
            const n = nodes[i];

            // Flat: disk coords → THREE coords
            // disk refY negative = up, THREE y positive = up → negate
            this.flatPos[i * 3]     = n.refX;
            this.flatPos[i * 3 + 1] = -n.refY;
            this.flatPos[i * 3 + 2] = 0;

            // Sphere: SO(3) orbit of north pole
            // node stores: sphereX = mat[0][2], sphereY = -mat[1][2], sphereZ = mat[2][2]
            // math (x,y,z) = (sphereX, -sphereY, sphereZ)
            // Coordinate change: (x,y,z) → ((x−y)/√2, −(x+y)/√2, z)
            //   North pole (0,0,1) → (0, 0, 1) = facing camera
            //   gen a tangent → +x (right), gen b tangent → +y (up)
            const mx = n.sphereX;        // mat[0][2] = math x
            const my = -n.sphereY;       // mat[1][2] = math y (undo negation)
            const mz = n.sphereZ;        // mat[2][2] = math z
            const s2 = Math.SQRT1_2;
            this.spherePos[i * 3]     = (mx - my) * s2;
            this.spherePos[i * 3 + 1] = -(mx + my) * s2;
            this.spherePos[i * 3 + 2] = mz;
        }

        // ── Vertex points ──
        const vertPosArr = new Float32Array(N * 3);
        vertPosArr.set(this.flatPos);

        const vertGeom = new THREE.BufferGeometry();
        vertGeom.setAttribute('position', new THREE.BufferAttribute(vertPosArr, 3));

        // Per-vertex sizes and levels
        const sizes = new Float32Array(N);
        const levels = new Float32Array(N);
        const regionColors = new Float32Array(N * 3);
        const defaultColor = new THREE.Color(0x5588ff);
        const regionThreeColors = DiskTreeViz.REGION_COLORS.map(
            rc => new THREE.Color(rc.hex)
        );
        for (let i = 0; i < N; i++) {
            const md = this.treeViz.maxDepth;
            if (md >= 8) {
                // Exponential decay so each depth ring is distinguishable
                sizes[i] = Math.max(0.3, 3.5 * Math.pow(0.7, nodes[i].level));
            } else {
                sizes[i] = Math.max(1, 3.5 - nodes[i].level * 0.5);
            }
            levels[i] = nodes[i].level;
            if (nodes[i].level > this.maxLevel) this.maxLevel = nodes[i].level;
            const rb = nodes[i].rootBranch;
            const c = rb >= 0 ? regionThreeColors[rb] : defaultColor;
            regionColors[i * 3]     = c.r;
            regionColors[i * 3 + 1] = c.g;
            regionColors[i * 3 + 2] = c.b;
        }
        vertGeom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        vertGeom.setAttribute('level', new THREE.BufferAttribute(levels, 1));
        vertGeom.setAttribute('regionColor', new THREE.BufferAttribute(regionColors, 3));

        const vertMat = new THREE.ShaderMaterial({
            uniforms: {
                color: { value: new THREE.Color(0x5588ff) },
                pulseColor: { value: new THREE.Color(0x88ccff) },
                pulseFront: { value: -1.0 },
                useRegionColors: { value: 0.0 },
            },
            vertexShader: `
                attribute float size;
                attribute float level;
                attribute vec3 regionColor;
                uniform float pulseFront;
                uniform float useRegionColors;
                varying float vPulse;
                varying vec3 vRegionColor;
                varying float vUseRegion;
                void main() {
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    float dist = abs(level - pulseFront);
                    vPulse = smoothstep(1.5, 0.0, dist);
                    float pulseScale = 1.0 + vPulse * 1.0;
                    gl_PointSize = size * pulseScale * (80.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                    vRegionColor = regionColor;
                    vUseRegion = useRegionColors;
                }
            `,
            fragmentShader: `
                uniform vec3 color;
                uniform vec3 pulseColor;
                varying float vPulse;
                varying vec3 vRegionColor;
                varying float vUseRegion;
                void main() {
                    float d = length(gl_PointCoord - vec2(0.5));
                    if (d > 0.5) discard;
                    float alpha = smoothstep(0.5, 0.35, d);
                    vec3 baseCol = mix(color, vRegionColor, vUseRegion);
                    // Pulse brightens toward white to preserve hue
                    vec3 pTarget = mix(pulseColor, vec3(1.0), vUseRegion * 0.6);
                    vec3 c = mix(baseCol, pTarget, vPulse * 0.7);
                    float a = alpha * (1.0 + vPulse * 0.5);
                    gl_FragColor = vec4(c, min(a, 1.0));
                }
            `,
            transparent: true,
            depthWrite: false,
        });

        this.vertexPoints = new THREE.Points(vertGeom, vertMat);
        this.sphereGroup.add(this.vertexPoints);

        // ── Edge mesh (billboard quads for variable thickness) ──
        this.EDGE_SEGS = 12;
        this.edgeIndices = [];

        for (let i = 0; i < N; i++) {
            if (nodes[i].parentIdx === -1) continue;
            this.edgeIndices.push([nodes[i].parentIdx, i]);
        }

        const numEdges = this.edgeIndices.length;
        const numQuadVerts = numEdges * this.EDGE_SEGS * 4;
        const numQuadIdxs = numEdges * this.EDGE_SEGS * 6;

        const edgePosArr = new Float32Array(numQuadVerts * 3);
        const edgeNextArr = new Float32Array(numQuadVerts * 3);
        const edgeSideArr = new Float32Array(numQuadVerts);
        const edgeLevelArr = new Float32Array(numQuadVerts);
        const edgeRegionColors = new Float32Array(numQuadVerts * 3);
        const edgeIndexArr = new Uint32Array(numQuadIdxs);
        const defaultEdgeColor = new THREE.Color(0x7c8aff);

        for (let e = 0; e < numEdges; e++) {
            const [pi, ci] = this.edgeIndices[e];
            const ax = this.flatPos[pi*3], ay = this.flatPos[pi*3+1], az = this.flatPos[pi*3+2];
            const bx = this.flatPos[ci*3], by = this.flatPos[ci*3+1], bz = this.flatPos[ci*3+2];
            const parentLevel = nodes[pi].level;
            const childLevel = nodes[ci].level;
            const rb = nodes[ci].rootBranch;
            const ec = rb >= 0 ? regionThreeColors[rb] : defaultEdgeColor;

            for (let s = 0; s < this.EDGE_SEGS; s++) {
                const u0 = s / this.EDGE_SEGS;
                const u1 = (s + 1) / this.EDGE_SEGS;
                const p0x = (1-u0)*ax + u0*bx, p0y = (1-u0)*ay + u0*by, p0z = (1-u0)*az + u0*bz;
                const p1x = (1-u1)*ax + u1*bx, p1y = (1-u1)*ay + u1*by, p1z = (1-u1)*az + u1*bz;
                const lvl0 = (1-u0)*parentLevel + u0*childLevel;
                const lvl1 = (1-u1)*parentLevel + u1*childLevel;

                const baseV = (e * this.EDGE_SEGS + s) * 4;
                const baseI = (e * this.EDGE_SEGS + s) * 6;

                // 4 verts per quad: v0(p0,-1), v1(p0,+1), v2(p1,-1), v3(p1,+1)
                const vData = [
                    { px:p0x,py:p0y,pz:p0z, nx:p1x,ny:p1y,nz:p1z, sd:-1, lv:lvl0 },
                    { px:p0x,py:p0y,pz:p0z, nx:p1x,ny:p1y,nz:p1z, sd: 1, lv:lvl0 },
                    { px:p1x,py:p1y,pz:p1z, nx:p0x,ny:p0y,nz:p0z, sd:-1, lv:lvl1 },
                    { px:p1x,py:p1y,pz:p1z, nx:p0x,ny:p0y,nz:p0z, sd: 1, lv:lvl1 },
                ];
                for (let v = 0; v < 4; v++) {
                    const idx = baseV + v;
                    const d = vData[v];
                    edgePosArr[idx*3] = d.px; edgePosArr[idx*3+1] = d.py; edgePosArr[idx*3+2] = d.pz;
                    edgeNextArr[idx*3] = d.nx; edgeNextArr[idx*3+1] = d.ny; edgeNextArr[idx*3+2] = d.nz;
                    edgeSideArr[idx] = d.sd;
                    edgeLevelArr[idx] = d.lv;
                    edgeRegionColors[idx*3] = ec.r; edgeRegionColors[idx*3+1] = ec.g; edgeRegionColors[idx*3+2] = ec.b;
                }
                // Two triangles: (v0,v1,v2), (v1,v3,v2)
                edgeIndexArr[baseI]   = baseV;
                edgeIndexArr[baseI+1] = baseV+1;
                edgeIndexArr[baseI+2] = baseV+2;
                edgeIndexArr[baseI+3] = baseV+1;
                edgeIndexArr[baseI+4] = baseV+3;
                edgeIndexArr[baseI+5] = baseV+2;
            }
        }

        const edgeGeom = new THREE.BufferGeometry();
        edgeGeom.setAttribute('position', new THREE.BufferAttribute(edgePosArr, 3));
        edgeGeom.setAttribute('nextPosition', new THREE.BufferAttribute(edgeNextArr, 3));
        edgeGeom.setAttribute('side', new THREE.BufferAttribute(edgeSideArr, 1));
        edgeGeom.setAttribute('level', new THREE.BufferAttribute(edgeLevelArr, 1));
        edgeGeom.setAttribute('regionColor', new THREE.BufferAttribute(edgeRegionColors, 3));
        edgeGeom.setIndex(new THREE.BufferAttribute(edgeIndexArr, 1));

        const cw = this.container.clientWidth, ch = this.container.clientHeight;
        const edgeMat = new THREE.ShaderMaterial({
            uniforms: {
                baseColor: { value: new THREE.Color(0x7c8aff) },
                pulseColor: { value: new THREE.Color(0x88ccff) },
                pulseFront: { value: -10.0 },
                baseOpacity: { value: 0.4 },
                baseWidth: { value: 1.0 },
                pulseWidth: { value: 5.0 },
                resolution: { value: new THREE.Vector2(cw, ch) },
                useRegionColors: { value: 0.0 },
            },
            vertexShader: `
                attribute vec3 nextPosition;
                attribute float side;
                attribute float level;
                attribute vec3 regionColor;
                uniform float pulseFront;
                uniform float baseWidth;
                uniform float pulseWidth;
                uniform vec2 resolution;
                uniform float useRegionColors;
                varying float vPulse;
                varying vec3 vRegionColor;
                varying float vUseRegion;
                void main() {
                    float dist = abs(level - pulseFront);
                    vPulse = smoothstep(1.5, 0.0, dist);
                    vRegionColor = regionColor;
                    vUseRegion = useRegionColors;

                    vec4 clipPos  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    vec4 clipNext = projectionMatrix * modelViewMatrix * vec4(nextPosition, 1.0);

                    vec2 screenPos  = clipPos.xy / clipPos.w;
                    vec2 screenNext = clipNext.xy / clipNext.w;

                    vec2 aspect = vec2(resolution.x / resolution.y, 1.0);
                    vec2 dir = normalize((screenNext - screenPos) * aspect);
                    vec2 perp = vec2(-dir.y, dir.x) / aspect;

                    float width = baseWidth + vPulse * pulseWidth;
                    clipPos.xy += perp * side * width * clipPos.w / resolution.y;

                    gl_Position = clipPos;
                }
            `,
            fragmentShader: `
                uniform vec3 baseColor;
                uniform vec3 pulseColor;
                uniform float baseOpacity;
                varying float vPulse;
                varying vec3 vRegionColor;
                varying float vUseRegion;
                void main() {
                    vec3 col = mix(baseColor, vRegionColor, vUseRegion);
                    // Pulse brightens toward white to preserve hue
                    vec3 pTarget = mix(pulseColor, vec3(1.0), vUseRegion * 0.6);
                    vec3 c = mix(col, pTarget, vPulse * 0.8);
                    float a = baseOpacity + vPulse * 0.6;
                    gl_FragColor = vec4(c, min(a, 1.0));
                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        this.edgeLines = new THREE.Mesh(edgeGeom, edgeMat);
        this.sphereGroup.add(this.edgeLines);
    }

    rebuild() {
        // Dispose old geometry
        if (this.vertexPoints) {
            this.vertexPoints.geometry.dispose();
            this.vertexPoints.material.dispose();
            this.sphereGroup.remove(this.vertexPoints);
        }
        if (this.edgeLines) {
            this.edgeLines.geometry.dispose();
            this.edgeLines.material.dispose();
            this.sphereGroup.remove(this.edgeLines);
        }
        this._buildGeometry();
        // Re-apply current color mode
        this._syncColorMode();
    }

    setColorMode(mode) {
        this._syncColorMode();
    }

    _syncColorMode() {
        const use = this.treeViz.colorMode === 'regions' ? 1.0 : 0.0;
        if (this.vertexPoints) {
            this.vertexPoints.material.uniforms.useRegionColors.value = use;
        }
        if (this.edgeLines) {
            this.edgeLines.material.uniforms.useRegionColors.value = use;
        }
    }

    // Convert math SO(3) matrix to THREE.js quaternion
    // Coordinate change C: math (x,y,z) → THREE ((x−y)/√2, −(x+y)/√2, z)
    // C is its own inverse (C² = I), so M_three = C · M_math · C
    _mathMatToThreeQuat(m) {
        const s = Math.SQRT1_2;
        const C = new THREE.Matrix4().set(
             s, -s, 0, 0,
            -s, -s, 0, 0,
             0,  0, 1, 0,
             0,  0, 0, 1
        );
        const M = new THREE.Matrix4().set(
            m[0][0], m[0][1], m[0][2], 0,
            m[1][0], m[1][1], m[1][2], 0,
            m[2][0], m[2][1], m[2][2], 0,
            0, 0, 0, 1
        );
        const result = new THREE.Matrix4().copy(C).multiply(M).multiply(C);
        const q = new THREE.Quaternion();
        q.setFromRotationMatrix(result);
        return q;
    }

    applyGenerator(gen) {
        const mat = DiskTreeViz.genMat(gen);
        const genQuat = this._mathMatToThreeQuat(mat);
        // Left action: new orientation = gen * current
        this.targetQuat.copy(genQuat).multiply(this.currentQuat);
        this.targetQuat.normalize();
        this.rotAnimating = true;
    }

    triggerPulse() {
        this.pulseTime = -1.5;
    }

    toggleFold() {
        this.foldTarget = this.foldTarget === 0 ? 1 : 0;
        if (this.foldTarget === 1) {
            this.active = true;
            this.renderer.domElement.style.pointerEvents = 'auto';
            this.renderer.domElement.style.opacity = '1';
        }
        return this.foldTarget === 1;
    }

    toggleDecompose() {
        if (this.rotAnimating || this.foldProgress < 0.9) return;
        
        if (!this.quatA) {
            this.quatA = this._mathMatToThreeQuat(DiskTreeViz.MAT_A);
            this.quatB = this._mathMatToThreeQuat(DiskTreeViz.MAT_B);
        }

        if (!this.decompState.active) {
            this.decompState.active = true;
            this.decompState.phase = 1;
            this.decompState.target = 1;
            this.decompState.progress = 0;
            if (!this.wireMeshLeft) {
                this.wireMeshLeft = new THREE.Mesh(this.wireMesh.geometry, this.wireMesh.material.clone());
                this.wireMeshRight = new THREE.Mesh(this.wireMesh.geometry, this.wireMesh.material.clone());
                this.sphereGroup.add(this.wireMeshLeft);
                this.sphereGroup.add(this.wireMeshRight);
            }
        } else if (this.decompState.phase === 1 && this.decompState.progress >= 0.99) {
            this.decompState.phase = 2;
            this.decompState.target = 1;
            this.decompState.progress = 0;
        } else if (this.decompState.phase === 2 && this.decompState.progress >= 0.99) {
            this.decompState.phase = 0;
            this.decompState.target = 0;
            this.decompState.progress = 1;
        }
    }

    _updatePositions() {
        const t = this.foldProgress;
        const vp = this.vertexPoints.geometry.attributes.position.array;
        const N = this.treeViz.nodes.length;

        let dp = 0;
        let dPhase = this.decompState ? this.decompState.phase : 0;
        if (this.decompState && this.decompState.active) {
            const p = this.decompState.progress;
            dp = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        }
        
        const sep = 1.6;
        let txLeft = 0, txRight = 0;
        let qa = null, qb = null;
        
        if (this.decompState && this.decompState.active) {
            qa = new THREE.Quaternion();
            qb = new THREE.Quaternion();
            if (dPhase === 1) {
                txLeft = -sep * dp;
                txRight = sep * dp;
            } else if (dPhase === 2) {
                txLeft = -sep;
                txRight = sep;
                if (this.quatA) {
                    qa.slerp(this.quatA, dp);
                    qb.slerp(this.quatB, dp);
                }
            } else if (dPhase === 0) {
                txLeft = -sep * dp;
                txRight = sep * dp;
                if (this.quatA) {
                    qa.slerp(this.quatA, dp);
                    qb.slerp(this.quatB, dp);
                }
            }
        }

        const applyDecomp = (x, y, z, rb) => {
            if (!this.decompState || !this.decompState.active) return {x, y, z};
            let cx = 0, currentQ = null;
            if (rb === -1 || rb === 0) { cx = txLeft; }
            else if (rb === 2) { cx = txLeft; currentQ = qa; }
            else if (rb === 1) { cx = txRight; }
            else if (rb === 3) { cx = txRight; currentQ = qb; }
            
            if (currentQ && currentQ.w !== 1.0) {
                const qx = currentQ.x, qy = currentQ.y, qz = currentQ.z, qw = currentQ.w;
                const ix = qw * x + qy * z - qz * y;
                const iy = qw * y + qz * x - qx * z;
                const iz = qw * z + qx * y - qy * x;
                const iw = -qx * x - qy * y - qz * z;
                const nx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
                const ny = iy * qw + iw * -qy + iz * -qx - ix * -qz;
                const nz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
                return { x: nx + cx, y: ny, z: nz };
            }
            return { x: x + cx, y, z };
        };

        if (!this.basePos || this.basePos.length !== N * 3) {
            this.basePos = new Float32Array(N * 3);
        }

        for (let i = 0; i < N; i++) {
            let x = (1 - t) * this.flatPos[i * 3]     + t * this.spherePos[i * 3];
            let y = (1 - t) * this.flatPos[i * 3 + 1] + t * this.spherePos[i * 3 + 1];
            let z = (1 - t) * this.flatPos[i * 3 + 2] + t * this.spherePos[i * 3 + 2];

            // Project onto sphere surface during fold (smooth blend)
            if (t > 0.2) {
                const len = Math.sqrt(x * x + y * y + z * z);
                if (len > 0.01) {
                    const surfaceBlend = Math.min(1, (t - 0.2) / 0.6);
                    const targetLen = (1 - surfaceBlend) * len + surfaceBlend * 1.0;
                    const s = targetLen / len;
                    x *= s; y *= s; z *= s;
                }
            }
            
            this.basePos[i * 3] = x;
            this.basePos[i * 3 + 1] = y;
            this.basePos[i * 3 + 2] = z;

            const rb = this.treeViz.nodes[i].rootBranch;
            const d = applyDecomp(x, y, z, rb);
            vp[i * 3] = d.x;
            vp[i * 3 + 1] = d.y;
            vp[i * 3 + 2] = d.z;
        }
        this.vertexPoints.geometry.attributes.position.needsUpdate = true;

        // Update edges — subdivide with sphere-surface normalization
        const SEGS = this.EDGE_SEGS;
        const ep = this.edgeLines.geometry.attributes.position.array;
        const en = this.edgeLines.geometry.attributes.nextPosition.array;

        for (let e = 0; e < this.edgeIndices.length; e++) {
            const [pi, ci] = this.edgeIndices[e];
            const rb = this.treeViz.nodes[ci].rootBranch;
            const ax = this.basePos[pi*3], ay = this.basePos[pi*3+1], az = this.basePos[pi*3+2];
            const bx = this.basePos[ci*3], by = this.basePos[ci*3+1], bz = this.basePos[ci*3+2];

            // Pre-compute all subdivision points along this edge
            const pts = [];
            for (let j = 0; j <= SEGS; j++) {
                const u = j / SEGS;
                let x = (1-u)*ax + u*bx;
                let y = (1-u)*ay + u*by;
                let z = (1-u)*az + u*bz;
                // Push intermediate points onto sphere surface
                if (t > 0.2 && j > 0 && j < SEGS) {
                    const nf = Math.min(1, (t - 0.2) / 0.6);
                    const len = Math.sqrt(x*x + y*y + z*z);
                    if (len > 0.01) {
                        const sc = ((1-nf) * len + nf) / len;
                        x *= sc; y *= sc; z *= sc;
                    }
                }
                const d = applyDecomp(x, y, z, rb);
                pts.push(d.x, d.y, d.z);
            }

            for (let s = 0; s < SEGS; s++) {
                const p0x = pts[s*3], p0y = pts[s*3+1], p0z = pts[s*3+2];
                const p1x = pts[(s+1)*3], p1y = pts[(s+1)*3+1], p1z = pts[(s+1)*3+2];
                const baseV = (e * SEGS + s) * 4;

                for (let v = 0; v < 4; v++) {
                    const idx = (baseV + v) * 3;
                    const isEnd = v >= 2;
                    ep[idx]   = isEnd ? p1x : p0x;
                    ep[idx+1] = isEnd ? p1y : p0y;
                    ep[idx+2] = isEnd ? p1z : p0z;
                    en[idx]   = isEnd ? p0x : p1x;
                    en[idx+1] = isEnd ? p0y : p1y;
                    en[idx+2] = isEnd ? p0z : p1z;
                }
            }
        }
        this.edgeLines.geometry.attributes.position.needsUpdate = true;
        this.edgeLines.geometry.attributes.nextPosition.needsUpdate = true;
    }

    _animate() {
        requestAnimationFrame(() => this._animate());

        if (!this.active) return;

        // Decomposition progress logic
        if (this.decompState && this.decompState.active) {
            const diff = this.decompState.target - this.decompState.progress;
            if (Math.abs(diff) > 0.001) {
                this.decompState.progress += Math.sign(diff) * 0.02;
                this.decompState.progress = Math.max(0, Math.min(1, this.decompState.progress));
            } else {
                this.decompState.progress = this.decompState.target;
                if (this.decompState.phase === 0 && this.decompState.target === 0 && this.decompState.progress <= 0.001) {
                    this.decompState.active = false;
                    this.decompState.phase = 0;
                }
            }
            this._updatePositions();
        }

        // Camera zoom for decomp
        const dPhase = this.decompState ? this.decompState.phase : 0;
        let dp = 0;
        if (this.decompState && this.decompState.active) {
            const p = this.decompState.progress;
            dp = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        }

        const baseCamZ = 3.2;
        const targetCamZ = 7.0; 
        let camZ = baseCamZ;
        if (dPhase === 1) camZ = baseCamZ + (targetCamZ - baseCamZ) * dp;
        else if (dPhase === 2) camZ = targetCamZ;
        else if (dPhase === 0 && this.decompState.active) camZ = targetCamZ + (baseCamZ - targetCamZ) * (1 - dp);
        this.camera.position.z = camZ;

        // Smooth fold transition
        const diff = this.foldTarget - this.foldProgress;
        if (Math.abs(diff) > 0.001) {
            this.foldProgress += diff * 0.04;
            this._updatePositions();
        } else if (this.foldProgress !== this.foldTarget) {
            this.foldProgress = this.foldTarget;
            this._updatePositions();
        }

        // Hide when fully unfolded
        if (this.foldTarget === 0 && this.foldProgress === 0) {
            this.renderer.domElement.style.pointerEvents = 'none';
            this.renderer.domElement.style.opacity = '0';
            this.active = false;
        }

        // Wireframe sphere visibility
        if (dPhase > 0 || (dPhase === 0 && this.decompState && this.decompState.active)) {
            this.wireMesh.visible = false;
            if (this.wireMeshLeft) {
                this.wireMeshLeft.visible = true;
                this.wireMeshRight.visible = true;
                const sep = 1.6;
                let txLeft = 0, txRight = 0;
                if (dPhase === 1) { txLeft = -sep * dp; txRight = sep * dp; }
                else if (dPhase === 2) { txLeft = -sep; txRight = sep; }
                else if (dPhase === 0) { txLeft = -sep * dp; txRight = sep * dp; }
                this.wireMeshLeft.position.x = txLeft;
                this.wireMeshRight.position.x = txRight;
                this.wireMeshLeft.material.opacity = 0.06 * this.foldProgress;
                this.wireMeshRight.material.opacity = 0.06 * this.foldProgress;
            }
        } else {
            this.wireMesh.visible = true;
            this.wireMesh.material.opacity = 0.06 * this.foldProgress;
            if (this.wireMeshLeft) {
                this.wireMeshLeft.visible = false;
                this.wireMeshRight.visible = false;
            }
        }

        // Pulse animation — on-demand, single sweep
        if (this.pulseTime >= -1.5 && this.pulseTime <= this.maxLevel + 2) {
            this.pulseTime += 0.04;
            this.vertexPoints.material.uniforms.pulseFront.value = this.pulseTime;
            this.edgeLines.material.uniforms.pulseFront.value = this.pulseTime;
            if (this.pulseTime > this.maxLevel + 2) {
                this.pulseTime = -10; // done
                this.vertexPoints.material.uniforms.pulseFront.value = -10.0;
                this.edgeLines.material.uniforms.pulseFront.value = -10.0;
            }
        }

        // Rotate sphere group smoothly
        if (this.rotAnimating) {
            this.currentQuat.slerp(this.targetQuat, 0.08);
            this.sphereGroup.quaternion.copy(this.currentQuat);
            if (this.currentQuat.angleTo(this.targetQuat) < 0.001) {
                this.currentQuat.copy(this.targetQuat);
                this.sphereGroup.quaternion.copy(this.currentQuat);
                this.rotAnimating = false;
            }
        }

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}
