"use strict";
/* Dance of the Gods — data: domains (types), moves, species */

/* ---------------- DOMAINS ---------------- */
const DOMAINS = {
  Sky:       {god:"Zeus",       color:"#7fa8c9", adv:["Sea","War"]},
  Sea:       {god:"Poseidon",   color:"#2e7d78", adv:["Forge","Sun"]},
  Underworld:{god:"Hades",      color:"#6b5b8e", adv:["Sun","Love"]},
  Wisdom:    {god:"Athena",     color:"#c9b458", adv:["War","Sky"]},
  War:       {god:"Ares",       color:"#b03a2e", adv:["Harvest","Hunt"]},
  Love:      {god:"Aphrodite",  color:"#d98b9c", adv:["Wisdom","Wine"]},
  Sun:       {god:"Apollo",     color:"#e0a833", adv:["Underworld","Wine"]},
  Hunt:      {god:"Artemis",    color:"#8aa86b", adv:["Love","Harvest"]},
  Forge:     {god:"Hephaestus", color:"#e0914d", adv:["Hunt","Sky"]},   // bright bronze — #c96f3b vanished against the vase ground
  Herald:    {god:"Hermes",     color:"#d8cba8", adv:[]},
  Harvest:   {god:"Demeter",    color:"#b8963f", adv:["Sea","Underworld"]},
  Wine:      {god:"Dionysus",   color:"#8e3d5c", adv:["Wisdom","Forge"]},
};
function effectiveness(att, def){
  if (att==="Herald"||def==="Herald") return 1;
  if (DOMAINS[att].adv.includes(def)) return 2;
  if (DOMAINS[def].adv.includes(att)) return 0.5;
  return 1;
}

/* ---------------- MOVES ----------------
   cat: "phys" | "spec" | "status"
   fx: {status:"burn|poison|chill|sleep|charm", chance} or {buff:{stat,stages}} or {heal:frac}
*/
const MOVES = {
  headbutt:   {name:"Headbutt",     dom:"Herald", cat:"phys", pow:45, acc:100},
  hoot:       {name:"Hoot",         dom:"Wisdom", cat:"spec", pow:40, acc:100},
  nectarSip:  {name:"Nectar Sip",   dom:"Herald", cat:"status", fx:{heal:0.45}, desc:"restore"},
  thunderPeck:{name:"Thunder Peck", dom:"Sky",  cat:"phys", pow:65, acc:100},
  boltOfZeus: {name:"Bolt of Zeus", dom:"Sky",  cat:"spec", pow:75, acc:85, fx:{status:"burn",chance:.1}},
  tidalRam:   {name:"Tidal Ram",    dom:"Sea",  cat:"phys", pow:60, acc:100, fx:{status:"chill",chance:.1}},
  brineJet:   {name:"Brine Jet",    dom:"Sea",  cat:"spec", pow:65, acc:100},
  shadowFang: {name:"Shadow Fang",  dom:"Underworld", cat:"phys", pow:65, acc:100, fx:{status:"poison",chance:.15}},
  styxSurge:  {name:"Styx Surge",   dom:"Underworld", cat:"spec", pow:70, acc:90},
  aegisBash:  {name:"Aegis Bash",   dom:"Wisdom", cat:"phys", pow:60, acc:100},
  brightIdea: {name:"Bright Idea",  dom:"Wisdom", cat:"spec", pow:65, acc:100},
  strategize: {name:"Strategize",   dom:"Wisdom", cat:"status", fx:{buff:{stat:"def",stages:1}}, desc:"+Def"},
  gore:       {name:"Gore",         dom:"War",  cat:"phys", pow:75, acc:90},
  warCry:     {name:"War Cry",      dom:"War",  cat:"status", fx:{buff:{stat:"atk",stages:1}}, desc:"+Atk"},
  doveDart:   {name:"Dove Dart",    dom:"Love", cat:"phys", pow:50, acc:100, prio:1},
  heartRay:   {name:"Heart Ray",    dom:"Love", cat:"spec", pow:60, acc:100, fx:{status:"charm",chance:.2}},
  charmGaze:  {name:"Charm Gaze",   dom:"Love", cat:"status", fx:{status:"charm",chance:.8}, desc:"charms"},
  solarFlare: {name:"Solar Flare",  dom:"Sun",  cat:"spec", pow:70, acc:95, fx:{status:"burn",chance:.15}},
  sunlance:   {name:"Sunlance",     dom:"Sun",  cat:"phys", pow:60, acc:100},
  swiftArrow: {name:"Swift Arrow",  dom:"Hunt", cat:"phys", pow:55, acc:100, prio:1},
  moonVolley: {name:"Moon Volley",  dom:"Hunt", cat:"spec", pow:65, acc:95},
  bronzeClamp:{name:"Bronze Clamp", dom:"Forge",cat:"phys", pow:65, acc:95, fx:{status:"chill",chance:.15}},
  moltenSpit: {name:"Molten Spit",  dom:"Forge",cat:"spec", pow:65, acc:100, fx:{status:"burn",chance:.1}},
  trickJab:   {name:"Trick Jab",    dom:"Herald", cat:"phys", pow:55, acc:100, crit:.25},
  wingedStep: {name:"Wingèd Step",  dom:"Herald", cat:"status", fx:{buff:{stat:"spe",stages:1}}, desc:"+Spe"},
  vineLash:   {name:"Vine Lash",    dom:"Harvest", cat:"phys", pow:60, acc:100},
  sporeCloud: {name:"Spore Cloud",  dom:"Harvest", cat:"status", fx:{status:"sleep",chance:.7}, desc:"sleeps"},
  grainVolley:{name:"Grain Volley", dom:"Harvest", cat:"spec", pow:60, acc:100},
  frenzyClaw: {name:"Frenzy Claw",  dom:"Wine", cat:"phys", pow:70, acc:90},
  grapeShot:  {name:"Grape Shot",   dom:"Wine", cat:"spec", pow:55, acc:100, fx:{status:"sleep",chance:.1}},
};

