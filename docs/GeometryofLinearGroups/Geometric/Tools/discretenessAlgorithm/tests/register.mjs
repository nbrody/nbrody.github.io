// Resolve the bare 'three' import of poincare's modules to its vendored copy, as its own tests do.
import { register } from 'node:module';
const three = new URL('../../Kleinian/vendor/three/three.module.js', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'three') return { url: ${JSON.stringify(three)}, shortCircuit: true };
    return nextResolve(specifier, context);
}`), import.meta.url);
