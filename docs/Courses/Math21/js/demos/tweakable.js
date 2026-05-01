/* =============================================================
   Math 21 — Inline tweakable
   A tiny number input embedded in prose, with a live result.

   Author syntax in markdown:
     The polynomial $\lambda^2 - 5\lambda + 6$ at $\lambda =$
     <span data-demo="tweakable"
           data-config='{"expr":"x*x - 5*x + 6","var":"x","init":2,"min":-3,"max":6,"step":0.5}'></span>

   Or with multiple variables:
     <span data-demo="tweakable"
           data-config='{"expr":"a + b","vars":[{"name":"a","init":1},{"name":"b","init":2}]}'></span>

   Config:
     expr:    JS expression to evaluate; can reference variable name(s)
     var:     single variable name (shortcut)
     vars:    array of {name, init, min, max, step} for multiple vars
     init/min/max/step:  shortcut applied when 'var' is used
     prefix/suffix: text shown around the result
     digits:  decimal places (default 3, trailing zeros trimmed)
   ============================================================= */

(function () {
  "use strict";

  function mount(host, config) {
    const fmt = window.DemoRegistry.helpers.fmt;
    const digits = config.digits != null ? config.digits : 3;
    const prefix = config.prefix || "";
    const suffix = config.suffix || "";

    // Normalize variables list
    let vars;
    if (config.vars) {
      vars = config.vars.map(v => ({
        name: v.name,
        value: v.init != null ? v.init : 0,
        min: v.min != null ? v.min : -10,
        max: v.max != null ? v.max : 10,
        step: v.step != null ? v.step : 0.1
      }));
    } else if (config.var) {
      vars = [{
        name: config.var,
        value: config.init != null ? config.init : 0,
        min: config.min != null ? config.min : -10,
        max: config.max != null ? config.max : 10,
        step: config.step != null ? config.step : 0.1
      }];
    } else {
      vars = [{ name: "x", value: 0, min: -10, max: 10, step: 0.1 }];
    }

    const expr = config.expr || vars[0].name;

    host.classList.add("demo-tw");
    host.innerHTML = `
      <span class="demo-tw-inputs"></span>
      <span class="demo-tw-arrow">→</span>
      <span class="demo-tw-result"></span>
    `;
    const inputsEl = host.querySelector(".demo-tw-inputs");
    const resultEl = host.querySelector(".demo-tw-result");

    // Build input chips
    const inputEls = vars.map(v => {
      const wrap = document.createElement("span");
      wrap.className = "demo-tw-input";
      wrap.innerHTML = `
        <span class="demo-tw-name">${escapeHTML(v.name)} =</span>
        <input type="number" step="${v.step}" min="${v.min}" max="${v.max}" value="${v.value}">
      `;
      const inp = wrap.querySelector("input");
      inp.addEventListener("input", () => {
        const n = parseFloat(inp.value);
        if (isFinite(n)) { v.value = n; recompute(); }
      });
      inputsEl.appendChild(wrap);
      return inp;
    });

    // Build a safe evaluator: Math functions allowed, vars passed in.
    // We compile once with Function(...).
    const argNames = vars.map(v => v.name);
    let evalFn;
    try {
      // Whitelist common Math symbols by destructuring inside the function
      evalFn = new Function(...argNames, `
        const { abs, sqrt, pow, exp, log, log2, log10, sin, cos, tan, asin, acos, atan, atan2, PI, E, min, max, round, floor, ceil, sign } = Math;
        return (${expr});
      `);
    } catch (e) {
      resultEl.textContent = `expr error: ${e.message}`;
      return { destroy(){} };
    }

    function recompute() {
      let result;
      try {
        result = evalFn(...vars.map(v => v.value));
      } catch (e) {
        resultEl.textContent = "—";
        return;
      }
      if (typeof result === "number") {
        resultEl.textContent = `${prefix}${fmt(result, digits)}${suffix}`;
      } else {
        resultEl.textContent = `${prefix}${result}${suffix}`;
      }
    }

    function escapeHTML(s) {
      return String(s).replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
    }

    recompute();
    return { destroy(){} };
  }

  window.DemoRegistry.register("tweakable", mount);
})();
