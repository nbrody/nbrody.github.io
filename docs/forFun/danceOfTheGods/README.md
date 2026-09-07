# Dance of the Gods

A browser RPG starring Orpheus, with sacred animal companions and an original first chapter set between Pimpleia and Delphi. Open `index.html` through any static HTTP server. No build or install is needed to play.

```sh
python3 -m http.server 18765 --directory docs/forFun/danceOfTheGods
```

Visit `http://localhost:18765`. The game saves this device's journey in local storage; the satchel supports JSON export/import. Existing version 1 journeys migrate when continued. A private browser or unavailable storage still allows play and export.

## Controls

- WASD / arrows: move. Hold Shift to run.
- E / Space / Enter: interact or advance a conversation.
- P: companions. J: journal. B: satchel. Escape: close a menu.
- Battle: click an action or press its position, 1–6. Click the dialogue or press Space to advance battle text.
- Touch: the direction pad moves; its center button interacts. Story choices and battle actions are touch buttons.
- Sound is optional. Quick battle text is available in the satchel. Reduced-motion preferences are respected.

## Book I: The broken song

Hermes offers Brontlet, Calfin, or Kilnclaw. Myrrha teaches a melody at the village well. Repeating **river → leaf → sun** at Grove Road's listening shrine reveals a stolen note and leads to Kass, a defector from the Cult of Typhon. Her spar unlocks Delphi. Pythia asks Orpheus to hear Daphne's river and Eros's ember before restoring a hollow guardian with Apollo. The chapter concludes with a player-chosen promise, the Laurel Seal, rewards, and a passage to the Sacred Way.

Ione's frightened Cresfawn is an optional rescue in the southwest grove. Winning or befriending it gives the companion; reporting back to Ione gives an additional reward. Supply caches and Melitta's shop support exploration. Later areas and the Athens contest remain playable.

## Systems

- Twelve domains and twelve sacred families. Companions learn moves, share favor, and awaken at levels 16 and 32. Each awakening changes stats, name, and portrait, for 36 illustrated forms.
- Speed, move priority, domain advantage, physical/special defenses, critical hits, stat changes, and five status conditions affect battles. Moves have limited uses; exhausted companions can always use Last Resolve.
- Playing the lyre heals 10% (at least 2 HP), halves incoming damage that turn, and adds harmony. At three harmony, the next damaging move consumes it for 35% extra power. Harmony also improves wild capture probability.
- Amphorae are consumed once per attempt. Captured beasts heal and join a party of six, with overflow available in the Oracle's keeping. The party menu changes the lead and transfers companions.
- Voluntary switching and items spend a turn; replacing a fallen companion does not. Nectar, herbs, and ambrosia can target party members in battle. A third attempted escape always succeeds.
- Healing NPCs replenish health, conditions, and move uses, and become recovery checkpoints. Defeat preserves story progress. Saving during a battle is deferred until returning to the road.
- A journal tracks the main story, the rescue, and encountered/befriended species. Map markers, contextual interaction prompts, a minimap, and the next objective provide navigation.

## Source layout

`data.js` and `engine.js` hold mechanics; `battle.js` presents battles. `maps.js` contains base maps and the Athens myth; `chapter.js` decorates the opening region and defines its storyline. `overworld.js` handles movement and interactions; `scenery.js` renders terrain, depth-sorted scenery, people, and map overlays. `journey.js` provides menus, items, audio, and save UI; `save.js` validates and restores journeys. Creature illustration loading is in `art.js`, with the illustrated Orpheus renderer in `keeper.js` and legacy procedural fallbacks in `sprites.js`; `bestiary.js` presents the illustrated field guide.

The older documents in `docs/` are worldbuilding and long-term design references. This README describes the implemented game; planned cities, legendary monsters, and future temple systems in those documents are not all implemented.

## Beast illustrations

