// Size in meters. Waypoints chosen to span 46 orders of magnitude
// without crowding the slider track.
export const WAYPOINTS = [
  { name: "Quark",              size: 1e-19,    emoji: "·",   category: "Subatomic",   color: "#ff3366",
    description: "A fundamental constituent of matter. Quarks have no measured size — only an experimental upper bound." },

  { name: "Proton",             size: 1.7e-15,  emoji: "⊕",   category: "Subatomic",   color: "#ff5566",
    description: "A composite particle made of three quarks. Found in every atomic nucleus." },

  { name: "Hydrogen atom",      size: 1.06e-10, emoji: "⚛️",  category: "Atomic",      color: "#ff8844",
    description: "The simplest atom: one proton, one electron. The most abundant element in the universe." },

  { name: "Water molecule",     size: 2.75e-10, emoji: "💧",  category: "Molecular",   color: "#ffaa44",
    description: "H₂O. Two hydrogens bonded to one oxygen. The basis of life as we know it." },

  { name: "DNA helix width",    size: 2.5e-9,   emoji: "🧬",  category: "Molecular",   color: "#ffdd44",
    description: "The diameter of the double helix that encodes genetic information." },

  { name: "Hemoglobin",         size: 6.5e-9,   emoji: "🩸",  category: "Molecular",   color: "#ddee2a",
    description: "An iron-containing protein that ferries oxygen through your bloodstream." },

  { name: "Ribosome",           size: 2.5e-8,   emoji: "⚙️",  category: "Molecular",   color: "#aaee2a",
    description: "A cellular machine that assembles proteins by reading messenger RNA." },

  { name: "HIV virus",          size: 1.2e-7,   emoji: "🦠",  category: "Microbial",   color: "#88e22a",
    description: "A retrovirus that invades immune cells. Far smaller than any bacterium." },

  { name: "Bacterium (E. coli)", size: 2e-6,    emoji: "🧫",  category: "Microbial",   color: "#44dd66",
    description: "A common gut bacterium — a self-contained, single-celled prokaryote." },

  { name: "Red blood cell",     size: 8e-6,     emoji: "🔴",  category: "Cellular",    color: "#22dd99",
    description: "Erythrocyte: a flexible, biconcave disc that delivers oxygen everywhere it's needed." },

  { name: "Animal cell",        size: 2e-5,     emoji: "🟢",  category: "Cellular",    color: "#22ddcc",
    description: "A typical eukaryotic cell, complete with nucleus and organelles." },

  { name: "Human hair width",   size: 8e-5,     emoji: "〰️",  category: "Microscopic", color: "#22aadd",
    description: "About 80 micrometers across — barely visible to the unaided eye." },

  { name: "Grain of sand",      size: 5e-4,     emoji: "⚪",  category: "Macroscopic", color: "#3399dd",
    description: "Roughly half a millimeter — small enough to slip between your fingers." },

  { name: "Ant",                size: 5e-3,     emoji: "🐜",  category: "Animal",      color: "#4488dd",
    description: "Social insects. A colony's collective intelligence rivals a small mammal's brain." },

  { name: "Honeybee",           size: 1.5e-2,   emoji: "🐝",  category: "Animal",      color: "#5588dd",
    description: "A keystone pollinator and one of the most studied insects on Earth." },

  { name: "Mouse",              size: 0.09,     emoji: "🐁",  category: "Mammal",      color: "#7788dd",
    description: "Among the smallest mammals — also the most ubiquitous lab animal." },

  { name: "House cat",          size: 0.5,      emoji: "🐈",  category: "Mammal",      color: "#8888dd",
    description: "Felis catus. A small carnivore that domesticated itself about 10,000 years ago." },

  { name: "Human",              size: 1.7,      emoji: "🧍",  category: "Mammal",      color: "#9988dd",
    description: "Average adult height of Homo sapiens." },

  { name: "African elephant",   size: 4,        emoji: "🐘",  category: "Mammal",      color: "#aa88dd",
    description: "The largest living land animal." },

  { name: "Tyrannosaurus rex",  size: 12,       emoji: "🦖",  category: "Prehistoric", color: "#bb88dd",
    description: "An apex predator from the late Cretaceous, ~66 million years ago." },

  { name: "Blue whale",         size: 30,       emoji: "🐋",  category: "Mammal",      color: "#cc88dd",
    description: "The largest animal ever known to have existed — heavier than any dinosaur." },

  { name: "Statue of Liberty",  size: 93,       emoji: "🗽",  category: "Structure",   color: "#dd66bb",
    description: "Including pedestal, from ground level to torch tip." },

  { name: "Eiffel Tower",       size: 330,      emoji: "🗼",  category: "Structure",   color: "#dd4499",
    description: "Wrought-iron lattice tower in Paris, completed in 1889." },

  { name: "Burj Khalifa",       size: 828,      emoji: "🏙️",  category: "Structure",   color: "#dd2277",
    description: "The tallest building in the world, in Dubai." },

  { name: "Mount Everest",      size: 8849,     emoji: "🏔️",  category: "Geographic",  color: "#dd2255",
    description: "Highest peak above sea level, in the Himalayas." },

  { name: "Grand Canyon",       size: 446e3,    emoji: "🏞️",  category: "Geographic",  color: "#cc4466",
    description: "446 km long. Carved by the Colorado River over millions of years." },

  { name: "Moon",               size: 3.474e6,  emoji: "🌑",  category: "Celestial",   color: "#cccccc",
    description: "Earth's natural satellite. About a quarter of Earth's diameter." },

  { name: "Earth",              size: 1.27e7,   emoji: "🌍",  category: "Celestial",   color: "#3399ff",
    description: "Our pale blue dot. Mean diameter, pole-to-pole." },

  { name: "Jupiter",            size: 1.43e8,   emoji: "🪐",  category: "Celestial",   color: "#dd9966",
    description: "The largest planet in our solar system — over 11 Earths across." },

  { name: "Sun",                size: 1.39e9,   emoji: "☀️",  category: "Stellar",     color: "#ffcc44",
    description: "Our G-type main-sequence star. 109 Earths fit across its diameter." },

  { name: "Earth–Sun distance", size: 1.5e11,   emoji: "🌞",  category: "Stellar",     color: "#ffaa66",
    description: "1 astronomical unit (AU). Light from the Sun takes about 8 minutes." },

  { name: "Solar System",       size: 2.2e13,   emoji: "🌌",  category: "Stellar",     color: "#ff8888",
    description: "Out to the heliopause, where solar wind meets interstellar space." },

  { name: "Light-year",         size: 9.46e15,  emoji: "✨",  category: "Stellar",     color: "#aaaaff",
    description: "The distance light travels in one year." },

  { name: "Proxima Centauri",   size: 4e16,     emoji: "⭐",  category: "Stellar",     color: "#8899ff",
    description: "The nearest star to the Sun, 4.24 light-years away." },

  { name: "Milky Way",          size: 9.5e20,   emoji: "🌀",  category: "Galactic",    color: "#aa66ff",
    description: "Our home galaxy, containing 100–400 billion stars." },

  { name: "Local Group",        size: 9.5e22,   emoji: "🌌",  category: "Galactic",    color: "#cc66ff",
    description: "A cluster of ~80 galaxies, including the Milky Way and Andromeda." },

  { name: "Observable universe", size: 8.8e26,  emoji: "◉",  category: "Cosmic",      color: "#ff66ff",
    description: "The diameter of all that light could have reached us since the Big Bang." },
];
