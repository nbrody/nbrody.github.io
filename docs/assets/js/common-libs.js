// Central loader for frequently used CDN libraries.
// Include this file once per page. It safely injects each library only once.

(function () {
  if (window.__commonLibsInjected) return;
  window.__commonLibsInjected = true;

  const libs = [
    "https://polyfill.io/v3/polyfill.min.js?features=es6",
    "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js",
    "https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.11.2/math.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/three.js/r153/three.min.js",
    "https://cdn.jsdelivr.net/npm/three@0.153.0/examples/js/controls/OrbitControls.js",
    "https://sagecell.sagemath.org/static/embedded_sagecell.js",
    "https://cdnjs.cloudflare.com/ajax/libs/mathquill/0.10.1/mathquill.min.js"
  ];

  libs.forEach(src => {
    if (!document.querySelector(`script[src="${src}"]`)) {
      const script = document.createElement('script');
      script.src = src;
      script.async = false; // Preserve order
      document.head.appendChild(script);
    }
  });
})();