# DANCE OF THE GODS — The Twelve Dungeons

Every region carries one **interior** — a map discontinuous with the overworld,
entered through a door and left the same way. Most are not dungeons in the
crawling sense: they are temples, holds, halls, caves, one forest heart and one
mountain stair. But they share an anatomy, and the game treats them as one
system:

**One dungeon per myth. The myth plays out inside. At the end waits its god.**

That gives the count the design wanted all along: **twelve dungeons — twelve
myths — twelve Olympians**, one god battled at the bottom (or top) of each.

## Anatomy of a dungeon

1. **The approach** — the overworld staging we already build (Apollo over
   Python on the plaza, the contest on the acropolis rock). Where Myths I and
   II are already implemented outdoors, that staging *stays*, and becomes the
   dungeon's front porch: the myth begins in the street and ends behind the
   door.
2. **The rooms** — two to five interior chambers. Each room stages one beat of
   the myth (the `owSay` + tile-mutation pattern from `../js/maps.js`), plus
   the dungeon's gimmick.
3. **The god chamber** — the last room. The god speaks in their `GODS.md`
   voice, then tests the witness: a full trainer battle, no catching, no
   fleeing.
4. **The Favor** — victory grants the god's **Favor** (the badge system:
   `state.ow.flags.favors`), a full heal, and whatever the myth opens. Favors
   are the keys to Olympus and, later, the hooks for Blessings.

**God battles, the format.** A god fights with beasts of their line and
domain, capstoned by their line's **stage 3** (the first place the player
meets evolved beasts). Gods do not blackout the player mercilessly — losing
returns you to the dungeon mouth, healed, with the god's door still open;
they are examiners, not executioners. Defeated, a god is not "beaten": the
dialogue frames it as *the god choosing to be persuaded*, which is the only
way a mortal ever wins.

**Suggested order & level bands** (the world gates most of this naturally):

| # | Dungeon | God | Band | Opens after |
|---|---|---|---|---|
| I | The Adyton of Delphi | Apollo | 12–15 | Myth I staged outside |
| II | The Parthenon | Athena | 15–17 | Myth II staged outside |
| III | The Wellsprings of Pirene | Poseidon | 17–19 | reaching Corinth |
| IV | The Wine-Dark Deck | Dionysus | 19–21 | Corinth harbor |
| IX | The Cradle-Cave of Kyllene | Hermes | any (scales) | Sacred Way detour |
| X | The Jammed Forge | Hephaestus | 21–24 | west road from Corinth |
| V | The Vault of the Jar | Ares | 24–26 | Forge opens Sparta |
| VI | The Heart of the Green | Artemis | 26–28 | Taygetos, past Sparta |
| XI | The Sanctum of Acrocorinth | Aphrodite | 28–30 | return to Corinth, post-VI |
| VII | The Telesterion | Demeter | 30–32 | Eleusis |
| VIII | The House of Hades | Hades | 32–35 | Myth VII complete |
| XII | The Storm Stair | Zeus | 36–40 | all eleven Favors |

---

## I. The Adyton of Delphi — ends before APOLLO (Sun)

**Interior.** Behind the temple door the player already knocks on: the
pronaos with the maxims on the walls (*Know Thyself* — readable signs), the
hall of tripods, then the **adyton** — the sunken oracle chamber, lit from no
visible source, the omphalos at its heart.
**Gimmick.** Prophecy: Pythia's vapors show one-tile glimpses of *later
dungeons* in braziers (teaser vignettes — the bronze jar, the black pool).
**Myth beats inside.** The laurel crown scene gains its coda here: Apollo
hangs the first crown above the omphalos and asks what the witness saw —
three dialogue choices, all true, differently.
**The god.** Apollo fights radiant and brittle, exactly per `GODS.md`: he
*narrates his own excellence* between turns. Team: Slithra, Solserp,
**Pythonos** capstone. Beating him is the game's first taste of a stage-3.
**Favor of Apollo** — and the Sacred Way's laurels bloom as you pass.

## II. The Parthenon — ends before ATHENA (Wisdom)

