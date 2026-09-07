"use strict";
/* Dance of the Gods — data: domains (types), moves, species */

/* ---------------- DOMAINS ---------------- */
const DOMAINS = {
  Sky: { god: "Zeus", color: "#7fa8c9", adv: ["Sea", "War"] },
  Sea: { god: "Poseidon", color: "#2e7d78", adv: ["Forge", "Sun"] },
  Underworld: { god: "Hades", color: "#6b5b8e", adv: ["Sun", "Love"] },
  Wisdom: { god: "Athena", color: "#c9b458", adv: ["War", "Sky"] },
  War: { god: "Ares", color: "#b03a2e", adv: ["Harvest", "Hunt"] },
  Love: { god: "Aphrodite", color: "#d98b9c", adv: ["Wisdom", "Wine"] },
  Sun: { god: "Apollo", color: "#e0a833", adv: ["Underworld", "Wine"] },
  Hunt: { god: "Artemis", color: "#8aa86b", adv: ["Love", "Harvest"] },
  Forge: { god: "Hephaestus", color: "#e0914d", adv: ["Hunt", "Sky"] }, // bright bronze — #c96f3b vanished against the vase ground
  Herald: { god: "Hermes", color: "#d8cba8", adv: [] },
  Harvest: { god: "Demeter", color: "#b8963f", adv: ["Sea", "Underworld"] },
  Wine: { god: "Dionysus", color: "#8e3d5c", adv: ["Wisdom", "Forge"] },
};
function effectiveness(att, def) {
  if (att === "Herald" || def === "Herald") return 1;
  if (DOMAINS[att].adv.includes(def)) return 2;
  if (DOMAINS[def].adv.includes(att)) return 0.5;
  return 1;
}

