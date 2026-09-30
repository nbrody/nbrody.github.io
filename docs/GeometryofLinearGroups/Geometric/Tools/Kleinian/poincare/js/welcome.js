// First-visit popup: the step-through walkthrough (?embed=true&tutorial=true, see
// tutorial.js) in a floating window. Shown once (localStorage flag); reopen with ?.
const KEY = 'poincare.welcome.v2';

const css = `
#wt-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(3,5,12,.6);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:3vh 3vw;animation:wt-in .25s ease-out}
@keyframes wt-in{from{opacity:0}to{opacity:1}}
#wt-win{width:min(1100px,100%);height:min(720px,100%);display:flex;flex-direction:column;background:#05070f;border:1px solid var(--hairline-strong,rgba(255,255,255,.14));border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6);font-family:var(--font,system-ui,sans-serif)}
#wt-bar{display:flex;align-items:center;gap:12px;padding:10px 14px;color:var(--ink,#eef1f8);font-size:14px;font-weight:600;border-bottom:1px solid var(--hairline,rgba(255,255,255,.07))}
#wt-bar span{flex:1}
#wt-bar small{font-weight:400;color:var(--ink-faint,#5e6880);font-size:12px}
#wt-bar button{font:inherit;font-size:13px;cursor:pointer;border-radius:8px;padding:5px 12px;border:1px solid var(--hairline-strong,#444);background:transparent;color:var(--ink,#eee)}
#wt-bar button:hover{filter:brightness(1.3)}
#wt-frame{flex:1;width:100%;border:0;background:#05070f}
#wt-help{position:fixed;right:14px;bottom:14px;z-index:90;width:30px;height:30px;border-radius:50%;padding:0;font:600 14px var(--font,sans-serif);cursor:pointer;color:var(--ink-dim,#9aa5bd);background:var(--glass,rgba(10,14,26,.72));border:1px solid var(--hairline-strong,#444)}
#wt-help:hover{color:var(--ink,#fff)}
`;

function remember() { try { localStorage.setItem(KEY, '1'); } catch (e) { /* private mode */ } }
function seen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }

function open() {
    if (document.getElementById('wt-backdrop')) return;
    const back = document.createElement('div');
    back.id = 'wt-backdrop';
    back.innerHTML = `<div id="wt-win" role="dialog" aria-modal="true" aria-label="Tutorial">
        <div id="wt-bar"><span>Tutorial <small>· ← → or the ‹ › buttons to step</small></span>
        <button id="wt-close">Skip</button></div>
        <iframe id="wt-frame" title="Tutorial walkthrough"></iframe></div>`;
    document.body.appendChild(back);
    const frame = back.querySelector('#wt-frame');
    const close = () => {
        remember(); back.remove();
        window.removeEventListener('message', onMsg);
        document.removeEventListener('keydown', onKey, true);
    };
    // tutorial.js posts iframeNav when stepping past either end.
    const onMsg = (e) => {
        if (e.source === frame.contentWindow && e.data?.type === 'iframeNav' && e.data.direction === 'next') close();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('message', onMsg);
    document.addEventListener('keydown', onKey, true);
    back.querySelector('#wt-close').onclick = close;
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    frame.addEventListener('load', () => frame.contentWindow?.focus());
    frame.src = location.pathname + '?embed=true&tutorial=true';
}

const root = document.documentElement.classList;
if (!root.contains('embed-mode') && !root.contains('tutorial-mode')) {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const help = document.createElement('button');
    help.id = 'wt-help'; help.textContent = '?'; help.title = 'Show the tutorial'; help.setAttribute('aria-label', 'Show the tutorial');
    help.onclick = open;
    document.body.appendChild(help);
    if (!seen()) setTimeout(open, 600);
}