**Interior.** The riddle-gym of DESIGN.md, made canonical: a maze of
column-screens and loom-frames where **correct answers move walls** — three
riddle doors (Sphinx-style multiple choice), each skippable by fighting the
philosopher-acolyte guarding it instead. Thought or force; the map keeps
score of which you chose.
**Myth beats inside.** The contest's aftermath: the olive branch and a bowl
of salt water sit on twin plinths; Athena walks the halls asking the player
what *they* would have given the city, and files the answer.
**The god.** Athena fights like a proof: she opens with Strategize every
time, and her dialogue observes your type choices aloud. Team: Owlet,
Glaucon, **Glaux Sophos**. If you solved all three riddles, she leads with
her weakest beast — a handicap she calls *respect*.
**Favor of Athena.**

## III. The Wellsprings of Pirene — ends before POSEIDON (Sea)

**Interior.** Corinth's fountain has a floor no one mentions: stair after
stair down into the water-caves where Pirene rises — flooded galleries,
stepping-stone paths, the tide-timer gimmick from DESIGN.md's old Corinth gym
(water rises and falls on a turn count, opening and closing routes).
**Myth beats inside.** Myth III's heart: Bellerophon sleeps in a side-grotto
shrine; the golden bridle glints on the altar; **Pegasus drinks at the
deepest pool** — the one time the player sees him before the endgame sky. The
beats stage the incubation dream and the bridling, witnessed from across the
water.
**The god.** Poseidon — father of horses, lord of the spring — rises last,
half-amused: *"My son gets the horse. Let's see what the singer gets."*
Team: Calfin, Wavebull, **Taurios**. Earthquake flavor: the arena tiles crack
cosmetically as the fight runs.
**Favor of Poseidon** — and the harbor ferryman starts taking bookings (sea
ring soft-open).

## IV. The Wine-Dark Deck — ends before DIONYSUS (Wine)

**Interior.** The pirate ship, boarded at Lechaion: hold, rowing deck,
mast-deck. The game's only *moving* dungeon — through the portholes the coast
slides by.
**Gimmick.** The transformation, room by room: wine wells between the deck
planks, vine tiles climb the mast as you climb the ship, and pirate trainers
fought on the lower decks are *missing* from the upper ones — replaced by
dolphin-shapes arcing past the rail.
**Myth beats inside.** Myth IV in full: the bound youth whose ropes won't
hold, the helmsman's warning, the lion-shadow at the prow. The player fights
the pirate captain one room before the end; his "after" line is delivered as
a dolphin.
**The god.** Dionysus, revealed, fights sitting down, wreathed, delighted:
the battle field is drunk (cosmetic wobble; his status moves land
half again as often — the loosening). Team: Cubvine, Vinther, **Pantheros**.
**Favor of Dionysus** — the sea ring opens fully; the helmsman becomes your
ferryman.

## V. The Vault of the Jar — ends before ARES (War)

