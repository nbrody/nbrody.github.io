"use strict";
/* Book I is an original story set among the existing myths. Flags are the
   source of truth: maps can always be rebuilt, including older saved games. */
function addChapter(world) {
  const V = world.village,
    R = world.route,
    D = world.delphi;
  V.region = "FOOTHILLS OF OLYMPUS";
  R.region = "THE PILGRIM'S ROAD";
  D.region = "SANCTUARY OF APOLLO";
  V.npcs.find((n) => n.name === "Hermes").y = 10;
  Object.assign(
    V.npcs.find((n) => n.name === "Elder Myrrha"),
    { kind: "script", script: myrrhaStory },
  );
  Object.assign(
    V.npcs.find((n) => n.name === "Village Child"),
    { name: "Ione", kind: "script", script: ioneStory },
  );
  V.npcs.push({
    x: 12,
    y: 5,
    dir: "down",
    sprite: "villager",
    name: "Melitta",
    kind: "script",
    script: () => merchantStory(),
  });
  V.grid[8][4] = "m";
  V.grid[9][4] = "m";
  // Short side roads make the village's services readable at a glance.
  for (let x = 3; x <= 12; x++) if (V.grid[5][x] === ".") V.grid[5][x] = ",";
  for (let x = 5; x <= 11; x++) if (V.grid[8][x] === ".") V.grid[8][x] = "m";
  for (const [x, y] of [
    [2, 6],
    [3, 11],
    [13, 6],
    [12, 11],
    [1, 10],
    [14, 9],
  ])
    if (V.grid[y][x] === ".") V.grid[y][x] = "f";
  V.grid[10][11] = "v";
  V.grid[10][3] = "v";
  V.decorations = [
    { x: 3, y: 5, label: "MYRRHA'S WELL" },
    { x: 12, y: 5, label: "PROVISIONS" },
  ];
  V.pickups = [{ id: "village-herbs", x: 2, y: 10, item: "remedy", count: 2 }];
  R.pickups = [
    { id: "grove-amphorae", x: 13, y: 10, item: "amphora", count: 3 },
    { id: "grove-nectar", x: 3, y: 7, item: "nectar", count: 2 },
  ];
  R.grid[4][4] = "O";
  R.grid[5][4] = "m";
  R.signs["4,4"] =
    "The old listening shrine. Three strings are carved into its stone.";
  R.npcs.push({
    x: 4,
    y: 5,
    dir: "down",
    sprite: "rhapsode",
    name: "Listening Shrine",
    kind: "script",
    script: groveShrine,
    shrine: true,
  });
  R.npcs.push({
    x: 4,
    y: 13,
    dir: "down",
    sprite: "deer",
    name: "Frightened Cresfawn",
    kind: "script",
    script: rescueFawn,
    beast: "fawnling",
  });
  const kass = R.npcs.find((n) => n.name === "Kass");
  Object.assign(kass, {
    kind: "script",
    script: kassStory,
    teamLv: [7, 8],
    reward: 35,
    onDefeat: () => {
      state.ow.flags.kass = true;
      openDelphiGate();
    },
    after: [
      "<b>Kass</b>: “You let your companion fall back when it was hurting. The Cult called that weakness.”",
      "She unwinds a black cord from her wrist. “They took a note from Delphi's altar. I helped carry it. I didn't know what the silence would do.”",
      "“Show this cord to Pythia. I'll keep the road safe behind you.” <b>The gate to Delphi opens.</b>",
    ],
  });
  D.pickups = [
    { id: "delphi-provisions", x: 2, y: 8, item: "nectar", count: 2 },
  ];
  D.grid[6][8] = "O";
  for (let x = 11; x <= 16; x++) D.grid[11][x] = ",";
  for (const [x, y] of [
    [2, 3],
    [4, 8],
    [14, 12],
    [15, 7],
    [15, 13],
    [2, 13],
  ])
    D.grid[y][x] = "f";
  Object.assign(
    D.npcs.find((n) => n.name === "Pythia"),
    { kind: "script", script: pythiaStory },
  );
  Object.assign(
    D.npcs.find((n) => n.name === "Apollo"),
    { script: apolloStory },
  );
  Object.assign(
    D.npcs.find((n) => n.name === "Daphne"),
    { script: daphneStory },
  );
  Object.assign(
    D.npcs.find((n) => n.name === "Eros"),
    { script: erosStory },
  );
  D.npcs.find((n) => n.name === "Temple Acolyte").teamLv = [8, 9];
  D.signs["12,13"] =
    "DELPHI · A sanctuary without a song. Pythia waits at the temple's central columns.";
  return world;
}
addChapter(MAPS);

