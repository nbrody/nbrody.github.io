# DANCE OF THE GODS — The Twelve Myths

Orpheus walks the old roads of Hellas, and in every place a myth is *happening* —
not recited, but staged around him in the overworld: NPCs move, tiles transform
(the laurel grows, the salt spring bursts, the olive rises), and the player
witnesses the canon with their own sprite. One myth anchors each region; each is
drawn from the Greek canon and each teaches, in passing, a domain of the type
chart. Myth VIII is Orpheus's own, and the game does not warn you it is coming.

**Framing rule.** Orpheus is a *witness*, not the hero of these stories. The
myths happen to gods and to other mortals; his job — and the player's — is to
see them truly, so that he can sing them. Every completed myth grants "the
god's favor" (full heal), advances a flag in `state.ow.flags`, and usually
opens a road.

**Staging pattern** (established by Myths I & II in `js/maps.js`): a driver NPC
with `kind:"script"` advances a stage counter; each stage is an `owSay` beat
that ends by mutating the world — NPC positions, `gone` flags, and grid tiles.
Side NPCs carry stage-aware flavor lines.

**Dungeons.** Each myth now culminates *indoors*: every one of the twelve has
an interior map that stages its final beats and ends in a battle against its
Olympian (see `DUNGEONS.md` for all twelve, the god-battle format, and the
Favor system). Outdoor stagings already built (I, II) remain as the dungeons'
approaches.

| # | Myth | Domain(s) | Place | Canon source | Status |
|---|------|-----------|-------|--------------|--------|
| I | Apollo, Eros & Daphne | Sun, Love | Delphi | Ovid, *Metamorphoses* I 452–567 | **Implemented** |
| II | The Contest for the City | Wisdom, Sea | Athens | Apollodorus III.14.1; Herodotus VIII.55 | **Implemented** |
| III | Bellerophon & Pegasus | Sky (hubris) | Corinth | Pindar, *Olympian* 13; *Iliad* VI 155–203 | Teased (Bellerophon NPC dreams at Pirene) |
| IV | Dionysus & the Pirates | Wine | Corinth harbor / sea route | *Homeric Hymn* VII | Planned |
| V | Ares in the Bronze Jar | War | Sparta | *Iliad* V 385–391 | Planned |
| VI | The Ceryneian Hind | Hunt | Taygetos road (near Sparta) | Apollodorus II.5.3; Callimachus, *Hymn* III | Planned |
| VII | Demeter & Persephone | Harvest, Underworld | Eleusis | *Homeric Hymn* II (to Demeter) | Planned |
| VIII | Orpheus & Eurydice | Love, Underworld | The Underworld gate | Ovid, *Met.* X; Virgil, *Georgics* IV | Planned — the player's own myth |
| IX | Hermes & the First Lyre | Herald | Game opening (cameo), Sacred Way (told), Mt. Kyllene (staged) | *Homeric Hymn* IV (to Hermes) | Hermes gives the starter at Pimpleia's gate; told by Rhapsode Phemios |
| X | The Return of Hephaestus | Forge, Wine | Forge cave, road to Sparta | Alcaeus fr. 349; vase tradition | Planned |
| XI | The Golden Net | Love, War, Forge | Corinth (Acrocorinth temple) | *Odyssey* VIII 266–366 | Teased (Priestess of Aphrodite) |
| XII | Zeus & Typhon | Sky | Mount Olympus (endgame) | Hesiod, *Theogony* 820–880 | Planned — the Cult of Typhon arc |

---

## I. Apollo, Eros & Daphne — Delphi ✅

**Canon.** Fresh from slaying Python, Apollo mocks Eros's archery. Eros answers
with two arrows: gold (love) into Apollo, lead (aversion) into the nymph
Daphne. Apollo pursues; Daphne prays to her river-father Peneus and becomes the
laurel; Apollo adopts the laurel as his crown. (Ovid, *Met.* I.)

**Staged.** Three beats driven by Apollo beside the slain Python: the boast and
the two arrows → the chase and transformation (Daphne's NPC becomes an `L`
tile by the river) → the first laurel crown. Completion opens the Sacred Way.
The Eros lines are the moral: *what the small god's arrow did to the great
one's pride* — a type-chart lesson (power is positional, not absolute).

## II. The Contest for the City — Athens ✅

**Canon.** Poseidon and Athena contend for patronage of Cecropia before its
serpent-bodied king Cecrops. Poseidon strikes the acropolis and a salt spring
bursts out; Athena plants the first olive. Cecrops judges the olive the greater
gift; the city is named Athens; Poseidon sulks magnificently. (Apollodorus
III.14; Herodotus VIII.55.)

**Staged.** Driver: Cecrops, on the acropolis plaza between the two gods.
Beat 1: the trident strike (`~` tiles burst through the marble). Beat 2: the
olive rises (`v` tile). Beat 3: the judgment — the map itself is renamed from
*Cecropia — the Unnamed City* to *Athens — City of the Olive*, and the Coast
Road opens. Teaches Wisdom ⇄ Sea positioning; the sulking Poseidon line
foreshadows the washed-out Sparta road (he *always* gets blamed).

