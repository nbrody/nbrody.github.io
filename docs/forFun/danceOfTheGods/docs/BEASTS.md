# DANCE OF THE GODS — The Bestiary

Twelve original animal-and-concept families with 36 illustrated forms, each grounded in its existing divine domain. The illustrations use expressive faces, bold silhouettes, rich color, and transparent backgrounds. Myth supplies the starting point; lantern anatomy, sundial coils, and walking kilns are original inventions.

All twelve first-stage families have front and rear battle illustrations. The homepage and overworld use full-color, lightly simplified versions of the Calfin and Cresfawn PNGs alongside an illustrated Orpheus. Their anatomy, expressions, colors, and signature markings are preserved; only fine surface texture is reduced. World artwork prompts are in [`world/prompts.json`](../assets/gen/world/prompts.json). The field guide has three stage selectors and a front/back view switch for first forms. All 24 level-16 and level-32 awakenings have distinct front portraits, silhouettes, and personalities; their front art is used on both sides of battle. The complete evolution prompts are in [`evolutions/prompts.json`](../assets/gen/beasts/evolutions/prompts.json). Stable internal species keys preserve existing saves. The built-in image generator produced these assets; exact prompts and design metadata are in [`prompts.json`](../assets/gen/beasts/prompts.json). Open **Meet the beasts** from the title or the field guide from the journal.

**Reading the numbers.** Base stats are `HP / Attack / Defense / Grace (sp.
atk) / Aegis (sp. def) / Speed`, on a scale where ~45 is poor, ~55 solid, ~65
excellent for a first stage. Learnsets list `level — move`. Matchups come from
the implemented chart (see `DESIGN.md` §2): each domain strikes two at
2× and suffers two weaknesses.

**On bonds.** Amphorae bind a beast's *body*; only regard binds the rest. Each
line takes to its Keeper differently, and Orpheus — who can hear them — hears
exactly how. This section is written as guidance for dialogue, battle flavor
text, and eventually the Blessing system (a bond made mechanical).

---

## 1. Brontlet → Aetion → Aetos Dios — the Eagle of Zeus (Sky)

**Hybrid.** Stormcloud eaglet.

**Appearance.** A puff-chested eaglet whose down forms thunderclouds, with slate zigzag wing tips, copper talons, and a gold lightning crest. A lifted foot and cocked brow make its confidence hilariously larger than its wings.

**Personality.** Puffs up its cloud-ruff before every challenge. Its tiny thunderclaps are mostly bravado.

**Mythic root.** Zeus's eagle and thunderbolt become a chick whose storm feathers are still growing.

**Awakenings.** At level 16, **Aetion**, the storm-wing eagle: Practices thunderous entrances, then checks whether anyone was startled. At level 32, **Aetos Dios**, the thunderhead sovereign: Waits out every storm beside its flock, no matter how loudly the heavens call.

**In battle.** `48 / 60 / 42 / 55 / 45 / 62` — a fast mixed attacker with
paper defenses. It hits first and hopes.
Learnset: `1 — Headbutt · 5 — Thunder Peck · 9 — Wingèd Step · 13 — Bolt of
Zeus`. Strikes 2× at Sea and War; weak to Wisdom and Forge (the owl outthinks
the storm; bronze does not conduct grudges).

**With its master.** Brontlet imprints instantly, totally, and upward: it rides
on heads. Not shoulders — heads. It regards its Keeper as a slower, wingless
mother and treats every battle as a chance to prove it was worth hatching. It
shrieks at anything that startles its master, including doors. An Aetos Dios
never rides heads; it circles a half-mile up, invisible — and lands on the
outstretched arm at the moment of need, always exactly on time, the way
thunder is.

## 2. Calfin → Wavebull → Taurios — the Bull of Poseidon (Sea)

**Hybrid.** Breaker calf.

**Appearance.** A turquoise bull calf with breaking-wave horns, a foamy mane, sea-stone hooves, and a kelp-fluke tail. It leans into an affectionate nudge; even its rounded silhouette has the weight of a rolling breaker.

**Personality.** Greets friends with a wave of its horns and a nudge strong enough to topple a picnic.

**Mythic root.** Poseidon's sea and bull imagery meet in a calf shaped by breaking surf.