function questInfo() {
  const f = state.ow.flags;
  if (!state.team.length)
    return {
      title: "A gift for the road",
      text: "Speak to Hermes beside the village road.",
      map: "village",
      x: 8,
      y: 10,
    };
  if (!f.wellSong)
    return {
      title: "The silent well",
      text: "Find Elder Myrrha by Pimpleia's well.",
      map: "village",
      x: 5,
      y: 8,
    };
  if (!f.groveSong)
    return {
      title: "A song in the stone",
      text: "Find the listening shrine in Grove Road's northwest grove.",
      map: "route",
      x: 4,
      y: 5,
    };
  if (!f.kass && !MAPS.route.npcs.find((n) => n.name === "Kass").defeated)
    return {
      title: "The girl with the black cord",
      text: "Meet Kass at the bend in Grove Road.",
      map: "route",
      x: 7,
      y: 9,
    };
  if (!f.delphi)
    return {
      title: "The missing note",
      text: "Bring Kass's black cord to Pythia in Delphi.",
      map: "delphi",
      x: 10,
      y: 4,
    };
  if (f.delphi < 2 && !f.riverNote)
    return {
      title: "What the river remembers",
      text: "Listen to Daphne on Delphi's eastern riverbank.",
      map: "delphi",
      x: 16,
      y: 10,
    };
  if (f.delphi < 2 && !f.emberNote)
    return {
      title: "What the fire remembers",
      text: "Ask Eros what happened at the altar.",
      map: "delphi",
      x: 12,
      y: 6,
    };
  if (f.delphi < 2)
    return {
      title: "The hollow guardian",
      text: "Return to Apollo. Restore the song in the sanctuary.",
      map: "delphi",
      x: 9,
      y: 6,
    };
  if (f.delphi === 2)
    return {
      title: "The first laurel",
      text: "Speak to Pythia to finish the song.",
      map: "delphi",
      x: 10,
      y: 4,
    };
  if ((f.athens || 0) < 3) {
    if (state.ow.map?.id === "athens")
      return {
        title: "The contest for the city",
        text: "Speak to King Cecrops on the acropolis to witness the gods' gifts.",
        map: "athens",
        x: 11,
        y: 7,
      };
    if (state.ow.map?.id === "sacredWay")
      return {
        title: "A city waiting for its name",
        text: "Follow the ridge road east to Athens.",
        map: "sacredWay",
        x: 23,
        y: 6,
      };
    return {
      title: "A city waiting for its name",
      text: "Take the Sacred Way northwest of the temple to Athens.",
      map: "delphi",
      x: 2,
      y: 0,
    };
  }
  return {
    title: "Beyond the olive",
    text: "Follow the Coast Road south from Athens to Corinth.",
    map: "athens",
    x: 10,
    y: 17,
  };
}
function markStory(flag, value = true) {
  state.ow.flags[flag] = value;
  updateHUD();
  saveGame();
}
async function openingStory() {
  if (state.ow.flags.intro) return;
  markStory("intro");
  await owSay([
    "<b>BOOK I · THE BROKEN SONG</b><br>At dawn, every bird in Pimpleia stops singing. Your lyre answers with a string that has never sounded before.",
    "<b>Orpheus</b>: “Mother used to say the world was a song the gods learned together. So who has forgotten their part?”",
    "A traveler with winged sandals waves from the road. <b>Find Hermes. Move with WASD or the arrows; face him and press E or Space.</b>",
  ]);
}
async function myrrhaStory() {
  state.team.forEach(healFull);
  state.caught.forEach(healFull);
  state.checkpoint = { map: "village", x: 5, y: 9 };
  if (!state.team.length) {
    await owSay(
      "<b>Myrrha</b>: “Hermes is waiting on the road, child. Take a companion before you try to mend the world.”",
    );
    return;
  }
  if (!state.ow.flags.wellSong) {
    await owSay([
      "<b>Myrrha</b>: “The well has gone quiet. Even water has a voice, if you listen. Your mother taught you its tune.”",
      "You lower your lyre over the water. One clear note rises from the dark: <b>river, leaf, sun</b>. Your companion answers the last note.",
      "<b>Myrrha</b>: “There. A bond, freely answered. Try that tune at the old shrine in the northwest grove. If it still remembers, Delphi may yet be saved.”",
    ]);
    markStory("wellSong");
    rewardItems({ nectar: 2 }, 0);
    playLyre([0, 2, 4]);
  }
  await owSay(
    "<b>Myrrha</b> restores your companions' health and move uses. <b>This well is your resting place.</b>",
  );
}
async function ioneStory() {
  const f = state.ow.flags;
  if (f.fawnRescued) {
    if (!f.ioneReward) {
      await owSay([
        "<b>Ione</b>: “You found the little deer! Look — it isn't shaking anymore.”",
        "She presses her little painted amphora into your hand. “For the next friend you find.” <b>Received 4 amphorae and 20 drachmae.</b>",
      ]);
      markStory("ioneReward");
      rewardItems({ amphora: 4 }, 20);
    } else
      await owSay(
        "<b>Ione</b>: “I think it's singing your song. Or maybe you're singing its song.”",
      );
  } else {
    markStory("fawnQuest");
    await owSay([
      "<b>Ione</b>: “A fawn used to eat flowers from my hand. This morning it ran into the southern grove. It looked so frightened.”",
      "“Will you bring it back to itself?” <b>Optional: find the Cresfawn in the southwest grass on Grove Road. Use your lyre to calm it.</b>",
    ]);
  }
}
async function groveShrine() {
  if (state.ow.flags.groveSong) {
    await owSay(
      "The listening shrine sings with you. <b>River, leaf, sun.</b> Three small voices, holding the silence back.",
    );
    return;
  }
  if (!state.ow.flags.wellSong) {
    await owSay(
      "Three strings are carved into the stone, but you do not know their tune. <b>Myrrha, beside the village well, may remember.</b>",
    );
    return;
  }
  await owSay(
    "The shrine holds its breath. Beneath the moss: <b>Water wakes the root. The leaf greets the light.</b> Play Myrrha's three notes.",
  );
  const melody = [];
  for (let i = 0; i < 3; i++) {
    const note = await owChoose(
      `<b>The listening shrine</b> · Note ${i + 1} of 3${melody.length ? `<br>${melody.join(" → ")}` : ""}`,
      [
        { label: "River · low", value: "River" },
        { label: "Leaf · middle", value: "Leaf" },
        { label: "Sun · high", value: "Sun" },
        { label: "Step away", value: "cancel" },
      ],
    );
    if (note === "cancel") return;
    melody.push(note);
    playLyre([["River", "Leaf", "Sun"].indexOf(note) * 2]);
  }
  if (melody.join(",") !== "River,Leaf,Sun") {
    await owSay(
      "The notes fall apart, gently. No offering is lost. <b>River first, then leaf, then sun.</b> Try the shrine again when you are ready.",
    );
    return;
  }
  markStory("groveSong");
  rewardItems({ nectar: 2, amphora: 2 }, 20);
  await owSay([
    "Roots shift beneath your feet. For one bright moment you hear the grove as it was: a thousand creatures singing different parts of the same song.",
    "Then a fourth note pulls away — a hollow sound, coming from Delphi. A black thread lies caught in the shrine's roots.",
    "<b>Learned: Hymn of Returning.</b> In battle, your lyre raises harmony, calms wild beasts, and shields your companion for one turn. <b>Kass waits at the bend in the road.</b>",
  ]);
}
async function rescueFawn(npc) {
  if (state.ow.flags.fawnRescued) {
    await owSay("A familiar hoofprint. The grove is peaceful here now.");
    return;
  }
  if (!state.team.length) return;
  await owSay([
    "A little <b>Cresfawn</b> tangles its antlers in the brambles. A black thread is wound around one hoof.",
    "It startles at your approach. <b>Use the Lyre to make befriending it easier, or gently win the encounter to free it.</b>",
  ]);
  const fawn = makeCreature("fawnling", 5);
  beginBattle({
    mode: "wild",
    foeTeam: [fawn],
    canCatch: true,
    canFlee: true,
    foeName: "The frightened fawn",
    intro: [
      "The Cresfawn cries out. There is fear in its voice, but no anger.",
    ],
    onEnd: async (result) => {
      if (result === "lost") return blackout();
      if (result === "fled") return returnToOverworld();
      if (result === "won") captureFoe(fawn);
      markStory("fawnRescued");
      npc.gone = true;
      returnToOverworld();
      await owSay([
        "The black thread loosens. <b>Cresfawn</b> nudges your lyre, then settles beside your companions.",
        "<b>Ione in Pimpleia will be glad to hear it is safe.</b>",
      ]);
    },
  });
}
async function kassStory(npc) {
  if (npc.defeated || state.ow.flags.kass) {
    await owSay(npc.after);
    return;
  }
  if (!state.ow.flags.groveSong) {
    await owSay([
      "<b>Kass</b>: “That lyre of yours — can it wake the old shrine? In the northwest grove?”",
      "“Do that first. I need to know you hear it too. Myrrha in Pimpleia knows its song.”",
    ]);
    return;
  }
  await owSay([
    "<b>Kass</b> turns the black thread over in her palm. She wears the same cord around her wrist.",
    "“They told me bonds were chains. That freeing the beasts meant silencing the gods. But the beasts aren't free. They're terrified.”",
    "“Show me a bond that doesn't need a chain.” <b>Kass restores your companions before the spar.</b>",
  ]);
  state.team.forEach(healFull);
  trainerBattle(npc);
}
async function pythiaStory() {
  const f = state.ow.flags;
  state.team.forEach(healFull);
  state.caught.forEach(healFull);
  state.checkpoint = { map: "delphi", x: 10, y: 5 };
  if (!f.delphi) {
    markStory("delphi", 1);
    await owSay([
      "<b>Pythia</b> takes the black cord without surprise. “A stolen note leaves a wound. The Cult pulled it from the heart of this sanctuary.”",
      "“Apollo tried to fill the silence with his own voice. Now the guardian at the altar hears nothing else.”",
      "“A song is more than its loudest singer. <b>Daphne remembers the river's part. Eros saw what burned at the altar.</b> Hear them both, then speak to Apollo.”",
      "She touches your amphorae. <b>Your companions are restored. Delphi is now your resting place.</b>",
    ]);
  } else if (f.delphi === 2) {
    const choice = await owChoose(
      "<b>Pythia</b>: “A new song needs a promise, Orpheus. What will yours remember?”",
      [
        { label: "Every voice deserves to be heard", value: "voices" },
        { label: "No bond should be a chain", value: "freedom" },
      ],
    );
    markStory("promise", choice);
    await owSay([
      "You play the river's note, then the ember's. Your companions answer. At last, the empty space in the song fills — not with a god's voice, but with all of yours.",
      "<b>Apollo</b> lowers his lyre. “I thought keeping the world in tune meant making it sing like me.”",
      "Daphne lays a fallen laurel branch upon the altar. “Then let this be a beginning.”",
      "<b>Pythia</b>: “Take the <b>Laurel Seal</b>, keeper of the first verse. The roads ahead will ask more of you. Carry this answer.”",
    ]);
    markStory("delphi", 3);
    markStory("laurel");
    openSacredWay();
    rewardItems({ amphora: 5, nectar: 3, ambrosia: 1 }, 80);
    playLyre([0, 2, 4, 7, 4]);
    await owSay([
      `<b>BOOK I COMPLETE · THE BROKEN SONG</b><br>Laurel Seal earned · 80 drachmae · your supplies replenished.${f.fawnRescued ? "<br>In Pimpleia, Ione's little deer is singing again." : ""}`,
      "At the gate, Kass waits with a folded scrap of sailcloth. “The Cult is heading east. A city with no name. Two gods fighting over who gets to be heard.”",
      "<b>Next: The Contest for the City.</b> The Sacred Way opens northwest of the temple. Your journal remembers the whole first verse.",
    ]);
  } else
    await owSay(
      f.delphi >= 3
        ? "<b>Pythia</b>: “The first verse is safe. Rest here whenever the road grows long.” <b>Your companions are restored.</b>"
        : "<b>Pythia</b>: “Hear Daphne by the river and Eros by the altar. Then help Apollo listen.” <b>Your companions are restored.</b>",
    );
}
async function daphneStory() {
  if (!state.ow.flags.delphi) {
    await owSay(
      "<b>Daphne</b>: “The river is quieter than it should be. Speak to Pythia. She has been expecting a singer.”",
    );
    return;
  }
  if (state.ow.flags.riverNote) {
    await owSay(
      "<b>Daphne</b>: “The river's part is yours to carry. Let it move at its own pace.”",
    );
    return;
  }
  await owSay([
    "<b>Daphne</b> trails one hand in the current. “Apollo keeps calling for the river to sing louder. But rivers don't answer commands.”",
    "You set down the lyre and listen. Beneath the rush of water, a low note rises and falls with your breathing.",
    "“There. You heard it because you left room for it.” <b>Remembered: the river's note.</b>",
  ]);
  markStory("riverNote");
  playLyre([0, 2, 0]);
}
async function erosStory() {
  if (!state.ow.flags.delphi) {
    await owSay(
      "<b>Eros</b>: “Someone stole something that isn't a thing. Pythia will explain. I prefer riddles.”",
    );
    return;
  }
  if (state.ow.flags.emberNote) {
    await owSay(
      "<b>Eros</b>: “Even a little voice can bring a great god to a standstill. Remember that.”",
    );
    return;
  }
  await owSay([
    "<b>Eros</b> balances a coal on an arrowhead. “The thieves burned their cord at the altar. Such solemn faces. As if breaking something made them brave.”",
    "He taps the coal against your lyre. It rings like a tiny bell. “Fire remembers everything it touches. This one remembers a song.”",
    "“Apollo thinks I only know how to wound hearts. Don't tell him I can mend things.” <b>Remembered: the ember's note.</b>",
  ]);
  markStory("emberNote");
  playLyre([4, 7, 4]);
}
async function apolloStory() {
  const f = state.ow.flags;
  if ((f.delphi || 0) >= 2) {
    await owSay(
      "<b>Apollo</b>: “Pythia is waiting. For once, singer, I will let another voice finish.”",
    );
    return;
  }
  if (!f.riverNote || !f.emberNote) {
    await owSay(
      "<b>Apollo</b>: “The guardian repeats my last command, over and over. Pythia says you can help. Listen to her, and to the voices she names.”",
    );
    return;
  }
  const ready = await owChoose(
    "<b>Apollo</b>: “I can restore your companions, but I cannot sing this verse for you. Will you face the hollow guardian?”",
    [
      { label: "Restore the song", value: true },
      { label: "Prepare a little longer", value: false },
    ],
  );
  if (!ready) return;
  state.team.forEach(healFull);
  const guardian = makeCreature("slithra", 11);
  guardian.name = "Hollow Guardian";
  guardian.maxhp = Math.round(guardian.maxhp * 1.45);
  guardian.hp = guardian.maxhp;
  guardian.moves = ["sunlance", "solarFlare", "wingedStep"];
  restorePP(guardian);
  beginBattle({
    mode: "guardian",
    foeTeam: [guardian],
    canCatch: false,
    canFlee: false,
    foeName: "The hollow guardian",
    reward: 60,
    intro: [
      "The altar answers with a broken chord. The guardian coils in its light.",
      "<b>The guardian gathers solar fire.</b> Watch its intent. Use the Lyre to shield your companion and weaken its next strike.",
    ],
    onEnd: async (result) => {
      if (result === "lost") return blackout();
      markStory("delphi", 2);
      returnToOverworld();
      await owSay([
        "The guardian's fire gutters. You play the two remembered notes into the quiet, and its eyes clear.",
        "<b>Apollo</b>: “Not defeated. Returned.” For the first time, his voice is barely a whisper. <b>Pythia waits by the temple columns.</b>",
      ]);
    },
  });
}
