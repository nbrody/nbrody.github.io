// textures.js
// Texture and color management for wall materials

import * as THREE from 'three';

let b4lTexture = null;

// Create B4L logo texture (quartered circle pattern)
// This creates a texture designed for spherical UV mapping
export function createB4LTexture() {
  const width = 512;
  const height = 256; // Only need half height for hemisphere
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Create texture in spherical coordinates (longitude x latitude)
  // For each pixel, determine if it should be black or white based on
  // which quadrant it falls in when mapped to a sphere

  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Convert pixel position to spherical coordinates
      const u = x / width; // longitude: 0 to 1 (0° to 360°)
      const v = y / height; // latitude: 0 to 1 (for hemisphere)

      // Convert to angles
      const phi = u * Math.PI * 2; // 0 to 2π (longitude)
      const theta = v * Math.PI / 2; // 0 to π/2 (latitude for hemisphere)

      // Project to Cartesian coordinates on unit hemisphere
      const px = Math.sin(theta) * Math.cos(phi);
      const py = Math.sin(theta) * Math.sin(phi);

      // Determine quadrant based on x,y position
      // Looking down at hemisphere from above (z-axis)
      // B4L logo: 3 white quadrants, 1 black quadrant
      // Using standard coordinates: +x = right, +y = forward
      let isWhite;
      if (px < 0 && py < 0) {
        // Bottom-left quadrant - BLACK (the only black quadrant)
        isWhite = false;
      } else {
        // All other quadrants - WHITE
        // Top-left (px < 0, py >= 0)
        // Top-right (px >= 0, py >= 0)
        // Bottom-right (px >= 0, py < 0)
        isWhite = true;
      }

      const idx = (y * width + x) * 4;
      const color = isWhite ? 255 : 0;
      data[idx] = color;     // R
      data[idx + 1] = color; // G
      data[idx + 2] = color; // B
      data[idx + 3] = 255;   // A
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

// Interpolate between two hex colors
export function lerpColorHex(hex1, hex2, t) {
  const c1 = new THREE.Color(hex1);
  const c2 = new THREE.Color(hex2);
  // clamp t to [0,1]
  const u = Math.min(1, Math.max(0, t || 0));
  return c1.lerp(c2, u);
}

// Get color for an index based on the selected palette
export function colorForIndex(si, total, colorPalette = 'bluegold') {
  if (colorPalette === 'monochrome') {
    return new THREE.Color('skyblue');
  }
  if (colorPalette === 'random') {
    // completely random on each render
    return new THREE.Color(Math.random() * 0xffffff);
  }
  if (colorPalette === 'bluegold') {
    // Smooth interpolation between UC blue and gold
    const start = 0x003660; // #003660
    const end = 0xFEBC11; // #FEBC11
    const denom = Math.max(1, (total || 1) - 1);
    const t = (typeof si === 'number') ? (si / denom) : 0.5;
    return lerpColorHex(start, end, t);
  }
  if (colorPalette === 'tealfuchsia') {
    const stops = [0x23bbad, 0x25d9c8, 0x2abed9, 0xff6da2, 0xf92672];
    const denom = Math.max(1, (total || 1) - 1);
    let t = (typeof si === 'number') ? (si / denom) : 0.5;
    // Bias toward the end color (fuchsia) — exponent < 1 pushes values toward 1
    t = Math.pow(t, 0.65);
    const seg = 1 / (stops.length - 1);
    const idx = Math.min(stops.length - 2, Math.floor(t / seg));
    const localT = (t - idx * seg) / seg;
    return lerpColorHex(stops[idx], stops[idx + 1], localT);
  }
  if (colorPalette === 'ucpure') {
    // Alternate between UC blue and gold
    return (si % 2 === 0) ? new THREE.Color(0x003660) : new THREE.Color(0xFEBC11);
  }
  if (colorPalette === 'b4l') {
    // B4L logo pattern: alternating black and white quadrants
    return (si % 2 === 0) ? new THREE.Color(0x000000) : new THREE.Color(0xFFFFFF);
  }
  // default: harmonic palette
  const c = new THREE.Color();
  c.setHSL(si / Math.max(1, total), 0.65, 0.58);
  return c;
}

// Create wall material with appropriate color/texture
export function createWallMaterial(si, total, wallOpacity = 0.4, colorPalette = 'bluegold') {
  const color = colorForIndex(si, total, colorPalette);
  const materialProps = {
    transparent: true,
    opacity: wallOpacity,
    side: THREE.DoubleSide,
    metalness: 0.2,
    roughness: 0.6
  };

  if (colorPalette === 'b4l') {
    if (!b4lTexture) {
      b4lTexture = createB4LTexture();
    }
    // Use the texture directly - spherical UV mapping will wrap it
    // The hemisphere is rotated -90° on X axis, showing the "top" half
    // With standard spherical UVs, this should display the circular pattern correctly
    return new THREE.MeshStandardMaterial({
      ...materialProps,
      map: b4lTexture,
      color: 0xFFFFFF, // Use white to show texture properly
      emissive: 0x000000,
      emissiveIntensity: 0
    });
  } else {
    return new THREE.MeshStandardMaterial({
      ...materialProps,
      color
    });
  }
}
