"use strict";
/* Illustrated patrons share the existing domain roster; browsing never changes a save. */
const OLYMPIANS = [
  {
    id: "zeus",
    name: "Zeus",
    domain: "Sky",
    beast: "peeplet",
    title: "The gathering storm",
    disposition:
      "Enormous in his welcome, unmistakable in his authority. He expects courage—and a place for every guest.",
    echo: "Storm-blue folds, ivory cloud curls, and lightning-gold edges echo Brontlet’s proud strut and Aetos Dios’s sheltering wings.",
  },
  {
    id: "poseidon",
    name: "Poseidon",
    domain: "Sea",
    beast: "calfin",
    title: "The tide remembers",
    disposition:
      "Proud, blunt, and fiercely affectionate. His welcome can lift a boat; his displeasure moves the shore.",
    echo: "Turquoise, seafoam curls, and dark sea-stone accents follow Calfin’s sturdy warmth and Taurios’s sweeping breakers.",
  },
  {
    id: "hades",
    name: "Hades",
    domain: "Underworld",
    beast: "pupnos",
    title: "A light at the threshold",
    disposition:
      "Courteous, exact, and quietly tender. No lost traveler is hurried through his door.",
    echo: "Charcoal robes, aubergine shadows, lilac waylight, and small coin-gold details belong beside Wickpup and Cerberos.",
  },
  {
    id: "athena",
    name: "Athena",
    domain: "Wisdom",
    beast: "owlet",
    title: "Always one move ahead",
    disposition:
      "Calm, keen-eyed, and thoroughly prepared. A raised eyebrow is usually the beginning of a lesson.",
    echo: "Parchment folds, olive leaves, bronze edges, and teal geometry mirror Glyphet’s living pages and Glaux Sophos’s watchful gaze.",
  },
  {
    id: "ares",
    name: "Ares",
    domain: "War",
    beast: "piglos",
    title: "First into the fray",
    disposition:
      "All swagger until a companion needs him. Then his courage becomes a wall that will not yield.",
    echo: "Crimson crests, russet cloth, and concentric bronze shields carry Clashog’s stubborn courage into Phalanboar’s protective stance.",
  },
  {
    id: "aphrodite",
    name: "Aphrodite",
    domain: "Love",
    beast: "dovie",
    title: "An invitation to belong",
    disposition:
      "Warm, delighted, and impossible to overlook. She makes the shyest guest feel expected.",
    echo: "Ivory, rose petals, flowing love-knots, and a confident smile tie her to Dovelace and Peristera.",
  },
  {
    id: "apollo",
    name: "Apollo",
    domain: "Sun",
    beast: "slithra",
    title: "Certain as the sunrise",
    disposition:
      "Brilliant, radiant, and a little too pleased with himself. Music can still stop him mid-sentence.",
    echo: "Sun-gold rays, copper curls, and ivory highlights recall Solisk’s sundial and Pythonos’s knowing smile.",
  },
  {
    id: "artemis",
    name: "Artemis",
    domain: "Hunt",
    beast: "fawnling",
    title: "Where the wild is free",
    disposition:
      "Alert, independent, and quietly playful with those she trusts. Her companions run beside her by choice.",
    echo: "Moss green, moon-pale ivory, bronze feet, and a golden crescent bow follow Cresfawn and Elaphos Chrysos.",
  },
  {
    id: "hephaestus",
    name: "Hephaestus",
    domain: "Forge",
    beast: "cindercrab",
    title: "Bring him a problem",
    disposition:
      "Patient hands, a wry smile, and pride in work done well. He always notices the buckle that needs fixing.",
    echo: "Terracotta, oxidized teal, hammered bronze, and warm kiln embers echo Kilnclaw’s craft and Automax’s sturdy care.",
  },
  {
    id: "hermes",
    name: "Hermes",
    domain: "Herald",
    beast: "tortikin",
    title: "Already at the crossroads",
    disposition:
      "Quick feet, quicker wit, and an unexpected kindness. Every shortcut is better with company.",
    echo: "Olive-teal, ivory feather fans, lyre-shaped gold scrollwork, and a courier’s grin pair him with Lyretto and Chelys Hermao.",
  },
  {
    id: "demeter",
    name: "Demeter",
    domain: "Harvest",
    beast: "seedviper",
    title: "Enough for one more",
    disposition:
      "Broad-handed, unhurried, and generous as good soil. No guest leaves her table hungry.",
    echo: "Chestnut, oat cream, leafy green, wheat crowns, and tiny red poppies share Sheafang’s warmth and Thesmora’s abundance.",
  },
  {
    id: "dionysus",
    name: "Dionysus",
    domain: "Wine",
    beast: "cubvine",
    title: "The welcome after the revel",
    disposition:
      "A shameless grin, an open invitation, and a quiet place for anyone whose joy has run out.",
    echo: "Plum and cream, grape clusters, curling ivy, and theatrical warmth connect him to Revelcub and Pantheros.",
  },
];
function godArtURL(id) {
  return `assets/gen/gods/${id}.png?v=1`;
}
let pantheonReturn = "title-screen";
let pantheonScroll = 0;
let pantheonTrigger = null;
let pantheonReturnHash = "";

