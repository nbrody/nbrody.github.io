export function prepareVisualization(frame, id) {
  const doc = frame.contentDocument;
  const style = doc.createElement('style');
  style.textContent = `
    #controls, #instructions, #ui-container, #hud, #legend,
    .app > header, .app > main > aside, #sidebar, body > #title,
    #hintOverlay, #readout, .stage > .legend { display:none !important; }
    html, body { margin:0 !important; width:100% !important; height:100% !important; overflow:hidden !important; }
  `;
  if (['picardOrbit', 'infiniteZ3lattice', 'z3lattice', 'indrasPearls'].includes(id)) style.textContent += '#info { display:none !important; }';
  if (['penrose', 'turingPatterns', 'tidalMarsh', 'cyclicCellularAutomaton'].includes(id)) style.textContent += `
    .app, .app > main, #stage { position:fixed !important; inset:0 !important; width:100% !important; height:100% !important; max-width:none !important; padding:0 !important; margin:0 !important; display:block !important; border:0 !important; border-radius:0 !important; }
    #stage canvas { width:100% !important; height:100% !important; }
  `;
  if (['bunya', 'juniper'].includes(id)) style.textContent += 'body > header, body > main, body > aside, body > footer, #status { display:none !important; }';
  if (id === 'passiflora') style.textContent += '#viewport > h1, #status { display:none !important; }';
  if (id === 'passiflora2') style.textContent += 'body > .caption { display:none !important; }';
  if (id === 'passifloraSimple') style.textContent += 'body > header, body > footer, #status { display:none !important; }';
  if (id === 'indrasPearls') style.textContent += '#info { display:none !important; }';
  if (id === 'cyclicCellularAutomaton') style.textContent += '#stage { max-height:none !important; min-height:0 !important; }';
  if (id === 'newtonFractals') style.textContent += '#control-panel, #coords { display:none !important; }';
  if (id === '4dKleinian') style.textContent += '.topbar, .drawer, #stats, .hint-bar { display:none !important; }';
  if (id === 'gameOfLife') style.textContent += '#restoreBtn { display:none !important; }';
  if (id === 'ballMachine') style.textContent += '#placard, #panelToggle, #machinePanel, #dock, #start { display:none !important; } #ticker { bottom:16px !important; }';
  doc.head.append(style);
  frame.contentWindow.dispatchEvent(new frame.contentWindow.Event('resize'));
}
