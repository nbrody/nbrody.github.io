"use strict";
let choiceResolver = null;
function owChoose(text, choices) {
  owBusy = true;
  state.ow.nextDir = null;
  Object.keys(keys).forEach((k) => (keys[k] = false));
  dlgResolver = null;
  $("owd-text").innerHTML = text;
  $("ow-dialogue").classList.remove("hidden");
  $("dialogue-choices").innerHTML = "";
  document.querySelector(".owd-cue").classList.add("hidden");
  return new Promise((resolve) => {
    choiceResolver = resolve;
    choices.forEach(({ label, value }) => {
      const b = document.createElement("button");
      b.className = "btn small";
      b.textContent = label;
      b.onclick = (e) => {
        e.stopPropagation();
        if (!choiceResolver) return;
        const finish = choiceResolver;
        choiceResolver = null;
        $("dialogue-choices").innerHTML = "";
        $("ow-dialogue").classList.add("hidden");
        document.querySelector(".owd-cue").classList.remove("hidden");
        owBusy = false;
        finish(value);
      };
      $("dialogue-choices").appendChild(b);
    });
    $("dialogue-choices").querySelector("button")?.focus();
  });
}
function updateHUD() {
  if (!state.ow.map) return;
  const q = questInfo();
  $("ow-hint").textContent = q.text;
  $("resources").textContent =
    `${state.drachma} drachmae · ${state.inventory.amphora} amphorae${state.ow.flags.laurel ? " · ✧ Laurel Seal" : ""}`;
  $("chapter-label").textContent =
    state.ow.flags.delphi >= 3
      ? "BOOK II / THE CITY & THE OLIVE"
      : "BOOK I / THE BROKEN SONG";
  $("ow-region").textContent = state.ow.map.region || "THE ROADS OF HELLAS";
}
function rewardItems(items, coins) {
  for (const [key, count] of Object.entries(items))
    state.inventory[key] = (state.inventory[key] || 0) + count;
  state.drachma += coins;
  updateHUD();
  saveGame();
}
function canUseItem(key, c) {
  if (!c || !state.inventory[key]) return false;
  if (key === "nectar") return c.hp > 0 && c.hp < c.maxhp;
  if (key === "remedy") return !!c.status;
  if (key === "ambrosia")
    return (
      c.hp < c.maxhp || !!c.status || c.moves.some((m) => c.pp[m] < maxPP(m))
    );
  return false;
}
function useItem(key, c) {
  if (!c || !state.inventory[key]) return false;
  if (key === "nectar") {
    if (c.hp <= 0 || c.hp === c.maxhp) return false;
    c.hp = Math.min(c.maxhp, c.hp + 35);
  } else if (key === "remedy") {
    if (!c.status) return false;
    c.status = null;
    c.statusTurns = 0;
  } else if (key === "ambrosia") {
    if (
      c.hp === c.maxhp &&
      !c.status &&
      c.moves.every((m) => c.pp[m] === maxPP(m))
    )
      return false;
    healFull(c);
  } else return false;
  state.inventory[key]--;
  saveGame();
  updateHUD();
  return true;
}
function canOpenMenu() {
  return owActive && !owBusy && !state.ow.moving;
}
function closeMenu() {
  returnToOverworld();
}
function openJournal() {
  if (!canOpenMenu()) return;
  owActive = false;
  renderJournal();
  show("journal-screen");
}
function renderJournal() {
  const f = state.ow.flags,
    q = questInfo(),
    owned = new Set([...state.team, ...state.caught].map((c) => c.key));
  const chapters = [
    [
      state.team.length > 0,
      "A gift for the road",
      "Hermes entrusts you with a sacred companion.",
    ],
    [f.wellSong, "The silent well", "Myrrha's melody: river, leaf, sun."],
    [
      f.groveSong,
      "The listening shrine",
      "The grove remembers. A black cord leads toward Delphi.",
    ],
    [
      f.kass,
      "A bond without a chain",
      "Kass leaves the Cult of Typhon and opens the road.",
    ],
    [
      (f.riverNote && f.emberNote) || f.delphi >= 2,
      "Voices of the sanctuary",
      "Daphne's river and Eros's ember carry the missing harmony.",
    ],
    [
      f.delphi >= 2,
      "The hollow guardian",
      "Orpheus helps the guardian hear the world again.",
    ],
    [
      f.delphi >= 3,
      "The first laurel",
      f.promise === "freedom"
        ? "Your promise: no bond should be a chain."
        : "Your promise: every voice deserves to be heard.",
    ],
  ];
  $("journal-content").innerHTML =
    `<div class="quest-current"><span class="eyebrow">CURRENT OBJECTIVE</span><h3>${q.title}</h3><p>${q.text}</p></div>
    <div class="journal-columns"><div><h3>Book I · The broken song</h3><ol class="quest-list">${chapters.map(([done, title, desc]) => `<li class="${done ? "complete" : ""}"><span>${done ? "✓" : "○"}</span><div><b>${title}</b><p>${done ? desc : "A verse still to be sung."}</p></div></li>`).join("")}</ol>
    <h3>A small kindness · optional</h3><p>${f.fawnRescued ? (f.ioneReward ? "✓ Ione's Cresfawn is safe. Her gift will help another friend." : "Cresfawn is safe. Tell Ione in Pimpleia.") : "Ione in Pimpleia has lost a little deer. Look in the southwest grove on Grove Road."}</p></div>
    <div><h3>Beasts of the gods</h3><p>${owned.size} befriended · ${state.seen.length} encountered · 12 sacred families</p><div class="codex-grid">${Object.entries(
      SPECIES,
    )
      .map(
        ([key, s]) =>
          `<div class="codex-entry ${owned.has(key) ? "owned" : ""}"><b>${state.seen.includes(key) || owned.has(key) ? s.name : "Unknown"}</b><span>${s.dom} · ${DOMAINS[s.dom].god}</span><small>${owned.has(key) ? "Befriended" : state.seen.includes(key) ? "Encountered" : "Yet to meet"}</small></div>`,
      )
      .join("")}</div>
    <h3>The art of listening</h3><p>Lyre: recover a little health and halve the next blow. Each use builds harmony. At three harmony, your next damaging move gains 35% power. Harmony also improves befriending chances.</p><p>Move affinity is shown before you strike. Switching companions costs a turn. Rest at Myrrha's well or with Pythia to recover health and move uses.</p><p>Companions share favor and awaken into new forms at levels 16 and 32. Save automatically on the road, or export a copy from your satchel.</p></div></div>`;
}
function renderSatchel() {
  $("satchel-summary").textContent =
    `${state.drachma} drachmae · Visit Melitta outside the eastern house in Pimpleia for supplies.`;
  $("satchel-content").innerHTML = "";
  Object.entries(ITEMS).forEach(([key, item]) => {
    const card = document.createElement("div");
    card.className = "item-card";
    card.innerHTML = `<div><h3>${item.name} <span>× ${state.inventory[key]}</span></h3><p>${item.desc}</p></div>`;
    if (key !== "amphora") {
      const select = document.createElement("select");
      select.setAttribute("aria-label", `Choose companion for ${item.name}`);
      state.team.forEach((c, i) =>
        select.add(
          new Option(
            `${c.name} · ${c.hp}/${c.maxhp} HP${c.status ? ` · ${c.status}` : ""}`,
            i,
          ),
        ),
      );
      const button = document.createElement("button");
      button.className = "btn small";
      button.textContent = "Use";
      button.disabled = state.inventory[key] <= 0 || !state.team.length;
      button.onclick = () => {
        const used = useItem(key, state.team[Number(select.value)]);
        $("save-message").textContent = used
          ? `${item.name} used.`
          : "That companion doesn't need this item.";
        renderSatchel();
      };
      card.append(select, button);
    }
    $("satchel-content").appendChild(card);
  });
  $("fast-text").checked = state.settings.fastText;
}
function openSatchel() {
  if (!canOpenMenu()) return;
  owActive = false;
  renderSatchel();
  show("satchel-screen");
}
$("journal-btn").onclick = openJournal;
$("journal-close").onclick = closeMenu;
$("satchel-btn").onclick = openSatchel;
$("satchel-close").onclick = closeMenu;
$("fast-text").onchange = (e) => {
  state.settings.fastText = e.target.checked;
  saveGame();
};
$("party-btn").onclick = () => {
  if (!canOpenMenu()) return;
  owActive = false;
  renderParty();
  show("party-screen");
};
$("party-close").onclick = closeMenu;