## III. Bellerophon & Pegasus — Corinth

**Canon.** The Corinthian hero, told by the seer Polyeidos to sleep in Athena's
temple, wakes holding a golden bridle; with it he tames Pegasus at the spring
of Pirene, slays the Chimera — and is finally thrown when he tries to ride to
Olympus itself. (Pindar, *Ol.* 13; *Iliad* VI.)

**Plan.** Bellerophon currently dreams by the fountain with a coil of golden
rope. Beats: the incubation in the temple → the bridling at Pirene (Pegasus as
a special white/winged tile-prop or custom NPC draw) → departure skyward —
and, late in the game (post-Olympus gate), the fall: an old lame wanderer on a
back road who asks not to be named. Gameplay hook: unlocks the Chimera
legendary-hunt thread; the fall scene is the game's hubris warning placed just
before the player's own ascent.

## IV. Dionysus & the Pirates — Corinth harbor

**Canon.** Tyrrhenian pirates seize a beautiful youth for ransom, not knowing
the god. The bonds fall away; wine runs along the deck; a vine climbs the mast;
the god becomes a lion — the pirates leap overboard and become the first
dolphins. Only the helmsman, who protested, is spared. (*Homeric Hymn* VII.)

**Plan.** Staged on a ship at the Lechaion dock (small boarded map): beats play
out with tile transformations (vine tiles up the mast-line, `~` around the
rail), then the pirate crew NPCs vanish and dolphin props arc in the harbor
water. The spared helmsman becomes the ferryman who later runs the sea routes
to the legendary islands. Teaches Wine's trickster matchups; grants safe sea
travel.

## V. Ares in the Bronze Jar — Sparta

**Canon.** The giant twins Otus and Ephialtes, the Aloadae, stuffed the war god
himself into a bronze jar and kept him there thirteen months, until Hermes
stole him out, "worn to a shadow." (*Iliad* V 385–391 — recounted, delightfully,
to shame Ares.)