function renderPantheon() {
  $("pantheon-jumps").innerHTML = OLYMPIANS.map(
    (g) =>
      `<button class="pantheon-jump" type="button" data-god-jump="${g.id}">${g.name}</button>`,
  ).join("");
  $("pantheon-grid").innerHTML = OLYMPIANS.map((g, index) => {
    const names = [SPECIES[g.beast].name, ...EVOLUTIONS[g.beast]];
    return `<article class="god-card" id="olympian-${g.id}" data-god="${g.id}" style="--beast-color:${DOMAINS[g.domain].color}">
      <div class="god-art">
        <span class="beast-number">${String(index + 1).padStart(2, "0")}</span>
        <span class="beast-type">${g.domain}</span>
        <a href="${godArtURL(g.id)}" target="_blank" rel="noopener" aria-label="Open full-size portrait of ${g.name}">
          <img src="${godArtURL(g.id)}" alt="${g.name}, ${g.title.toLowerCase()}" width="1024" height="1536" loading="lazy" decoding="async">
        </a>
      </div>
      <div class="god-copy">
        <span class="beast-patron">${g.domain} · Divine patron</span>
        <h3 tabindex="-1">${g.name}</h3>
        <div class="god-epithet">${g.title}</div>
        <p class="god-disposition">${g.disposition}</p>
        <p class="god-echo">${g.echo}</p>
        <div class="god-family" role="group" aria-label="${g.name}'s sacred family">
          ${names
            .map(
              (
                name,
                stage,
              ) => `<button type="button" class="god-companion" data-species="${g.beast}" data-stage="${stage}" aria-label="Meet ${name} in the field guide">
            <img src="${beastArtURL(g.beast, "front", stage)}" alt="" width="150" height="150" loading="lazy" decoding="async">
            <span>${name}</span><small>${stage ? `Lv ${stage === 1 ? 16 : 32}` : "First form"}</small>
          </button>`,
            )
            .join("")}
        </div>
      </div>
    </article>`;
  }).join("");
}
function focusOlympian(id) {
  const card = document.getElementById("olympian-" + id);
  if (!card) return;
  card.scrollIntoView({ block: "start" });
  card.querySelector("h3").focus({ preventScroll: true });
}
function openPantheon(id) {
  const active = document.querySelector(".screen.active");
  if (
    !active ||
    !["title-screen", "journal-screen", "bestiary-screen"].includes(active.id)
  )
    return;
  pantheonReturn = active.id;
  pantheonScroll = window.scrollY;
  pantheonTrigger = document.activeElement;
  pantheonReturnHash = location.hash === "#gods" ? "" : location.hash;
  if (!$("pantheon-grid").children.length) renderPantheon();
  $("pantheon-close").textContent = {
    "title-screen": "Back to the title",
    "journal-screen": "Back to the journal",
    "bestiary-screen": "Back to the beasts",
  }[pantheonReturn];
  show("pantheon-screen");
  history.replaceState(null, "", location.pathname + location.search + "#gods");
  if (typeof id === "string") focusOlympian(id);
  else {
    window.scrollTo(0, 0);
    $("pantheon-close").focus({ preventScroll: true });
  }
}
function closePantheon() {
  show(pantheonReturn);
  history.replaceState(
    null,
    "",
    location.pathname + location.search + pantheonReturnHash,
  );
  window.scrollTo(0, pantheonScroll);
  pantheonTrigger?.focus({ preventScroll: true });
}
for (const id of ["pantheon-open", "bestiary-pantheon", "journal-pantheon"])
  $(id).onclick = () => openPantheon();
$("pantheon-close").onclick = closePantheon;
$("pantheon-jumps").onclick = (event) => {
  const button = event.target.closest("[data-god-jump]");
  if (button) focusOlympian(button.dataset.godJump);
};
$("bestiary-grid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-patron]");
  if (button) openPantheon(button.dataset.patron);
});
$("pantheon-grid").onclick = (event) => {
  const button = event.target.closest("button[data-species]");
  if (!button) return;
  const { species, stage } = button.dataset;
  closePantheon();
  if (!$("bestiary-screen").classList.contains("active")) openBestiary();
  setBestiaryStage(Number(stage));
  setBestiaryView("front");
  const card = document.querySelector(`.beast-card[data-species="${species}"]`);
  card.querySelector("details").open = true;
  card.scrollIntoView({ block: "center" });
  card
    .querySelector(`button[data-form="${stage}"]`)
    .focus({ preventScroll: true });
};
addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    $("pantheon-screen").classList.contains("active")
  ) {
    event.preventDefault();
    closePantheon();
  }
});
if (location.hash === "#gods") openPantheon();
addEventListener("hashchange", () => {
  if (location.hash === "#gods") openPantheon();
});