**Awakenings.** At level 16, **Wavebull**, the reefbreaker bull: Escorts tiny swimmers through rough water and pretends the rescue was a race. At level 32, **Taurios**, the tide-crowned aurochs: Lowers its tremendous horns so children can tie seashells to them.

**In battle.** `58 / 62 / 55 / 58 / 52 / 42` — the tank of the starter
triangle: even everywhere, slow, and stubborn as a harbor stone.
Learnset: `1 — Headbutt · 5 — Tidal Ram · 9 — Strategize · 13 — Brine Jet`.
Strikes 2× at Sun and Forge (water quenches both); weak to Sky and Harvest
(the storm rides above; the shore drinks the sea).

**With its master.** Calfin loves like the tide: without hurry and without
exception. It leans. Fifty pounds of affectionate sea-calf, leaning, all the
time — Keepers of Calfin stand at a permanent five-degree list. It will place
itself between its master and anything it distrusts, which is everything new,
for about a minute, until the new thing is also family. A Taurios does not
lean; it stands at its Keeper's side like a second horizon, and harbors feel
safer when the two of them walk the dock.

## 3. Wickpup → Dihound → Cerberos — the Hound of Hades (Underworld)

**Hybrid.** Waylight hound.

**Appearance.** A soft charcoal puppy with a lantern glowing through the rib-like fur of its chest. Lilac wisps tip its floppy ears and curled tail. Those two ear-lights foreshadow the extra heads of its awakenings; its offered paw makes the Underworld feel welcoming.

**Personality.** Pretends it isn't sleepy. Its tail-light stays on until every companion has found the camp.

**Mythic root.** A gentle echo of Cerberus, the hound guarding Hades's realm; its lantern is an original guiding-spirit motif.

**Awakenings.** At level 16, **Dihound**, the twin-lantern hound: One head keeps watch while the other insists it is still early enough for a nap. At level 32, **Cerberos**, the three-watch gatekeeper: All three heads agree on one rule: no companion crosses the dark alone.

**In battle.** `55 / 62 / 50 / 45 / 45 / 50` — a physical bruiser that trades
special bulk for bite. Shadow Fang's poison makes it a war of attrition it
usually wins.
Learnset: `1 — Headbutt · 5 — Shadow Fang · 9 — War Cry · 13 — Styx Surge`.
Strikes 2× at Love and Sun — and Sun strikes 2× back: the Underworld and the
day are mutually at total war, the chart's one two-way feud. Weak also to
Harvest (Demeter reaches into the dark and takes her daughter back).

**With its master.** Wickpup guards. That is the whole relationship, and it is
bottomless. It sleeps facing the door. It walks between its Keeper and the
edge of every cliff, bridge, and dock. It does not want to be praised so much
as *counted on*, and it can tell the difference. The dead do not frighten it,
so a Keeper of Wickpup stops being frightened of them too, which is the pup's
real gift. Cerberos guards three things at once forever: the door, the master,
and the master's name.

## 4. Glyphet → Glaucon → Glaux Sophos — the Owl of Athena (Wisdom)

**Hybrid.** Living-script owl.

**Appearance.** A round owl with scroll-like parchment feathers, curled page eyebrows, olive sprigs, and bronze eye rims. One wing rests at its beak as if it has already found the flaw in your argument. Its markings suggest writing without containing readable text.

**Personality.** Tilts its head whenever you make a poor decision. Usually knows a better one.

**Mythic root.** Athena's owl, olive, and wisdom become scroll-like feathers and watchful bronze eye markings.

**Awakenings.** At level 16, **Glaucon**, the atlas-wing owl: Reorders the camp's maps overnight and acts surprised when nobody can find them. At level 32, **Glaux Sophos**, the living-archive owl: Remembers every promise ever made beneath its wings, especially the kind ones.

**In battle.** `50 / 42 / 52 / 62 / 62 / 48` — the special wall: modest speed,
feeble arm, and the best twinned Grace/Aegis of any first stage.
Learnset: `1 — Hoot · 5 — Aegis Bash · 9 — Strategize · 13 — Bright Idea`.
Strikes 2× at Sky and War (wisdom beats both storm and rage); weak to Love and
Wine, the two things no philosopher has ever out-argued.

**With its master.** Glyphet does not obey; it *concurs*. Commands are received
as proposals, considered on their merits, and — almost always — executed, with
a small hoot that means *I was going to suggest that*. It perches on the lyre's
crossbar while Orpheus plays, closing its eyes at the good parts, which is the
highest review it gives. A Keeper who makes a genuinely bad decision will find
Glaux Sophos already positioned where the mistake is going to land, waiting,
not saying anything. It is insufferable. It is also never wrong.

