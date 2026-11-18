/**
 * Curated Gallery of Kleinian & Fuchsian groups, view combinations, and camera
 * poses. Each entry stores ONLY its shareable `#s=…` link payload; clicking a
 * preview decodes and loads that payload directly into the live scene.
 */

export const GALLERY_CATEGORIES = [
    { id: 'all', label: 'All' },
    { id: 'fractals', label: 'Limit Sets & Fractals' },
    { id: 'manifolds', label: '3-Manifolds & Tilings' },
    { id: 'kaleidoscopes', label: 'Mirrors & Kaleidoscopes' },
    { id: 'halfspace', label: 'Half-Space & Cusps' },
    { id: 'surfaces', label: 'Surfaces & 2D' },
];

export const GALLERY_ITEMS = [
    {
        "id": "apollonian-pearls",
        "title": "Apollonian Pearls",
        "group": "Apollonian Gasket",
        "cat": "fractals",
        "tags": [
            "Limit Set",
            "Edges",
            "Translucent"
        ],
        "desc": "Poincaré reduction paints the Apollonian circle packing across the sphere at infinity around a translucent fundamental domain.",
        "payload": "#s=eyJ2IjoxLCJtYXRzIjpbWyIxIiwiMStpIiwiMCIsIjEiXSxbIjAiLCItMSIsIjEiLCIwIl1dLCJsaW1pdCI6dHJ1ZSwibGltaXREZXB0aCI6MTEyLCJwb2x5IjowLjI0LCJjeWNsZXMiOnRydWUsInBhbGV0dGUiOiJ0b2t5b05pZ2h0Iiwic3BpbiI6ZmFsc2UsImNhbSI6eyJwb3MiOlsxLjY4LDAuOTgsMS43Nl0sInRndCI6WzAsMCwwXX19"
    },
    {
        "id": "weeks-mirror",
        "title": "Weeks Mirror Chamber",
        "group": "Weeks manifold (closed)",
        "cat": "manifolds",
        "tags": [
            "Mirror",
            "Closed 3-Manifold"
        ],
        "desc": "Geodesic reflections inside the 26-faced Weeks domain — the smallest closed orientable hyperbolic 3-manifold.",
        "payload": "#s=eyJ2IjoxLCJtYXRzIjpbWyJcXGZyYWN7d317d14yKzF9LTEiLCItMSIsIjEiLCIwIl0sWyIwIiwidyIsIi1cXGZyYWN7MX17d30iLCJcXGZyYWN7d317d14yKzF9LTEiXV0sImNvbnN0cyI6W3sibmFtZSI6InciLCJwb2x5Ijoid142LTJ3XjUrNndeNC01d14zKzZ3XjItMncrMSIsIm5lYXIiOnsicmUiOjAuNjE1NDczMTUsImltIjoxLjgwMzcyOTExfX1dLCJtaXJyb3IiOnRydWUsInBhbGV0dGUiOiJyb3NlUGluZSIsInNwaW4iOmZhbHNlLCJjYW0iOnsicG9zIjpbMC44NCwtMC4zMiwwLjg4XSwidGd0IjpbMCwwLDBdfX0"
    },
    {
        "id": "dodecahedron-kaleidoscope",
        "title": "Pentagonal Tie-Dye",
        "group": "Right-angled dodecahedron (12 mirrors)",
        "cat": "kaleidoscopes",
        "tags": [
            "Tie-Dye",
            "Coxeter Mirrors",
            "Edges"
        ],
        "desc": "Looking down a 5-fold axis of the compact right-angled dodecahedron as wall inversions tile the entire Poincaré ball.",
        "payload": "#s=eyJ2IjoxLCJtYXRzIjpbWyItaSIsInArcSIsInAtcSIsIi1pIl0sWyItaSIsIi1wK3EiLCItcC1xIiwiLWkiXSxbImkiLCJwK3EiLCJwLXEiLCJpIl0sWyJpIiwiLXArcSIsIi1wLXEiLCJpIl0sWyItMS1tIiwicSIsIi1xIiwiMS1tIl0sWyItMSttIiwicSIsIi1xIiwiMSttIl0sWyIxLW0iLCJxIiwiLXEiLCItMS1tIl0sWyIxK20iLCJxIiwiLXEiLCItMSttIl0sWyItcCIsIjErcSIsIjEtcSIsInAiXSxbIi1wIiwiLTErcSIsIi0xLXEiLCJwIl0sWyJwIiwiMStxIiwiMS1xIiwiLXAiXSxbInAiLCItMStxIiwiLTEtcSIsIi1wIl1dLCJhbnRpIjpbdHJ1ZSx0cnVlLHRydWUsdHJ1ZSx0cnVlLHRydWUsdHJ1ZSx0cnVlLHRydWUsdHJ1ZSx0cnVlLHRydWVdLCJjb25zdHMiOltbInAiLCJcXGZyYWN7MStcXHNxcnR7NX19ezJ9Il0sWyJxIiwiXFxzcXJ0e3B9Il0sWyJtIiwiaXAiXV0sInRpZUR5ZSI6dHJ1ZSwiY3ljbGVzIjp0cnVlLCJwYWxldHRlIjoic3Vuc2V0Iiwic3BpbiI6ZmFsc2UsImNhbSI6eyJwb3MiOlswLDEuMzQsMi4xNl0sInRndCI6WzAsMCwwXX19"
    },
    {
        "id": "fig8-manifold",
        "title": "Inside the Figure-Eight Quotient",
        "group": "Figure eight knot group",
        "cat": "manifolds",
        "tags": [
            "Manifold View",
            "Inside View",
            "Edges"
        ],
        "desc": "Standing inside the figure-eight knot complement: rays leaving any face re-enter through its partner across the quotient.",
        "payload": "#s=eyJ2IjoxLCJtYXRzIjpbWyIxIiwiXFxmcmFjey0xK1xcc3FydHstM319ezJ9IiwiMCIsIjEiXSxbIjEiLCIwIiwiMSIsIjEiXV0sIm1hbmlmb2xkIjp0cnVlLCJjeWNsZXMiOnRydWUsInBhbGV0dGUiOiJoaXJvc2hpZ2UiLCJjYW0iOnsicXVhdCI6WzAuMTQxNywwLjIxNjcsMC4wMzgsMC45NjUyXX19"
    },
    {
        "id": "borromean-horoballs",
        "title": "Borromean Horoball Lattice",
        "group": "Borromean rings group",
        "cat": "halfspace",
        "tags": [
            "Cusp View",
            "Horoballs",
            "Upper Half-Space"
        ],
        "desc": "Ford isometric spheres and maximal cusp horoballs of the Borromean rings complement in PSL₂(ℤ[i]).",
        "payload": "#s=eyJ2IjoxLCJtYXRzIjpbWyItaSIsIjEiLCItMmkiLCIyK2kiXSxbIjEiLCIxIiwiMCIsIjEiXSxbIjEiLCIwIiwiLTJpIiwiMSJdXSwiY3VzcCI6MCwibW9kZWwiOiJ1aHMiLCJwb2x5IjowLjM4LCJjeWNsZXMiOnRydWUsImN1dCI6Mi4xLCJwYWxldHRlIjoiaG9rdXNhaSIsInNwaW4iOmZhbHNlLCJjYW0iOnsicG9zIjpbMS42MiwyLjI4LDIuMDVdLCJ0Z3QiOlswLDAuNDIsMF19fQ"
    },
    {
        "id": "fibonacci-pleating-uhs",
        "title": "Fibonacci Pleating Ray Over ℂ",
        "group": "P(8/13)",
        "cat": "fractals",
        "tags": [
            "Upper Half-Space",
            "Limit Set",
            "Cayley"
        ],
        "desc": "The Riley cusp at Fibonacci slope 8/13: its dendritic limit set carpets the complex plane beneath translucent isometric domes.",
        "payload": "#s=eyJ2IjoxLCJtYXRzIjpbWyIxIiwidyIsIjAiLCIxIl0sWyJcXGZyYWN7d317Mn0iLCItXFxmcmFje3deMn17NH0tMSIsIjEiLCItXFxmcmFje3d9ezJ9Il1dLCJjb25zdHMiOlt7Im5hbWUiOiJ3IiwicG9seSI6IndeNy13XjYrM3deNS0yd140KzR3XjMtM3deMiszdy0yIiwibmVhciI6eyJyZSI6MC41OTEwMTc1Mjk3LCJpbSI6MS4xMjE4NTU1ODE0fX1dLCJtb2RlbCI6InVocyIsImxpbWl0Ijp0cnVlLCJsaW1pdERlcHRoIjoxMjAsInBvbHkiOjAuMzUsImNheWxleSI6IlMiLCJjeWNsZXMiOnRydWUsInBhbGV0dGUiOiJsaWx5UGF0Y2giLCJzcGluIjpmYWxzZSwiY2FtIjp7InBvcyI6WzAuNTgsMy4wNSwyLjU1XSwidGd0IjpbMC4yMiwwLjE4LDAuM119fQ"
    },
    {
        "id": "jorgensen-honeycomb",
        "title": "Jørgensen Fibered Honeycomb",
        "group": "Jorgensen fibered (n=3)",
        "cat": "manifolds",
        "tags": [
            "Honeycomb",
            "Banded Faces"
        ],
        "desc": "Hundreds of hyperbolic cells of Jørgensen’s arithmetic fibered orbifold rendered with banded faces and gossamer walls.",
        "payload": "#s=eyJ2IjoxLCJtYXRzIjpbWyJ0IiwiMCIsIjAiLCIxIl0sWyItdSIsIi0xLVxcZnJhY3t1XjJ9e219IiwiMSIsIlxcZnJhY3t1fXttfSJdXSwiY29uc3RzIjpbeyJuYW1lIjoidCIsInBvbHkiOiJ0XjQtdF4zLXReMi10KzEiLCJuZWFyIjp7InJlIjoxLjcyMjA4MzgwNTcsImltIjowfX0seyJuYW1lIjoibSIsInBvbHkiOiJtXjItbSsxIiwibmVhciI6eyJyZSI6MC41LCJpbSI6MC44NjYwMjU0MDM4fX0sWyJ1IiwiXFxmcmFje3R9ezJ9KFxcZnJhY3ttKzF9e3ReMi0xfStcXGZyYWN7bS0xfXsodC0xKV4yfSkiXV0sImhvbmV5Y29tYiI6dHJ1ZSwiaGNXYWxscyI6MC4yOCwiaGNGYWNlcyI6MC40NCwidGlsZXMiOjM0MCwicGFsZXR0ZSI6ImNhdHBwdWNjaW4iLCJzcGluIjpmYWxzZSwiY2FtIjp7InBvcyI6WzEuNTQsMC44OCwxLjYyXSwidGd0IjpbMCwwLDBdfX0"
    },
    {
        "id": "eisenstein-tie-dye-light",
        "title": "Eisenstein Stained Glass",
        "group": "PSL(2,Z[w])",
        "cat": "kaleidoscopes",
        "tags": [
            "Tie-Dye",
            "Edges",
            "Light Theme"
        ],
        "desc": "Wall inversions of the Eisenstein Bianchi group PSL₂(ℤ[ω]) fold the Poincaré ball into a pastel hexagonal kaleidoscope on paper.",
        "payload": "#s=eyJ2IjoxLCJtYXRzIjpbWyIxIiwiMSIsIjAiLCIxIl0sWyIxIiwidyIsIjAiLCIxIl0sWyIwIiwiLTEiLCIxIiwiMCJdXSwiY29uc3RzIjpbeyJuYW1lIjoidyIsInBvbHkiOiJ3XjIrdysxIiwibmVhciI6eyJyZSI6LTAuNSwiaW0iOjAuODY2MDI1NH19XSwidGllRHllIjp0cnVlLCJjeWNsZXMiOnRydWUsInRoZW1lIjoibGlnaHQiLCJwYWxldHRlIjoidGllcG9sbyIsInNwaW4iOmZhbHNlLCJjYW0iOnsicG9zIjpbMS41MiwxLjI0LDEuNjRdLCJ0Z3QiOlswLDAsMF19fQ"
    },
    {
        "id": "quasischottky-lace",
        "title": "Indra’s Necklace & Cayley Tree",
        "group": "quasiSchottky",
        "cat": "fractals",
        "tags": [
            "Limit Set",
            "Cayley",
            "Dual Bisectors"
        ],
        "desc": "With the polyhedron hidden, ordinary-set tiles wrap the sphere around the 3D Cayley graph and dual bisector disks.",
        "payload": "#s=eyJ2IjoxLCJtYXRzIjpbWyJcXHNxcnR7Mn0iLCIxIiwiMSIsIlxcc3FydHsyfSJdLFsiXFxzcXJ0ezJ9IiwiaSIsIi1pIiwiXFxzcXJ0ezJ9Il1dLCJsaW1pdCI6dHJ1ZSwibGltaXREZXB0aCI6MTEyLCJwb2x5IjowLCJjYXlsZXkiOiJTIiwiZHVhbCI6IlMiLCJkdWFsT3AiOjAuMjQsInBhbGV0dGUiOiJuZW9uIiwic3BpbiI6ZmFsc2UsImNhbSI6eyJwb3MiOlsyLjEyLDAuNDgsMS42Ml0sInRndCI6WzAsMCwwXX19"
    },
    {
        "id": "bolza-octagon-disk",
        "title": "Bolza Dual Octagon Tiling",
        "group": "Genus-2 surface (generic basepoint)",
        "cat": "surfaces",
        "tags": [
            "Plane (2D)",
            "Delaunay",
            "Face Labels",
            "Light Theme"
        ],
        "desc": "Seen from a generic basepoint, the Bolza genus-2 surface has an 18-gon Dirichlet domain whose Delaunay dual is a clean octagon.",
        "payload": "#s=eyJ2IjoxLCJtYXRzIjpbWyJBK0IiLCJcXGZyYWN7Mn17M31CIiwiMCIsIkEtQiJdLFsiQStcXGZyYWN7NH17M31oIiwiLVxcZnJhY3syfXs5fWgiLCItaCIsIkEtXFxmcmFjezR9ezN9aCJdLFsiQStcXGZyYWN7MX17M31CIiwiLVxcZnJhY3s4fXs5fUIiLCItQiIsIkEtXFxmcmFjezF9ezN9QiJdLFsiQS1cXGZyYWN7Mn17M31oIiwiLVxcZnJhY3sxNH17OX1oIiwiLWgiLCJBK1xcZnJhY3syfXszfWgiXV0sImNvbnN0cyI6W1siQSIsIjErXFxzcXJ0ezJ9Il0sWyJCIiwiXFxzcXJ0ezIrMlxcc3FydHsyfX0iXSxbImgiLCJcXGZyYWN7XFxzcXJ0ezJ9fXsyfUIiXV0sInBsYW5lIjp0cnVlLCJkb20iOiJkZWxhdW5heSIsImxhYmVscyI6dHJ1ZSwiY2F5bGV5IjoiVCIsInRoZW1lIjoibGlnaHQiLCJwYWxldHRlIjoiaGlyb3NoaWdlIiwic3BpbiI6ZmFsc2UsImNhbSI6eyJwb3MiOlswLC0yLjU1LDAuMDAwNV0sInRndCI6WzAsMCwwXX19"
    },
    {
        "id": "meyerhoff-delaunay-tiling",
        "title": "Meyerhoff Dual Cloud",
        "group": "Meyerhoff manifold (closed)",
        "cat": "manifolds",
        "tags": [
            "Delaunay",
            "Tiling",
            "Edges"
        ],
        "desc": "The dual Delaunay domain of the Meyerhoff manifold suspended amid 220 translucent neighbor tiles inside the ideal sphere.",
        "payload": "#s=eyJ2IjoxLCJtYXRzIjpbWyJ4IiwiLTEiLCIxIiwiMCJdLFsiMCIsImIiLCItXFxmcmFjezF9e2J9IiwieSJdXSwiY29uc3RzIjpbeyJuYW1lIjoieCIsInBvbHkiOiJ4XjQteF4zLTEiLCJuZWFyIjp7InJlIjowLjIxOTQ0NzQ3MjEsImltIjowLjkxNDQ3MzY2M319LFsieSIsIjEreC14XjIiXSxbInoiLCJ4XjIteF4zIl0sWyJiIiwiXFxmcmFje3orXFxzcXJ0e3peMi00fX17Mn0iXV0sImRvbSI6ImRlbGF1bmF5IiwidGlsaW5nIjp0cnVlLCJ0aWxlcyI6MjIwLCJjeWNsZXMiOnRydWUsInBhbGV0dGUiOiJjcm9zcyIsInNwaW4iOmZhbHNlLCJjYW0iOnsicG9zIjpbLTEuNjQsMS4yNiwxLjU2XSwidGd0IjpbMCwwLDBdfX0"
    },
    {
        "id": "hurwitz-halfplane",
        "title": "Hurwitz (2,3,7) Half-Plane",
        "group": "(2,3,7) triangle group (cocompact Fuchsian)",
        "cat": "surfaces",
        "tags": [
            "Plane (2D)",
            "Upper Half-Space",
            "Cayley"
        ],
        "desc": "Oblique 3D perspective on the vertical upper half-plane tiled by the cocompact (2,3,7) triangle group and its Cayley arcs.",
        "payload": "#s=eyJ2IjoxLCJtYXRzIjpbWyIwIiwiMSIsIi0xIiwiMCJdLFsiXFxmcmFjezF9ezJ9IiwiXFxmcmFje1xcc3FydHszfX17Mn10IiwiLVxcZnJhY3tcXHNxcnR7M319ezJ0fSIsIlxcZnJhY3sxfXsyfSJdXSwiY29uc3RzIjpbWyJ1IiwiXFxmcmFjezJcXGNvcyhcXGZyYWN7XFxwaX17N30pfXtcXHNxcnR7M319Il0sWyJ0IiwidStcXHNxcnR7dV4yLTF9Il1dLCJwbGFuZSI6dHJ1ZSwibW9kZWwiOiJ1aHMiLCJjYXlsZXkiOiJTIiwicGFsZXR0ZSI6ImZpcmUiLCJzcGluIjpmYWxzZSwiY2FtIjp7InBvcyI6Wy0xLjc1LDEuMTIsMy4xNV0sInRndCI6WzAuMDUsMC45NSwwXX19"
    },
    {
        "id": "so3-octahedral-crystal",
        "title": "Shifted Arithmetic Crystal",
        "group": "SO₃(Z[2<sup>1/3</sup>])",
        "cat": "kaleidoscopes",
        "tags": [
            "Mirror",
            "Shifted Basepoint"
        ],
        "desc": "Moving the basepoint off the order-24 octahedral fixed point unfolds the cocompact arithmetic group over ℚ(∛2, i) into a faceted mirror gem.",
        "payload": "#s=eyJ2IjoxLCJtYXRzIjpbWyIxIiwiaSIsImkiLCIxIl0sWyIxK2JeMitpIiwiMCIsIjAiLCIxK2JeMi1pIl0sWyIxKzJiLWkiLCItMS1pIiwiMS1pIiwiMSsyYitpIl0sWyIxK2kiLCIwIiwiMCIsIjEtaSJdXSwiY29uc3RzIjpbeyJuYW1lIjoiYiIsInBvbHkiOiJiXjMtMiIsIm5lYXIiOnsicmUiOi0wLjYyOTk2MDUyNDk1LCJpbSI6MS4wOTExMjM2MzU5N319XSwiYnAiOlswLjIyLDAuMTIsMC4wOF0sIm1pcnJvciI6dHJ1ZSwicGFsZXR0ZSI6Im9jZWFuIiwic3BpbiI6ZmFsc2UsImNhbSI6eyJwb3MiOlswLjk4LDAuNzQsMS4wOF0sInRndCI6WzAuMjIsMC4xLDAuMDhdfX0"
    },
    {
        "id": "dense-circles-dust",
        "title": "Circle Packing & Hyperbolic Dust",
        "group": "Dense circles",
        "cat": "fractals",
        "tags": [
            "Limit Set",
            "Walls",
            "Dust",
            "Axis"
        ],
        "desc": "Tangent-circle limit set over ℚ(ζ₈) with translucent bisector walls, volume-uniform hyperbolic dust, and a marked generator axis.",
        "payload": "#s=eyJ2IjoxLCJtYXRzIjpbWyIxIiwiMmkiLCIwIiwiMSJdLFsiXFxmcmFje1xcc3FydHsyfX17Mn0iLCItXFxmcmFje1xcc3FydHsyfX17Mn0iLCJcXGZyYWN7XFxzcXJ0ezJ9fXsyfSIsIlxcZnJhY3tcXHNxcnR7Mn19ezJ9Il1dLCJsaW1pdCI6dHJ1ZSwibGltaXREZXB0aCI6OTYsInBvbHkiOjAuNDIsIndhbGxzIjowLjI4LCJkdXN0Ijp0cnVlLCJtYXJrIjoxLCJwYWxldHRlIjoia2FuYWdhd2EiLCJzcGluIjpmYWxzZSwiY2FtIjp7InBvcyI6WzEuOTIsLTAuNzQsMS40NF0sInRndCI6WzAsMCwwXX19"
    },
    {
        "id": "bianchi-sqrt5-uhs",
        "title": "Class-Number-Two Bianchi Domes",
        "group": "PSL(2,Z[√-5])",
        "cat": "halfspace",
        "tags": [
            "Upper Half-Space",
            "Cayley",
            "Edges",
            "Cutaway"
        ],
        "desc": "Hemispherical walls and Cayley geodesics of PSL₂(ℤ[√−5]) in upper half-space, showing the singular second cusp on the floor.",
        "payload": "#s=eyJ2IjoxLCJtYXRzIjpbWyIxIiwiMSIsIjAiLCIxIl0sWyIxIiwidyIsIjAiLCIxIl0sWyIyK3ciLCI0IiwiMiIsIjItdyJdLFsiMCIsIi0xIiwiMSIsIjAiXSxbIi00LXciLCItMnciLCIydyIsIi00K3ciXV0sImNvbnN0cyI6W3sibmFtZSI6InciLCJwb2x5Ijoid14yKzUiLCJuZWFyIjp7InJlIjowLCJpbSI6Mi4yMzYwNjc5OH19XSwibW9kZWwiOiJ1aHMiLCJwb2x5IjowLjc4LCJjeWNsZXMiOnRydWUsImNheWxleSI6IlMiLCJjdXQiOjIuNSwicGFsZXR0ZSI6Im5vcmQiLCJzcGluIjpmYWxzZSwiY2FtIjp7InBvcyI6WzEuOTUsMi4yNSwyLjU1XSwidGd0IjpbMCwwLjQyLDBdfX0"
    },
    {
        "id": "inside-dodecahedron-beams",
        "title": "Starlight Honeycomb",
        "group": "Right-angled dodecahedron (12 mirrors)",
        "cat": "kaleidoscopes",
        "tags": [
            "Inside Honeycomb",
            "Inside View",
            "Dust"
        ],
        "desc": "Standing at the ball origin inside an immersive 3D lattice of right-angled dodecahedral beams and hyperbolic dust.",
        "payload": "#s=eyJ2IjoxLCJtYXRzIjpbWyItaSIsInArcSIsInAtcSIsIi1pIl0sWyItaSIsIi1wK3EiLCItcC1xIiwiLWkiXSxbImkiLCJwK3EiLCJwLXEiLCJpIl0sWyJpIiwiLXArcSIsIi1wLXEiLCJpIl0sWyItMS1tIiwicSIsIi1xIiwiMS1tIl0sWyItMSttIiwicSIsIi1xIiwiMSttIl0sWyIxLW0iLCJxIiwiLXEiLCItMS1tIl0sWyIxK20iLCJxIiwiLXEiLCItMSttIl0sWyItcCIsIjErcSIsIjEtcSIsInAiXSxbIi1wIiwiLTErcSIsIi0xLXEiLCJwIl0sWyJwIiwiMStxIiwiMS1xIiwiLXAiXSxbInAiLCItMStxIiwiLTEtcSIsIi1wIl1dLCJhbnRpIjpbdHJ1ZSx0cnVlLHRydWUsdHJ1ZSx0cnVlLHRydWUsdHJ1ZSx0cnVlLHRydWUsdHJ1ZSx0cnVlLHRydWVdLCJjb25zdHMiOltbInAiLCJcXGZyYWN7MStcXHNxcnR7NX19ezJ9Il0sWyJxIiwiXFxzcXJ0e3B9Il0sWyJtIiwiaXAiXV0sImluc2lkZUhjIjp0cnVlLCJkdXN0Ijp0cnVlLCJwYWxldHRlIjoidG9reW9OaWdodCIsImNhbSI6eyJxdWF0IjpbMC4xNTIyLDAuMzE0NSwtMC4xNDE0LDAuOTI2Ml19fQ"
    }
];

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escapeAttr = escapeHtml;