**Plan.** Sparta's gym-city myth, told against type: the war-city's own myth is
the humiliation of war. Driver: a Spartan priest of Ares polishing an enormous
bronze jar (`O`-variant tile) in the Agoge courtyard. Beats: the boasting twins
(giant NPCs) → the jar slams shut (Ares's NPC *into* the jar tile) → Hermes
slips in and picks the lock. The Agoge gauntlet unlocks after; its leader
fights with the lesson: *strength alone is a jar with the lid on*.

## VI. The Ceryneian Hind — the Taygetos road

**Canon.** The golden-horned hind sacred to Artemis, which Heracles was set to
capture alive as his third labor — a full year's chase, ended with an arrow
through the forelegs that drew no blood, and Artemis's grudging pardon on the
promise of release. (Apollodorus II.5.3.)

**Plan.** A mountain route between Sparta and the coast. The hind appears as a
golden deer sprite that flees exactly one map ahead of the player (visible,
never catchable) across several visits — the chase *is* the route. Final beat:
Artemis intervenes; the player must choose to release rather than throw the
amphora. Reward: the Elaphos line's hidden evolution item (golden antler) and
Artemis's favor. Teaches Hunt discipline: some beasts are not for binding —
the anti-capture myth in a capture game.

## VII. Demeter & Persephone — Eleusis

**Canon.** Hades takes Persephone; Demeter wanders grieving, and the earth
starves; Zeus brokers her return — but Persephone has eaten pomegranate seeds,
and so divides the year: winter below, summer above. Demeter founds her
Mysteries at Eleusis. (*Homeric Hymn* II.)

**Plan.** The darkness-gym city. The whole map cycles between two palettes —
the fields tiles literally wither (`"` grass → bare `.`) while Demeter
grieves, and regreen at the reunion beat. Beats: the abduction (heard, not
seen — a torn veil by a cave mouth) → the barren wandering (encounters
disabled on the route! nothing lives) → the pomegranate bargain → the return.
Completion re-enables and upgrades Harvest encounters and opens the Underworld
gate for Myth VIII. The pomegranate is the game's one seen-but-unusable item
until the very end.

## VIII. Orpheus & Eurydice — the Underworld gate

**Canon.** Orpheus's bride dies of a serpent-bite; he sings his way past
Charon, Cerberus, and the throne of Hades; the dead weep, Sisyphus sits on his
stone. His music wins one condition: do not look back. At the last threshold,
he looks back. (Ovid, *Met.* X; Virgil, *Georgics* IV.)

**Plan.** The player's own myth, sprung without warning: NPCs throughout the
early game mention Eurydice as if she's waiting in Pimpleia — the healer's
lines, a letter item, flowers by the well. After Myth VII the elder meets you
at the village gate: the serpent has already struck. The Underworld is a
real dungeon map (Herald/Underworld encounters, the three great shades as
set-pieces calmed by lyre mini-beats, Cerberos as a boss soothed rather than
fought). At the final ascent, the game gives the player an actual **Look Back /
Don't Look** input. Canon says look back — and either choice must cost
something true. This is the emotional payload of the whole game; everything
else is rehearsal for this song.

## IX. Hermes & the First Lyre — the Sacred Way ✅ (told), Mt. Kyllene (to stage)

**Canon.** Infant Hermes steals Apollo's cattle, driving them backwards to
baffle the tracks, then strings seven strings across a tortoise shell — the
first lyre. Caught, he buys peace with the instrument; Apollo laughs, and the
trade seals their friendship. (*Homeric Hymn* IV.)

**Plan.** Hermes opens the whole game in person: the player begins with no
beasts, and the god of roads waits at Pimpleia's gate with three companions —
"I never travel with fewer than three" — the starter choice as a god's gift
(and a running joke: he claims credit for Orpheus's lyre, correctly). The tale
itself is *told* by Rhapsode Phemios on the Sacred Way — the origin of
Orpheus's own lyre and of Tortikin's design (the shell IS the lyre). To stage
later as a flashback on Mt. Kyllene: the player briefly controls the theft as
baby Hermes, walking backwards (reversed controls, one screen — the game's one
pure comedy beat). Reward: the Chelys line's hidden speed blessing.

## X. The Return of Hephaestus — the forge cave

**Canon.** Cast from Olympus by Hera, Hephaestus sends her a golden throne that
binds her fast. No god can free her; only the smith can, and he refuses to
come. Ares tries force and is driven off with fire. Dionysus tries wine — and
leads the smith home on a donkey, roaring drunk, to unbind her.
(Alcaeus fr. 349; the favorite scene of the vase-painters.)

**Plan.** A forge cave on the washed-out Sparta road: the road itself is
blocked *by* the quarrel (Hephaestus, sulking, has stopped the mountain
traffic). Beats: the trapped throne (Hera's priestess pleads) → Ares fails
(off-screen crash and a singed hoplite) → the player fetches unmixed wine from
Corinth → the donkey procession crosses the whole route map as a moving
parade. Completion opens the Sparta road: Forge and Wine reconciled, which is
also exactly their type-chart relation (Wine > Forge). 

## XI. The Golden Net — Corinth, temple on Acrocorinth

**Canon.** Aphrodite and Ares meet in secret; Helios tells the smith;
Hephaestus forges a net fine as spider-silk and catches the lovers mid-embrace,
then calls all the gods to look. Unquenchable laughter of the immortals;
Poseidon negotiates the release. (*Odyssey* VIII, the song of Demodocus.)

**Plan.** Told/staged as a comic shadow-play *inside* Aphrodite's temple — the
priestess already teases it ("not while the acolytes are listening"). Staged
with lamplight silhouettes on the temple wall (tile-art panel swaps) rather
than god NPCs — the myth as Corinthian gossip. Reward: the held-item system's
first item, the **Gold Mesh Charm** (survive one KO at 1 HP — a net that
catches you). Love/War/Forge triangle lesson.

## XII. Zeus & Typhon — Mount Olympus

**Canon.** Earth's last child, hundred-headed Typhon, storm and fire together,
against whom Zeus alone stood — thunderbolt against volcano, sinews cut and
recovered, and at last the monster pinned under Etna, where he smokes still.
(Hesiod, *Theogony* 820–880.)

**Plan.** The endgame and the Cult of Typhon's whole arc: the feral outbreaks,
Kass's defection, every city disturbance traces here. The Divine Council
battles climax at the Olympian gate, where the Cult attempts the un-pinning;
the final gauntlet is fought through the weather zones of the mountain as the
myth is re-told — because the Cult's whole heresy is that the myth ended
wrongly. Orpheus doesn't out-fight Typhon; the last beat is sung (the lyre
mechanic from Myth VIII returns as the finisher). Teaches nothing about the
type chart. Teaches what the songs are *for*.

---

## Design notes

- **One myth per domain** is the coverage rule (I:Sun, II:Wisdom+Sea, III:Sky,
  IV:Wine, V:War, VI:Hunt, VII:Harvest, VIII:Love+Underworld, IX:Herald,
  X:Forge, XI:Love/War/Forge ensemble, XII:Sky finale). Underworld and Love
  deliberately double up on VIII — the player's myth gets the two heaviest
  domains.
- **Myths mutate maps.** Every myth should leave at least one permanent tile
  change a returning player can point to (laurel `L`, spring `~`, olive `v`,
  withered fields, dolphins in the harbor…). The world remembers the stories.
- **Sequencing.** I → II are done and gate the roads. III/IV/XI cluster in
  Corinth (III begins after first Corinth visit). X unblocks the Sparta road;
  V–VI are the Sparta cluster; VII opens Eleusis; VIII follows VII directly;
  IX's staged half and XII are late-game. 
- **Sources** are cited for tone, not pedantry: Ovid where the telling is
  romantic (I, VIII), Homeric Hymns where it is ritual (IV, VII, IX), Homer
  where it is comic or humbling (V, XI), Hesiod where it is cosmic (XII).