## 5. Clashog → Warthos → Phalanboar — the Boar of Ares (War)

**Hybrid.** Shield-rush boar.

**Appearance.** A red boar with bronze shield scutes growing from its shoulders and a sweeping helmet-crest mane. Its broad muzzle, lowered brow, and planted hooves say that retreat has never occurred to it. Phalanboar replaces the old final name Kalydon: this line belongs to Ares, while the Calydonian boar was sent by Artemis.

**Personality.** Challenges boulders to staring contests. Leans against friends as fiercely as it charges foes.

**Mythic root.** Ares's martial character inspires its shield-hide and crest. A boar-form Ares appears in one tradition about Adonis.

**Awakenings.** At level 16, **Warthos**, the shieldback boar: Plants itself between danger and its friends, then refuses to admit it was worried. At level 32, **Phalanboar**, the living phalanx: Stands guard long after everyone is safe, pretending it simply enjoys the view.

**In battle.** `55 / 66 / 52 / 38 / 42 / 48` — the hardest physical hitter of
the twelve and nearly incapable of subtlety; its Grace stat is a rumor.
Learnset: `1 — Headbutt · 5 — War Cry · 9 — Vine Lash · 13 — Gore`.
Strikes 2× at Hunt and Harvest (war tramples field and forest); weak to Sky
and Wisdom (the general and the sky-god both outrank the charge).

**With its master.** Clashog respects exactly one currency: shown courage. It
tests a new Keeper for a week — barging, shoving, stealing food — and the
Keeper who stands ground (not hits back; *stands ground*) is adopted with
total, blazing loyalty. After that the shoving becomes leaning (see Calfin)
performed at higher speed. It charges anything that threatens its master
without any assessment whatsoever of relative size, which has saved several
Keepers and mildly embarrassed several gods. Phalanboar fights beside its master
like a phalanx of one.

## 6. Dovelace → Columbra → Peristera — the Dove of Aphrodite (Love)

**Hybrid.** Rose-knot dove.

**Appearance.** An ivory-and-rose dove with layered petal wings, a rosette chest, and two long ribbon feathers that describe a heart behind it. Its lifted foot and open beak suggest a confident invitation to dance.

**Personality.** Insists that everyone at camp make up before bedtime. Takes matchmaking far too seriously.

**Mythic root.** Aphrodite's dove and rose imagery become petal wings and a tail that ties a living love-knot.

**Awakenings.** At level 16, **Columbra**, the petal-wing dove: Settles quarrels with a sweeping bow, then waits very patiently for applause. At level 32, **Peristera**, the rosewoven sovereign: Offers its finest feather to the guest who arrived feeling least welcome.

**In battle.** `50 / 45 / 45 / 58 / 55 / 60` — fast, charming, and glassy: a
status specialist that wins by making the fight not worth having.
Learnset: `1 — Dove Dart · 5 — Heart Ray · 9 — Charm Gaze · 13 — Nectar Sip`.
Strikes 2× at Wisdom and Wine; weak to Underworld and Hunt (grief and the
arrow, the two old enemies of love).

**With its master.** Dovelace is the mirror of its Keeper's heart, which is
occasionally unbearable. Master cheerful: Dovelace perches high and sings.
Master heartsick: Dovelace will not leave the shoulder, murmuring, one wing
against the neck. It cannot be lied to about feelings and does not understand
why anyone tries. With Orpheus it is nearly overwhelmed — a heart that size,
singing — and early-game dialogue should hint that Dovelace knows about Eurydice
before the player does. Peristera chooses Keepers who have lost something;
the temple records do not say why.

## 7. Solisk → Solserp → Pythonos — the Serpent of Apollo (Sun)

**Hybrid.** Sundial serpent.

**Appearance.** A golden serpent whose broad, flat coil is a sundial. Wedge-shaped scales mark the hours, its upright neck forms the gnomon, and its frill is a fan of sunbeams. The knowing smile belongs to a tiny prophet who enjoys being right.

**Personality.** Always finds the warmest stone. Looks unbearably pleased when its little predictions come true.

**Mythic root.** An original solar reinterpretation of the serpent at Delphi, joining the Python story to Apollo's light and prophecy.

