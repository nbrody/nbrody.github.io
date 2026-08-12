"use strict";
/* Dance of the Gods — maps & myths.
   Each city stages one myth, driven by kind:"script" NPCs and a stage
   counter in state.ow.flags. Myth I — Delphi: Apollo & Eros (Ovid, Met. I).
   Tile legend lives in overworld.js drawTile. */

/* ---- grid helpers ---- */
function grid(w,h,fill){ return Array.from({length:h},()=>Array(w).fill(fill)); }
function fillRect(g,x0,y0,x1,y1,ch){ for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) if(g[y]&&g[y][x]!==undefined) g[y][x]=ch; }
function borderOf(g,ch){ const h=g.length,w=g[0].length; for(let x=0;x<w;x++){g[0][x]=ch;g[h-1][x]=ch;} for(let y=0;y<h;y++){g[y][0]=ch;g[y][w-1]=ch;} }

/* ---- Pimpleia — Orpheus's home village, under Olympus ---- */
function buildVillage(){
  const w=16,h=14, g=grid(w,h,".");
  borderOf(g,"T");
  g[0][7]=","; g[0][8]=",";               // north road gap
  for(let y=1;y<=12;y++){ g[y][7]=","; g[y][8]=","; }   // village road
  fillRect(g,2,2,5,4,"#");  g[4][3]="D";   // house A
  fillRect(g,10,2,13,4,"#"); g[4][11]="D"; // house B
  g[7][4]="O";                              // well
  g[6][2]="f"; g[6][13]="f"; g[9][3]="f"; g[9][12]="f"; g[10][13]="f";
  g[11][10]="S";                            // sign
  return {
    name:"Pimpleia", id:"village", grid:g, w, h,
    warps:{ "7,0":{map:"route",x:7,y:16,dir:"up"}, "8,0":{map:"route",x:8,y:16,dir:"up"} },
    signs:{ "10,11":"“PIMPLEIA, beneath Olympus — birthplace of Orpheus. The Grove Road runs north. Beware the tall grass.”" },
    encounters:null,
    npcs:[
      {x:8,y:1,dir:"down",sprite:"hermes",name:"Hermes",kind:"script",script:hermesGift},
      {x:5,y:8,dir:"down",sprite:"elder",name:"Elder Myrrha",kind:"heal",
       talk:["<b>Elder Myrrha</b>: “Orpheus. Even the cicadas hush when you pass — they are listening.”",
             "“Your mother sang these fields awake once. Go gently, and whenever your companions tire, return to me.”"]},
      {x:11,y:8,dir:"down",sprite:"child",name:"Village Child",kind:"npc",
       talk:["<b>Child</b>: “There's a stranger at the north gate with wings on his SHOES. Mama says don't stare at gods, but how can you not?”",
             "“Play beasts your lyre and throw a Clay Amphora when they're weak — they might join you!”"]},
    ],
  };
}

/* ================================================================
   THE GIFT OF HERMES — the game opens with no beasts. The god of
   roads waits at Pimpleia's gate with three companions: Peeplet /
   Calfin / Cindercrab (the chart's one true triangle:
   Sky > Sea > Forge > Sky). Choosing hands off to the pick screen
   (buildStarterPick in screens.js); he vanishes after the gift.
   ================================================================ */
async function hermesGift(npc){
  if(state.team.length>0){
    await owSay("<b>Hermes</b>: “Still here? Roads, singer. They're the whole point of me.”");
    return;
  }
  await owSay([
    "A traveler leans on the gatepost — winged sandals drumming the air, grin faster than thought.",
    "<b>Hermes</b>: “Orpheus! Fine lyre. I <i>made</i> the first one, you know — a tortoise did the hard part.”",
    "“The roads aren't safe for a lone singer just now; the beasts have forgotten their manners. So: a gift, from the god of travelers.”",
    "“Three companions I can spare — <b>Zeus's eagle chick</b>, <b>Poseidon's sea-calf</b>, and <b>the Smith's bronze crab</b>. Choose the one that sings back.”",
  ]);
  owActive=false;
  buildStarterPick();
  show("pick-screen");
}