/* ---------------- MOVES ----------------
   cat: "phys" | "spec" | "status"
   fx: {status:"burn|poison|chill|sleep|charm", chance} or {buff:{stat,stages}} or {heal:frac}
*/
const MOVES = {
  headbutt: { name: "Headbutt", dom: "Herald", cat: "phys", pow: 45, acc: 100 },
  hoot: { name: "Hoot", dom: "Wisdom", cat: "spec", pow: 40, acc: 100 },
  nectarSip: {
    name: "Nectar Sip",
    dom: "Herald",
    cat: "status",
    fx: { heal: 0.45 },
    desc: "restore",
  },
  thunderPeck: {
    name: "Thunder Peck",
    dom: "Sky",
    cat: "phys",
    pow: 65,
    acc: 100,
  },
  boltOfZeus: {
    name: "Bolt of Zeus",
    dom: "Sky",
    cat: "spec",
    pow: 75,
    acc: 85,
    fx: { status: "burn", chance: 0.1 },
  },
  tidalRam: {
    name: "Tidal Ram",
    dom: "Sea",
    cat: "phys",
    pow: 60,
    acc: 100,
    fx: { status: "chill", chance: 0.1 },
  },
  brineJet: { name: "Brine Jet", dom: "Sea", cat: "spec", pow: 65, acc: 100 },
  shadowFang: {
    name: "Shadow Fang",
    dom: "Underworld",
    cat: "phys",
    pow: 65,
    acc: 100,
    fx: { status: "poison", chance: 0.15 },
  },
  styxSurge: {
    name: "Styx Surge",
    dom: "Underworld",
    cat: "spec",
    pow: 70,
    acc: 90,
  },
  aegisBash: {
    name: "Aegis Bash",
    dom: "Wisdom",
    cat: "phys",
    pow: 60,
    acc: 100,
  },
  brightIdea: {
    name: "Bright Idea",
    dom: "Wisdom",
    cat: "spec",
    pow: 65,
    acc: 100,
  },
  strategize: {
    name: "Strategize",
    dom: "Wisdom",
    cat: "status",
    fx: { buff: { stat: "def", stages: 1 } },
    desc: "+Def",
  },
  gore: { name: "Gore", dom: "War", cat: "phys", pow: 75, acc: 90 },
  warCry: {
    name: "War Cry",
    dom: "War",
    cat: "status",
    fx: { buff: { stat: "atk", stages: 1 } },
    desc: "+Atk",
  },
  doveDart: {
    name: "Dove Dart",
    dom: "Love",
    cat: "phys",
    pow: 50,
    acc: 100,
    prio: 1,
  },
  heartRay: {
    name: "Heart Ray",
    dom: "Love",
    cat: "spec",
    pow: 60,
    acc: 100,
    fx: { status: "charm", chance: 0.2 },
  },
  charmGaze: {
    name: "Charm Gaze",
    dom: "Love",
    cat: "status",
    fx: { status: "charm", chance: 0.8 },
    desc: "charms",
  },
  solarFlare: {
    name: "Solar Flare",
    dom: "Sun",
    cat: "spec",
    pow: 70,
    acc: 95,
    fx: { status: "burn", chance: 0.15 },
  },
  sunlance: { name: "Sunlance", dom: "Sun", cat: "phys", pow: 60, acc: 100 },
  swiftArrow: {
    name: "Swift Arrow",
    dom: "Hunt",
    cat: "phys",
    pow: 55,
    acc: 100,
    prio: 1,
  },
  moonVolley: {
    name: "Moon Volley",
    dom: "Hunt",
    cat: "spec",
    pow: 65,
    acc: 95,
  },
  bronzeClamp: {
    name: "Bronze Clamp",
    dom: "Forge",
    cat: "phys",
    pow: 65,
    acc: 95,
    fx: { status: "chill", chance: 0.15 },
  },
  moltenSpit: {
    name: "Molten Spit",
    dom: "Forge",
    cat: "spec",
    pow: 65,
    acc: 100,
    fx: { status: "burn", chance: 0.1 },
  },
  trickJab: {
    name: "Trick Jab",
    dom: "Herald",
    cat: "phys",
    pow: 55,
    acc: 100,
    crit: 0.25,
  },
  wingedStep: {
    name: "Wingèd Step",
    dom: "Herald",
    cat: "status",
    fx: { buff: { stat: "spe", stages: 1 } },
    desc: "+Spe",
  },
  vineLash: {
    name: "Vine Lash",
    dom: "Harvest",
    cat: "phys",
    pow: 60,
    acc: 100,
  },
  sporeCloud: {
    name: "Spore Cloud",
    dom: "Harvest",
    cat: "status",
    fx: { status: "sleep", chance: 0.7 },
    desc: "sleeps",
  },
  grainVolley: {
    name: "Grain Volley",
    dom: "Harvest",
    cat: "spec",
    pow: 60,
    acc: 100,
  },
  frenzyClaw: {
    name: "Frenzy Claw",
    dom: "Wine",
    cat: "phys",
    pow: 70,
    acc: 90,
  },
  grapeShot: {
    name: "Grape Shot",
    dom: "Wine",
    cat: "spec",
    pow: 55,
    acc: 100,
    fx: { status: "sleep", chance: 0.1 },
  },
};

