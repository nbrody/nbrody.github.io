/** Desktop text entry and XR spatial keypad for a specialization value. */
import { createPanel } from '../../questGOLG/poincare/js/ui/panel.js?v=2026-11-12a';
import { drawExpressionKeypad, applyExpressionKey } from './xrKeypad.js';
const elem=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};

/** onApply(text) may throw to display an error or return false to keep editing. */
export function createValueEditor({onApply=()=>{},onClose=()=>{}}={}) {
  let active=false,immersive=false,field='Q',value='1',error='';
  const stylesheet=elem('link');stylesheet.rel='stylesheet';stylesheet.href=new URL('../generator-editor.css',import.meta.url).href;document.head.append(stylesheet);
  const aside=elem('aside',null,'generator-editor');aside.hidden=true;aside.setAttribute('aria-label','Specialization value');document.body.append(aside);
  const panel=createPanel({name:'specialization-value',widthM:.52,heightM:.66,build(ui){
    if(!active)return;
    ui.subheading('Specialize t');
    ui.text('Enter a nonzero value for t.',{muted:true,size:23*ui.s});
    ui.row(r=>{r.button('ve:apply','Apply',{width:'46%'});r.button('ve:cancel','Cancel',{width:'46%'});});
    if(error)ui.text(error,{color:ui.theme.fail,size:21*ui.s});
    ui.scrollArea('ve:scroll',null,u=>{
      u.text(`t = ${value||'∅'}`,{size:27*u.s});
      u.text(field==='Q'?'Use a rational expression, for example 3/2.':'Use a complex expression, for example 2+i or exp(iπ).',{muted:true,size:21*u.s});
      drawExpressionKeypad(u,{prefix:'ve',field,mode:field==='Q'?'rational':'complex'});
    });
  }});
  panel.mesh.visible=false;
  function setError(message){error=String(message||'');panel.invalidate();const e=aside.querySelector('[data-value-error]');if(e)e.textContent=error;}
  function syncVisibility(){aside.hidden=!(active&&!immersive);panel.mesh.visible=active&&immersive;}
  function close(){if(!active)return;active=false;syncVisibility();onClose();}
  function apply(){try{if(onApply(value)===false)return;close();}catch(e){setError(e?.message||'Could not read the value.');}}
  function showDesktop(){
    aside.replaceChildren();
    const head=elem('div',null,'generator-editor-head'),title=elem('h2','Specialize t'),x=elem('button','×');x.type='button';x.setAttribute('aria-label','Close specialization editor');x.addEventListener('click',close);head.append(title,x);aside.append(head);
    aside.append(elem('p',field==='Q'?'Enter a nonzero rational value, such as 3/2.':'Enter a nonzero complex value, such as 2+i, π, or exp(iπ).'));
    const form=elem('form'),label=elem('label','Value of t'),input=elem('input');input.className='specialization-value-input';input.type='text';input.value=value;input.autocomplete='off';input.spellcheck=false;input.setAttribute('aria-label','Value of t');
    input.addEventListener('input',()=>{value=input.value;setError('');});label.append(input);form.append(label);
    const actions=elem('div',null,'generator-editor-actions'),submit=elem('button','Apply'),cancel=elem('button','Cancel');submit.type='submit';cancel.type='button';cancel.addEventListener('click',close);actions.append(submit,cancel);form.append(actions);form.addEventListener('submit',e=>{e.preventDefault();apply();});aside.append(form);
    const message=elem('p',error,'generator-editor-error');message.dataset.valueError='';message.setAttribute('role','alert');aside.append(message);
  }
  panel.onAction((id,key)=>{
    if(!active)return;
    if(id==='ve:apply'){apply();return;}if(id==='ve:cancel'){close();return;}
    if(id==='ve:key'){value=applyExpressionKey(value,key);setError('');if(!immersive)showDesktop();}
  });
  return {
    panel,
    get isOpen(){return active;},
    open({field:nextField,value:initial='1',immersive:inXR=false}){field=nextField;value=String(initial);error='';immersive=!!inXR;active=true;showDesktop();panel.invalidate();syncVisibility();},
    setImmersive(flag){immersive=!!flag;if(active&&!immersive)showDesktop();syncVisibility();},
    setError,
    close,
    dispose(){close();panel.dispose();aside.remove();stylesheet.remove();},
  };
}
