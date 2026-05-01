/* =============================================================
   Math 21 — Table of contents (wiki-style, slide-from-left)
   - Hover the left edge → TOC slides in
   - Click a chapter → expands to show its sections
   - Click a section → navigate via the textbook engine
   - Pin button to keep TOC open and shift the viewport
   ============================================================= */

(function () {
  "use strict";

  const els = {
    trigger: document.querySelector(".toc-trigger"),
    panel:   document.getElementById("toc"),
    list:    document.getElementById("toc-list"),
    pinBtn:  document.getElementById("toc-pin"),
    body:    document.body
  };

  const state = {
    open: false,
    pinned: false,
    closeTimer: null,
    onNavigate: null,
    expandedChapter: null
  };

  // ---------- Open / close ----------
  function open() {
    clearTimeout(state.closeTimer);
    if (state.open) return;
    state.open = true;
    els.panel.classList.add("is-open");
  }

  function close() {
    if (state.pinned || !state.open) return;
    state.open = false;
    els.panel.classList.remove("is-open");
  }

  function scheduleClose(delay = 220) {
    if (state.pinned) return;
    clearTimeout(state.closeTimer);
    state.closeTimer = setTimeout(close, delay);
  }

  function togglePin() {
    state.pinned = !state.pinned;
    els.pinBtn.classList.toggle("is-pinned", state.pinned);
    els.body.classList.toggle("toc-pinned", state.pinned);
    if (state.pinned) {
      open();
    } else {
      // unpin → close shortly unless still hovered
      if (!els.panel.matches(":hover") && !els.trigger.matches(":hover")) {
        close();
      }
    }
    try {
      localStorage.setItem("math21.toc.pinned", state.pinned ? "1" : "0");
    } catch (_) {}
  }

  // ---------- TOC tree ----------
  function buildTree(manifest) {
    els.list.innerHTML = "";

    for (const ch of manifest.chapters) {
      const li = document.createElement("li");
      li.className = "toc-chapter";
      li.dataset.chapterId = ch.id;

      const header = document.createElement("div");
      header.className = "toc-chapter-header";
      header.setAttribute("role", "treeitem");
      header.setAttribute("aria-expanded", "false");
      header.tabIndex = 0;

      const num = document.createElement("span");
      num.className = "toc-chapter-num";
      num.textContent = ch.number;

      const title = document.createElement("span");
      title.className = "toc-chapter-title";
      title.textContent = ch.title;

      const caret = document.createElement("span");
      caret.className = "toc-caret";
      caret.innerHTML = `<svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
        <path d="M2 1 L8 5 L2 9 Z"></path>
      </svg>`;

      header.appendChild(num);
      header.appendChild(title);
      header.appendChild(caret);

      // Sub-list of sections
      const subList = document.createElement("ol");
      subList.className = "toc-sublist";
      subList.setAttribute("role", "group");

      for (const sec of ch.sections) {
        const sli = document.createElement("li");
        sli.className = "toc-section";
        sli.dataset.sectionId = sec.id;
        sli.setAttribute("role", "treeitem");
        sli.tabIndex = 0;

        const snum = document.createElement("span");
        snum.className = "toc-section-num";
        snum.textContent = sec.id;

        const stitle = document.createElement("span");
        stitle.className = "toc-section-title";
        stitle.textContent = sec.title;

        sli.appendChild(snum);
        sli.appendChild(stitle);

        const navigate = () => {
          if (typeof state.onNavigate === "function") {
            state.onNavigate(sec.id);
          }
          // Auto-close on selection unless pinned
          if (!state.pinned) {
            scheduleClose(120);
          }
        };
        sli.addEventListener("click", navigate);
        sli.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate();
          }
        });

        subList.appendChild(sli);
      }

      const toggleChapter = () => {
        const isExpanded = li.classList.toggle("is-expanded");
        header.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        if (isExpanded) {
          // Collapse other expanded chapters (accordion behavior)
          els.list.querySelectorAll(".toc-chapter.is-expanded").forEach((other) => {
            if (other !== li) {
              other.classList.remove("is-expanded");
              const h = other.querySelector(".toc-chapter-header");
              if (h) h.setAttribute("aria-expanded", "false");
            }
          });
          state.expandedChapter = ch.id;
        } else if (state.expandedChapter === ch.id) {
          state.expandedChapter = null;
        }
      };

      header.addEventListener("click", toggleChapter);
      header.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleChapter();
        }
      });

      li.appendChild(header);
      li.appendChild(subList);
      els.list.appendChild(li);
    }
  }

  // ---------- Active highlighting ----------
  function setActive(sectionId, chapterId) {
    // Clear all
    els.list.querySelectorAll(".toc-section.is-active").forEach((s) => s.classList.remove("is-active"));
    els.list.querySelectorAll(".toc-chapter-header.is-active").forEach((h) => h.classList.remove("is-active"));

    if (!sectionId) return;

    const sec = els.list.querySelector(`.toc-section[data-section-id="${sectionId}"]`);
    if (sec) sec.classList.add("is-active");

    if (chapterId) {
      const ch = els.list.querySelector(`.toc-chapter[data-chapter-id="${chapterId}"]`);
      if (ch) {
        const header = ch.querySelector(".toc-chapter-header");
        if (header) header.classList.add("is-active");
        // Auto-expand the active chapter
        if (!ch.classList.contains("is-expanded")) {
          els.list.querySelectorAll(".toc-chapter.is-expanded").forEach((o) => o.classList.remove("is-expanded"));
          ch.classList.add("is-expanded");
          if (header) header.setAttribute("aria-expanded", "true");
          state.expandedChapter = chapterId;
        }
      }
    }
  }

  // ---------- Init ----------
  function init(manifest, opts = {}) {
    state.onNavigate = opts.onNavigate || null;
    buildTree(manifest);

    // Hover triggers
    els.trigger.addEventListener("mouseenter", open);
    els.panel.addEventListener("mouseenter", open);
    els.trigger.addEventListener("mouseleave", () => scheduleClose());
    els.panel.addEventListener("mouseleave", () => scheduleClose());

    // Click trigger to toggle (useful on touch / when hover doesn't fire)
    els.trigger.addEventListener("click", () => {
      if (state.open) close();
      else open();
    });

    // Pin
    els.pinBtn.addEventListener("click", togglePin);

    // Restore pin preference
    try {
      if (localStorage.getItem("math21.toc.pinned") === "1") {
        togglePin();
      }
    } catch (_) {}
  }

  // ---------- Public API ----------
  window.MATH21_TOC = {
    init,
    open,
    close,
    setActive,
    togglePin
  };
})();
