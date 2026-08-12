# DANCE OF THE GODS — Design & Build Plan
*A Pokémon-style RPG set in mythological Greece*

> **Update (Jul 2026):** the player character is **Orpheus** (Pimpleia is the home village), and each city stages one myth as a scripted overworld sequence — the full twelve-myth outline lives in **`myths.md`** (Myths I Delphi & II Athens implemented). Beasts start with one weak move and learn from per-species `learn` tables on level-up. Section 2 below is the *implemented* type chart, generated from `js/data.js`.

---

## 1. High Concept

You are a young **Keeper** traveling ancient Greece, collecting **Theriomorphs** — sacred animals bound to the twelve Olympian gods. Five great poleis each host a **Temple Gym** run by an Oracle. Defeat all five, then ascend Mount Olympus to face the Divine Council.

The hook: every creature line is a real sacred animal from Greek myth (Athena's owl, Zeus's eagle, Poseidon's bull), and each god defines an elemental **Domain** (the type system).

---

## 2. The Domain System (Types) — implemented chart

Twelve domains, one per Olympian. The rules, exactly as coded in `effectiveness()` (`js/data.js`):

1. If either side is **Herald**, the multiplier is **1** (the trickster is never super-effective and never resisted; Herald creatures instead get **+6% crit** on every move).
2. Else if the defender is in the attacker's `adv` list → **2×**.
3. Else if the attacker is in the defender's `adv` list → **½×**.
4. Else **1×**.

Because rule 2 is checked first, the one mutual pair — **Underworld ⇄ Sun** — is super-effective *in both directions* (chthonic and solar are at total war; there is no resisting between them).

### Full matrix — attacker (row) × defender (column)

| atk \ def | Sky | Sea | Und | Wis | War | Lov | Sun | Hnt | Frg | Hrl | Hrv | Win |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Sky** | 1 | **2** | 1 | ½ | **2** | 1 | 1 | 1 | ½ | 1 | 1 | 1 |
| **Sea** | ½ | 1 | 1 | 1 | 1 | 1 | **2** | 1 | **2** | 1 | ½ | 1 |
| **Und** | 1 | 1 | 1 | 1 | 1 | **2** | **2**† | 1 | 1 | 1 | ½ | 1 |
| **Wis** | **2** | 1 | 1 | 1 | **2** | ½ | 1 | 1 | 1 | 1 | 1 | ½ |
| **War** | ½ | 1 | 1 | ½ | 1 | 1 | 1 | **2** | 1 | 1 | **2** | 1 |
| **Lov** | 1 | 1 | ½ | **2** | 1 | 1 | 1 | ½ | 1 | 1 | 1 | **2** |
| **Sun** | 1 | ½ | **2**† | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | **2** |
| **Hnt** | 1 | 1 | 1 | 1 | ½ | **2** | 1 | 1 | ½ | 1 | **2** | 1 |
| **Frg** | **2** | ½ | 1 | 1 | 1 | 1 | 1 | **2** | 1 | 1 | 1 | ½ |
| **Hrl** | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| **Hrv** | 1 | **2** | **2** | 1 | ½ | 1 | 1 | ½ | 1 | 1 | 1 | 1 |
| **Win** | 1 | 1 | 1 | **2** | 1 | ½ | ½ | 1 | **2** | 1 | 1 | 1 |

† the mutual Underworld ⇄ Sun pair: 2× both ways.

### Per-domain summary (attacker's view / defender's view)

| Domain | God | Hits 2× | Is resisted by (½) | Takes 2× from | Resists (foe deals ½) |
|---|---|---|---|---|---|
| Sky | Zeus | Sea, War | Wisdom, Forge | Wisdom, Forge | Sea, War |
| Sea | Poseidon | Sun, Forge | Sky, Harvest | Sky, Harvest | Sun, Forge |
| Underworld | Hades | Sun†, Love | Harvest | Sun†, Harvest | Love |
| Wisdom | Athena | Sky, War | Love, Wine | Love, Wine | Sky, War |
| War | Ares | Hunt, Harvest | Sky, Wisdom | Sky, Wisdom | Hunt, Harvest |
| Love | Aphrodite | Wisdom, Wine | Underworld, Hunt | Underworld, Hunt | Wisdom, Wine |
| Sun | Apollo | Underworld†, Wine | Sea | Sea, Underworld† | Wine |
| Hunt | Artemis | Love, Harvest | War, Forge | War, Forge | Love, Harvest |
| Forge | Hephaestus | Sky, Hunt | Sea, Wine | Sea, Wine | Sky, Hunt |
| Herald | Hermes | — (always 1×; +6% crit passive) | — | — | — |
| Harvest | Demeter | Sea, Underworld | War, Hunt | War, Hunt | Sea, Underworld |
| Wine | Dionysus | Wisdom, Forge | Love, Sun | Love, Sun | Wisdom, Forge |

† mutual 2× (no resist leg).

Every non-Herald domain lands exactly **2 super-effective** hits and suffers exactly **2 weaknesses** — the graph is balanced and learnable. For every ordinary pair, "A hits B for 2×" implies "B hits A for ½" — *except* Underworld/Sun, where both directions are 2×. Underworld is therefore the only domain resisted by just one attacker (Love), and Sun the only one that resists just one (Wine); their extra "weakness leg" is the mutual war.

### Damage modifiers stack (from `js/engine.js`)

```
dmg = (((2·lvl/5 + 2) · power · A/D) / 50 + 2) · eff · STAB · crit · roll
```
- **eff**: 2 / 1 / ½ per the matrix above
- **STAB**: ×1.5 when the move's domain matches the user's
- **crit**: ×1.6; base 6% chance, +6% for Herald creatures, and Trick Jab carries its own 25%
- **roll**: uniform 0.88–1.00
- Status side-effects on stats: **burn** → Attack ×0.7, **chill** → Speed ×0.5; stat stages step ±30% (clamped to ±2, floor ×0.4)

---

## 3. Creature Roster (36 total: 12 lines × 3 stages)

Each god gets one 3-stage evolution line based on their sacred animal:

1. **Zeus / Sky** — Aetos line: *Peeplet → Aetion → Aetos Dios* (eagle; final form wields thunderbolts)
2. **Poseidon / Sea** — Taurios line: *Calfin → Wavebull → Taurios* (sea-bull with kelp mane)
3. **Hades / Underworld** — Cerberling line: *Pupnos → Dihound → Cerberos* (1 → 2 → 3 heads)
4. **Athena / Wisdom** — Glaux line: *Owlet → Glaucon → Glaux Sophos* (little owl, bronze-armored final)
5. **Ares / War** — Boaris line: *Piglos → Warthos → Kalydon* (Calydonian boar)
6. **Aphrodite / Love** — Peristera line: *Dovie → Columbra → Peristera* (dove; charm/status specialist)
7. **Apollo / Sun** — Pythonos line: *Slithra → Solserp → Pythonos* (Delphic serpent, solar flame)
8. **Artemis / Hunt** — Elaphos line: *Fawnling → Cerynhind → Elaphos Chrysos* (golden hind, bronze hooves)
9. **Hephaestus / Forge** — Automax line: *Cindercrab → Bronzeclaw → Automax* (bronze automaton crab, ref. Talos)
10. **Hermes / Herald** — Chelys line: *Tortikin → Swiftshell → Chelys Hermao* (winged tortoise — the lyre tortoise, fastest creature in the game as a joke that becomes true)
11. **Demeter / Harvest** — Ophis line: *Seedviper → Grainwyrm → Ophis Karpos* (grain serpent, drawn from Demeter's chthonic serpent chariot)
12. **Dionysus / Wine** — Pantheros line: *Cubvine → Vinther → Pantheros* (ivy-wreathed panther)

Plus **6 Legendary Monsters** (post-gym content): Chimera, Hydra, Sphinx, Pegasus, Minotaur, Phoenix. Dual-domain, no evolutions, one each hidden in the world.

Stats: HP / Attack / Defense / Grace (sp. atk) / Aegis (sp. def) / Speed. Each line has a stat identity (Cerberos = bulky attacker, Chelys = speed, Glaux = special wall, etc.).

---

## 4. The Five Cities & Gyms

Progression order, each city with a theme, gym, and story beat:

### City 1 — **Delphi** (tutorial region)
- Vibe: mountain sanctuary, pilgrims, the Omphalos stone
- **Gym: Temple of Apollo** — Leader: **Pythia** (Sun domain), 3 creatures, badge: **Laurel Badge**
- Story: the Oracle prophesies that the bonds between gods and mortals are fraying — creatures are turning feral.

### City 2 — **Athens**
- Vibe: agora, philosophers who battle you with logic-puzzle trainers, the Acropolis
- **Gym: The Parthenon** — Leader: **Archon Sofia** (Wisdom domain), gimmick: gym is a maze of riddles (Sphinx-style multiple choice; correct answers skip trainer battles)
- Badge: **Owl Badge**

### City 3 — **Sparta**
- Vibe: barracks, training yards, trainers auto-challenge you on sight — no dodging
- **Gym: The Agoge** — Leader: **Polemarch Leon** (War domain), gimmick: gauntlet of 5 back-to-back fights, no healing between
- Badge: **Spear Badge**

### City 4 — **Corinth** (port city)
- Vibe: harbor, merchants, the Diolkos ship-railway; sailing unlocked here
- **Gym: Temple of Poseidon at Isthmia** — Leader: **Navarch Thalassa** (Sea domain), gimmick: tide floods sections of the gym on a turn timer, changing paths
- Badge: **Trident Badge**

### City 5 — **Eleusis**
- Vibe: torchlit mystery cult, half the city is underground; entrance to the Underworld
- **Gym: The Telesterion** — Leader: **Hierophant Nyx** (Underworld + Harvest dual gym, hardest fight), gimmick: fought in darkness, limited visibility on the field
- Badge: **Pomegranate Badge**

### Endgame — **Mount Olympus**
Five badges open the Olympian Gate. Climb through weather zones, then face the **Divine Council**: four elite battles (Hermes, Artemis, Hephaestus, Hera-champion using mixed teams) and a final confrontation with the story antagonist.

### Story Antagonist
**The Cult of Typhon** — appears in every city causing the feral outbreaks, trying to awaken Typhon beneath Mount Etna. Rival character: **Kass**, a cult defector who battles you at each city and gradually joins your side.

---

## 5. Core Mechanics

- **Battles**: turn-based 1v1, party of up to 6. Moves have Power / Accuracy / Domain / PP. Speed decides order. Standard damage formula (Pokémon Gen-1 style, simplified): `dmg = ((2·lvl/5 + 2) · power · atk/def)/50 + 2`, × domain multiplier (2 / 1 / 0.5), × STAB 1.5, × crit.
- **Capture**: throw **Amphorae** (clay jar = the ball). Catch rate scales with remaining HP % and status. Tiers: Clay, Painted, Golden Amphora.
- **Status effects**: Burn, Chill (freeze-lite: speed cut), Charm (may skip turn), Poison, Sleep.
- **Leveling**: EXP from battles; evolutions at set levels (16 / 32 baseline, varies per line).
- **Wild encounters**: grass = olive groves / scrubland; also caves, sea routes, ruins. Encounter tables per route (~3–5 species each, from other lines' early stages so all 12 lines are catchable pre-Olympus).
- **Moves**: ~60 total moves (5 per domain: one weak/strong physical, weak/strong special, one status). Each creature learns 4 max, learnset per line.
- **Items**: Ambrosia (full heal), Nectar (potion tiers), Antidote herbs, domain-boost charms (held items, phase 2).
- **Blessings** (replaces abilities, phase 2): one passive per creature granted by its god.

---

## 6. World Map

Overworld graph, ~12 routes connecting the five cities:

```
        Mt. Olympus
             |
  Delphi — Route 3 — Athens
     |                 |
  Route 2           Route 5
     |                 |
  [Start:          Corinth — sea routes — islands (legendaries)
   Thebes-adjacent     |
   village]         Route 7
                       |
                    Sparta      Eleusis — (Underworld cave)
```

(Exact geography flexible — roughly honest to the real map: Delphi NW, Athens E, Corinth on the isthmus, Sparta S, Eleusis near Athens.)

Tile-based movement (grid, 16×16 logical tiles), Game-Boy-era presentation.

---

## 7. Technical Plan

Single-file HTML/JS (your usual stack), Canvas rendering, no build step. Architecture:

- **State machine**: `OVERWORLD | BATTLE | MENU | DIALOGUE | EVOLUTION | TITLE`
- **Data-driven everything**: creatures, moves, trainers, encounter tables, maps as plain JS objects — so content lives separately from engine code
- **Maps**: tilemaps as 2D arrays with a tileset legend; collision layer; warp tiles for doors/city transitions
- **Sprites**: procedural/geometric creature sprites drawn on canvas at first (placeholder-friendly), consistent with a chosen palette; can upgrade to pixel-art data later
- **Save system**: in-memory + export/import save string (no localStorage in artifacts)
- **Battle engine**: pure function core (`resolveTurn(state, actionA, actionB) → newState + event log`) with the UI replaying the event log — makes it testable and lets you add AI later
- **Trainer AI**: v1 = highest-expected-damage move; v2 = adds switching and status logic
- **Aesthetic**: your editorial style could actually work here — cream parchment UI, Cormorant Garamond for dialogue, black-figure-pottery-inspired creature silhouettes (terracotta/black palette). Distinctive and way easier to make look good than pixel art.

---

## 8. Build Phases

**Phase 1 — Battle core (playable slice)**
Battle engine + 12 first-stage creatures + ~24 moves + domain chart + one scripted trainer fight. Deliverable: a battle screen you can win/lose.

**Phase 2 — Overworld**
Tilemap renderer, player movement, one town + one route, wild encounters, capture mechanic, party menu.

**Phase 3 — Progression**
EXP/leveling/evolution, full 36-creature roster, healing temple (Pokécenter), shop, save export.

**Phase 4 — Content: Cities 1–2**
Delphi + Athens, routes between, gym gimmicks, badge system, Kass rival fight #1, Cult of Typhon intro.

**Phase 5 — Content: Cities 3–5**
Sparta gauntlet, Corinth tides + sailing, Eleusis darkness gym.

**Phase 6 — Endgame + polish**
Mount Olympus, Divine Council, legendaries, Blessings, held items, sound (Tone.js — you could even score it), balance pass.

Each phase is independently shippable. Phase 1 is the right first artifact: it forces all the data schemas (creatures, moves, domains) that everything else builds on.

---

## 9. Open Design Questions

1. Pottery-silhouette aesthetic vs. classic pixel art?
2. Starter choice: pick one of three (traditional) — e.g., Owlet / Calfin / Slithra as a Wisdom/Sea/Sun triangle — or begin with Hermes's tortoise as a fixed story starter?
3. Difficulty: healing between gym fights automatic, or Pokémon-classic item economy?
4. How mythologically strict — real Greek names throughout, or the softened portmanteaus above?
