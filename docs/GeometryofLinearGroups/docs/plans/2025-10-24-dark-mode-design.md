# Dark Mode Design for Navigation Pages

**Date**: 2025-10-24
**Status**: Approved

## Overview

Implement dark mode for all navigation/index pages across the Geometry of Linear Groups site. Dark mode will automatically activate based on user's system preferences using CSS media queries.

## Requirements

### Scope
- **In scope**: All navigation index.html pages
  - Main: `/index.html`
  - Sections: `/Algebraic/index.html`, `/Geometric/index.html`, `/Arithmetic/index.html`
  - Additional navigation pages as identified
- **Out of scope**: Tool/visualization pages (separate implementation if needed)

### Activation Method
- **System preference detection**: Automatic activation via `@media (prefers-color-scheme: dark)`
- No manual toggle required
- No JavaScript needed
- Works with OS-level dark mode settings (macOS, Windows, iOS, Android, browser)

## Architecture

### Approach: Separate dark-mode.css File

**Rationale**:
- Modular: Keeps dark/light theme concerns separated
- Easy to maintain: Can edit dark theme independently
- Easy to enable/disable: Simply add/remove link tag
- Leverages existing CSS variable system

### File Structure

**New file**:
```
/assets/css/dark-mode.css
```

**Modified files**:
- All navigation index.html files (add link tag)

## Color Scheme

### Light Theme (Current)
```css
--primary-color: #2c3e50     /* Dark blue-gray */
--secondary-color: #34495e   /* Secondary dark blue-gray */
--accent-color: #3498db      /* Blue */
--text-color: #333333        /* Dark gray */
--text-light: #666666        /* Medium gray */
--background: #ffffff        /* White */
--background-alt: #f8f9fa    /* Light gray */
--border-color: #e0e0e0      /* Light gray */
--card-shadow: 0 2px 8px rgba(0, 0, 0, 0.1)
--hover-shadow: 0 4px 16px rgba(0, 0, 0, 0.15)
```

### Dark Theme (Proposed)
```css
--primary-color: #e8eef5     /* Light blue-gray for headings */
--secondary-color: #d0d8e0   /* Secondary light blue-gray */
--accent-color: #5dade2      /* Brighter blue */
--text-color: #e0e4e8        /* Light gray */
--text-light: #a0a8b0        /* Muted gray */
--background: #1a1d23        /* Very dark blue-gray */
--background-alt: #252930    /* Slightly lighter dark gray */
--border-color: #3a3f47      /* Subtle gray */
--card-shadow: 0 2px 8px rgba(0, 0, 0, 0.3)
--hover-shadow: 0 4px 16px rgba(0, 0, 0, 0.4)
```

### Design Rationale
- **Dark blue-gray background** instead of pure black: Reduces eye strain, more sophisticated aesthetic
- **Maintains mathematical/academic feel**: Professional and elegant
- **High contrast for readability**: Light text on dark background without being harsh
- **Brightened accent color**: Better visibility against dark backgrounds
- **Adjusted shadows**: Lighter/subtler for depth on dark surfaces

## Implementation Details

### dark-mode.css Content

```css
/* Dark Mode Theme for Navigation Pages */
@media (prefers-color-scheme: dark) {
  :root {
    /* Primary Colors */
    --primary-color: #e8eef5;
    --secondary-color: #d0d8e0;
    --accent-color: #5dade2;

    /* Text Colors */
    --text-color: #e0e4e8;
    --text-light: #a0a8b0;

    /* Backgrounds */
    --background: #1a1d23;
    --background-alt: #252930;

    /* Borders & Shadows */
    --border-color: #3a3f47;
    --card-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    --hover-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }
}
```

### HTML Modifications

**For main index.html**:
```html
<link rel="stylesheet" href="assets/css/main.css">
<link rel="stylesheet" href="assets/css/dark-mode.css">
```

**For section index.html files** (Algebraic/, Geometric/, Arithmetic/):
```html
<link rel="stylesheet" href="../assets/css/main.css">
<link rel="stylesheet" href="../assets/css/dark-mode.css">
```

### Pages to Update

Confirmed pages requiring the link tag:
1. `/index.html` - Main landing page
2. `/Algebraic/index.html` - Algebraic section
3. `/Geometric/index.html` - Geometric section
4. `/Arithmetic/index.html` - Arithmetic section
5. `/PresentationCalc/index.html` - Presentation calculator (if navigation page)
6. `/GroupLibrary/index.html` - Group library (if navigation page)

Additional pages should be identified during implementation.

## Testing Considerations

### Browser Testing
- Chrome/Edge: DevTools > Rendering > "Emulate CSS media feature prefers-color-scheme"
- Firefox: DevTools > Inspector > Color scheme simulation
- Safari: Develop > Experimental Features > Dark Mode CSS Override

### Visual Testing Checklist
- [ ] All text remains readable (sufficient contrast)
- [ ] Card hover effects work correctly
- [ ] Borders are visible but subtle
- [ ] Icons maintain appropriate color
- [ ] Shadows provide depth without being too strong
- [ ] Mathematical symbols render correctly
- [ ] Footer text is legible
- [ ] Link colors are distinguishable

### Cross-Browser Compatibility
- Modern browsers support `prefers-color-scheme` (CSS Media Queries Level 5)
- Fallback: Users with older browsers see light theme (graceful degradation)
- No polyfill needed

## Additional Considerations

### Status Badges
The `.status` class currently uses `--accent-color` for background. May need specific dark mode treatment if visibility is poor. Can be addressed in dark-mode.css if needed:

```css
.status {
  background: var(--accent-color);
  color: #1a1d23; /* Dark text on bright button */
}
```

### Future Extensions
- Other page types (tool pages, about pages) can use same dark-mode.css file
- Manual toggle could be added later with JavaScript + localStorage
- Additional theme variants (high contrast, colorblind-friendly) could follow same pattern

## Success Criteria

1. Dark mode activates automatically when user's system preference is dark
2. All navigation pages have consistent dark theme
3. Text maintains WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text)
4. Visual hierarchy preserved from light theme
5. No layout shifts or broken styles
6. No JavaScript required for basic functionality
