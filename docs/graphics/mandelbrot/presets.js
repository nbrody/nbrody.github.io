/* ═══════════════════════════════════════════════════════
   Deep-dive destinations.

   re/im    target point as exact decimal strings. For most dives
            this is the nucleus of the minibrot the dive lands on,
            solved with Newton's method in high precision.
   size     that minibrot's complex size: near it c ≈ nucleus + size·w
            maps it onto the whole set (w = −2 is its antenna tip)
   aim      final view center relative to the target (the visual
            middle of that minibrot, since its nucleus sits off-center)
   zoom     final view height in the complex plane
   iters    [view height, max iterations] keyframes, interpolated
            log-log during the dive
   palette / mapping / density  coloring for the dive
            (mapping: 0 linear, 1 square root, 2 logarithmic)
   ═══════════════════════════════════════════════════════ */

window.MANDELBROT_PRESETS = [
    {
        id: 'seahorse',
        name: 'Seahorse Valley',
        blurb: 'Seahorse tails curl into spirals between the cardioid and the period-2 bulb. A period-998 minibrot drifts past at 10¹⁵×, and below it the spirals fold into ever richer Julia-set patterns around a period-8007 minibrot.',
        re: '-0.743643887037158704752191506114779778215256207',
        im: '0.131825904205311970493132056385140678972952279',
        size: [-7.4339e-33, 4.9769e-33],
        aim: [3.717e-33, -2.488e-33],
        zoom: 3.2e-32,
        iters: [[3.5, 400], [1e-2, 2000], [1e-6, 12000], [1e-14, 14000], [1e-20, 18000], [1e-24, 24000], [1e-28, 36000], [1e-30, 60000], [3.2e-32, 400000]],
        palette: 0, mapping: 1, density: 0.5,
    },
    {
        id: 'elephant',
        name: 'Elephant Valley',
        blurb: 'Elephant trunks wind into a spiral that becomes a pinwheel around a period-324 minibrot. Skimming past it, the patterns double at every stage — ovals, squares, octagons — until a period-3384 minibrot.',
        re: '0.2963032247269534641496154226009024942464650',
        im: '0.0171734113310878613663102786437723733043077',
        size: [5.3164e-32, 6.0782e-31],
        aim: [-2.658e-32, -3.039e-31],
        zoom: 2.2e-30,
        iters: [[3.5, 500], [1e-3, 2000], [1e-8, 4000], [1e-12, 5000], [1e-17, 8000], [1e-23, 12000], [1e-27, 20000], [1e-29, 60000], [2.2e-30, 400000]],
        palette: 3, mapping: 1, density: 0.3,
    },
    {
        id: 'lightning',
        name: 'Lightning Bolt',
        blurb: 'Filaments off the period-4 bulb fork into branching lightning, again and again, until concentric rings close around a period-999 minibrot.',
        re: '-1.315180982097868074368013351235685212739915993',
        im: '0.073481649996795118968199823752931160846231544',
        size: [4.6887e-33, -4.9894e-34],
        aim: [-2.344e-33, 2.495e-34],
        zoom: 1.7e-32,
        iters: [[3.5, 400], [1e-3, 4000], [1e-20, 4000], [1e-28, 6000], [1e-30, 12000], [1.7e-32, 100000]],
        palette: 6, mapping: 1, density: 0.2,
    },
    {
        id: 'scepter',
        name: 'Scepter Valley',
        blurb: 'In the valley between the period-2 and period-4 bulbs, spirals twist into S-curves and a four-armed pinwheel around a period-340 minibrot, then a second round of doubling leads to a period-1298 minibrot.',
        re: '-1.25342084444409362654258965961507',
        im: '0.02231613322034702841684881415375',
        size: [1.7443e-21, 9.1549e-20],
        aim: [-8.722e-22, -4.577e-20],
        zoom: 3.3e-19,
        iters: [[3.5, 500], [1e-2, 3500], [1e-12, 5000], [1e-16, 8000], [1e-18, 20000], [3.3e-19, 200000]],
        palette: 2, mapping: 1, density: 0.5,
    },
    {
        id: 'spiral',
        name: 'Endless Spiral',
        blurb: 'In the triple-spiral valley beside the period-3 bulb, arms wind around a Misiurewicz point, whose orbit lands exactly on a repelling fixed point. Its neighborhood is self-similar, so the spiral keeps turning however deep you go.',
        re: '-0.081042198183892919379358564125816144163924132831580896361233',
        im: '0.657410115220671474645190556345559553824724660660763475394122',
        zoom: 3.5e-40,
        iters: [[3.5, 400], [1e-2, 3000], [1e-20, 6000], [3.5e-40, 9000]],
        palette: 5, mapping: 1, density: 0.4,
    },
];