**Awakenings.** At level 16, **Solserp**, the noon-dial cobra: Predicts the afternoon weather with great ceremony, even when the sky is perfectly clear. At level 32, **Pythonos**, the solar oracle serpent: Answers urgent questions at dawn, but insists every prophecy begin with breakfast.

**In battle.** `46 / 50 / 44 / 64 / 48 / 58` — a glass cannon of Grace: the
best special attack of the twelve on the thinnest body.
Learnset: `1 — Headbutt · 5 — Sunlance · 9 — Nectar Sip · 13 — Solar Flare`.
Strikes 2× at Underworld and Wine — but the Underworld strikes 2× back
(the mutual feud; see Wickpup). Otherwise weak to Sea (the ocean drowns noon).

**With its master.** Solisk bonds by *basking adjacency*: it likes to be
within three feet of its Keeper and directly in the sun, and will rearrange
whichever of those is easier — usually by climbing the Keeper. It drapes
across shoulders like a golden scarf and slowly constricts when the master
says something evasive; Keepers of Solisk become honest. It hears prophecy in
Orpheus's music, tasting the air after certain chords, agitated, as if the
song had told it something about next week. Pythonos's masters historically
stop being masters and start being priests; the game should never clarify
which one is serving.

## 8. Cresfawn → Cerynhind → Elaphos Chrysos — the Hind of Artemis (Hunt)

**Hybrid.** Moonbow hind.

**Appearance.** A tan-and-moss hind with golden crescent antlers joined by a fine silver bowstring, bronze hooves, and a fletching-shaped tail. Moon and star markings follow the curve of its body. It looks back playfully while already halfway into a leap.

**Personality.** Plays hide-and-seek without announcing the game. Returns the moment a friend truly needs it.

**Mythic root.** Artemis's Ceryneian hind lends its golden antlers and bronze hooves; the antlers grow into a moonlit bow.

**Awakenings.** At level 16, **Cerynhind**, the moonstring runner: Runs circles around impatient hunters, then quietly guides lost travelers home. At level 32, **Elaphos Chrysos**, the golden moonbow hind: Leaves a trail of silver hoofprints only for travelers who have lost their way.

**In battle.** `48 / 65 / 44 / 56 / 48 / 66` — the fastest attacker in the
game: first strike, priority arrows, and no plan for being hit back.
Learnset: `1 — Headbutt · 5 — Swift Arrow · 9 — Wingèd Step · 13 — Moon
Volley`. Strikes 2× at Love and Harvest; weak to War and Forge (the spear and
the trap, the two ways a chase ends).

**With its master.** Cresfawn is never quite caught — that is the bond. It
walks ten feet ahead, or ten feet behind, or appears on the rock above; it
sleeps just outside the firelight and is at the Keeper's cheek by dawn. It
does not come when called; it comes when *needed*, which it judges better than
the caller. Trust between Cresfawn and Keeper is built entirely from released
things — game let go, doors left open, the amphora never thrown twice. This
is by design of the goddess, and Myth VI is its test: the line's final
evolution cannot be reached by a Keeper who has never chosen release.

## 9. Kilnclaw → Bronzeclaw → Automax — the Automaton of Hephaestus (Forge)

**Hybrid.** Walking kiln crab.

**Appearance.** A terracotta crab whose domed carapace is a working kiln. Bronze bands hold the ceramic shell; one large hammer claw contrasts with a precise little pincer. Its warm furnace and soot-smudged, proud expression make it a small, earnest craftsperson.

**Personality.** Fixes buckles while you sleep and waits proudly for someone to notice. Hums when its kiln is warm.

**Mythic root.** An invented crab automaton inspired by Hephaestus's living craft and metalwork; the crab is not his historical sacred animal.

**Awakenings.** At level 16, **Bronzeclaw**, the bellows-shell crab: Inspects every broken pot it passes and offers repairs before introductions. At level 32, **Automax**, the walking forge citadel: Repairs the village gates, then engraves a tiny crab where nobody will notice.

**In battle.** `56 / 60 / 66 / 56 / 52 / 32` — the wall of the twelve: best
Defense in the game, best chassis, worst sprint. It is not slow so much as
*deliberate at scale*.
Learnset: `1 — Headbutt · 5 — Bronze Clamp · 9 — Strategize · 13 — Molten
Spit`. Strikes 2× at Sky and Hunt (lightning grounds on bronze; traps end
chases); weak to Sea and Wine (rust and the drunken forge-fire).

