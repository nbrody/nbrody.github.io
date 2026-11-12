/** Shared on-panel expression keypad. Works with the existing hand/controller panel input. */
export function expressionKeyRows({field='Q',mode='generator'}={}) {
  const rows=[
    ['7','8','9','('], ['4','5','6',')'], ['1','2','3','+'],
    ['0','.','-','/'], ['*','^','⌫','Clear'],
  ];
  if(mode==='generator') rows.push(field==='i'?['t','i']:field==='omega'?['t','ω']:['t']);
  else if(mode==='complex') rows.push(['i','ω','π','e'],['sqrt(','exp(','sin(','cos(']);
  return rows;
}
/** Draw within a panel, preferably inside a scroll area. Emits `${prefix}:key` with a key value. */
export function drawExpressionKeypad(ui,{prefix='expression',field='Q',mode='generator'}={}) {
  for(const keys of expressionKeyRows({field,mode})) {
    ui.row(row=>keys.forEach(key=>row.button(`${prefix}:key`,key,{value:key,width:'23%',size:25*ui.s,height:58*ui.s})),{gap:8*ui.s});
  }
}
/** Append or erase; the desktop parser accepts both ASCII and the displayed ω/π characters. */
export function applyExpressionKey(text,key) {
  text=String(text??'');
  if(key==='⌫') return Array.from(text).slice(0,-1).join('');
  if(key==='Clear') return '';
  return text+String(key);
}
