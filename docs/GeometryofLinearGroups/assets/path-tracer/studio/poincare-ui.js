/* ============================================================
   Topology tools — panel chrome shared with poincare-ui.css.

   A classic script; load it in <head> (no defer) so a stored light
   theme is applied before first paint:
       <html lang="en" data-theme-key="myApp.theme">
       <script src="../assets/poincare-ui.js"></script>

   On DOMContentLoaded it wires whatever of these it finds:
     .tab-btn[data-tab]   shows #tab-<name> in the same panel
     #collapse-btn        folds #control-panel into a round button
     #help-btn            opens #help-modal
     #theme-btn           toggles html.light (stored under data-theme-key)
     .status-banner-close collapses the banner; a click reopens it
     .fold-toggle         opens/closes its .fold
     .example-modal       closes on ×, backdrop or Esc
   Put data-ui="manual" on any of these elements to wire it yourself.

   Events on document: 'panel:tab' {tab}, 'panel:collapse' {collapsed},
   'themechange' {theme}. window.PoincareUI has the same operations.
   ============================================================ */
(function () {
    'use strict';
    const root = document.documentElement;
    const themeKey = () => root.dataset.themeKey || '';

    // ---- theme, before first paint ----
    try {
        const k = themeKey();
        const stored = k && localStorage.getItem(k);
        if (stored === 'light') root.classList.add('light');
        else if (stored === 'dark') root.classList.remove('light');
    } catch (e) { /* storage unavailable */ }

    const manual = el => !el || el.dataset.ui === 'manual';
    const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));

    function getTheme() { return root.classList.contains('light') ? 'light' : 'dark'; }

    function syncThemeButton() {
        const btn = document.getElementById('theme-btn');
        if (!btn) return;
        btn.title = getTheme() === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
        btn.setAttribute('aria-label', btn.title);
    }

    function setTheme(mode, { store = true, silent = false } = {}) {
        if (mode !== 'light' && mode !== 'dark') return;
        const changed = mode !== getTheme();
        root.classList.toggle('light', mode === 'light');
        if (store && themeKey()) {
            try { localStorage.setItem(themeKey(), mode); } catch (e) { /* storage unavailable */ }
        }
        syncThemeButton();
        if (changed && !silent) emit('themechange', { theme: mode });
    }

    function selectTab(name, nav) {
        const panel = (nav && nav.closest('#control-panel, .glass-card')) || document.getElementById('control-panel');
        if (!panel) return;
        panel.querySelectorAll('.tab-btn[data-tab]').forEach(b => {
            const on = b.dataset.tab === name;
            b.classList.toggle('active', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        panel.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${name}`));
        emit('panel:tab', { tab: name });
    }

    function setCollapsed(collapsed) {
        const panel = document.getElementById('control-panel');
        if (!panel) return;
        panel.classList.toggle('collapsed', collapsed);
        root.classList.toggle('panel-collapsed', collapsed);
        const btn = document.getElementById('collapse-btn');
        if (btn) {
            btn.title = collapsed ? 'Open panel' : 'Collapse panel';
            btn.setAttribute('aria-label', btn.title);
            btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        }
        emit('panel:collapse', { collapsed });
    }

    function openModal(id) {
        const m = typeof id === 'string' ? document.getElementById(id) : id;
        if (!m) return;
        m.hidden = false;
        m.querySelector('.example-modal-close')?.focus({ preventScroll: true });
    }
    function closeModal(id) {
        const m = typeof id === 'string' ? document.getElementById(id) : id;
        if (m) m.hidden = true;
    }

    function wire() {
        document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
            if (manual(btn)) return;
            btn.addEventListener('click', () => selectTab(btn.dataset.tab, btn));
        });

        const collapse = document.getElementById('collapse-btn');
        if (!manual(collapse)) {
            collapse.addEventListener('click', () =>
                setCollapsed(!document.getElementById('control-panel').classList.contains('collapsed')));
            if (document.getElementById('control-panel')?.classList.contains('collapsed')) setCollapsed(true);
        }

        const help = document.getElementById('help-btn');
        if (!manual(help) && document.getElementById('help-modal')) {
            help.addEventListener('click', () => openModal('help-modal'));
        }

        const theme = document.getElementById('theme-btn');
        if (!manual(theme)) {
            theme.addEventListener('click', () => setTheme(getTheme() === 'light' ? 'dark' : 'light'));
        }
        syncThemeButton();

        document.querySelectorAll('.status-banner').forEach(banner => {
            if (manual(banner)) return;
            banner.querySelector('.status-banner-close')?.addEventListener('click', e => {
                e.stopPropagation();
                banner.classList.add('collapsed');
            });
            banner.addEventListener('click', () => banner.classList.remove('collapsed'));
        });

        document.querySelectorAll('.fold-toggle').forEach(t => {
            if (manual(t)) return;
            t.addEventListener('click', () => {
                const fold = t.closest('.fold');
                const open = !fold.classList.contains('open');
                fold.classList.toggle('open', open);
                t.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
        });

        document.querySelectorAll('.example-modal').forEach(m => {
            if (manual(m)) return;
            m.querySelector('.example-modal-backdrop')?.addEventListener('click', () => closeModal(m));
            m.querySelectorAll('.example-modal-close').forEach(b => b.addEventListener('click', () => closeModal(m)));
        });
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            document.querySelectorAll('.example-modal:not([hidden])').forEach(m => { if (!manual(m)) closeModal(m); });
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
    else wire();

    window.PoincareUI = { getTheme, setTheme, selectTab, setCollapsed, openModal, closeModal };
})();
