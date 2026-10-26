// The shared exact number-ring engine (Algebraic/Tools/numberRings/ringEngine.js) is a classic UMD
// script. In the browser (page or module worker) importing it runs it and it sets
// self.NumberRingEngine; in Node the import gives its module.exports as the default export.
const mod = await import('../../../../Algebraic/Tools/numberRings/ringEngine.js');
export const RE = (mod && mod.default) || globalThis.NumberRingEngine;
if (!RE) throw new Error('could not load ringEngine.js');
export const RI = RE._internal;
