/* =============================================================
   Math 21 — Demo registry
   Demos register themselves with a name and a mount function.
   In markdown, authors drop:
     <div data-demo="<name>" data-config='{"...":...}'></div>
   After the section's markdown is rendered, textbook.js calls
   DemoRegistry.mountAll(rootEl) to instantiate them.
   ============================================================= */

(function () {
  "use strict";

  const registry = new Map();
  // Track instances per host element so we can unmount on re-render
  const instances = new WeakMap();

  function register(name, mountFn) {
    if (registry.has(name)) {
      console.warn(`[Math 21] Demo "${name}" was already registered; overwriting.`);
    }
    registry.set(name, mountFn);
  }

  function parseConfig(el) {
    const raw = el.getAttribute("data-config");
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn(`[Math 21] Demo "${el.getAttribute("data-demo")}" has invalid JSON config:`, e);
      return {};
    }
  }

  function mountOne(el) {
    // Skip if already mounted
    if (instances.has(el)) return;
    const name = el.getAttribute("data-demo");
    if (!name) return;
    const fn = registry.get(name);
    if (!fn) {
      el.classList.add("demo-missing");
      el.innerHTML = `
        <div class="demo-error">
          <strong>Demo "${name}" not found.</strong>
          <small>Make sure the corresponding script is loaded.</small>
        </div>`;
      return;
    }
    const config = parseConfig(el);
    el.classList.add("demo");
    try {
      const instance = fn(el, config) || {};
      instances.set(el, instance);
    } catch (e) {
      console.error(`[Math 21] Demo "${name}" failed to mount`, e);
      el.innerHTML = `<div class="demo-error">Demo failed to load — see console.</div>`;
    }
  }

  function unmount(el) {
    const inst = instances.get(el);
    if (inst && typeof inst.destroy === "function") {
      try { inst.destroy(); } catch (e) { console.warn(e); }
    }
    instances.delete(el);
  }

  function mountAll(root) {
    if (!root) return;
    const els = root.querySelectorAll("[data-demo]");
    els.forEach(mountOne);
  }

  function unmountAll(root) {
    if (!root) return;
    root.querySelectorAll("[data-demo]").forEach(unmount);
  }

  // ---------- Helpers exposed to demos ----------
  /**
   * Number formatting helper used across demos: keeps a stable width
   * by rounding to N decimals and trimming trailing zeros.
   */
  function fmt(n, digits = 2) {
    if (!isFinite(n)) return "—";
    const s = n.toFixed(digits);
    return s.replace(/\.?0+$/, "") || "0";
  }

  /**
   * Render KaTeX into an element. Safe to call before KaTeX is loaded —
   * it'll just leave the source text in place.
   */
  function renderMath(el) {
    if (window.renderMathInElement) {
      try {
        renderMathInElement(el, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$",  right: "$",  display: false }
          ],
          throwOnError: false,
          strict: "ignore"
        });
      } catch (_) {}
    }
  }

  window.DemoRegistry = {
    register,
    mountAll,
    mountOne,
    unmount,
    unmountAll,
    helpers: { fmt, renderMath }
  };
})();
