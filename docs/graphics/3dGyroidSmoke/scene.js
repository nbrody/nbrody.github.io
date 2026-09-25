export const ROOM_MIN = [-4, 0, -3.5];
export const ROOM_MAX = [4, 4.8, 3.5];
export const DEFAULT_CAMERA = { yaw: 0.68, pitch: 0.38, distance: 14.6 };

const fract = value => value - Math.floor(value);
const hash = value => fract(Math.sin(value * 127.1 + 311.7) * 43758.5453123);

/** Stable pitches occupy different X/Y/Z locations throughout the room. */
export function noteSource(voice, strength = 1) {
  const note = voice.note, channel = voice.channel || 0;
  const hue = note / 12;
  return {
    position: [
      0.16 + 0.68 * hash(note + channel * 137),
      0.13 + 0.47 * hash(note * 1.713 + channel * 19),
      0.16 + 0.68 * hash(note * 2.371 + channel * 47),
    ],
    color: [0, 1 / 3, 2 / 3].map(phase => 0.56 + 0.44 * Math.cos(2 * Math.PI * (hue + phase))),
    strength: Math.max(0, voice.level * voice.velocity * strength),
  };
}

export function cameraPosition(camera) {
  const radius = camera.distance * Math.cos(camera.pitch);
  return [Math.sin(camera.yaw) * radius, 2.15 + Math.sin(camera.pitch) * camera.distance, Math.cos(camera.yaw) * radius];
}