/* ---------------- SPECIES (12 first stages) ----------------
   base: hp atk def gra aeg spe  |  sprite: draw fn key
   learn: [level, moveKey] pairs, ascending. Every beast starts with one
   weak move; a creature knows the LAST FOUR learnset entries at or below
   its level (movesAt in engine.js).
*/
const SPECIES = {
  peeplet: {
    name: "Brontlet",
    category: "Stormcloud eaglet",
    personality:
      "Puffs up its cloud-ruff before every challenge. Its tiny thunderclaps are mostly bravado.",
    lore: "Zeus's eagle and thunderbolt become a chick whose storm feathers are still growing.",
    dom: "Sky",
    base: [48, 60, 42, 55, 45, 62],
    sprite: "eagle",
    learn: [
      [1, "headbutt"],
      [5, "thunderPeck"],
      [9, "wingedStep"],
      [13, "boltOfZeus"],
    ],
  },
  calfin: {
    name: "Calfin",
    category: "Breaker calf",
    personality:
      "Greets friends with a wave of its horns and a nudge strong enough to topple a picnic.",
    lore: "Poseidon's sea and bull imagery meet in a calf shaped by breaking surf.",
    dom: "Sea",
    base: [58, 62, 55, 58, 52, 42],
    sprite: "bull",
    learn: [
      [1, "headbutt"],
      [5, "tidalRam"],
      [9, "strategize"],
      [13, "brineJet"],
    ],
  },
  pupnos: {
    name: "Wickpup",
    category: "Waylight hound",
    personality:
      "Pretends it isn't sleepy. Its tail-light stays on until every companion has found the camp.",
    lore: "A gentle echo of Cerberus, the hound guarding Hades's realm; its lantern is an original guiding-spirit motif.",
    dom: "Underworld",
    base: [55, 62, 50, 45, 45, 50],
    sprite: "hound",
    learn: [
      [1, "headbutt"],
      [5, "shadowFang"],
      [9, "warCry"],
      [13, "styxSurge"],
    ],
  },
  owlet: {
    name: "Glyphet",
    category: "Living-script owl",
    personality:
      "Tilts its head whenever you make a poor decision. Usually knows a better one.",
    lore: "Athena's owl, olive, and wisdom become scroll-like feathers and watchful bronze eye markings.",
    dom: "Wisdom",
    base: [50, 42, 52, 62, 62, 48],
    sprite: "owl",
    learn: [
      [1, "hoot"],
      [5, "aegisBash"],
      [9, "strategize"],
      [13, "brightIdea"],
    ],
  },
  piglos: {
    name: "Clashog",
    category: "Shield-rush boar",
    personality:
      "Challenges boulders to staring contests. Leans against friends as fiercely as it charges foes.",
    lore: "Ares's martial character inspires its shield-hide and crest. A boar-form Ares appears in one tradition about Adonis.",
    dom: "War",
    base: [55, 66, 52, 38, 42, 48],
    sprite: "boar",
    learn: [
      [1, "headbutt"],
      [5, "warCry"],
      [9, "vineLash"],
      [13, "gore"],
    ],
  },
  dovie: {
    name: "Dovelace",
    category: "Rose-knot dove",
    personality:
      "Insists that everyone at camp make up before bedtime. Takes matchmaking far too seriously.",
    lore: "Aphrodite's dove and rose imagery become petal wings and a tail that ties a living love-knot.",
    dom: "Love",
    base: [50, 45, 45, 58, 55, 60],
    sprite: "dove",
    learn: [
      [1, "doveDart"],
      [5, "heartRay"],
      [9, "charmGaze"],
      [13, "nectarSip"],
    ],
  },
  slithra: {
    name: "Solisk",
    category: "Sundial serpent",
    personality:
      "Always finds the warmest stone. Looks unbearably pleased when its little predictions come true.",
    lore: "An original solar reinterpretation of the serpent at Delphi, joining the Python story to Apollo's light and prophecy.",
    dom: "Sun",
    base: [46, 50, 44, 64, 48, 58],
    sprite: "serpent",
    learn: [
      [1, "headbutt"],
      [5, "sunlance"],
      [9, "nectarSip"],
      [13, "solarFlare"],
    ],
  },
  fawnling: {
    name: "Cresfawn",
    category: "Moonbow hind",
    personality:
      "Plays hide-and-seek without announcing the game. Returns the moment a friend truly needs it.",
    lore: "Artemis's Ceryneian hind lends its golden antlers and bronze hooves; the antlers grow into a moonlit bow.",
    dom: "Hunt",
    base: [48, 65, 44, 56, 48, 66],
    sprite: "deer",
    learn: [
      [1, "headbutt"],
      [5, "swiftArrow"],
      [9, "wingedStep"],
      [13, "moonVolley"],
    ],
  },
  cindercrab: {
    name: "Kilnclaw",
    category: "Walking kiln crab",
    personality:
      "Fixes buckles while you sleep and waits proudly for someone to notice. Hums when its kiln is warm.",
    lore: "An invented crab automaton inspired by Hephaestus's living craft and metalwork; the crab is not his historical sacred animal.",
    dom: "Forge",
    base: [56, 60, 66, 56, 52, 32],
    sprite: "crab",
    learn: [
      [1, "headbutt"],
      [5, "bronzeClamp"],
      [9, "strategize"],
      [13, "moltenSpit"],
    ],
  },
  tortikin: {
    name: "Lyretto",
    category: "Lyre-shell courier",
    personality:
      "Steals the shortest route, then waits smugly at the crossroads. Its shell hums along with your lyre.",
    lore: "Hermes made the first lyre from a tortoise shell; this courier grows its own strings and little messenger wings.",
    dom: "Herald",
    base: [48, 46, 54, 46, 50, 66],
    sprite: "tortoise",
    learn: [
      [1, "headbutt"],
      [5, "trickJab"],
      [9, "wingedStep"],
      [13, "nectarSip"],
    ],
  },
  seedviper: {
    name: "Sheafang",
    category: "Harvest dormouse",
    personality:
      "Packs its cheeks for the whole camp, then shyly offers the biggest seed to whoever looks hungry.",
    lore: "Demeter's wheat, barley, and poppies inspire this generous granary dormouse. Its leafy ears and grain pouches are an invented hybrid, not a historical sacred animal.",
    dom: "Harvest",
    base: [52, 54, 50, 54, 52, 46],
    sprite: "harvestmouse",
    learn: [
      [1, "headbutt"],
      [5, "vineLash"],
      [9, "sporeCloud"],
      [13, "grainVolley"],
    ],
  },
  cubvine: {
    name: "Revelcub",
    category: "Festival panther",
    personality:
      "Turns every rest stop into a festival. Steals one fig, then offers you half with a shameless grin.",
    lore: "Dionysus's panther, ivy, grapes, and theater meet in a cub with vine-tendrils and comedy-mask markings.",
    dom: "Wine",
    base: [52, 62, 46, 52, 44, 56],
    sprite: "panther",
    learn: [
      [1, "headbutt"],
      [5, "grapeShot"],
      [9, "warCry"],
      [13, "frenzyClaw"],
    ],
  },
};

