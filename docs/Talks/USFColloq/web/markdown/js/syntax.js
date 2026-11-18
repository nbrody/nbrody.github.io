// alphaMarkdown's syntax: the math delimiters, theorem-like blocks
// ([[thm:label]] …), [[wiki links]], and project macros. Plain JavaScript with
// no imports from outside this folder, so the standalone page, alphaCentaur
// (through app/lib/math.mjs) and the tests share one copy.
import {normalizeWithOffsets} from './live.js';
// One delimiter grammar for reading and live editing. Code is never rewritten.
export const mathPattern = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|(?<!\\)\$(?:\\.|[^$\\\n])+?\$|\\\([^\n]+?\\\)/g;
export function formula(raw) {
  const display = raw.startsWith('$$') || raw.startsWith('\\[');
  const width = display || raw.startsWith('\\(') ? 2 : 1;
  return {tex:raw.slice(width,-width), display};
}
export const normalizeMarkdown=source=>normalizeWithOffsets(source).text;
export const environmentNames = {thm:'Theorem', theorem:'Theorem', conj:'Conjecture', conjecture:'Conjecture', def:'Definition', defn:'Definition', definition:'Definition', lem:'Lemma', lemma:'Lemma', prop:'Proposition', cor:'Corollary', prf:'Proof', proof:'Proof', pf:'Proof', rem:'Remark', ex:'Example', claim:'Claim', q:'Question', ax:'Axiom', note:'Note'};
export const environmentStart = /^\[\[([a-z][\w-]*):([^\]\s:|]*)\]\][ \t]*(?:\(([^)]*)\))?[ \t]*/i;
export function environmentLabel(kind, title='') { return `${environmentNames[kind] || kind[0].toUpperCase()+kind.slice(1)}${title ? ` (${title})` : ''}.`; }
// Consume balanced groups; no arbitrary TeX or JavaScript is executed.
function group(s, start, open='{', close='}') {
  if (s[start]!==open) return null;
  let depth=1, i=start+1;
  for (;i<s.length;i++) {
    if (s[i]==='\\') { i++; continue; }
    if (s[i]===open) depth++;
    if (s[i]===close && !--depth) return {body:s.slice(start+1,i),end:i+1};
  }
  return null;
}
// KaTeX is passed in (the page's vendored copy, or npm's in alphaCentaur).
export function projectMacros(source='', katex) {
  const macros = {}, warnings = [];
  const s = source.replace(/\\%|%[^\n]*/g, x=>x==='\\%'?x:'');
  const re = /\\(newcommand|renewcommand|providecommand|DeclareMathOperator|def)(\*?)/g;
  let m;
  while ((m=re.exec(s))) {
    let i=re.lastIndex;
    const ws=()=>{while (/\s/.test(s[i]||'') && i<s.length)i++;}; ws();
    let name;
    if(s[i]==='{') {const g=group(s,i); if(!g)continue;name=g.body.trim();i=g.end;}
    else { const n=/^\\[A-Za-z@]+/.exec(s.slice(i)); if(!n)continue;name=n[0];i+=name.length; }
    if(!/^\\[A-Za-z@]+$/.test(name))continue;
    ws(); let args='',optional='';
    if(m[1]==='def') { const a=/^(?:#[1-9])*/.exec(s.slice(i))[0];args=a;i+=a.length;ws(); }
    else if(s[i]==='[') {const a=group(s,i,'[',']');if(!a)continue;args=`[${a.body}]`;i=a.end;ws();if(s[i]==='['){const d=group(s,i,'[',']');if(!d)continue;optional=`[${d.body}]`;i=d.end;ws();}}
    const body=group(s,i);if(!body)continue;re.lastIndex=body.end;
    if(optional){warnings.push(`${name}: optional arguments render in compiled LaTeX only; use a required argument for editor preview.`);continue;}
    let definition;
    if(m[1]==='DeclareMathOperator') definition=`\\gdef${name}{\\operatorname${m[2]}{${body.body}}}`;
    else if(m[1]==='def') definition=`\\gdef${name}${args}{${body.body}}`;
    else definition=`\\providecommand{${name}}{}\\renewcommand{${name}}${args}${optional}{${body.body}}`;
    try {katex.renderToString(definition,{macros,globalGroup:true,trust:false,maxExpand:500,throwOnError:true});}
    catch(e){warnings.push(`${name}: ${e.message}`);}
  }
  return {macros,warnings};
}
export const katexOptions = (macros={}) => ({macros:{...macros},trust:false,throwOnError:false,maxExpand:500,strict:false});
// An environment runs from its [[kind:label]] paragraph to the next blank line
// in the source, so lists, display math and code written directly beneath the
// statement stay inside it. Pass {source, offset} from normalizeWithOffsets:
// normalization pads display math with blank lines the author never wrote.
const continues = new Set(['list','math','code','table','paragraph']);
export function remarkEnvironments({source,offset}={}) {
 return (tree) => {
   const attached=(a,b)=>{
     const end=a.position?.end,start=b.position?.start;
     if(!end||!start)return false;
     if(source!=null&&offset)return !/\n[ \t]*\n/.test(source.slice(offset(end.offset,'end'),offset(start.offset,'start')));
     return start.line-end.line<=1;
   };
   const opens=node=>node.type==='paragraph'&&node.children?.[0]?.type==='text'&&environmentStart.test(node.children[0].value);
   const transform = parent => {
     if(!parent.children) return;
     const out=[];
     for(let i=0;i<parent.children.length;i++) {
       const node=parent.children[i];
       if(!opens(node)) {if(node.type!=='paragraph')transform(node);out.push(node);continue;}
       const first=node.children[0], m=first.value.match(environmentStart);
       first.value=first.value.slice(m[0].length);
       const kind=m[1].toLowerCase(), label=m[2], body=[{type:'paragraph',children:[{type:'strong',children:[{type:'text',value:environmentLabel(kind,m[3])}]}, {type:'text',value:' '},...node.children]}];
       let last=node;
       for(let next=parent.children[i+1];next&&continues.has(next.type)&&!opens(next)&&attached(last,next);next=parent.children[i+1]) {
         if(next.type!=='paragraph')transform(next);
         body.push(next);last=next;i++;
       }
       out.push({type:'mathEnvironment',position:node.position&&last.position?{start:node.position.start,end:last.position.end}:node.position,data:{hName:'section',hProperties:{className:['math-environment',`env-${kind}`],...(label?{id:`env-${label}`}:{})}},children:body});
     }
     parent.children=out;
   };transform(tree);
 };
}
export function remarkWikiLinks() {
 return tree => {
   const labels=new Set();
   const collect=n=>{const id=n.data?.hProperties?.id;if(id)labels.add(id.slice(4));n.children?.forEach(collect);};collect(tree);
   const walk=node=>{
     if(!node.children || ['code','inlineCode','math','inlineMath','link'].includes(node.type))return;
     node.children=node.children.flatMap(child=>{
       if(child.type!=='text'){walk(child);return [child];}
       const out=[];let pos=0;
       for(const m of child.value.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
         out.push({type:'text',value:child.value.slice(pos,m.index)});
         const ref=m[1].split(':').pop();out.push({type:'link',url:labels.has(ref)?`#env-${encodeURIComponent(ref)}`:`#note-${encodeURIComponent(m[1])}`,children:[{type:'text',value:m[2]||m[1]}]});pos=m.index+m[0].length;
       }
       out.push({type:'text',value:child.value.slice(pos)});return out;
     });
   };walk(tree);
 };
}

export function liveHeading(line){const m=/^(#{1,6})\s+/.exec(line);return m?{level:m[1].length,prefix:m[0].length}:null;}
