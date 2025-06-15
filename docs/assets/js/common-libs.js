(function() {
  const libs = [
    "https://polyfill.io/v3/polyfill.min.js?features=es6",
    "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js",
    "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js",
    "https://cdn.jsdelivr.net/npm/mathjs@11.3.0/lib/browser/math.js",
    "https://cdn.jsdelivr.net/npm/mathjs@13.3.2/dist/math.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.11.2/math.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.3.0/math.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.3.2/math.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/three.js/r132/three.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/three.js/r153/three.min.js",
    "https://cdn.jsdelivr.net/npm/three@0.153.0/examples/js/controls/OrbitControls.js",
    "https://sagecell.sagemath.org/static/embedded_sagecell.js",
    "https://cdnjs.cloudflare.com/ajax/libs/mathquill/0.10.1/mathquill.min.js"
  ];
  libs.forEach(url => {
    const script = document.createElement('script');
    script.src = url;
    script.async = false;
    document.head.appendChild(script);
  });
})();