/* ---- Grove Road — north to Delphi ---- */
function buildRoute(){
  const w=16,h=18, g=grid(w,h,".");
  borderOf(g,"T");
  g[17][7]=","; g[17][8]=",";              // south road gap (to village)
  for(let y=1;y<=16;y++){ g[y][7]=","; g[y][8]=","; }
  g[0][8]="S";                              // Delphi gate marker in the wall
  fillRect(g,2,3,5,6,"\"");                 // tall-grass fields
  fillRect(g,10,3,13,6,"\"");
  fillRect(g,2,11,5,14,"\"");
  fillRect(g,10,12,13,14,"\"");
  fillRect(g,11,7,13,8,"~");                // pond
  g[9][8]="R";                              // rock beside the choke point
  g[5][6]="T"; g[13][6]="T"; g[6][3]="f"; g[13][11]="f";
  return {
    name:"Grove Road", id:"route", grid:g, w, h,
    warps:{ "7,17":{map:"village",x:7,y:1,dir:"down"}, "8,17":{map:"village",x:8,y:1,dir:"down"} },
    signs:{ "8,0":"A sealed gate. “DELPHI — the way is barred. Return when the gods will it.”" },
    encounters:{ min:4, max:7, table:[
      {key:"seedviper",w:3},{key:"tortikin",w:3},{key:"dovie",w:2},
      {key:"slithra",w:2},{key:"fawnling",w:1},{key:"cubvine",w:1} ] },
    npcs:[
      {x:7,y:9,dir:"down",sprite:"kass",name:"Kass",kind:"trainer",defeated:false,
       team:["pupnos","slithra"], teamLv:[8,9], onDefeat:openDelphiGate,
       talk:["<b>Kass</b> blocks the road, amphorae at her belt.",
             "“The Cult of Typhon fears no lyre, singer. Show me your bond — or turn back.”"],
       after:["<b>Kass</b>: “…A true bond. Perhaps the Cult is wrong about your kind.”",
              "“The gate of Delphi stands open now. The god up there is in a savage mood — go hear it yourself.”"]},
    ],
  };
}

/* Kass falls → the sealed gate at the top of Grove Road opens. */
function openDelphiGate(){
  const r = MAPS.route;
  r.grid[0][7]=","; r.grid[0][8]=",";
  delete r.signs["8,0"];
  r.warps["7,0"]={map:"delphi",x:9,y:14,dir:"up"};
  r.warps["8,0"]={map:"delphi",x:10,y:14,dir:"up"};
}

/* ---- Delphi — Myth I: Apollo & Eros ---- */
function buildDelphi(){
  const w=20,h=16, g=grid(w,h,".");
  borderOf(g,"T");
  // south gate (from Grove Road)
  g[15][9]=","; g[15][10]=",";
  for(let y=8;y<=14;y++){ g[y][9]=","; g[y][10]=","; }
  // temple of Apollo
  fillRect(g,6,1,13,3,"#");
  g[3][9]="D";
  // marble plaza + colonnade
  fillRect(g,5,4,14,7,"m");
  g[4][6]="C"; g[4][8]="C"; g[4][11]="C"; g[4][13]="C";
  g[6][6]="O";                              // the Omphalos
  g[6][8]="Y";                              // Python, slain
  // the river Peneus, along the east bank
  fillRect(g,17,1,18,14,"~");
  g[9][16]="f"; g[12][16]="f";
  // west grove
  g[5][3]="T"; g[10][3]="T"; g[12][4]="T";
  g[7][2]="f"; g[11][2]="f";
  g[13][12]="S";
  g[1][4]="S";                              // Sacred Way marker, behind the temple
  return {
    name:"Delphi — Navel of the World", id:"delphi", grid:g, w, h,
    warps:{ "9,15":{map:"route",x:7,y:1,dir:"down"}, "10,15":{map:"route",x:8,y:1,dir:"down"} },
    signs:{ "12,13":"“DELPHI — navel of the world. Tread softly: the god is in high temper today.”",
            "4,1":"“Behind the temple climbs the SACRED WAY — barred until the god's temper settles.”" },
    encounters:null,
    npcs:[
      {x:9, y:6, dir:"left", sprite:"apollo", name:"Apollo", kind:"script", script:mythApollo},
      {x:12,y:6, dir:"left", sprite:"eros",   name:"Eros",   kind:"script", script:erosLines},
      {x:16,y:10,dir:"left", sprite:"daphne", name:"Daphne", kind:"script", script:daphneLines},
      {x:10,y:4, dir:"down", sprite:"pythia", name:"Pythia", kind:"heal",
       talk:["<b>Pythia</b>: “The god quarrels with Love upon his own doorstep. This will not end quietly.”",
             "“Rest your beasts, singer. Prophecy is kinder to the well-prepared.”"]},
      {x:4, y:10,dir:"right",sprite:"acolyte",name:"Temple Acolyte",kind:"trainer",defeated:false,
       team:["slithra","seedviper"], teamLv:[10,10],
       talk:["<b>Acolyte</b>: “Pilgrims must be proven! The god's light tests all who walk this plaza.”"],
       after:["<b>Acolyte</b>: “Proven. Forgive me — since the serpent fell, we are all on edge.”"]},
    ],
  };
}