function buildGalleryDialog() {
    if (document.getElementById('gallery-dialog')) return document.getElementById('gallery-dialog');

    const counts = new Map([['all', GALLERY_ITEMS.length]]);
    for (const item of GALLERY_ITEMS) {
        counts.set(item.cat, (counts.get(item.cat) || 0) + 1);
    }

    const dialog = document.createElement('dialog');
    dialog.id = 'gallery-dialog';
    dialog.setAttribute('closedby', 'any');
    dialog.setAttribute('aria-labelledby', 'gallery-title');

    const filtersHtml = GALLERY_CATEGORIES
        .filter((c) => c.id === 'all' || counts.get(c.id))
        .map((c, idx) => `<button type="button" class="gallery-filter${idx === 0 ? ' active' : ''}" data-cat="${escapeAttr(c.id)}" aria-pressed="${idx === 0 ? 'true' : 'false'}"${idx === 0 ? ' autofocus' : ''}>` +
            `<span>${escapeHtml(c.label)}</span>` +
            `<span class="gallery-filter-count">${counts.get(c.id) || 0}</span>` +
            `</button>`)
        .join('');

    const cardsHtml = GALLERY_ITEMS.map((item) => {
        const tags = (item.tags || []).map((t) => `<li class="gallery-tag">${escapeHtml(t)}</li>`).join('');
        return `<article class="gallery-card" data-cat="${escapeAttr(item.cat)}">` +
            `<img class="gallery-thumb" src="gallery/${escapeAttr(item.id)}.webp" alt="${escapeAttr(`${item.title} — ${item.desc}`)}" width="720" height="450" loading="lazy" fetchpriority="low">` +
            `<header class="gallery-card-head">` +
            `<h3><a class="card-link" href="${escapeAttr(item.payload)}">${escapeHtml(item.title)}</a></h3>` +
            `<span class="gallery-card-group">${item.group}</span>` +
            `</header>` +
            `<p class="gallery-card-desc">${escapeHtml(item.desc)}</p>` +
            `<footer class="gallery-card-foot">` +
            `<ul class="gallery-tags" aria-label="View modes">${tags}</ul>` +
            `<button type="button" class="gallery-copy-btn" data-payload="${escapeAttr(item.payload)}" aria-label="Copy link to ${escapeAttr(item.title)}" title="Copy shareable link to this view">Copy link</button>` +
            `</footer>` +
            `</article>`;
    }).join('');

    dialog.innerHTML = `
        <div class="gallery-head">
            <div class="gallery-head-text">
                <h2 id="gallery-title">Gallery</h2>
                <p class="gallery-subtitle">Curated groups, view modes, and camera angles — click any preview to load its link payload.</p>
            </div>
            <form method="dialog" class="gallery-close-form">
                <button type="submit" class="gallery-close-btn" aria-label="Close gallery" title="Close (Esc)">×</button>
            </form>
        </div>
        <div class="gallery-filters" role="toolbar" aria-label="Filter gallery by style">${filtersHtml}</div>
        <div class="gallery-body">
            <div class="gallery-grid" id="gallery-grid">${cardsHtml}</div>
        </div>
    `;

    document.body.appendChild(dialog);

    // Fallback for browsers without native <dialog closedby="any"> support
    if (!('closedBy' in HTMLDialogElement.prototype)) {
        const outside = (e, dlg) => {
            const r = dlg.getBoundingClientRect();
            return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        };
        let pressedOutside = false;
        dialog.addEventListener('pointerdown', (e) => {
            pressedOutside = e.target === dialog && outside(e, dialog);
        });
        dialog.addEventListener('pointerup', (e) => {
            if (pressedOutside && e.target === dialog && outside(e, dialog)) dialog.close();
            pressedOutside = false;
        });
    }

    // Category filtering
    const filterBtns = [...dialog.querySelectorAll('.gallery-filter')];
    const cards = [...dialog.querySelectorAll('.gallery-card')];
    const body = dialog.querySelector('.gallery-body');
    filterBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            const cat = btn.dataset.cat;
            filterBtns.forEach((b) => {
                const active = b === btn;
                b.classList.toggle('active', active);
                b.setAttribute('aria-pressed', String(active));
            });
            cards.forEach((card) => {
                card.hidden = cat !== 'all' && card.dataset.cat !== cat;
            });
            if (body) body.scrollTop = 0;
        });
    });

    // Card navigation (loads payload in-place) + copy-link secondary action
    dialog.addEventListener('click', (e) => {
        const copyBtn = e.target.closest('.gallery-copy-btn');
        if (copyBtn) {
            e.preventDefault();
            e.stopPropagation();
            const payload = copyBtn.dataset.payload;
            const url = location.origin + location.pathname + location.search + payload;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(() => {
                    copyBtn.textContent = 'Copied ✓';
                    copyBtn.classList.add('copied');
                    setTimeout(() => {
                        copyBtn.textContent = 'Copy link';
                        copyBtn.classList.remove('copied');
                    }, 1600);
                }).catch(() => {
                    window.prompt('Copy this link:', url);
                });
            } else {
                window.prompt('Copy this link:', url);
            }
            return;
        }

        const link = e.target.closest('a.card-link');
        if (!link) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        const payload = link.getAttribute('href');
        dialog.close();
        if (window.PoincareAPI && typeof window.PoincareAPI.loadPayload === 'function') {
            window.PoincareAPI.loadPayload(payload);
        } else {
            location.hash = payload;
        }
    });

    return dialog;
}

export function openGallery() {
    const dialog = buildGalleryDialog();
    if (!dialog.open) dialog.showModal();
}

function mountGallery() {
    const root = document.documentElement.classList;
    if (root.contains('embed-mode') || root.contains('tutorial-mode')) return;
    const dialog = buildGalleryDialog();

    document.querySelectorAll('#gallery-btn, [data-open-gallery]').forEach((btn) => {
        btn.addEventListener('click', () => openGallery());
    });

    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'g' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey &&
            !document.documentElement.classList.contains('inside-mode') &&
            !e.target.closest('input, textarea, select, [contenteditable], .mq-editable-field')) {
            if (dialog.open) dialog.close();
            else dialog.showModal();
        }
    });

    const q = new URLSearchParams(location.search);
    if (q.has('gallery')) openGallery();
}

if (typeof document !== 'undefined') {
    mountGallery();
}
