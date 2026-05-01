/* =============================================================
   Math 21 — Textbook navigation engine
   Vertical full-page snap, wheel/keyboard/touch, hash sync,
   markdown loading + KaTeX render.
   ============================================================= */

(function () {
  "use strict";

  // ---------- State ----------
  const manifest = window.MATH21_MANIFEST;
  if (!manifest) {
    console.error("[Math 21] Manifest not found. Did js/manifest.js load?");
    return;
  }

  /**
   * Build a flat list of pages (splash + every section in order).
   * Each entry: { kind, id, chapterId, chapterTitle, chapterNumber, sectionId, title, file }
   */
  const pages = [{ kind: "splash", id: "splash", title: "Title" }];
  for (const ch of manifest.chapters) {
    for (const sec of ch.sections) {
      pages.push({
        kind: "section",
        id: sec.id,
        chapterId: ch.id,
        chapterNumber: ch.number,
        chapterTitle: ch.title,
        sectionId: sec.id,
        title: sec.title,
        file: sec.file
      });
    }
  }

  const state = {
    index: 0,
    transitioning: false,
    transitionTimeout: null,
    wheelLocked: false,
    wheelLockTimeout: null,
    touchStartY: 0,
    loadedFiles: new Map() // file → markdown text cache
  };

  // ---------- DOM ----------
  const elTrack = document.getElementById("textbook-track");
  const elLoader = document.getElementById("loader");
  const elLocator = document.getElementById("locator");
  const elLocatorChapter = document.getElementById("locator-chapter");
  const elLocatorSection = document.getElementById("locator-section");
  const elRail = document.getElementById("rail");

  // ---------- Build sections (skeleton) ----------
  function buildSections() {
    // Sections after splash
    for (let i = 1; i < pages.length; i++) {
      const page = pages[i];
      const sectionEl = document.createElement("section");
      sectionEl.className = "page page-section";
      sectionEl.dataset.sectionId = page.sectionId;
      sectionEl.dataset.index = String(i);
      sectionEl.dataset.chapterId = page.chapterId;
      sectionEl.dataset.loaded = "false";

      const inner = document.createElement("div");
      inner.className = "page-inner";

      const eyebrow = document.createElement("div");
      eyebrow.className = "page-eyebrow";
      eyebrow.textContent = `Chapter ${page.chapterNumber} · ${page.chapterTitle}`;

      const heading = document.createElement("h1");
      heading.textContent = `${page.sectionId} · ${page.title}`;

      const body = document.createElement("div");
      body.className = "page-body";
      body.innerHTML = `<p style="color: var(--ink-mute); font-style: italic;">Loading…</p>`;

      inner.appendChild(eyebrow);
      inner.appendChild(heading);
      inner.appendChild(body);
      sectionEl.appendChild(inner);
      elTrack.appendChild(sectionEl);
    }

    // Build the dot rail
    elRail.innerHTML = "";
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const li = document.createElement("li");
      const dot = document.createElement("button");
      dot.className = "rail-dot";
      dot.dataset.index = String(i);
      dot.dataset.label = page.kind === "splash"
        ? "Title"
        : `${page.sectionId} · ${page.title}`;
      dot.setAttribute("aria-label", `Go to ${dot.dataset.label}`);
      dot.addEventListener("click", () => goTo(i));
      li.appendChild(dot);
      elRail.appendChild(li);
    }

    // Set heights on track
    elTrack.style.height = `${pages.length * 100}vh`;
  }

  // ---------- Markdown helpers ----------
  /**
   * Light pre-processing for callout syntax:
   *   > [!def] Title
   *   > body
   * → <div class="callout definition" data-label="Definition · Title">body</div>
   */
  const calloutMap = {
    def: { cls: "definition", label: "Definition" },
    thm: { cls: "theorem",    label: "Theorem" },
    lem: { cls: "theorem",    label: "Lemma" },
    cor: { cls: "theorem",    label: "Corollary" },
    prop:{ cls: "theorem",    label: "Proposition" },
    ex:  { cls: "example",    label: "Example" },
    note:{ cls: "note",       label: "Note" }
  };

  function preprocessCallouts(md) {
    const lines = md.split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const m = lines[i].match(/^>\s*\[!(\w+)\]\s*(.*)$/);
      if (m && calloutMap[m[1].toLowerCase()]) {
        const cfg = calloutMap[m[1].toLowerCase()];
        const titleRest = m[2].trim();
        const dataLabel = titleRest ? `${cfg.label} · ${titleRest}` : cfg.label;
        const bodyLines = [];
        i++;
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          bodyLines.push(lines[i].replace(/^>\s?/, ""));
          i++;
        }
        out.push(`<div class="callout ${cfg.cls}" data-label="${dataLabel}">`);
        out.push("");
        out.push(bodyLines.join("\n"));
        out.push("");
        out.push(`</div>`);
      } else {
        out.push(lines[i]);
        i++;
      }
    }
    return out.join("\n");
  }

  async function loadSection(idx) {
    const page = pages[idx];
    if (page.kind !== "section") return;

    const sectionEl = elTrack.querySelector(`[data-index="${idx}"]`);
    if (!sectionEl || sectionEl.dataset.loaded === "true") return;

    const body = sectionEl.querySelector(".page-body");
    let md = state.loadedFiles.get(page.file);
    if (md === undefined) {
      try {
        const resp = await fetch(page.file, { cache: "no-cache" });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        md = await resp.text();
        state.loadedFiles.set(page.file, md);
      } catch (err) {
        body.innerHTML = `<p class="callout note" data-label="Coming soon">
          <em>This section is being written.</em><br>
          <small style="color: var(--ink-mute)">${page.file}</small>
        </p>`;
        sectionEl.dataset.loaded = "true";
        return;
      }
    }

    const processed = preprocessCallouts(md);
    body.innerHTML = window.marked
      ? marked.parse(processed)
      : processed;

    // Render math
    if (window.renderMathInElement) {
      try {
        renderMathInElement(body, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$",  right: "$",  display: false },
            { left: "\\[", right: "\\]", display: true },
            { left: "\\(", right: "\\)", display: false }
          ],
          throwOnError: false,
          strict: "ignore"
        });
      } catch (e) {
        console.warn("[Math 21] KaTeX render failed", e);
      }
    }

    // Mount any interactive demos in this section
    if (window.DemoRegistry && typeof window.DemoRegistry.mountAll === "function") {
      window.DemoRegistry.mountAll(body);
    }

    sectionEl.dataset.loaded = "true";
  }

  // ---------- Navigation ----------
  function goTo(idx, opts = {}) {
    if (idx < 0 || idx >= pages.length) return;
    if (idx === state.index && !opts.force) return;

    state.index = idx;
    state.transitioning = true;
    elTrack.classList.add("is-transitioning");
    elTrack.style.transform = `translate3d(0, ${-idx * 100}vh, 0)`;

    // Pre-load current + neighbours
    loadSection(idx);
    if (idx + 1 < pages.length) loadSection(idx + 1);
    if (idx - 1 >= 0) loadSection(idx - 1);

    updateChrome();
    syncHash();

    clearTimeout(state.transitionTimeout);
    state.transitionTimeout = setTimeout(() => {
      state.transitioning = false;
      elTrack.classList.remove("is-transitioning");
    }, 750);
  }

  function next() { goTo(state.index + 1); }
  function prev() { goTo(state.index - 1); }

  // ---------- Chrome (locator + rail + TOC) ----------
  function updateChrome() {
    const page = pages[state.index];

    // Locator
    if (page.kind === "splash") {
      elLocator.classList.remove("is-visible");
    } else {
      elLocator.classList.add("is-visible");
      elLocatorChapter.textContent = `Chapter ${page.chapterNumber} · ${page.chapterTitle}`;
      elLocatorSection.textContent = `§${page.sectionId} ${page.title}`;
    }

    // Rail
    elRail.querySelectorAll(".rail-dot").forEach((d) => {
      d.classList.toggle("is-active", parseInt(d.dataset.index, 10) === state.index);
    });

    // TOC active state
    if (window.MATH21_TOC && typeof window.MATH21_TOC.setActive === "function") {
      window.MATH21_TOC.setActive(page.sectionId || null, page.chapterId || null);
    }
  }

  function syncHash() {
    const page = pages[state.index];
    const newHash = page.kind === "splash" ? "" : `#${page.sectionId}`;
    if (window.location.hash !== newHash) {
      // Use replaceState so back/forward isn't polluted on every snap
      history.replaceState(null, "", newHash || window.location.pathname);
    }
  }

  function readHash() {
    const h = window.location.hash.replace(/^#/, "");
    if (!h) return 0;
    const i = pages.findIndex((p) => p.sectionId === h);
    return i >= 0 ? i : 0;
  }

  // ---------- Input handling ----------
  function lockWheel(ms = 750) {
    state.wheelLocked = true;
    clearTimeout(state.wheelLockTimeout);
    state.wheelLockTimeout = setTimeout(() => {
      state.wheelLocked = false;
    }, ms);
  }

  function onWheel(e) {
    // If the inner page is scrollable and not at its edge, let the user scroll it.
    const inner = e.target.closest && e.target.closest(".page-inner");
    if (inner) {
      const atTop = inner.scrollTop <= 0;
      const atBottom = inner.scrollTop + inner.clientHeight >= inner.scrollHeight - 1;
      const goingDown = e.deltaY > 0;
      const goingUp = e.deltaY < 0;
      if ((goingDown && !atBottom) || (goingUp && !atTop)) {
        return; // allow native scroll within the section
      }
    }

    e.preventDefault();
    if (state.wheelLocked || state.transitioning) return;

    const threshold = 12;
    if (e.deltaY > threshold) {
      lockWheel();
      next();
    } else if (e.deltaY < -threshold) {
      lockWheel();
      prev();
    }
  }

  function onKey(e) {
    // Don't hijack when typing in an input
    const tag = (e.target && e.target.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;

    switch (e.key) {
      case "ArrowDown":
      case "PageDown":
      case " ":
        e.preventDefault();
        next();
        break;
      case "ArrowUp":
      case "PageUp":
        e.preventDefault();
        prev();
        break;
      case "Home":
        e.preventDefault();
        goTo(0);
        break;
      case "End":
        e.preventDefault();
        goTo(pages.length - 1);
        break;
      case "Escape":
        if (window.MATH21_TOC) window.MATH21_TOC.close();
        break;
    }
  }

  function onTouchStart(e) {
    if (e.touches.length === 1) state.touchStartY = e.touches[0].clientY;
  }
  function onTouchEnd(e) {
    if (state.transitioning) return;
    const endY = (e.changedTouches[0] || {}).clientY || 0;
    const dy = state.touchStartY - endY;
    if (Math.abs(dy) < 50) return;

    // Respect inner scroll
    const inner = e.target.closest && e.target.closest(".page-inner");
    if (inner) {
      const atTop = inner.scrollTop <= 0;
      const atBottom = inner.scrollTop + inner.clientHeight >= inner.scrollHeight - 1;
      if (dy > 0 && !atBottom) return;
      if (dy < 0 && !atTop) return;
    }
    if (dy > 0) next();
    else prev();
  }

  function onResize() {
    // Re-apply transform — vh units take care of it but force a reflow on iOS
    elTrack.style.transform = `translate3d(0, ${-state.index * 100}vh, 0)`;
  }

  function onHashChange() {
    const i = readHash();
    if (i !== state.index) goTo(i);
  }

  // ---------- Public hook used by TOC ----------
  window.MATH21_TEXTBOOK = {
    pages,
    goTo,
    goToSectionId(sid) {
      const i = pages.findIndex((p) => p.sectionId === sid);
      if (i >= 0) goTo(i);
    },
    getCurrent() { return pages[state.index]; }
  };

  // ---------- Boot ----------
  function boot() {
    buildSections();

    // Build the TOC now that pages exist
    if (window.MATH21_TOC && typeof window.MATH21_TOC.init === "function") {
      window.MATH21_TOC.init(manifest, {
        onNavigate: (sectionId) => {
          window.MATH21_TEXTBOOK.goToSectionId(sectionId);
        }
      });
    }

    // Wire input
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("hashchange", onHashChange);

    // Initial position from hash
    const startIdx = readHash();
    state.index = startIdx;
    elTrack.style.transform = `translate3d(0, ${-startIdx * 100}vh, 0)`;
    loadSection(startIdx);
    if (startIdx + 1 < pages.length) loadSection(startIdx + 1);
    updateChrome();

    // Hide loader
    requestAnimationFrame(() => {
      elLoader.classList.add("is-hidden");
    });
  }

  // KaTeX/marked load via `defer`. Wait for them to be available.
  function whenReady(fn) {
    const check = () => {
      if (window.marked && window.renderMathInElement) {
        fn();
      } else {
        setTimeout(check, 30);
      }
    };
    check();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => whenReady(boot));
  } else {
    whenReady(boot);
  }
})();