function buildWorld(){
  return {
    village:buildVillage(), route:buildRoute(), delphi:buildDelphi(),
    sacredWay:buildSacredWay(), athens:buildAthens(),
    coastRoad:buildCoastRoad(), corinth:buildCorinth(),
  };
}
let MAPS = buildWorld();
/* Rebuild every map from scratch — fresh grids, NPCs, gates. */
function resetWorld(){ MAPS = buildWorld(); }

/* Myth I complete → the Sacred Way parts behind Delphi's temple. */
function openSacredWay(){
  const d = MAPS.delphi;
  d.grid[0][2]=","; d.grid[0][3]=",";
  d.warps["2,0"]={map:"sacredWay",x:1,y:12,dir:"up"};
  d.warps["3,0"]={map:"sacredWay",x:2,y:12,dir:"up"};
  d.signs["4,1"]="“Behind the temple climbs the SACRED WAY — to Cecropia and the lands of the east.”";
}
/* Myth II complete → the Coast Road south from Athens opens. */
function openCoastRoad(){
  const a = MAPS.athens;
  a.grid[17][10]=","; a.grid[17][11]=",";
  a.warps["10,17"]={map:"coastRoad",x:7,y:1,dir:"down"};
  a.warps["11,17"]={map:"coastRoad",x:8,y:1,dir:"down"};
  a.signs["12,16"]="“The COAST ROAD — south along the Saronic shore, to Corinth of the two seas.”";
}

