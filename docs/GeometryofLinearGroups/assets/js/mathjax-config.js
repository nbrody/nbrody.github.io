// MathJax configuration with custom macros
window.MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    macros: {
      // Number systems and fields
      N: '\\mathbb{N}',
      Z: '\\mathbb{Z}',
      Q: '\\mathbb{Q}',
      Qbar: '\\overline{\\mathbb{Q}}',
      R: '\\mathbb{R}',
      C: '\\mathbb{C}',
      F: '\\mathbb{F}',
      G: '\\mathbb{G}',
      // Other blackboard bold
      bbH: '\\mathbb{H}',
      bbX: '\\mathbb{X}',
      bbK: '\\mathbb{K}',
      bbP: '\\mathbb{P}',
      // Groups
      SO: '\\mathsf{SO}',
      sfO: '\\mathsf{O}',
      PGL: '\\mathsf{PGL}',
      PSL: '\\mathsf{PSL}',
      SL: '\\mathsf{SL}'
    }
  },
  svg: {fontCache: 'global'}
};