**Interior.** Beneath Sparta's Agoge: the trophy-vault where the city keeps
what it will not talk about — racks of captured arms, and at the center, the
**bronze jar**, big as a room, patched where it was once opened.
**Gimmick.** The gauntlet (DESIGN.md's Sparta gym): five back-to-back fights
down the vault's length, no healing, each guard themed on a way war goes
wrong (the Coward, the Butcher, the Ledger-Keeper, the Glory-Hound, the
Deserter — who fights hardest).
**Myth beats inside.** Myth V staged as vault-keeper's tour: the Aloadae's
boasts echo from the jar when struck; Hermes's lockpick scratches are still
on the lid; thirteen tally-marks inside, one per month.
**The god.** Ares waits *inside the open jar*, sitting on its floor — his
choice of arena, the site of his humiliation, because per `GODS.md` he is
honest as a wound. Team: Piglos, Warthos, **Kalydon**. He fights at full
joy and thanks you win or lose; it is the friendliest fight in the game and
the hardest so far.
**Favor of Ares.**

## VI. The Heart of the Green — ends before ARTEMIS (Hunt)

**Interior.** The Deep Green's soft maze finally resolves: a grove with no
door — the "entrance" is any gap in the trees, and the interior map is
bounded by dusk rather than walls. Fireflies, the black mirror-pool at the
edge (Narcissus just visible, not part of this), and the hind's hoofprints
in gold.
**Gimmick.** The chase concludes: the hind stands in the open at last, and
the dungeon is a single long *approach* — step wrong (running, amphora in
hand) and it bounds one clearing away; step right and the distance closes.
The mechanics of Myth VI's release test.
**Myth beats inside.** The arrow that draws no blood; the goddess's pardon;
the choice to lower the amphora.
**The god.** Artemis fights **only those who passed** — refuse the release
and there is no battle, no Favor, and the Green does not let you find its
heart again for a long while. Team: Fawnling, Cerynhind, **Elaphos
Chrysos** — and the golden hind itself watches from the treeline.
**Favor of Artemis** — and the golden antler (the Elaphos line's hidden
evolution item).

## VII. The Telesterion — ends before DEMETER (Harvest)

**Interior.** The hall of the Mysteries at Eleusis: the only dungeon fought
**in the dark** (DESIGN.md's darkness gym) — a torch-radius of visible tiles,
initiates' processions crossing the black like slow comets.
**Gimmick.** Light as resource: braziers extend sight; some beats *require*
standing in darkness to proceed (the Mysteries are not watched, they are
undergone).
**Myth beats inside.** Myth VII's bargain: the withered fields visible
through the hall's one window regreen as the reunion beat lands; the
pomegranate — the game's one seen-but-unusable item — is placed in your bag
here by a hand you don't see.
**The god.** Demeter, at a plain altar heaped with bread. She fights slowly,
enormously, sorrow-first — Spore Cloud opens every bout. Team: Seedviper,
Grainwyrm, **Ophis Karpos**.
**Favor of Demeter** — and the cave below Eleusis stands open.

## VIII. The House of Hades — ends before HADES (Underworld)

**Interior.** The Underworld descent from GEOGRAPHY.md, formalized: Charon's
crossing (the fare is a song), the Cerberos gate (soothed, not fought — the
lyre mini-beat), the three great shades as side-rooms (Sisyphus's slope,
Tantalus's pool, the Danaids' jars — each a one-screen tableau that pauses
when the lyre plays), then the basalt throne hall.
**Gimmick.** The dead listen: every battle in the House is fought silent
(no battle text flourishes, muted palette) *except* when Orpheus's own beats
play — the game's sound design inverts.
**Myth beats inside.** Myth VIII entire. The bargain, the condition, the
ascent — and the **Look Back / Don't Look** input at the last threshold,
after everything else in this list.
**The god.** Hades battles *before* the bargain, not after — the price of
audience, stated exactly once, per `GODS.md`: he does not haggle twice.
Team: Pupnos, Dihound, **Cerberos** (the one you soothed; it pulls its
strikes, and he does not comment). Winning does not win Eurydice. Nothing
wins Eurydice except the walk.
**Favor of Hades** — given, with precision, whichever way the threshold goes.

## IX. The Cradle-Cave of Kyllene — ends before HERMES (Herald)

**Interior.** A detour off the Sacred Way, findable early, finishable
anytime (the god scales to your band): the cave where Hermes was born —
cradle still rocking, cattle-tracks pointing *into* the walls, the smell of
an infant's innocence applied strategically.
**Gimmick.** The flashback: one room is played **as baby Hermes, walking
backwards** (reversed controls, the game's one pure comedy beat), driving
cattle in reverse past a bewildered search party.
**Myth beats inside.** Myth IX staged in full — the theft, the tortoise, the
trade — ending at the shrine where the **first lyre** hangs. Orpheus's own
lyre hums when carried past it. Tortikin, if in the party, refuses to leave
the room for a full minute (a real timer; the game just waits with you).
**The god.** Hermes fights like a card trick: Chelys speed, guaranteed
crits, switch-tricks, and running commentary he clearly prepared in advance.
Team: Tortikin, Swiftshell, **Chelys Hermao**. Beating him earns the only
Favor delivered as a handshake.
**Favor of Hermes.**

## X. The Jammed Forge — ends before HEPHAESTUS (Forge)

**Interior.** GEOGRAPHY.md's forge cave: basalt galleries lit by ember
vents, automaton half-builds watching from alcoves (their spEye pupils
track), and at the deepest bench the **golden throne**, occupied, immovable,
politely furious.
**Gimmick.** Machines: floor-plates route molten channels; the player
re-pipes fire to unjam doors — the dungeon is a device being repaired around
you, by you.
**Myth beats inside.** Myth X: Ares's scorched failure (a singed hoplite
recovering in an alcove), the fetch-quest for unmixed wine, and the donkey
procession — which crosses the *interior*, room by room, gathering automata
behind it like a parade.
**The god.** Hephaestus fights from a work-stool, unhurried, repairing his
lead beast *mid-battle* (his beasts heal a little every turn — the only god
whose gimmick is maintenance). Team: Cindercrab, Bronzeclaw, **Automax**.
**Favor of Hephaestus** — and the road to Sparta unjams, because the road
was never blocked by rock, only by a quarrel.

## XI. The Sanctum of Acrocorinth — ends before APHRODITE (Love)

**Interior.** The temple on the mountain above Corinth, reached by a
switchback stair-map with the whole built world visible below (a deliberate
look-how-far vista before the late game). Inside: lamplight, doves in the
rafters, and the shadow-play wall.
**Gimmick.** Myth XI is staged as the priestess's **shadow-play** — panel
tiles swap along the wall as the Golden Net story is told, the gods as
silhouettes, the laughter of the immortals supplied by the congregation.
It is the only dungeon whose myth is explicitly a *performance* — a story
about stories, in Orpheus's house of worship.
**Myth beats inside.** The song of Demodocus retold; the net descends on the
final panel; the **Gold Mesh Charm** (held item: survive one KO at 1 HP) is
pressed into your hand "from one professional to another."
**The god.** Aphrodite fights last of the eleven and knows it: her battle is
the game's status-effect exam — Charm everywhere, priority Dove Darts,
Nectar stalls. Team: Dovie, Columbra, **Peristera**. Her pre-fight line asks
about Eurydice, kindly, before the player has told anyone.
**Favor of Aphrodite.**

## XII. The Storm Stair — ends before ZEUS (Sky)

**Interior.** Olympus itself is the overworld climb (GEOGRAPHY.md's weather
bands); the dungeon is the summit interior: the Olympian Gate, the Divine
Council's antehall — where the four elite bouts of DESIGN.md are fought
between colonnades of cloud — and the throne terrace above the weather.
**Gimmick.** All eleven Favors are *spent* here: each one nullifies a
hazard-band of the stair (Poseidon's calms the sleet, Hephaestus's warms the
ice…) — the endgame mechanically restates the whole journey.
**Myth beats inside.** Myth XII: the Cult's un-pinning attempt, Kass's final
choice, the retelling of the Typhon war in the Council's own hall — and the
finale that is sung, not fought, with the lyre mechanic learned in the House
of Hades.
**The god.** Zeus, last, alone, genial and terrifying at the same distance
for the first time. Team: Peeplet, Aetion, **Aetos Dios** — and the fight
runs in weather: the arena cycles storm effects turn by turn.
**Favor of Zeus** — the twelfth, which is not a key to anything, because
there is nothing left locked. It is thanks.

---

## Appendix — the unnumbered door

**The House of Polished Stone (Aeaea).** Circe's hall keeps the dungeon
anatomy — rooms, beats, a goddess at the end — but stands outside the
twelve: no myth number, no Favor, and the "god battle" is optional twice
over (she would honestly rather have dinner). Her fight (Wine/Wisdom/Sea
mixed team, the sea ring's hardest) is the game's hidden superboss, and her
prize is not a Favor but a *pharmakon* — the brewing of status-cures
unlocked for the rest of the run. See GEOGRAPHY.md for the island; see the
sailor on the beach for why you knock carefully.

## Implementation notes

- **Interiors are just maps**: `MAPS` entries with `indoor:true`, entered by
  door tiles (`D`) that finally warp instead of saying "shut." No new engine
  concepts — warps, script NPCs, tile mutation, and `beginBattle` cover
  everything above except per-dungeon gimmicks.
- **God battles** are trainer battles (`canCatch:false, canFlee:false`) with
  a `boss:true` flag for the framing (no blackout on loss — return to
  dungeon mouth healed). Stage-3 capstones require the evolution species to
  exist in `data.js` first; that is the real prerequisite for this file.
- **Favors** live in `state.ow.flags.favors` (array of god names) and must be
  replayed by `restoreWorld` like every other mutation.
- **Myths I & II migration**: their outdoor stagings remain as approaches;
  the Adyton and Parthenon add the interior coda + god battle on top. No
  existing beats move.

*Cross-references: the stories — `myths.md`; the voices — `GODS.md`; the
regions these doors open from — `GEOGRAPHY.md`; the teams — `BEASTS.md`;
systems — `DESIGN.md`.*