/* ---- Sacred Way — the high road from Delphi toward Attica ---- */
function buildSacredWay(){
  const w=24,h=14, g=grid(w,h,".");
  borderOf(g,"T");
  // grass, water, features first — the road is carved after
  fillRect(g,3,2,10,4,"\"");
  fillRect(g,10,8,15,11,"\"");
  fillRect(g,17,2,21,4,"\"");
  fillRect(g,19,9,21,11,"~");
  g[3][14]="T"; g[9][4]="T"; g[4][12]="R";
  g[2][2]="f"; g[10][17]="f"; g[12][20]="f";
  // the winding road: up from Delphi, east along the ridge
  for(let y=11;y<=13;y++){ g[y][1]=","; g[y][2]=","; }
  for(let x=2;x<=6;x++) g[11][x]=",";
  for(let y=6;y<=11;y++){ g[y][6]=","; g[y][7]=","; }
  for(let x=6;x<=23;x++){ g[6][x]=","; g[7][x]=","; }
  g[10][3]="S";
  return {
    name:"The Sacred Way", id:"sacredWay", grid:g, w, h,
    warps:{ "1,13":{map:"delphi",x:2,y:1,dir:"down"}, "2,13":{map:"delphi",x:3,y:1,dir:"down"},
            "23,6":{map:"athens",x:1,y:8,dir:"right"}, "23,7":{map:"athens",x:1,y:9,dir:"right"} },
    signs:{ "3,10":"“THE SACRED WAY — Delphi behind you, Cecropia ahead. Sing as you walk; the stones remember.”" },
    encounters:{ min:5, max:9, table:[
      {key:"peeplet",w:3},{key:"dovie",w:2},{key:"owlet",w:2},
      {key:"tortikin",w:2},{key:"fawnling",w:2},{key:"cubvine",w:1} ] },
    npcs:[
      {x:12,y:8,dir:"up",sprite:"rhapsode",name:"Rhapsode Phemios",kind:"npc",
       talk:["<b>Phemios</b> tunes a battered lyre. “A colleague! Do you know the oldest song, singer?”",
             "“How infant <b>Hermes</b> stole Apollo's cattle, walked them backward to hide the trail — then paid for them with a <b>tortoise-shell lyre</b>, the first that ever sounded.”",
             "“Apollo laughed and called it a fair trade. Every lyre since — yours too — is that tortoise's grandchild.”"]},
      {x:16,y:6,dir:"down",sprite:"villager",name:"Pilgrim Iona",kind:"trainer",defeated:false,
       team:["owlet","dovie"], teamLv:[10,10],
       talk:["<b>Iona</b>: “I walk to every shrine in Hellas. My companions have walked farther — show me yours!”"],
       after:["<b>Iona</b>: “Well fought. The road east runs to Cecropia — kings' city, still waiting for a god to claim it.”"]},
    ],
  };
}

/* ---- Cecropia / Athens — Myth II: the Contest for the City ---- */
function buildAthens(){
  const w=22,h=18, g=grid(w,h,".");
  borderOf(g,"T");
  // west gate (from the Sacred Way)
  g[8][0]=","; g[9][0]=",";
  for(let x=1;x<=7;x++){ g[8][x]=","; g[9][x]=","; }
  // acropolis temple + plaza
  fillRect(g,8,1,15,3,"#");
  g[3][11]="D";
  fillRect(g,6,4,17,8,"m");
  g[4][8]="C"; g[4][10]="C"; g[4][13]="C"; g[4][15]="C";
  // south agora: houses + road down to the (closed) coast gate
  for(let y=10;y<=16;y++){ g[y][10]=","; g[y][11]=","; }
  fillRect(g,4,12,7,14,"#");  g[14][5]="D";
  fillRect(g,14,12,17,14,"#"); g[14][16]="D";
  g[6][2]="f"; g[12][2]="f"; g[11][19]="f"; g[16][3]="f";
  g[10][13]="S"; g[16][12]="S";
  return {
    name:"Cecropia — the Unnamed City", id:"athens", grid:g, w, h,
    warps:{ "0,8":{map:"sacredWay",x:22,y:6,dir:"left"}, "0,9":{map:"sacredWay",x:22,y:7,dir:"left"} },
    signs:{ "13,10":"“CECROPIA — the city has a king, but no god and no name. Two Olympians contend upon the rock.”",
            "12,16":"“The Coast Road to Corinth — closed while the city has no name.”" },
    encounters:null,
    npcs:[
      {x:11,y:7, dir:"down", sprite:"cecrops", name:"King Cecrops", kind:"script", script:mythAthens},
      {x:9, y:5, dir:"right",sprite:"athena",  name:"Athena",       kind:"script", script:athenaLines},
      {x:14,y:5, dir:"left", sprite:"poseidon",name:"Poseidon",     kind:"script", script:poseidonLines},
      {x:12,y:4, dir:"down", sprite:"pythia",  name:"Priestess Aglauros", kind:"heal",
       talk:["<b>Aglauros</b>: “Two gods on one rock, and the king between them. Rest your beasts — the earth itself may shake.”"]},
      {x:8, y:13,dir:"right",sprite:"philosopher",name:"Philosopher Timon",kind:"trainer",defeated:false,
       team:["owlet","slithra"], teamLv:[12,11],
       talk:["<b>Timon</b>: “A premise: all beasts act from nature. A test: whose nature is stronger — yours or mine?”"],
       after:["<b>Timon</b>: “Conclusion: yours. I shall revise my premises.”"]},
      {x:15,y:10,dir:"left", sprite:"child",   name:"Citizen",      kind:"npc",
       talk:["<b>Citizen</b>: “The king stands on the acropolis between the two gods. Whatever he decides, half the city will grumble.”"]},
    ],
  };
}

