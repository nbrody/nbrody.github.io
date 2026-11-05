// This preview has no editable fields or backend; buttons only switch views.
for (const preview of document.querySelectorAll('[data-ac-preview]')) {
  const buttons = [...preview.querySelectorAll('[data-ac-view]')];
  const panels = [...preview.querySelectorAll('[data-ac-panel]')];
  for (const button of buttons) button.addEventListener('click', () => {
    const view = button.dataset.acView;
    for (const item of buttons) item.setAttribute('aria-pressed', String(item === button));
    for (const panel of panels) panel.hidden = panel.dataset.acPanel !== view;
    preview.querySelector('[data-ac-current]').textContent = button.dataset.acLabel || button.textContent.trim();
  });
}