**With its master.** Kilnclaw bonds by *maintenance*. It mends things: the
frayed lyre-strap appears re-riveted; the loose sandal-thong is somehow
crimped in bronze wire by morning. Affection is expressed as small repairs and
received as being allowed to sit near the campfire's exact hottest stone. It
runs warm; Keepers of Kilnclaw winter well. It does not understand music
but understands *instruments*, and its relationship with Orpheus consists of
deep mutual professional respect between a maker and a lyre it is not allowed
to improve. (It has ideas. It keeps a small wax tablet of them.)

## 10. Lyretto → Swiftshell → Chelys Hermao — the Tortoise of Hermes (Herald)

**Hybrid.** Lyre-shell courier.

**Appearance.** A determined olive-green tortoise whose shell forms a lyre soundbox, with raised strings and gold ridges. Little wing fans and a comically eager stride turn Hermes's original instrument into an impatient courier.

**Personality.** Steals the shortest route, then waits smugly at the crossroads. Its shell hums along with your lyre.

**Mythic root.** Hermes made the first lyre from a tortoise shell; this courier grows its own strings and little messenger wings.

**Awakenings.** At level 16, **Swiftshell**, the lyre runner tortoise: Delivers messages before the sender finishes rehearsing them. At level 32, **Chelys Hermao**, the sky-song messenger: Carries the news of home farther than any road, humming every name it remembers.

**In battle.** `48 / 46 / 54 / 46 / 50 / 66` — speed and mischief on a
tough little chassis; no domain touches it and it touches no domain (Herald is
never super-effective and never resisted), but every strike carries a bonus
crit — the trickster's thumb on the scale.
Learnset: `1 — Headbutt · 5 — Trick Jab · 9 — Wingèd Step · 13 — Nectar Sip`.

**With its master.** Lyretto does not regard its Keeper as a master at all;
it regards the two of them as *colleagues in transit*. It is a fellow
traveler, a road-partner, occasionally a luggage thief (it returns things,
rearranged, improved, or traded for something it judged better — the god's own
economics). For Orpheus it holds a special reverence it would die before
admitting: his lyre is its grandmother. On quiet nights it settles beside the
instrument, shell to soundbox, and if the wind is right the strings of one
hum faintly against the strings of the other.

## 11. Sheafang → Granibble → Thesmora — the Granary of Demeter (Harvest)

**Hybrid.** Harvest dormouse.

**Appearance.** A round chestnut dormouse with enormous oat-cream grain pouches, leafy inner ears, a wheat forelock, tiny poppy accents, two little incisors, and a short seedpod tail. Granibble grows taller and extends a helping paw; Thesmora becomes a broad protective granary guardian beneath a canopy of wheat and leaves. Its soft round silhouette is distinct from Solisk's golden serpent coils.

**Personality.** Packs its cheeks for the whole camp, then shyly offers the biggest seed to whoever looks hungry.

**Mythic root.** Demeter's wheat, barley, and poppies inspire an original dormouse/granary hybrid. The mouse is not presented as her historical sacred animal. Thesmora's name evokes Demeter's Thesmophoria festival.

**Awakenings.** At level 16, **Granibble**, the seedkeeper dormouse: Counts everyone's supper twice, then quietly adds a little extra. At level 32, **Thesmora**, the granary guardian: Never lets a winter guest leave hungry, even when it means emptying its own stores.

**In battle.** `52 / 54 / 50 / 54 / 52 / 46` — the most balanced statline of
the twelve, and the best status platform: Spore Cloud is the game's most
reliable sleep.
Learnset: `1 — Headbutt · 5 — Vine Lash · 9 — Spore Cloud · 13 — Grain
Volley`. Strikes 2× at Sea and Underworld (the shore drinks the sea; Demeter
reaches into the dark); weak to War and Hunt (what tramples and what forages).

**With its master.** Sheafang keeps its Keeper fed. It knows where the wild figs are and packs its cheeks before anyone remembers to plan supper. It sleeps nestled against the grain sack, one leaf-shaped ear listening for a hungry guest. Granibble becomes the camp's patient quartermaster; Thesmora treats every traveler as someone who belongs at its table.

## 12. Revelcub → Vinther → Pantheros — the Panther of Dionysus (Wine)