/* ---- Coast Road — south along the Saronic shore ---- */
function buildCoastRoad(){
  const w=16,h=20, g=grid(w,h,".");
  borderOf(g,"T");
  fillRect(g,2,3,5,7,"\"");
  fillRect(g,10,5,13,9,"\"");
  fillRect(g,2,11,5,15,"\"");
  fillRect(g,10,13,13,16,"\"");
  fillRect(g,12,17,14,18,"~");
  for(let y=1;y<=18;y++){ g[y][7]=","; g[y][8]=","; }
  g[0][7]=","; g[0][8]=","; g[19][7]=","; g[19][8]=",";
  g[10][8]="R";                             // rock chokepoint beside the hoplite
  g[2][5]="S"; g[8][14]="f"; g[17][2]="f";
  return {
    name:"The Coast Road", id:"coastRoad", grid:g, w, h,
    warps:{ "7,0":{map:"athens",x:10,y:16,dir:"up"}, "8,0":{map:"athens",x:11,y:16,dir:"up"},
            "7,19":{map:"corinth",x:9,y:1,dir:"down"}, "8,19":{map:"corinth",x:10,y:1,dir:"down"} },
    signs:{ "5,2":"“COAST ROAD — the Saronic glitters east. Corinth of the two seas lies south.”" },
    encounters:{ min:8, max:11, table:[
      {key:"calfin",w:3},{key:"cindercrab",w:2},{key:"piglos",w:2},
      {key:"seedviper",w:2},{key:"cubvine",w:2},{key:"dovie",w:1} ] },
    npcs:[
      {x:7,y:10,dir:"down",sprite:"hoplite",name:"Hoplite Drakon",kind:"trainer",defeated:false,
       team:["piglos","pupnos"], teamLv:[12,12],
       talk:["<b>Drakon</b> plants his spear across the road. “None pass to Corinth unproven. Phalanx — forward!”"],
       after:["<b>Drakon</b>: “You'd have made a fine shield-mate. Pass — and mind the harbor crowds.”"]},
      {x:11,y:16,dir:"left",sprite:"sailor",name:"Fisher Halios",kind:"trainer",defeated:false,
       team:["calfin"], teamLv:[13],
       talk:["<b>Halios</b>: “The sea gives and the sea takes. Today it gives you a fight!”"],
       after:["<b>Halios</b>: “Hah! Fair catch. May the Sea-lord mind your sails, singer.”"]},
    ],
  };
}