const ITEMS = {
  amphora: {
    name: "Clay amphora",
    desc: "Befriend a wild beast. Weaken it and play your lyre to improve the chance.",
    price: 8,
  },
  nectar: {
    name: "Nectar",
    desc: "Restore 35 health to a conscious companion.",
    price: 12,
  },
  remedy: {
    name: "Mountain herbs",
    desc: "Clear a companion's burn, poison, chill, sleep, or charm.",
    price: 10,
  },
  ambrosia: {
    name: "Ambrosia",
    desc: "Fully restore a companion, even if it has fallen. Replenishes move uses.",
    price: 35,
  },
};
const EVOLUTIONS = {
  peeplet: ["Aetion", "Aetos Dios"],
  calfin: ["Wavebull", "Taurios"],
  pupnos: ["Dihound", "Cerberos"],
  owlet: ["Glaucon", "Glaux Sophos"],
  piglos: ["Warthos", "Phalanboar"],
  dovie: ["Columbra", "Peristera"],
  slithra: ["Solserp", "Pythonos"],
  fawnling: ["Cerynhind", "Elaphos Chrysos"],
  cindercrab: ["Bronzeclaw", "Automax"],
  tortikin: ["Swiftshell", "Chelys Hermao"],
  seedviper: ["Granibble", "Thesmora"],
  cubvine: ["Vinther", "Pantheros"],
};
// Each awakening has its own portrait and field-note personality.
const EVOLUTION_DETAILS = {
  peeplet: [
    {
      category: "Storm-wing eagle",
      personality:
        "Practices thunderous entrances, then checks whether anyone was startled.",
    },
    {
      category: "Thunderhead sovereign",
      personality:
        "Waits out every storm beside its flock, no matter how loudly the heavens call.",
    },
  ],
  calfin: [
    {
      category: "Reefbreaker bull",
      personality:
        "Escorts tiny swimmers through rough water and pretends the rescue was a race.",
    },
    {
      category: "Tide-crowned aurochs",
      personality:
        "Lowers its tremendous horns so children can tie seashells to them.",
    },
  ],
  pupnos: [
    {
      category: "Twin-lantern hound",
      personality:
        "One head keeps watch while the other insists it is still early enough for a nap.",
    },
    {
      category: "Three-watch gatekeeper",
      personality:
        "All three heads agree on one rule: no companion crosses the dark alone.",
    },
  ],
  owlet: [
    {
      category: "Atlas-wing owl",
      personality:
        "Reorders the camp's maps overnight and acts surprised when nobody can find them.",
    },
    {
      category: "Living-archive owl",
      personality:
        "Remembers every promise ever made beneath its wings, especially the kind ones.",
    },
  ],
  piglos: [
    {
      category: "Shieldback boar",
      personality:
        "Plants itself between danger and its friends, then refuses to admit it was worried.",
    },
    {
      category: "Living phalanx",
      personality:
        "Stands guard long after everyone is safe, pretending it simply enjoys the view.",
    },
  ],
  dovie: [
    {
      category: "Petal-wing dove",
      personality:
        "Settles quarrels with a sweeping bow, then waits very patiently for applause.",
    },
    {
      category: "Rosewoven sovereign",
      personality:
        "Offers its finest feather to the guest who arrived feeling least welcome.",
    },
  ],
  slithra: [
    {
      category: "Noon-dial cobra",
      personality:
        "Predicts the afternoon weather with great ceremony, even when the sky is perfectly clear.",
    },
    {
      category: "Solar oracle serpent",
      personality:
        "Answers urgent questions at dawn, but insists every prophecy begin with breakfast.",
    },
  ],
  fawnling: [
    {
      category: "Moonstring runner",
      personality:
        "Runs circles around impatient hunters, then quietly guides lost travelers home.",
    },
    {
      category: "Golden moonbow hind",
      personality:
        "Leaves a trail of silver hoofprints only for travelers who have lost their way.",
    },
  ],
  cindercrab: [
    {
      category: "Bellows-shell crab",
      personality:
        "Inspects every broken pot it passes and offers repairs before introductions.",
    },
    {
      category: "Walking forge citadel",
      personality:
        "Repairs the village gates, then engraves a tiny crab where nobody will notice.",
    },
  ],
  tortikin: [
    {
      category: "Lyre runner tortoise",
      personality:
        "Delivers messages before the sender finishes rehearsing them.",
    },
    {
      category: "Sky-song messenger",
      personality:
        "Carries the news of home farther than any road, humming every name it remembers.",
    },
  ],
  cubvine: [
    {
      category: "Ivy-masked panther",
      personality:
        "Turns every practice hunt into a game and always lets the smallest cub win.",
    },
    {
      category: "Festival-crowned panther",
      personality:
        "Makes the grandest entrance, then spends the evening beside the shyest guest.",
    },
  ],
  seedviper: [
    {
      category: "Seedkeeper dormouse",
      personality:
        "Counts everyone's supper twice, then quietly adds a little extra.",
    },
    {
      category: "Granary guardian",
      personality:
        "Never lets a winter guest leave hungry, even when it means emptying its own stores.",
    },
  ],
};
MOVES.struggle = {
  name: "Last Resolve",
  dom: "Herald",
  cat: "phys",
  pow: 35,
  acc: 100,
};
function maxPP(key) {
  const m = MOVES[key];
  return m.cat === "status" ? 5 : m.pow >= 70 ? 8 : 15;
}
function restorePP(c) {
  c.pp = Object.fromEntries(c.moves.map((k) => [k, maxPP(k)]));
}
function creatureStage(level) {
  return level >= 32 ? 2 : level >= 16 ? 1 : 0;
}
function creatureBase(key, level) {
  const stage = creatureStage(level);
  return SPECIES[key].base.map((b) => Math.round(b * (1 + stage * 0.24)));
}
function creatureName(key, level) {
  const stage = creatureStage(level);
  return stage ? EVOLUTIONS[key][stage - 1] : SPECIES[key].name;
}