async function merchantStory() {
  if (!state.team.length) {
    await owSay(
      "<b>Melitta</b>: “Hermes has a gift for you. I'll have provisions ready when you return.”",
    );
    return;
  }
  while (true) {
    const key = await owChoose(
      `<b>Melitta's provisions</b> · ${state.drachma} drachmae<br>“A full satchel makes a kinder road.”`,
      [
        ...Object.entries(ITEMS).map(([k, i]) => ({
          label: `${i.name} · ${i.price} drachmae (own ${state.inventory[k]})`,
          value: k,
        })),
        { label: "Leave the market", value: "leave" },
      ],
    );
    if (key === "leave") break;
    if (state.drachma < ITEMS[key].price) {
      await owSay(
        "<b>Melitta</b>: “A few more drachmae, dear. A friendly challenge on the road should cover it.”",
      );
      continue;
    }
    state.drachma -= ITEMS[key].price;
    rewardItems({ [key]: 1 }, 0);
    playLyre([4]);
  }
}
let audioContext = null;
function playLyre(notes = [0, 2, 4]) {
  if (!state.settings.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume();
    notes.forEach((n, i) => {
      const osc = audioContext.createOscillator(),
        gain = audioContext.createGain(),
        time = audioContext.currentTime + i * 0.14;
      osc.type = "triangle";
      osc.frequency.value = 261.63 * Math.pow(2, n / 12);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.065, time + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.7);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(time);
      osc.stop(time + 0.75);
    });
  } catch (e) {
    state.settings.sound = false;
  }
}
function updateSoundButton() {
  const b = $("sound-btn");
  b.textContent = state.settings.sound ? "Sound on" : "Sound off";
  b.setAttribute(
    "aria-label",
    state.settings.sound ? "Disable sound" : "Enable sound",
  );
  b.setAttribute("aria-pressed", String(state.settings.sound));
}
$("sound-btn").onclick = () => {
  state.settings.sound = !state.settings.sound;
  updateSoundButton();
  playLyre();
  saveGame();
};
addEventListener("keydown", (e) => {
  if (e.target.matches("input,select,textarea,button") || e.repeat) return;
  if (e.key.toLowerCase() === "p" && canOpenMenu()) $("party-btn").click();
  if (e.key.toLowerCase() === "j") openJournal();
  if (e.key.toLowerCase() === "b") openSatchel();
  if (
    e.key === "Escape" &&
    ["party-screen", "journal-screen", "satchel-screen"].some((id) =>
      $(id).classList.contains("active"),
    )
  )
    closeMenu();
});
addEventListener("blur", () => {
  Object.keys(keys).forEach((k) => (keys[k] = false));
  state.ow.nextDir = null;
});
document.addEventListener("visibilitychange", () => {
  Object.keys(keys).forEach((k) => (keys[k] = false));
  state.ow.nextDir = null;
  if (
    document.hidden &&
    !state.busy &&
    !owBusy &&
    !state.ow.moving &&
    !$("battle-screen").classList.contains("active")
  )
    saveGame();
});

$("save-export").onclick = () => {
  const blob = new Blob([JSON.stringify(makeSave(), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "dance-of-the-gods-save.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $("save-message").textContent = "Save exported.";
};
$("save-import").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error("Save file is too large.");
    const sv = validateSave(JSON.parse(await file.text()));
    if (!sv) throw new Error("This file is not a valid journey save.");
    if (
      !confirm(
        "Replace this journey with the imported save? Export your current journey first if you want to keep it.",
      )
    )
      return;
    saveEnabled = true;
    applySave(sv);
    saveGame();
  } catch (err) {
    $("save-message").textContent =
      err.message || "The save could not be imported.";
  } finally {
    e.target.value = "";
  }
};