/* ---- Corinth — mistress of two seas (Myths III & XI to come) ---- */
function buildCorinth(){
  const w=20,h=16, g=grid(w,h,".");
  borderOf(g,"T");
  // north gate (from the Coast Road)
  g[0][9]=","; g[0][10]=",";
  for(let y=1;y<=10;y++){ g[y][9]=","; g[y][10]=","; }
  // agora + the fountain of Pirene
  fillRect(g,6,5,13,8,"m");
  g[6][8]="O";
  // houses
  fillRect(g,2,3,5,5,"#");  g[5][3]="D";
  fillRect(g,14,3,17,5,"#"); g[5][15]="D";
  // the harbor of Lechaion
  fillRect(g,1,12,18,14,"~");
  for(const [x,y] of [[9,11],[10,11],[9,12],[10,12],[9,13],[10,13]]) g[y][x]=",";  // the dock
  g[9][4]="S"; g[8][1]="S"; g[10][13]="S";
  g[9][17]="f"; g[3][7]="f";
  return {
    name:"Corinth — Mistress of Two Seas", id:"corinth", grid:g, w, h,
    warps:{ "9,0":{map:"coastRoad",x:7,y:18,dir:"up"}, "10,0":{map:"coastRoad",x:8,y:18,dir:"up"} },
    signs:{ "4,9":"“CORINTH — mistress of two seas. Above you broods Acrocorinth, Aphrodite's mountain.”",
            "1,8":"“Road to Sparta — washed out by the spring floods. The engineers blame Poseidon; the engineers always blame Poseidon.”",
            "13,10":"“Harbor of Lechaion. Sailors swear a winged shadow crosses the moon on clear nights.”" },
    encounters:null,
    npcs:[
      {x:12,y:6,dir:"down",sprite:"priestessA",name:"Priestess of Aphrodite",kind:"heal",
       talk:["<b>Priestess</b>: “From Acrocorinth the Lady watches every harbor and every heart.”",
             "“She loves a good story, singer. Ask me someday how the Smith caught War and Love in a net of gold — but not while the acolytes are listening.”"]},
      {x:7,y:7,dir:"right",sprite:"bellerophon",name:"Bellerophon",kind:"npc",
       talk:["<b>Bellerophon</b> stares into the fountain of Pirene, a coil of golden rope in his lap.",
             "“Every night the same dream: a winged horse drinks here, white as sea-foam. A goddess hands me a golden bridle.”",
             "“The seer says: sleep a night in Athena's temple and the dream will finish itself. Perhaps when you return, singer, you'll find me in the sky.”"]},
      {x:6,y:10,dir:"right",sprite:"villager",name:"Merchant",kind:"npc",
       talk:["<b>Merchant</b>: “Two seas, two harbors, one toll road between — everything crosses Corinth, friend, including trouble.”"]},
      {x:11,y:10,dir:"left",sprite:"sailor",name:"Bosun Okypete",kind:"trainer",defeated:false,
       team:["calfin","dovie"], teamLv:[13,12],
       talk:["<b>Okypete</b>: “Fresh off the road? Harbor rule: new faces spar the bosun. In you go!”"],
       after:["<b>Okypete</b>: “You'd survive a squall, I'd wager. Welcome to Corinth.”"]},
    ],
  };
}

/* ================================================================
   MYTH II — The Contest for the City (Athens).
   Apollodorus III.14; Herodotus VIII.55; Ovid, Met. VI (the weaving).
   Staged on state.ow.flags.athens:
     0 — the gods present themselves; Poseidon strikes the salt spring
     1 — Athena plants the olive
     2 — Cecrops judges; the city is named; the Coast Road opens
     3 — done (idle lines)
   ================================================================ */
const mythAthensStage = ()=> state.ow.flags.athens||0;

