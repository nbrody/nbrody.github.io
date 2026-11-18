const headingLevel=node=>node.type==='element'&&/^h[1-6]$/.test(node.tagName)?Number(node.tagName[1]):0;
const textOf=node=>node.value||node.children?.map(textOf).join('')||'';
// Heading identity is independent of source offsets, so edits above a section do not unfold it.
export function headingKey(text) {
 let a=2166136261,b=5381;
 for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
 return `${(a>>>0).toString(36)}-${(b>>>0).toString(36)}`;
}
export function rehypeFoldSections({collapsed=[]}={}) {
 return tree=>{
  const folded=new Set(collapsed),stack=[],occurrences=new Map(),sections=[];
  for(const node of tree.children) {
   const level=headingLevel(node);
   if(level)while(stack.length&&stack.at(-1).level>=level)stack.pop();
   if(node.type==='element') {
    const parents=stack.map(section=>section.key);
    node.properties={...node.properties,...(parents.length?{'data-fold-path':JSON.stringify(parents)}:{})};
    if(parents.some(key=>folded.has(key)))Object.assign(node.properties,{hidden:true,'data-fold-hidden':true});
    for(const parent of stack)parent.hasBody=true;
   }
   if(level) {
    const label=textOf(node).trim(),identity=`${level}:${label}`,occurrence=occurrences.get(identity)||0;
    occurrences.set(identity,occurrence+1);
    const key=`${headingKey(identity)}-${occurrence}`,section={node,level,key,label,hasBody:false};
    stack.push(section);sections.push(section);
   }
  }
  for(const {node,key,label,hasBody} of sections)if(hasBody)Object.assign(node.properties,{'data-fold-key':key,'data-fold-label':label});
 };
}
export function toggleFold(collapsed,key) {
 return collapsed.includes(key)?collapsed.filter(item=>item!==key):[...collapsed,key];
}
export function readFolds(scope,storage) {
 if(!scope)return [];
 try {
  const value=JSON.parse((storage||globalThis.localStorage)?.getItem(`alpha:markdown-folds:${scope}`)||'[]');
  return Array.isArray(value)?[...new Set(value.filter(k=>typeof k==='string'&&/^[a-z0-9]+-[a-z0-9]+-\d+$/.test(k)))]:[];
 }catch{return [];}
}
export function writeFolds(scope,folds,storage) {
 if(!scope)return;
 try {(storage||globalThis.localStorage)?.setItem(`alpha:markdown-folds:${scope}`,JSON.stringify(folds));}catch{/* Folding still works if browser storage is unavailable. */}
}
