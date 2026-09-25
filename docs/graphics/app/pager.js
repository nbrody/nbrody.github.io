// pager.js — segmented tabs over horizontally swipeable pages.
//
// The pages sit side by side in a scroll-snap strip, so on a phone you can
// either tap a tab or swipe sideways; both stay in sync. Used by the remote
// (Simple · Advanced · Playlist · Connect) and the stage panel
// (Simple · Advanced · Studio). Every page stays laid out for swiping, but
// only the selected one is live: the others are `inert`, which keeps them out
// of the focus order and accessibility tree (the same control can appear on
// both Simple and Advanced).

export function mountPager({ tabs, pager, initial = 0, onChange }) {
  const buttons = [...tabs.querySelectorAll('[role=tab]')];
  const pages = [...pager.children];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let index = -1;
  let target = null; // page a tab click is scrolling toward; ignore intermediate pages
  let settle;

  buttons.forEach((b, i) => {
    const page = pages[i];
    if (!b.id) b.id = `${pager.id || 'pager'}-tab-${i}`;
    b.setAttribute('aria-controls', page.id);
    page.setAttribute('role', 'tabpanel');
    page.setAttribute('aria-labelledby', b.id);
    b.addEventListener('click', () => select(i));
  });

  tabs.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: buttons.length - 1 }[e.key];
    if (next == null) return;
    e.preventDefault();
    const j = (next + buttons.length) % buttons.length;
    select(j);
    buttons[j].focus();
  });

  function mark(i) {
    if (i === index || i < 0 || i >= pages.length) return;
    // Focus inside a page that is about to go inert would fall to <body>; hand it to the new tab.
    const stranded = pages.some((p, j) => j !== i && p.contains(document.activeElement));
    index = i;
    buttons.forEach((b, j) => {
      b.setAttribute('aria-selected', String(j === i));
      b.tabIndex = j === i ? 0 : -1;
      pages[j].inert = j !== i;
      if (j === i) pages[j].removeAttribute('aria-hidden');
      else pages[j].setAttribute('aria-hidden', 'true');
    });
    if (stranded) buttons[i].focus({ preventScroll: true });
    onChange?.(i, pages[i]);
  }

  const at = () => pager.scrollLeft / (pager.clientWidth || 1);

  function select(i, { smooth = true } = {}) {
    i = Math.max(0, Math.min(pages.length - 1, i));
    target = i;
    mark(i);
    pager.scrollTo({ left: i * pager.clientWidth, behavior: smooth && !reduced.matches ? 'smooth' : 'instant' });
    // Still no arrival after 700ms (slow or throttled smooth scroll, no `scrollend`): land on the
    // page. A swipe or wheel meanwhile clears `target`, so this never overrides the user.
    clearTimeout(settle);
    settle = setTimeout(() => {
      if (target !== i) return;
      target = null;
      if (Math.abs(at() - i) > 0.01) pager.scrollTo({ left: i * pager.clientWidth, behavior: 'instant' });
      mark(i);
    }, 700);
  }

  // Only the strip's own horizontal scrolling counts — not a page scrolling vertically inside it.
  pager.addEventListener('scroll', (e) => {
    if (e.target !== pager) return;
    if (target != null) {
      if (Math.abs(at() - target) * pager.clientWidth > 2) return; // ignore pages passed on the way
      target = null;
      clearTimeout(settle);
    }
    mark(Math.round(at()));
  }, { passive: true });
  // A scroll ending short of a tab's page was interrupted (Chrome can cancel a smooth scroll
  // before it moves); users steering clear `target` first, so finish the trip.
  pager.addEventListener('scrollend', (e) => {
    if (e.target !== pager || target == null) return;
    if (Math.abs(at() - target) > 0.01) pager.scrollTo({ left: target * pager.clientWidth, behavior: 'instant' });
    else { target = null; clearTimeout(settle); }
  });
  // A finger or trackpad on the strip means the user is steering; stop waiting for a tab target.
  for (const type of ['pointerdown', 'touchstart', 'wheel']) {
    pager.addEventListener(type, () => { target = null; clearTimeout(settle); }, { passive: true });
  }

  // Keep the current page aligned when the strip is resized (rotation, panel open).
  new ResizeObserver(() => {
    if (index >= 0) pager.scrollTo({ left: index * pager.clientWidth, behavior: 'instant' });
  }).observe(pager);

  select(initial, { smooth: false });
  return {
    select,
    get index() { return index; },
  };
}