async function mythAthens(npc){
  const M = MAPS.athens, st = mythAthensStage();
  const athena = M.npcs.find(n=>n.name==="Athena");
  const poseidon = M.npcs.find(n=>n.name==="Poseidon");
  if(st===0){
    await owSay([
      "<b>King Cecrops</b> — man above, serpent below the waist — coils uneasily between the two Olympians.",
      "<b>Cecrops</b>: “Singer of Pimpleia, you come in a heavy hour. Two gods claim my city, and I — half snake, half king — must choose between them.”",
      "<b>Poseidon</b>: “Choose swiftly, then.” The Earth-Shaker lifts his trident and strikes the rock of the acropolis—",
      "The stone splits! Salt water leaps up, a spring where no spring was — it tastes of the sea, of harbors, of fleets without number.",
      "<b>Poseidon</b>: “Mastery of the waves, king. Every ship that swims will call your city mother. What can the weaving-girl set against the ocean?”",
    ]);
    M.grid[6][9]="~"; M.grid[6][10]="~";
    poseidon.x=11; poseidon.y=6; poseidon.dir="left";
    state.ow.flags.athens=1;
    $("ow-hint").textContent="Poseidon has made his gift. Speak with Cecrops again…";
  } else if(st===1){
    await owSay([
      "<b>Athena</b> says nothing. She kneels, grey eyes calm, and presses something small into a crack of the rock.",
      "Slowly — root, trunk, silver leaf — an <b>olive tree</b> rises where her hand rested. The first olive tree in the world.",
      "<b>Athena</b>: “Oil for the lamp and the wound. Fruit for the table. Wood for the hearth. Peace, king — a tree that outlives the planter, and feeds her grandchildren.”",
      "The crowd of citizens has gone very quiet.",
    ]);
    M.grid[6][14]="v";
    athena.x=13; athena.y=6; athena.dir="right";
    state.ow.flags.athens=2;
    $("ow-hint").textContent="Two gifts stand upon the rock. Cecrops must judge.";
  } else if(st===2){
    await owSay([
      "<b>Cecrops</b> looks long at the salt spring, and long at the silver tree.",
      "<b>Cecrops</b>: “The sea we would have loved anyway, Lord Poseidon — no sailor can help it. But the olive… the olive is a gift only a guardian would think of.”",
      "<b>Cecrops</b>: “The city is <b>Athena's</b>. Let it bear her name: <b>ATHENS</b>.”",
      "<b>Poseidon</b> turns without a word. Far below, the harbor water drops a full hand's breadth — the god withdrawing his breath.",
      "<b>Athena</b>: “He will sulk a generation and love the city anyway. Singer — you witness well. Take the road south with my favor; your beasts are made whole.”",
    ]);
    state.team.forEach(healFull); state.caught.forEach(healFull);
    M.name = "Athens — City of the Olive";
    if(state.ow.map===M){ $("ow-place").textContent=M.name; $("brand-sub").textContent=M.name; }
    poseidon.dir="down";
    openCoastRoad();
    state.ow.flags.athens=3;
    $("ow-hint").textContent="Myth II complete — Athens is named. The Coast Road lies open.";
  } else {
    await owSay("<b>Cecrops</b>: “A spring of salt and a tree of silver — and my little rock chose well. Go gently on the roads, singer.”");
  }
}

async function athenaLines(){
  const st = mythAthensStage();
  if(st===0) await owSay("<b>Athena</b>: “The Earth-Shaker will strike first — he always strikes first. Watch what endures, singer, not what astonishes.”");
  else if(st===1) await owSay("<b>Athena</b>: “My gift is planted. Now the king must weigh a wonder against a livelihood.”");
  else if(st===2) await owSay("<b>Athena</b>: “Judgment sits heavy on half-serpent shoulders. Give him a moment.”");
  else await owSay("<b>Athena</b>: “Guard the tree, and the tree guards you. That is the whole treaty, and it has never been broken.”");
}

async function poseidonLines(){
  const st = mythAthensStage();
  if(st===0) await owSay("<b>Poseidon</b>: “Stand back from the rock, mortal. The sea is about to arrive.”");
  else if(st<3) await owSay("<b>Poseidon</b>: “A puddle of oil against the whole grey ocean. Let the snake-king choose — and let him remember tides turn.”");
  else await owSay("<b>Poseidon</b>: “…Keep your olive city. But every one of her ships will still ask <i>my</i> leave.” The god almost smiles. Almost.");
}

/* ================================================================
   MYTH I — Apollo & Eros (& Daphne).  Ovid, Metamorphoses I.
   Staged on state.ow.flags.delphi:
     0 — Apollo boasts over Python; Eros looses the two arrows
     1 — the chase by the river Peneus; Daphne becomes the laurel
     2 — the first laurel crown; the god's favor (full heal)
     3 — done (idle lines)
   ================================================================ */
const mythStage = ()=> state.ow.flags.delphi||0;