All twelve first forms have detailed front and rear battle illustrations, and all 24 evolutions have unique front portraits generated with the built-in image tool. Homepage and overworld scenes use full-color storybook sprites. Calfin and Cresfawn have lightly simplified variants of their detailed PNGs: the same anatomy, expressions, palette, and markings, with smoother surface texture and fewer fine highlight lines. Orpheus has matching illustrated front, rear, and side views with a laurel wreath, teal cloak, cream chiton, and lyre; the side view is mirrored for the fourth walking direction. First-form companions appear from behind in battle; evolved companions and all opponents use their current form’s front portrait. Evolution rear views are not included. Starter, party, and field-guide portraits retain the detailed art. **Meet the beasts** on the title screen (or `#bestiary` in the URL) opens their field guide, also accessible from the journal. Choose First forms, Awakened (Lv 16), or Ascended (Lv 32) to browse all 36 beasts. The Front views / Back views buttons compare first-form portraits, and each family’s awakening links jump between its forms. Starter portraits include their hybrid category and personality. Names propagate through battles, party menus, dialogue, and migrated saves.

Artwork lives in `assets/gen/beasts/`; the front-view prompts and design metadata are preserved in [`prompts.json`](assets/gen/beasts/prompts.json), with rear-view prompts and correction notes in [`back-prompts.json`](assets/gen/beasts/back-prompts.json). Rear files use the stable species key plus `Back.png`, such as `peepletBack.png`. World sprites and their [prompt set](assets/gen/world/prompts.json) live in `assets/gen/world/`. While a lighter beast variant loads, its detailed front portrait can stand in. Rear portraits load when a party enters battle; unavailable rear art falls back to the front portrait, then the procedural silhouette. [`docs/BEASTS.md`](docs/BEASTS.md) describes the revised anatomy, temperament, and mythological sources. Existing species keys, types, and stats are preserved. War's final awakening is now Phalanboar to avoid conflating Ares with Artemis's Calydonian boar. Evolution portraits live in `assets/gen/beasts/evolutions/` as `<species-key>-1.png` and `<species-key>-2.png`, with all concepts and prompts in [`evolutions/prompts.json`](assets/gen/beasts/evolutions/prompts.json). Portraits are derived from level in both battles and the party, including restored saves. Sheafang is now a wheat-cheeked Harvest dormouse, awakening into Granibble and Thesmora; its stable `seedviper` key preserves journeys.

## Olympian portraits

**Meet the gods** on the title screen, in the journal, or beside the field-guide controls opens the illustrated divine patrons. A direct link is `#gods`. The twelve full-body portraits share their sacred families’ palettes, materials, and disposition; each portrait is displayed with all three beast forms. Select a beast to open that form in the field guide, or select a patron’s name in the guide to meet the god. Portraits open at full resolution when clicked.

Transparent PNGs live in [`assets/gen/gods/`](assets/gen/gods/), with the complete built-in image-generation [prompt set and reference mappings](assets/gen/gods/prompts.json). `js/pantheon.js` supplies the gallery and character notes. This follows the game’s existing twelve-domain roster, including Hades; Hera and Hestia have no beast families.

## Checks

Run the dependency-free battle engine checks:

```sh
node docs/forFun/danceOfTheGods/tests/engine.test.cjs
```

Browser checks require Playwright and Chrome. Start the static server, then run the scripts below with Playwright available on Node's module search path. `DANCE_URL` can select another server and `DANCE_QA_DIR` another screenshot directory; default screenshots go to the operating system's temporary directory.

```sh
node docs/forFun/danceOfTheGods/tests/playthrough.cjs
node docs/forFun/danceOfTheGods/tests/features.cjs
node docs/forFun/danceOfTheGods/tests/beasts.cjs
node docs/forFun/danceOfTheGods/tests/world-art.cjs
node docs/forFun/danceOfTheGods/tests/evolutions.cjs
node docs/forFun/danceOfTheGods/tests/pantheon.cjs
```

The playthrough walks the opening chapter using game controls, completes battles and the ending, reloads its save, checks legacy migration, and renders desktop/mobile views. Feature checks cover items, switching, harmony, capture overflow, exhausted moves, escape, defeat, party transfers, settings, save validation, and touch input. Each browser run uses a fresh temporary profile and leaves player saves alone.

`?dev` exposes the existing scenario picker for manual playtesting. Sessions do not save unless explicitly enabled there. `?art=vector` exercises the procedural creature fallback.
