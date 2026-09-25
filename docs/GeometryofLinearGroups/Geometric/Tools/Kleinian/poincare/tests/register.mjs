import { register } from 'node:module';
// Use the same vendored Three.js as the browser; no npm install is needed.
const three = new URL('../../vendor/three/three.module.js', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'three') return { url: ${JSON.stringify(three)}, shortCircuit: true };
    return nextResolve(specifier, context);
}`), import.meta.url);