async function mythApollo(npc){
  const M = MAPS.delphi, st = mythStage();
  const daphne = M.npcs.find(n=>n.name==="Daphne");
  if(st===0){
    await owSay([
      "<b>Apollo</b> stands over the slain serpent — radiant, terrible, and terribly pleased with himself.",
      "<b>Apollo</b>: “Look well, singer! Python, dread of Delphi, brought down by <i>my</i> arrows. Name me an archer my equal!”",
      "From the colonnade comes a small laugh. <b>Eros</b> leans against a column, a little bow across his shoulder.",
      "<b>Eros</b>: “You shoot serpents, son of Leto. I shoot hearts. Shall we see whose arrow flies farther?”",
      "<b>Apollo</b>: “Boy. Keep your torch and your dimples, and leave the bow to gods who wage true war.”",
      "<b>Eros</b> answers nothing. He draws <b>two arrows</b> — one of bright gold, one of dull lead…",
      "The golden shaft takes <b>Apollo</b> through the heart. The leaden one hums away toward the river — and finds the nymph <b>Daphne</b>.",
    ]);
    npc.x=14; npc.y=10; npc.dir="right";
    daphne.dir="up";
    state.ow.flags.delphi=1;
    $("ow-hint").textContent="Apollo has run to the river Peneus. Follow the myth…";
  } else if(st===1){
    await owSay([
      "<b>Apollo</b>: “Nymph! Daughter of Peneus, stay! It is no enemy who follows you — Delphi is mine, Delos is mine, and my father is Zeus!”",
      "<b>Daphne</b> flees along the bank, swifter than wind, and lovelier for her flight.",
      "<b>Daphne</b>: “Father Peneus! If your waters keep any power — unmake this shape that has pleased too well!”",
      "The river hears. Heaviness takes her limbs; thin bark closes over her breast; her hair bursts into leaves, her arms into branches…",
      "Where she ran, a <b>laurel</b> stands trembling at the water's edge.",
    ]);
    daphne.gone=true;
    M.grid[10][16]="L";
    npc.x=15; npc.y=10; npc.dir="right";
    state.ow.flags.delphi=2;
    $("ow-hint").textContent="Speak with Apollo, beside the laurel.";
  } else if(st===2){
    await owSay([
      "<b>Apollo</b> lays his hand on the young bark — and feels the heart still beating under it.",
      "<b>Apollo</b>: “Since you cannot be my bride, you will be my tree. My hair, my lyre, my quiver will wear you — laurel, evergreen, as my love.”",
      "The branches bow, as if consenting. He twines a sprig into the first <b>laurel crown</b>.",
      "<b>Apollo</b>: “You saw it all, singer — my glory and my folly in one morning. Remember what the small god's arrow did to the great one's pride.”",
    ]);
    state.team.forEach(healFull); state.caught.forEach(healFull);
    state.ow.flags.delphi=3;
    state.ow.flags.laurel=true;
    openSacredWay();
    $("ow-hint").textContent="Myth I complete — the Sacred Way opens behind the temple.";
    await owSay("A warmth settles over your amphorae — <b>the god's favor</b>. Your companions are fully restored.");
    await owSay("Behind the temple, the wood parts like a curtain: the <b>Sacred Way</b> climbs east, toward Cecropia.");
  } else {
    await owSay("<b>Apollo</b>: “Evergreen,” he says, to no one in particular. “Evergreen.”");
  }
}

async function erosLines(){
  const st = mythStage();
  if(st===0) await owSay("<b>Eros</b>: “Watch closely, singer. The Far-Shooter is about to learn how far a <i>little</i> arrow can go.”");
  else if(st===1) await owSay("<b>Eros</b>: “Gold for the pursuer, lead for the pursued. He called my bow a toy — toys, then, for the god of archery.”");
  else await owSay("<b>Eros</b>: “A crown of leaves for a god's first heartbreak. Sing that one, Orpheus — they'll weep for centuries.”");
}

async function daphneLines(){
  const st = mythStage();
  if(st===0) await owSay("<b>Daphne</b>: “The god's boasting scatters the river birds. I keep to the bank, where it is quiet, and no one asks for my hand.”");
  else await owSay("<b>Daphne</b>: “Let me be! No bridegroom, no chase — the river is my home!”");
}
