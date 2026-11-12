import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGenerators } from '../js/generatorData.js';
import { applyExpressionKey, expressionKeyRows } from '../js/xrKeypad.js';

test('validate rational and complex-field generator entries atomically',()=>{
  const cases=[['Q',[['1','(t+1)/(t-1)','0','1']]],['i',[['1','i*t','0','1']]],['omega',[['1','ω*t','0','1']]]];
  for(const [field,entries] of cases){const out=validateGenerators(field,entries);assert.deepEqual(out.generators,entries);assert.equal(out.matrices.length,1);assert.notEqual(out.generators,entries);}
});
test('reject invalid, singular, empty and wrong-field generators',()=>{
  for(const entries of [[['1','0','0','0']],[['1','','0','1']],[['1','i','0','1']]])assert.throws(()=>validateGenerators('Q',entries));
  assert.throws(()=>validateGenerators('i',[['0','0','0','0']]),/zero matrix/);
  assert.throws(()=>validateGenerators('i',[]));
  assert.equal(validateGenerators('i',Array.from({length:9},()=>['1','0','0','1'])).generators.length,9);
});
test('keypad builds, clears and removes field-aware expressions',()=>{
  let s='';for(const key of ['(','t','+','1',')','/','2'])s=applyExpressionKey(s,key);assert.equal(s,'(t+1)/2');
  assert.equal(applyExpressionKey('ω','⌫'),'');assert.equal(applyExpressionKey('abc','Clear'),'');
  assert.ok(expressionKeyRows({field:'omega'}).flat().includes('ω'));
  assert.ok(expressionKeyRows({mode:'complex'}).flat().includes('π'));
});
