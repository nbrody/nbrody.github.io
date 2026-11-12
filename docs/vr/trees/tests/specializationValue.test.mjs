import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSpecialization} from '../js/specializationValue.js';
test('rational specialization uses exact arithmetic',()=>{
  const x=parseSpecialization('Q','1/3');assert.equal(x.n,1n);assert.equal(x.d,3n);
  for(const v of ['0','t','1/0','i'])assert.throws(()=>parseSpecialization('Q',v));
});
test('complex specialization uses the desktop expression parser',()=>{
  const x=parseSpecialization('i','pi+2i');assert.ok(Math.abs(x[0]-Math.PI)<1e-14);assert.equal(x[1],2);
  const y=parseSpecialization('omega','ω');assert.ok(Math.abs(y[0]+.5)<1e-14);assert.ok(Math.abs(y[1]-Math.sqrt(3)/2)<1e-14);
  for(const v of ['0','1/0','t'])assert.throws(()=>parseSpecialization('i',v));
});
