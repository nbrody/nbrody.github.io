'use strict';
// Exercise the actual explorer's parameter construction without starting its UI.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../pgl2zp/app.js'), 'utf8');
const marker = '    readColors();\n    const resizeObserver';
assert(source.includes(marker));
const instrumented = source.replace(marker, '    globalThis.subject = { buildModel, isPrime };\n    return;\n    const resizeObserver');
const fakeElement = {getContext:()=>({}), addEventListener(){}, classList:{add(){},remove(){}}};
const context = vm.createContext({document:{getElementById:()=>fakeElement}, window:{addEventListener(){}}, console});
vm.runInContext(instrumented,context);
const {buildModel,isPrime}=context.subject;
for (const p of [3,5,7,97,997]) {
 assert.equal(isPrime(p),true);
 for (const family of ['minimal','uniform','all-prime']) {
  const m=buildModel(p,family);
  const [[a,b],[c,d]]=m.matrixA.map(row=>row.map(BigInt));
  const [[e,f],[g,h]]=m.matrixB.map(row=>row.map(BigInt));
  const q=BigInt(m.q);
  assert.equal(a*d-b*c,1n,`det A p=${p} ${family}`);
  assert.equal(e*h-f*g,1n,`det B p=${p} ${family}`);
  assert.equal(e,a);assert.equal(f,q*b);assert.equal(q*g,c);assert.equal(h,d);
  assert.equal(c%(2n*BigInt(p)),0n);
  assert.equal(g%(2n*BigInt(p)),0n);
  assert(m.certificate.margin>=0,`stability inequality p=${p} ${family}`);
 }
}
assert.equal(isPrime(1),false);assert.equal(isPrime(9),false);
console.log('PASS: exact determinants, conjugacy, congruences and displayed inequalities for 15 representative constructions.');
