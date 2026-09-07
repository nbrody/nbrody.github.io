const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const path = require("node:path");
const context = vm.createContext({ console, Math: Object.create(Math) });
for (const file of ["data", "engine"])
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../js", file + ".js"), "utf8"),
    context,
    { filename: file + ".js" },
  );
function run(code) {
  return vm.runInContext(code, context);
}
function check(name, fn) {
  fn();
  console.log("✓ " + name);
}
run("rng=()=>.5");
check("All twelve domains preserve their intended matchups", () => {
  assert.equal(run('effectiveness("Sky","Sea")'), 2);
  assert.equal(run('effectiveness("Sea","Sky")'), 0.5);
  assert.equal(run('effectiveness("Sun","Underworld")'), 2);
  assert.equal(run('effectiveness("Underworld","Sun")'), 2);
  assert(
    run(
      'Object.keys(DOMAINS).every(d=>effectiveness("Herald",d)===1 && effectiveness(d,"Herald")===1)',
    ),
  );
});
check(
  "Every species has legal stats, moves, and move uses from levels 1–60",
  () => {
    assert(
      run(
        "Object.keys(SPECIES).every(k=>Array.from({length:60},(_,i)=>makeCreature(k,i+1)).every(c=>c.hp>0 && c.moves.length>0 && c.moves.length<=4 && c.moves.every(m=>MOVES[m] && c.pp[m]>0)))",
      ),
    );
  },
);
check(
  "Empty moves cannot be used; AI falls back to unlimited Last Resolve",
  () => {
    run(
      'var a=makeCreature("calfin",8),f=makeCreature("slithra",8);a.moves.forEach(k=>a.pp[k]=0);var hp=f.hp;actOnce(a,f,a.moves[0],"ally",[]);',
    );
    assert.equal(run("f.hp"), run("hp"));
    assert.equal(run("chooseAiMove(a,f)"), "struggle");
    run('actOnce(a,f,"struggle","ally",[])');
    assert(run("f.hp<hp"));
  },
);
check("Lyre shielding halves damage; full harmony amplifies damage", () => {
  run(
    'a=makeCreature("calfin",8);f=makeCreature("slithra",8);var normal=calcDamage(a,f,MOVES.tidalRam,[]);f.guarding=true;var guarded=calcDamage(a,f,MOVES.tidalRam,[]);f.guarding=false;a.resonance=true;var chorus=calcDamage(a,f,MOVES.tidalRam,[]);',
  );
  assert.equal(run("guarded"), run("Math.max(1,Math.floor(normal*.5))"));
  assert(run("chorus>normal"));
});
check("Battle event snapshots preserve damage order for animation", () => {
  run(
    'a=makeCreature("calfin",8);f=makeCreature("slithra",8);var events=resolveTurn(a,f,"tidalRam");var snapshots=events.filter(e=>e.t==="hp");',
  );
  assert(run("snapshots.length>=2"));
  assert(
    run(
      "snapshots[0].snapshot.ally.hp!==snapshots[1].snapshot.ally.hp || snapshots[0].snapshot.foe.hp!==snapshots[1].snapshot.foe.hp",
    ),
  );
});
check(
  "Both awakening milestones update names and stats without reviving fallen beasts",
  () => {
    run(
      'a=makeCreature("peeplet",15);var oldmax=a.maxhp;var up=gainXp(a,xpToNext(15));',
    );
    assert.equal(run("a.name"), "Aetion");
    assert(run("a.maxhp>oldmax"));
    assert(run('up[0].evolved.to==="Aetion"'));
    run('a=makeCreature("peeplet",31);a.hp=0;gainXp(a,xpToNext(31))');
    assert.equal(run("a.hp"), 0);
    assert.equal(run("a.name"), "Aetos Dios");
  },
);
check("Statuses, stages, healing, and move learning stay bounded", () => {
  run('a=makeCreature("calfin",8);a.hp=4;a.status="poison";endOfTurn(a,[]);');
  assert(run("a.hp>=0"));
  run('a=makeCreature("calfin",8);a.pp.headbutt=0;gainXp(a,xpToNext(8));');
  assert(
    run(
      'a.moves.includes("strategize") && a.pp.strategize===maxPP("strategize") && a.pp.headbutt===0',
    ),
  );
  run(
    'a.stages.def=2;actOnce(a,makeCreature("pupnos",8),"strategize","ally",[])',
  );
  assert.equal(run("a.stages.def"), 2);
});
console.log("All engine checks passed.");
