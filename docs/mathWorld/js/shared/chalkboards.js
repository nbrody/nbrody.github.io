/**
 * Shared chalkboard content for Math World.
 *
 * Every campus scatters outdoor chalkboards tagged with a math topic.
 * This module renders the actual chalk writing (canvas texture) and
 * carries a short blurb for the info card, so all campuses share one
 * look and one source of content.
 *
 * Usage inside a scene's createChalkboard(name):
 *
 *   import { chalkTexture, chalkDescription } from '../shared/chalkboards.js';
 *   const face = new THREE.Mesh(
 *       new THREE.PlaneGeometry(2.6, 1.6),
 *       new THREE.MeshBasicMaterial({ map: chalkTexture(name) })
 *   );
 *   face.position.set(0, 1.85, 0.09);   // just in front of the slate
 *   g.add(face);
 *   g.userData.description = chalkDescription(name);
 */

import * as THREE from 'three';

export const CHALK_TOPICS = {
    // ---- UCSC ----
    'Algebra': {
        lines: ['x = (-b ± √(b²-4ac)) / 2a', '(a+b)² = a² + 2ab + b²', 'x⁵ - x - 1 : not solvable!'],
        description: 'From quadratic formulas to the impossibility of solving the general quintic — the study of equations and the structures they generate.'
    },
    'Geometry': {
        lines: ['a² + b² = c²', 'A = πr²', 'angles of Δ sum to π'],
        description: 'Shapes, distances, and angles — the oldest branch of mathematics, from Euclid’s postulates to the curvature of space itself.'
    },
    'Calculus': {
        lines: ['d/dx eˣ = eˣ', '∫₀^∞ e^(-x²) dx = √π / 2', 'e^(iπ) + 1 = 0'],
        description: 'The mathematics of change. Derivatives measure instantaneous rates; integrals accumulate them back. Euler’s identity ties it all together.'
    },
    'Linear Algebra': {
        lines: ['Av = λv', 'det(AB) = det(A)·det(B)', 'rank + nullity = n'],
        description: 'Vectors, matrices, and the eigenvalue problems that power everything from quantum mechanics to search engines.'
    },
    'Number Theory': {
        lines: ['ζ(s) = Π 1/(1 - p⁻ˢ)', 'aᵖ ≡ a (mod p)', 'π(x) ~ x / ln x'],
        description: 'The queen of mathematics: primes, congruences, and the Riemann zeta function, whose zeros encode the rhythm of the primes.'
    },

    // ---- Berkeley ----
    'Differential Geometry': {
        lines: ['∫_M K dA = 2πχ(M)', '∇ₓY - ∇ᵧX = [X, Y]', 'geodesics: ∇_γ̇ γ̇ = 0'],
        description: 'Curvature meets topology. The Gauss–Bonnet theorem says total curvature is a topological invariant — bend a surface all you like, the integral never changes.'
    },
    'Algebraic Geometry': {
        lines: ['V(I) ⊂ 𝔸ⁿ', 'g = (d-1)(d-2)/2', 'Spec ℤ'],
        description: 'Geometry through the lens of polynomial equations. Curves, surfaces, and schemes — where algebra draws pictures.'
    },
    'Dynamical Systems': {
        lines: ['xₙ₊₁ = r·xₙ(1 - xₙ)', 'λ = lim (1/n) ln‖Dfⁿ‖', 'period 3 ⇒ chaos'],
        description: 'Iterate a simple rule and watch order dissolve into chaos. The logistic map and Lyapunov exponents measure how quickly prediction fails.'
    },
    'Probability': {
        lines: ['P(A|B) = P(B|A)P(A)/P(B)', 'Sₙ/√n → N(0,1)', 'E[X+Y] = E[X] + E[Y]'],
        description: 'The calculus of uncertainty — Bayes’ rule for updating beliefs, and the central limit theorem explaining why the bell curve is everywhere.'
    },
    'Mathematical Logic': {
        lines: ['Con(PA) ⊬ PA', '∀x ∃y (y > x)', '⊢  vs  ⊨'],
        description: 'What can be proved, and what provably can’t. Gödel showed arithmetic cannot prove its own consistency — mathematics studying its own limits.'
    },
    'SLMath Common Area': {
        lines: ['π₁(S¹) = ℤ', 'tea @ 15:30', 'next talk: Simons Aud.'],
        description: 'The common-room board at the Simons Laufer Mathematical Sciences Institute, where visiting mathematicians sketch ideas between tea and talks.'
    },

    // ---- UCSB ----
    'Geometric Topology': {
        lines: ['χ = 2 - 2g', 'π₁(S³ \\ K)', 'Thurston: 8 geometries'],
        description: 'Knots, surfaces, and 3-manifolds. Thurston’s geometrization — proved via Ricci flow — classified all the shapes a 3-dimensional universe can take.'
    },
    'Operator Algebras': {
        lines: ['‖a*a‖ = ‖a‖²', 'II₁ factor: tr(1) = 1', 'B(H) ⊃ K(H)'],
        description: 'Infinite-dimensional linear algebra: C*-algebras and von Neumann factors, the natural language of quantum mechanics.'
    },
    'Conformal Field Theory': {
        lines: ['[Lₘ,Lₙ] = (m-n)Lₘ₊ₙ + (c/12)(m³-m)δ', 'c = 1/2 : Ising', 'T(z) = Σ Lₙ z⁻ⁿ⁻²'],
        description: 'Quantum field theory with angle-preserving symmetry. The Virasoro algebra’s central charge c classifies critical phenomena — c = ½ is the Ising model at its phase transition.'
    },
    'Mirror Symmetry': {
        lines: ['h¹·¹(X) = h²·¹(X̌)', 'quintic ⊂ ℙ⁴', 'n₁ = 2875 lines'],
        description: 'A duality from string theory: Calabi–Yau spaces come in mirror pairs that swap their Hodge numbers. It predicted the count of 2875 lines on the quintic — and much more.'
    },
    'Ergodic Theory': {
        lines: ['(1/N) Σ f(Tⁿx) → ∫ f dμ', 'μ(T⁻¹A) = μ(A)', 'mixing ⇒ ergodic'],
        description: 'When time averages equal space averages. Birkhoff’s theorem underlies statistical mechanics: follow one orbit long enough and it samples the whole space.'
    },
    'Partial Differential Equations': {
        lines: ['∂u/∂t = Δu', '□u = 0', 'Δu = 0 ⇒ mean value prop.'],
        description: 'Heat spreading, waves propagating, potentials balancing — the equations that model the continuous physical world, one derivative at a time.'
    }
};

