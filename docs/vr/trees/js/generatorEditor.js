/** One generator editor, with a native desktop form and a spatial XR keypad. */
import { createPanel } from '../../questGOLG/poincare/js/ui/panel.js?v=2026-11-12a';
import { validateGenerators } from './generatorData.js';
import { drawExpressionKeypad, applyExpressionKey } from './xrKeypad.js';

const IDENTITY=['1','0','0','1'], LABELS=['a','b','c','d'];
const clone=rows=>rows.map(row=>row.slice());
function element(tag,text,className){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(className)e.className=className;return e;}
function button(text,action){const b=element('button',text);b.type='button';b.addEventListener('click',action);return b;}

/**
 * onApply({generators,matrices}) receives validated copies, or can return false
 * to keep editing. onClose fires after apply or cancellation. The caller adds
 * panel to its interaction list and positions panel.mesh in the workbench.
 */
export function createGeneratorEditor({onApply=()=>{},onClose=()=>{}}={}) {
  let active=false,immersive=false,field='Q',rows=[IDENTITY.slice()],selected=0,cell=0,error='';
  const stylesheet=element('link');stylesheet.rel='stylesheet';stylesheet.href=new URL('../generator-editor.css',import.meta.url).href;document.head.append(stylesheet);
  const aside=element('aside',null,'generator-editor');aside.hidden=true;aside.setAttribute('aria-label','Custom matrix generators');
  document.body.append(aside);
  const panel=createPanel({name:'custom-generators',widthM:.52,heightM:.66,build(ui){
    if(!active)return;
    ui.subheading('Custom generators');
    ui.text(`Field: ${field==='Q'?'ℚ':field==='i'?'ℚ(i)':'ℚ(ω)'}`,{muted:true,size:23*ui.s});
    ui.row(r=>{r.button('ge:apply','Apply',{width:'46%'});r.button('ge:cancel','Cancel',{width:'46%'});});
    if(error)ui.text(error,{color:ui.theme.fail,size:21*ui.s});
    ui.scrollArea('ge:scroll',null,u=>{
      u.text(`Generator ${selected+1} of ${rows.length}`,{bold:true,size:24*u.s});
      u.row(r=>{r.button('ge:previous','‹',{width:'22%'});r.button('ge:next','›',{width:'22%'});r.button('ge:add','+ Add',{width:'24%'});r.button('ge:remove','Remove',{width:'24%'});},{gap:6*u.s});
      for(let i=0;i<4;i+=2)u.row(r=>{
        for(let j=i;j<i+2;j++)r.button('ge:cell',`${LABELS[j]}: ${rows[selected][j]||'∅'}`,{value:j,active:cell===j,width:'46%',align:'left',size:22*u.s});
      });
      u.text(`Editing ${LABELS[cell]}: ${rows[selected][cell]||'∅'}`,{size:22*u.s});
      u.text('Tap an entry, then use the keypad. Clear replaces its contents.',{muted:true,size:20*u.s});
      drawExpressionKeypad(u,{prefix:'ge',field,mode:'generator'});
    });
  }});
  panel.mesh.visible=false;
  function syncVisibility(){aside.hidden=!(active&&!immersive);panel.mesh.visible=active&&immersive;}
  function setError(message){error=message;panel.invalidate();const e=aside.querySelector('[data-generator-error]');if(e)e.textContent=error;}
  function notify(){error='';panel.invalidate();}
  function apply(){
    try{
      const result=validateGenerators(field,rows);
      if(onApply(result)===false)return;
      close();
    }catch(e){setError(e?.message||'Could not read the generators.');}
  }
  function close(){if(!active)return;active=false;syncVisibility();onClose();}
  function showDesktop(){
    aside.replaceChildren();
    const head=element('div',null,'generator-editor-head');head.append(element('h2','Custom generators'),button('×',close));head.lastChild.setAttribute('aria-label','Close generator editor');aside.append(head);
    const about=element('p',`Matrices over ${field==='Q'?'ℚ(t)':field==='i'?'ℚ(i)(t)':'ℚ(ω)(t)'}. Use t, parentheses, fractions, powers and ${field==='i'?'i':field==='omega'?'ω':'rational numbers'}.`);aside.append(about);
    const list=element('div',null,'generator-editor-list');aside.append(list);
    rows.forEach((row,i)=>{
      const block=element('section',null,'generator-editor-card'),bar=element('div',null,'generator-editor-row');
      bar.append(element('strong',`Generator ${i+1}`));
      const remove=button('Remove',()=>{if(rows.length>1){rows.splice(i,1);selected=Math.min(selected,rows.length-1);notify();showDesktop();}});remove.disabled=rows.length===1;bar.append(remove);block.append(bar);
      const grid=element('div',null,'generator-editor-grid');row.forEach((value,j)=>{
        const label=element('label');label.append(element('span',`Generator ${i+1}, entry ${LABELS[j]}`));
        const input=element('input');input.type='text';input.value=value;input.autocomplete='off';input.spellcheck=false;input.setAttribute('aria-label',`Generator ${i+1}, entry ${LABELS[j]}`);
        input.addEventListener('input',()=>{rows[i][j]=input.value;selected=i;cell=j;notify();setError('');});
        input.addEventListener('focus',()=>{selected=i;cell=j;});label.append(input);grid.append(label);
      });block.append(grid);list.append(block);
    });
    const actions=element('div',null,'generator-editor-actions');
    const add=button('+ Add generator',()=>{rows.push(IDENTITY.slice());selected=rows.length-1;notify();showDesktop();});
    actions.append(add,button('Apply',apply),button('Cancel',close));aside.append(actions);
    const e=element('p',error,'generator-editor-error');e.dataset.generatorError='';e.setAttribute('role','alert');aside.append(e);
  }
  panel.onAction((id,value)=>{
    if(!active)return;
    if(id==='ge:apply'){apply();return;}
    if(id==='ge:cancel'){close();return;}
    if(id==='ge:previous')selected=(selected+rows.length-1)%rows.length;
    else if(id==='ge:next')selected=(selected+1)%rows.length;
    else if(id==='ge:add'){rows.push(IDENTITY.slice());selected=rows.length-1;cell=0;}
    else if(id==='ge:remove'){if(rows.length===1){setError('Keep at least one generator.');return;}rows.splice(selected,1);selected=Math.min(selected,rows.length-1);}
    else if(id==='ge:cell')cell=value;
    else if(id==='ge:key'){rows[selected][cell]=applyExpressionKey(rows[selected][cell],value);}
    else return;
    notify();showDesktop();
  });
  return {
    panel,
    get isOpen(){return active;},
    open({field:nextField,generators,immersive:inXR=false}){
      field=nextField;rows=clone(generators?.length?generators:[IDENTITY]);selected=0;cell=0;error='';immersive=!!inXR;active=true;showDesktop();panel.invalidate();syncVisibility();
    },
    setImmersive(value){immersive=!!value;if(active&&!immersive)showDesktop();syncVisibility();},
    close,
    dispose(){close();panel.dispose();aside.remove();stylesheet.remove();},
  };
}
