// Source offsets survive the display-math normalization used by both modes.
export function normalizeWithOffsets(source) {
 const tokens=/(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[^\n]*|`+[^`\n]*`+|\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|(?<!\\)\$(?:\\.|[^$\\\n])+?\$|\\\([^\n]+?\\\)/g;
 const segments=[];let text='',cursor=0;
 const add=(value,from,to,replaced=false)=>{segments.push({start:text.length,end:text.length+value.length,from,to,replaced});text+=value;};
 for(const m of source.matchAll(tokens)){
  add(source.slice(cursor,m.index),cursor,m.index);
  const raw=m[0],display=raw.startsWith('$$')||raw.startsWith('\\['),width=display||raw.startsWith('\\(')?2:1;
  const value=raw.startsWith('`')||raw.startsWith('~')?raw:display?`\n\n$$\n${raw.slice(width,-width).trim()}\n$$\n\n`:`$${raw.slice(width,-width)}$`;
  add(value,m.index,m.index+raw.length,value!==raw);cursor=m.index+raw.length;
 }
 add(source.slice(cursor),cursor,source.length);
 const offset=(pos,edge='start')=>{
  const seg=segments.find(s=>s.start<=pos&&pos<=s.end);
  if(!seg)return source.length;
  if(pos===seg.start)return seg.from;if(pos===seg.end)return seg.to;
  return seg.replaced?(edge==='start'?seg.from:seg.to):seg.from+pos-seg.start;
 };
 return {text,offset};
}
export function rehypeMathBlocks(){
 return tree=>{tree.children=tree.children.map(n=>n.type==='element'&&n.tagName==='pre'&&n.children?.some(c=>c.properties?.className?.includes('math-display'))?{type:'element',tagName:'div',position:n.position,properties:{className:['math-block']},children:[n]}:n);};
}