/* ---------------- SPECIES (12 first stages) ----------------
   base: hp atk def gra aeg spe  |  sprite: draw fn key
   learn: [level, moveKey] pairs, ascending. Every beast starts with one
   weak move; a creature knows the LAST FOUR learnset entries at or below
   its level (movesAt in engine.js).
*/
const SPECIES = {
  peeplet:  {name:"Peeplet",  dom:"Sky",        base:[48,60,42,55,45,62], sprite:"eagle",
             learn:[[1,"headbutt"],[5,"thunderPeck"],[9,"wingedStep"],[13,"boltOfZeus"]]},
  calfin:   {name:"Calfin",   dom:"Sea",        base:[58,62,55,58,52,42], sprite:"bull",
             learn:[[1,"headbutt"],[5,"tidalRam"],[9,"strategize"],[13,"brineJet"]]},
  pupnos:   {name:"Pupnos",   dom:"Underworld", base:[55,62,50,45,45,50], sprite:"hound",
             learn:[[1,"headbutt"],[5,"shadowFang"],[9,"warCry"],[13,"styxSurge"]]},
  owlet:    {name:"Owlet",    dom:"Wisdom",     base:[50,42,52,62,62,48], sprite:"owl",
             learn:[[1,"hoot"],[5,"aegisBash"],[9,"strategize"],[13,"brightIdea"]]},
  piglos:   {name:"Piglos",   dom:"War",        base:[55,66,52,38,42,48], sprite:"boar",
             learn:[[1,"headbutt"],[5,"warCry"],[9,"vineLash"],[13,"gore"]]},
  dovie:    {name:"Dovie",    dom:"Love",       base:[50,45,45,58,55,60], sprite:"dove",
             learn:[[1,"doveDart"],[5,"heartRay"],[9,"charmGaze"],[13,"nectarSip"]]},
  slithra:  {name:"Slithra",  dom:"Sun",        base:[46,50,44,64,48,58], sprite:"serpent",
             learn:[[1,"headbutt"],[5,"sunlance"],[9,"nectarSip"],[13,"solarFlare"]]},
  fawnling: {name:"Fawnling", dom:"Hunt",       base:[48,65,44,56,48,66], sprite:"deer",
             learn:[[1,"headbutt"],[5,"swiftArrow"],[9,"wingedStep"],[13,"moonVolley"]]},
  cindercrab:{name:"Cindercrab",dom:"Forge",    base:[56,60,66,56,52,32], sprite:"crab",
             learn:[[1,"headbutt"],[5,"bronzeClamp"],[9,"strategize"],[13,"moltenSpit"]]},
  tortikin: {name:"Tortikin", dom:"Herald",     base:[48,46,54,46,50,66], sprite:"tortoise",
             learn:[[1,"headbutt"],[5,"trickJab"],[9,"wingedStep"],[13,"nectarSip"]]},
  seedviper:{name:"Seedviper",dom:"Harvest",    base:[52,54,50,54,52,46], sprite:"grainsnake",
             learn:[[1,"headbutt"],[5,"vineLash"],[9,"sporeCloud"],[13,"grainVolley"]]},
  cubvine:  {name:"Cubvine",  dom:"Wine",       base:[52,62,46,52,44,56], sprite:"panther",
             learn:[[1,"headbutt"],[5,"grapeShot"],[9,"warCry"],[13,"frenzyClaw"]]},
};

