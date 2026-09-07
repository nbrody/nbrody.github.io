"use strict";
/* The complete field guide is available independently of save progress. */
let bestiaryReturn = "title-screen";
let bestiaryScroll = 0;
let bestiaryTrigger = null;
let bestiaryView = "front";
let bestiaryStage = 0;
function renderBestiary() {
  $("bestiary-grid").innerHTML = Object.entries(SPECIES)
    .map(([key, s], index) => {
      const domain = DOMAINS[s.dom];
      const form = bestiaryStage
        ? EVOLUTION_DETAILS[key][bestiaryStage - 1]
        : s;
      const names = [s.name, ...EVOLUTIONS[key]];
      const name = names[bestiaryStage];
      return `<article class="beast-card" data-species="${key}" data-stage="${bestiaryStage}" style="--beast-color:${domain.color}">
        <div class="beast-art"><span class="beast-number">${String(index * 3 + bestiaryStage + 1).padStart(2, "0")}</span>
        <span class="beast-type">${s.dom}</span>
        <img src="${beastArtURL(key, bestiaryView, bestiaryStage)}" alt="${name}, the ${form.category.toLowerCase()}${bestiaryView === "back" ? ", seen from behind" : ""}" width="400" height="400" loading="lazy" decoding="async" /></div>
        <div class="beast-copy"><button class="beast-patron patron-link" type="button" data-patron="${domain.god.toLowerCase()}" aria-label="Meet ${domain.god}">${domain.god} ↗</button><h3>${name}</h3>
        <div class="beast-category">${form.category}</div><p>${form.personality}</p>
        <details><summary>Myth &amp; awakenings</summary><p>${s.lore}</p>
        <div class="beast-line">${names.map((n, stage) => `<button type="button" data-form="${stage}" aria-pressed="${stage === bestiaryStage}">${stage ? `Lv ${stage === 1 ? 16 : 32} · ` : ""}${n}</button>`).join("")}</div></details></div>
      </article>`;
    })
    .join("");
  $("bestiary-count").textContent =
    `${["12 first forms", "12 awakened forms · Level 16", "12 ascended forms · Level 32"][bestiaryStage]} · 36 beasts in the field guide`;
}
function openBestiary() {
  const active = document.querySelector(".screen.active");
  if (!active || !["title-screen", "journal-screen"].includes(active.id))
    return;
  bestiaryReturn = active.id;
  bestiaryScroll = window.scrollY;
  bestiaryTrigger = document.activeElement;
  if (!$("bestiary-grid").children.length) renderBestiary();
  $("bestiary-close").textContent =
    bestiaryReturn === "journal-screen"
      ? "Back to the journal"
      : "Back to the title";
  show("bestiary-screen");
  window.scrollTo(0, 0);
  $("bestiary-close").focus({ preventScroll: true });
}
function setBestiaryView(view) {
  bestiaryView = bestiaryStage ? "front" : view;
  for (const option of ["front", "back"]) {
    const button = $("bestiary-" + option);
    button.setAttribute("aria-pressed", String(bestiaryView === option));
    button.classList.toggle("secondary", bestiaryView !== option);
  }
  document.querySelectorAll(".beast-card").forEach((card) => {
    const key = card.dataset.species;
    const form = bestiaryStage
      ? EVOLUTION_DETAILS[key][bestiaryStage - 1]
      : SPECIES[key];
    const name = bestiaryStage
      ? EVOLUTIONS[key][bestiaryStage - 1]
      : SPECIES[key].name;
    const img = card.querySelector("img");
    img.src = beastArtURL(key, bestiaryView, bestiaryStage);
    img.alt = `${name}, the ${form.category.toLowerCase()}${bestiaryView === "back" ? ", seen from behind" : ""}`;
  });
}
function setBestiaryStage(stage) {
  if (![0, 1, 2].includes(stage)) return;
  bestiaryStage = stage;
  if (stage) bestiaryView = "front";
  for (const option of [0, 1, 2]) {
    const button = $("bestiary-stage-" + option);
    button.setAttribute("aria-pressed", String(stage === option));
    button.classList.toggle("secondary", stage !== option);
  }
  $("bestiary-back").disabled = stage > 0;
  $("bestiary-back").title = stage
    ? "Rear views are available for first forms"
    : "";
  renderBestiary();
  setBestiaryView(bestiaryView);
}
for (const stage of [0, 1, 2])
  $("bestiary-stage-" + stage).onclick = () => setBestiaryStage(stage);
$("bestiary-front").onclick = () => setBestiaryView("front");
$("bestiary-back").onclick = () => setBestiaryView("back");
$("bestiary-grid").onclick = (event) => {
  const button = event.target.closest("button[data-form]");
  if (!button) return;
  const key = button.closest(".beast-card").dataset.species;
  const stage = Number(button.dataset.form);
  setBestiaryStage(stage);
  const card = document.querySelector(`.beast-card[data-species="${key}"]`);
  card.querySelector("details").open = true;
  card.scrollIntoView({ block: "center" });
  card
    .querySelector(`button[data-form="${stage}"]`)
    .focus({ preventScroll: true });
};
function closeBestiary() {
  show(bestiaryReturn);
  if (location.hash === "#bestiary")
    history.replaceState(null, "", location.pathname + location.search);
  window.scrollTo(0, bestiaryScroll);
  bestiaryTrigger?.focus({ preventScroll: true });
}
$("bestiary-open").onclick = openBestiary;
$("journal-bestiary").onclick = openBestiary;
$("bestiary-close").onclick = closeBestiary;
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("bestiary-screen").classList.contains("active")) {
    e.preventDefault();
    closeBestiary();
  }
});
if (location.hash === "#bestiary") openBestiary();
