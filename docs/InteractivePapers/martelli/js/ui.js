export function toggleSection(header) {
    header.classList.toggle('active');
    const content = header.nextElementSibling;
    content.classList.toggle('active');
}

// Attach to window for onclick handlers
window.toggleSection = toggleSection;
