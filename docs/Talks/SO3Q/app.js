(() => {
    'use strict';
    const sectionElements = [...document.querySelectorAll('#fullpage > .section')];
    const anchors = sectionElements.map(section => section.dataset.anchor);
    const previous = document.getElementById('previous');
    const next = document.getElementById('next');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let moving = false;

    function state() {
        const section = document.querySelector('.fp-section.active');
        if (!section) return null;
        const slides = [...section.querySelectorAll('.slide')];
        const slide = section.querySelector('.slide.active') || slides[0];
        return { section, sectionIndex: sectionElements.indexOf(section), slides, slideIndex: slides.indexOf(slide) };
    }
    function updateControls() {
        moving = false;
        const active = state();
        if (!active) return;
        previous.disabled = active.sectionIndex === 0 && active.slideIndex === 0;
        next.disabled = active.sectionIndex === sectionElements.length - 1 && active.slideIndex === active.slides.length - 1;
    }
    window.smartNext = function () {
        if (moving) return;
        const active = state();
        if (!active) return;
        if (active.slideIndex < active.slides.length - 1) fullpage_api.moveSlideRight();
        else if (active.sectionIndex < sectionElements.length - 1) fullpage_api.moveTo(anchors[active.sectionIndex + 1], 0);
    };
    window.smartPrev = function () {
        if (moving) return;
        const active = state();
        if (!active) return;
        if (active.slideIndex > 0) fullpage_api.moveSlideLeft();
        else if (active.sectionIndex > 0) {
            const destination = sectionElements[active.sectionIndex - 1];
            fullpage_api.moveTo(anchors[active.sectionIndex - 1], destination.querySelectorAll('.slide').length - 1);
        }
    };
    // Match the fullPage setup used in the other talks: vertical sections,
    // horizontal slides, section dots, and sequential keyboard navigation.
    window.fp_api = new fullpage('#fullpage', {
        licenseKey: 'gplv3-license',
        autoScrolling: true,
        navigation: true,
        navigationPosition: 'right',
        navigationTooltips: ['SO₃(ℚ)', 'Section 1', 'Section 2', 'Section 3', 'Section 4'],
        showActiveTooltip: false,
        anchors,
        slidesNavigation: true,
        controlArrows: true,
        keyboardScrolling: false,
        loopHorizontal: false,
        animateAnchor: false,
        scrollingSpeed: reducedMotion ? 0 : 700,
        scrollBar: false,
        scrollOverflow: true,
        onLeave() { moving = true; },
        onSlideLeave() { moving = true; },
        afterLoad: updateControls,
        afterSlideLoad: updateControls
    });
    previous.addEventListener('click', window.smartPrev);
    next.addEventListener('click', window.smartNext);
    document.getElementById('present').addEventListener('click', () => {
        document.documentElement.requestFullscreen?.().catch(() => {});
        fullpage_api.moveTo('section1', 0);
    });
    document.addEventListener('keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input,textarea,select,[contenteditable=true]')) return;
        if (event.target.closest('button,a') && [' ', 'Enter'].includes(event.key)) return;
        if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(event.key)) {
            event.preventDefault(); window.smartNext();
        } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) {
            event.preventDefault(); window.smartPrev();
        } else if (event.key === 'Home') {
            event.preventDefault(); fullpage_api.moveTo('title', 0);
        } else if (event.key === 'End') {
            event.preventDefault(); fullpage_api.moveTo('classification', 0);
        }
    });
    if (window.MathJax?.startup?.promise) MathJax.startup.promise.then(() => fullpage_api.reBuild());
    document.fonts.ready.then(() => fullpage_api.reBuild());
    updateControls();
})();