const FALLBACK = {
    lines: ['∃ mathematics here', '(chalk pending)'],
    description: 'An outdoor chalkboard, waiting for the next idea.'
};

/**
 * Chalk-written slate face as a CanvasTexture.
 * Not cached: scene teardown disposes location textures, so each
 * scene load draws its own copies (cheap — a handful of canvases).
 */
export function chalkTexture(name) {
    const topic = CHALK_TOPICS[name] || FALLBACK;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');

    // Slate background with a faint wash of erased chalk
    ctx.fillStyle = '#1A4030';
    ctx.fillRect(0, 0, 1024, 640);
    for (let i = 0; i < 14; i++) {
        // Deterministic smudges (no Math.random — stable across loads)
        const t = i / 14;
        const x = 80 + 870 * ((t * 7.31) % 1);
        const y = 60 + 520 * ((t * 3.77 + 0.31) % 1);
        const r = 60 + 90 * ((t * 5.13 + 0.62) % 1);
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(235, 235, 220, 0.05)');
        grad.addColorStop(1, 'rgba(235, 235, 220, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    const chalkFont = '"Chalkboard SE", "Comic Sans MS", "Segoe Print", cursive';

    // Title, underlined
    ctx.fillStyle = '#F2EDDC';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let titleSize = 78;
    ctx.font = `${titleSize}px ${chalkFont}`;
    while (ctx.measureText(name).width > 920 && titleSize > 40) {
        titleSize -= 4;
        ctx.font = `${titleSize}px ${chalkFont}`;
    }
    ctx.fillText(name, 512, 105);
    ctx.strokeStyle = 'rgba(242, 237, 220, 0.85)';
    ctx.lineWidth = 4;
    const tw = Math.min(ctx.measureText(name).width, 920);
    ctx.beginPath();
    ctx.moveTo(512 - tw / 2, 160);
    ctx.lineTo(512 + tw / 2 + 14, 164);
    ctx.stroke();

    // Chalk lines, slightly uneven like handwriting
    const lines = topic.lines;
    const rowH = 420 / (lines.length + 0.4);
    lines.forEach((line, i) => {
        let size = 56;
        ctx.font = `${size}px ${chalkFont}`;
        while (ctx.measureText(line).width > 930 && size > 28) {
            size -= 3;
            ctx.font = `${size}px ${chalkFont}`;
        }
        const y = 245 + rowH * i;
        const tilt = (i % 2 === 0 ? -1 : 1) * 0.012;
        ctx.save();
        ctx.translate(512, y);
        ctx.rotate(tilt);
        ctx.fillStyle = i === 0 ? '#F2EDDC' : 'rgba(242, 237, 220, 0.92)';
        ctx.fillText(line, 0, 0);
        ctx.restore();
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

/** Info-card blurb for a chalkboard topic. */
export function chalkDescription(name) {
    return (CHALK_TOPICS[name] || FALLBACK).description;
}
