#!/usr/bin/env node
/* Dance of the Gods — generate beast art with nano-banana (Gemini image gen).
   Usage:
     GEMINI_API_KEY=... node tools/gen-beasts.mjs            # all 12
     GEMINI_API_KEY=... node tools/gen-beasts.mjs owlet calfin  # some
     node tools/gen-beasts.mjs --force                        # regenerate existing
   Output: assets/gen/beasts/<key>.png  (the art layer in js/art.js picks
   them up automatically; delete the folder or use ?art=vector to revert). */

import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "assets", "gen", "beasts");
const MODEL = process.env.GEN_MODEL || "gemini-2.5-flash-image";
const KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

const STYLE = `Ancient Greek black-figure pottery painting, 6th-century-BC Attic vase style:
a single creature as a bold solid BLACK silhouette with fine cream-colored incised
line details (like sgraffito through slip) and exactly ONE accent color as noted.
Flat, completely uniform terracotta-orange background (#C96F3B), edge to edge —
no border, no frame, no text, no ground line, no other objects. The creature is
centered, full body, FACING LEFT, filling most of the frame. Charming, slightly
cute proportions — this is a first-stage creature companion in a video game.`;

const BEASTS = {
  peeplet:   `A plump eagle CHICK of Zeus: round teardrop body, stubby wings, oversized round eye, small zigzag LIGHTNING BOLT crest on its head. Accent color: storm blue-grey (#7fa8c9) for the beak and lightning crest.`,
  calfin:    `A stocky SEA-CALF (baby bull) of Poseidon: barrel body, short sturdy legs, two horns shaped like curling ocean WAVES, a wave pattern incised on its flank, tail ending in a kelp sprig. Accent color: deep sea teal (#2e7d78) for horns and kelp tail.`,
  pupnos:    `A sitting underworld PUPPY of Hades: black hound pup with very tall pointed ears, one small fang, a spiked collar, smoke-curl tail. Accent color: dusky violet (#6b5b8e) for the spiked collar, nose and eye-ring.`,
  owlet:     `A little OWL of Athena (glaux): egg-shaped body, two ENORMOUS round staring eyes ringed in gold, small horn tufts, chevron feather marks incised on the chest. Accent color: olive-gold (#c9b458) for the eye rings and beak.`,
  piglos:    `A charging BOAR PIGLET of Ares: wedge-shaped body leaning into a charge, one upturned tusk, a mohawk crest of stiff bristles along its spine. Accent color: blood red (#b03a2e) for the bristle mohawk and hoof-caps.`,
  dovie:     `An elegant DOVE of Aphrodite: sleek teardrop body, long pointed tail with incised feather lines, folded wing, a tiny floating HEART above its head. Accent color: rose pink (#d98b9c) for the heart crest and beak.`,
  slithra:   `A coiled SUN-SERPENT of Apollo: snake coiled in a tapering tower of three coils, head raised inside a radiant SUN HALO of rays, forked tongue. Accent color: golden yellow (#e0a833) for the sun halo, tongue and a diamond mark on the coil.`,
  fawnling:  `A leaping FAWN of Artemis: slender deer fawn mid-leap, legs stretched fore and aft, incised slip spots on its flanks, tiny antler nubs. Accent: GOLD (#e0a833) hooves and antler nubs (the golden hind's child).`,
  cindercrab:`A bronze AUTOMATON CRAB of Hephaestus: riveted dome shell with visible plate seams, two mismatched claws (left one bigger), eyes on stalks, a small flame venting from the top of the shell. Accent color: bright bronze (#e0914d) for rivets, flame and claw tips.`,
  tortikin:  `A SPRINTING TORTOISE of Hermes: low tortoise at a full run with motion lines, its shell is a LYRE — incised strings across the dome and a crossbar — with two small wings swept back on the shell. Accent color: pale gold (#d8cba8) for the wings and lyre crossbar.`,
  seedviper: `A wheat-crowned GRAIN SERPENT of Demeter: thick snake gliding in an S-curve, crowned with three golden WHEAT EARS growing from its head, diamond marks incised down its back. Accent color: harvest gold (#b8963f) for the wheat crown.`,
  cubvine:   `An ivy-wreathed PANTHER CUB of Dionysus: chunky playful cub in a crouch, big head, round ears, an IVY WREATH around its brow, long tail ending in an ivy leaf, mischievous grin. Accent color: wine purple-red (#8e3d5c) for the ivy wreath, nose and tail leaf.`,
};

const force = process.argv.includes("--force");
const only = process.argv.slice(2).filter(a=>!a.startsWith("--"));
const keys = only.length ? only : Object.keys(BEASTS);

if(!KEY){
  console.error("No GEMINI_API_KEY / GOOGLE_API_KEY in the environment.");
  console.error("Get one at https://aistudio.google.com/apikey then re-run.");
  process.exit(1);
}

mkdirSync(OUT, {recursive:true});

async function genOne(key){
  const out = join(OUT, `${key}.png`);
  if(existsSync(out) && !force){ console.log(`skip ${key} (exists; --force to redo)`); return; }
  const prompt = `${STYLE}\n\nThe creature: ${BEASTS[key]}`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
    { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ contents:[{parts:[{text:prompt}]}] }) });
  if(!res.ok){ throw new Error(`${key}: HTTP ${res.status} ${(await res.text()).slice(0,300)}`); }
  const data = await res.json();
  const part = data.candidates?.[0]?.content?.parts?.find(p=>p.inlineData);
  if(!part) throw new Error(`${key}: no image in response`);
  writeFileSync(out, Buffer.from(part.inlineData.data, "base64"));
  console.log(`wrote ${out}`);
}

for(const key of keys){
  if(!BEASTS[key]){ console.error(`unknown beast: ${key}`); continue; }
  try{ await genOne(key); }
  catch(e){ console.error(String(e.message||e)); }
}
