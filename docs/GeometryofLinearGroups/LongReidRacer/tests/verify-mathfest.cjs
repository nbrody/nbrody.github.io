// Exercise the canonical game.js with real math/graph code and a simulated
// MathFest parent; run `node verify-mathfest.cjs [canonical-directory]`.
'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const elements = new Map();
for (const id of ['matrix-display','height-value','solution-progress','arrow-instructions','ui-layer','title-screen','btn-up','btn-left','btn-right','btn-down','mobile-autoplay-btn']) {
  elements.set(id, {style:{}, innerText:'', innerHTML:'', addEventListener(){}});
}
const windowHandlers = new Map();
const documentHandlers = new Map();
const fakeParent = {};
let now = 0, nextId = 1;
const timers = new Map(), rafs = [];
const window = {
  parent: fakeParent,
  location: {origin:'http://localhost', search:'?embed=true', href:'http://localhost/LongReidRacer/?embed=true'},
  addEventListener(name, cb) { (windowHandlers.get(name) || windowHandlers.set(name, []).get(name)).push(cb); },
};
const document = {
  getElementById(id) { return elements.get(id) || null; },
  addEventListener(name, cb) { (documentHandlers.get(name) || documentHandlers.set(name, []).get(name)).push(cb); },
};
const context = vm.createContext({
  window, document,
  location:window.location,
  URL, URLSearchParams,
  performance:{now:() => now},
  requestAnimationFrame:cb => { rafs.push(cb); return nextId++; },
  cancelAnimationFrame(){},
  setTimeout: (cb, delay=0) => { const id=nextId++; timers.set(id, {cb, due:now+delay}); return id; },
  clearTimeout:id => timers.delete(id),
  Render:{start(){}, resetVictoryScroll(){}},
  console,
});
for (const name of ['math.js', 'cayley.js', 'solution.js', 'game.js']) {
  const filename = path.join(dir, 'js', name);
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, {filename});
}
function state() { return vm.runInContext('({started:Game.started,won:Game.hasWon,moving:Game.isMoving,history:Game.history.join(""),key:Game.current.key,height:Game.current.height})',context); }
function emit(cmd, origin='http://localhost', source=fakeParent) {
  const callbacks=windowHandlers.get('message') || [];
  assert(callbacks.length, 'game must register MathFest message listener');
  callbacks.forEach(cb => cb({data:{type:'tutorial',cmd}, source, origin}));
}
function finishAnimation() {
  now += 1000;
  while (rafs.length) { const callbacks=rafs.splice(0); callbacks.forEach(cb=>cb(now)); }
}
function stepTimers(limit=1000) {
  let steps=0;
  while(timers.size && steps++ < limit) {
    const [id, timer]=[...timers.entries()].sort((a,b)=>a[1].due-b[1].due)[0];
    timers.delete(id); now=Math.max(now,timer.due); timer.cb();
    finishAnimation();
  }
  assert(steps<limit, 'autoplay must terminate');
}
assert.equal(state().started,false,'game starts on title screen');
emit('next','https://other.example');
assert.equal(state().started,false,'cross-origin message is ignored');
emit('next','http://localhost',{});
assert.equal(state().started,false,'message not from parent is ignored');
emit('next');
assert.equal(state().started,true,'first next starts game');
assert.equal(state().history,'','first next only dismisses title');
emit('next'); finishAnimation();
assert.equal(state().history,'a','second next steps first solution move');
emit('next'); finishAnimation();
assert.equal(state().history,'aa','next steps second solution move');
emit('next'); finishAnimation();
assert.equal(state().history,'aab','next steps third solution move');
emit('prev'); finishAnimation();
assert.equal(state().history,'aa','prev undoes last move');
emit('next'); finishAnimation();
assert.equal(state().history,'aab','next after prev replays the undone move');
emit('reset');
assert.equal(state().history,'','reset clears history');
assert.equal(state().height,0,'reset returns to height zero');
emit('autoplay'); stepTimers();
assert.equal(state().won,true,'autoplay reaches victory');
assert.equal(state().height,0,'autoplay result is integral');
assert.equal(state().history.length,82,'autoplay completed the 82-step witness');
emit('reset');
assert.equal(state().won,false,'reset dismisses victory');
assert.equal(state().history,'','reset after victory clears history');
emit('autoplay');
assert(timers.size>0,'autoplay schedules subsequent moves');
emit('reset');
assert.equal(timers.size,0,'reset cancels scheduled autoplay');
assert.equal(state().history,'','reset during autoplay clears history');
window.location.origin='null';
emit('next','null'); finishAnimation();
assert.equal(state().history,'a','file-origin parent message is supported');
console.log('PASS: MathFest next, prev, reset and autoplay against real game code');