**Hybrid.** Festival panther.

**Appearance.** A plum panther cub with grape-cluster spots, ivy tufts, and a curling leaf-tipped tail. A cream comedy-mask marking and impish grin connect Dionysus's animal to theater and celebration. It plays host wherever the party rests.

**Personality.** Turns every rest stop into a festival. Steals one fig, then offers you half with a shameless grin.

**Mythic root.** Dionysus's panther, ivy, grapes, and theater meet in a cub with vine-tendrils and comedy-mask markings.

**Awakenings.** At level 16, **Vinther**, the ivy-masked panther: Turns every practice hunt into a game and always lets the smallest cub win. At level 32, **Pantheros**, the festival-crowned panther: Makes the grandest entrance, then spends the evening beside the shyest guest.

**In battle.** `52 / 62 / 46 / 52 / 44 / 56` — a quick, reckless physical
attacker: Frenzy Claw hits like a festival ending badly, and its defenses
assume it won't need them.
Learnset: `1 — Headbutt · 5 — Grape Shot · 9 — War Cry · 13 — Frenzy Claw`.
Strikes 2× at Wisdom and Forge (revelry undoes reason and melts down
discipline); weak to Love and Sun (the morning after, in both senses).

**With its master.** Revelcub is a conspiracy of two. It does not obey and it
does not guard; it *collaborates*, ideally on something inadvisable. It steals
exactly one small thing from every town (the game should quietly track this),
brings its Keeper the best finds, and expects fair division of spoils. It is
the only beast that laughs — an actual chirping panther-laugh — and it laughs
most at its own master, which is somehow never cruel. Keepers of Revelcub come
home late, grinning, with stories. Pantheros's Keepers historically found
festivals, or religions, or both.

---

## The Six Legendaries (post-Olympus)

Dual-domain, no evolutions, one of each hidden in the world — monsters, not
sacred animals, and the bestiary treats them accordingly (no "with its
master" section; a legendary has companions, briefly, or victims).

| Beast | Domains | Where | Note |
|---|---|---|---|
| **Chimera** | War + Sun | after Myth III | lion, goat, serpent; Bellerophon's story is its story |
| **Hydra** | Sea + Harvest | Lerna marsh | staged fight: it *grows* on a timer |
| **Sphinx** | Wisdom + Underworld | back road to Thebes | asks the riddles; battle optional if answered |
| **Pegasus** | Sky + Herald | sky above Corinth | never fought — bridled or nothing (Myth III) |
| **Minotaur** | War + Underworld | a labyrinth map | the map is the boss |
| **Phoenix** | Sun + Forge | Etna's slopes | can only be caught at the moment of its rebirth |

---

*Cross-references: type chart & damage math in `DESIGN.md` §2; the
stories these beasts walk through in `myths.md`; implementation in
`../js/data.js` (stats, learnsets), `../js/sprites.js` (appearance),
`../js/engine.js` (mechanics).*


## Mythology references and interpretation

- Hermes makes a lyre from a tortoise shell in the Homeric Hymn to Hermes: [ancient passages collected by Theoi](https://www.theoi.com/Olympios/HermesMyths.html). Lyretto makes that shell an instrument while keeping its owner alive.
- The Ceryneian hind has golden antlers and bronze feet in ancient descriptions: [Apollodorus and other passages](https://www.theoi.com/Ther/ElaphosKerynitis.html). Cresfawn adds Artemis's bow and lunar imagery.
- Apollo kills Python at Delphi: [Python sources](https://www.theoi.com/Ther/DrakainaPython.html). Solisk is a fictional reconciliation of that serpent with Apollo's prophetic and solar identity, not a claim that Python was his sacred pet.
- Hephaestus makes living constructs: [automaton sources](https://www.theoi.com/Ther/Automotones.html). Kilnclaw's crab body is invented; [Hephaestus's traditional sacred animal](https://www.theoi.com/Olympios/Hephaistos.html) is the donkey.
- Demeter's wheat, barley, and poppies inform Sheafang's invented dormouse/granary anatomy: [Demeter's attributes](https://www.theoi.com/Olympios/DemeterTreasures.html).
- Clashog uses Ares's martial imagery and the boar-form association in some Adonis traditions: [Ares traditions](https://www.theoi.com/Olympios/Ares.html?level=1). It does not recast Artemis's Calydonian boar as Ares's animal.
