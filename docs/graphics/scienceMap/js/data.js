// World coordinate system
const VIEW_W = 2400;
const VIEW_H = 1600;

// Continents are arranged along the canonical reductionist hierarchy:
//
//   ComputerScience              Astronomy & Space
//        \                        |
//         Physics --- Chemistry --- Biology --- Medicine
//          |              |           |    \      |
//        Engineering    Earth Sciences  Social Sciences
//
// The horizontal "spine" Physics → Chemistry → Biology → Medicine reflects
// the chain of emergent complexity. Astronomy sits above the physical
// sciences (astro = physics of the cosmos). Earth Sciences sits below the
// physical/life boundary (Earth = physics + chemistry + biology applied to
// one planet). Social Sciences emerge below Biology (humans are organisms).
// Engineering anchors the applied side of Physics; Computer Science sits
// across from Math (linked from the title) as a formal science.
const continents = [
  {
    id: 'compsci',
    name: 'Computer Science',
    description:
      'The study of computation, information, and the design of systems that process and reason about data.',
    color: '#33a8a8',
    cx: 270, cy: 360, r: 230, seed: 101,
    topics: [
      { name: 'Algorithms',     x: 210, y: 290 },
      { name: 'AI / ML',        x: 340, y: 290 },
      { name: 'Theoretical CS', x: 200, y: 360 },
      { name: 'Systems',        x: 340, y: 360 },
      { name: 'Networks',       x: 210, y: 430 },
      { name: 'Graphics',       x: 340, y: 430 },
      { name: 'Cryptography',   x: 270, y: 480 },
    ],
  },
  {
    id: 'astronomy',
    name: 'Astronomy & Space',
    description:
      'The study of the cosmos beyond Earth — stars, galaxies, planets, and the structure of the universe itself.',
    color: '#5e6dcf',
    cx: 1230, cy: 290, r: 250, seed: 102,
    topics: [
      { name: 'Astronomy',         x: 1160, y: 230 },
      { name: 'Astrophysics',      x: 1300, y: 230 },
      { name: 'Cosmology',         x: 1230, y: 290 },
      { name: 'Planetary Science', x: 1160, y: 350 },
      { name: 'Exoplanets',        x: 1310, y: 350 },
      { name: 'Stellar Evolution', x: 1230, y: 400 },
    ],
  },
  {
    id: 'physics',
    name: 'Physics',
    description:
      'The fundamental science of matter, energy, space, and time — from subatomic particles to the universe at large.',
    color: '#5b8fd6',
    cx: 580, cy: 760, r: 320, seed: 103,
    topics: [
      { name: 'Classical Mechanics', x: 470, y: 660 },
      { name: 'Quantum Mechanics',   x: 660, y: 660 },
      { name: 'Relativity',          x: 770, y: 750 },
      { name: 'Thermodynamics',      x: 460, y: 760 },
      { name: 'Electromagnetism',    x: 580, y: 810 },
      { name: 'Particle Physics',    x: 700, y: 850 },
      { name: 'Optics',              x: 380, y: 760 },
      { name: 'Condensed Matter',    x: 510, y: 900 },
      { name: 'Nuclear Physics',     x: 660, y: 940 },
    ],
  },
  {
    id: 'chemistry',
    name: 'Chemistry',
    description:
      'The science of matter and the changes it undergoes — atoms, molecules, and the reactions that build the world.',
    color: '#d39432',
    cx: 1170, cy: 770, r: 280, seed: 104,
    topics: [
      { name: 'Organic',            x: 1100, y: 700 },
      { name: 'Inorganic',          x: 1240, y: 700 },
      { name: 'Physical Chemistry', x: 1170, y: 780 },
      { name: 'Biochemistry',       x: 1260, y: 840 },
      { name: 'Analytical',         x: 1080, y: 840 },
      { name: 'Polymer',            x: 1260, y: 910 },
      { name: 'Materials',          x: 1080, y: 910 },
      { name: 'Electrochemistry',   x: 1190, y: 630 },
    ],
  },
  {
    id: 'biology',
    name: 'Biology',
    description:
      'The study of living organisms — their structure, function, growth, evolution, and interactions with environments.',
    color: '#6ba055',
    cx: 1740, cy: 770, r: 300, seed: 105,
    topics: [
      { name: 'Molecular Biology', x: 1660, y: 670 },
      { name: 'Genetics',          x: 1790, y: 660 },
      { name: 'Cell Biology',      x: 1720, y: 740 },
      { name: 'Microbiology',      x: 1620, y: 780 },
      { name: 'Ecology',           x: 1850, y: 800 },
      { name: 'Evolution',         x: 1740, y: 860 },
      { name: 'Neuroscience',      x: 1640, y: 860 },
      { name: 'Physiology',        x: 1850, y: 720 },
      { name: 'Immunology',        x: 1860, y: 880 },
      { name: 'Botany',            x: 1620, y: 720 },
      { name: 'Developmental',     x: 1740, y: 940 },
    ],
  },
  {
    id: 'medicine',
    name: 'Medicine',
    description:
      'The science and practice of diagnosing, treating, and preventing disease — from molecular pathology to public health.',
    color: '#c45a5a',
    cx: 2120, cy: 920, r: 240, seed: 106,
    topics: [
      { name: 'Anatomy',       x: 2040, y: 860 },
      { name: 'Pharmacology',  x: 2190, y: 860 },
      { name: 'Pathology',     x: 2030, y: 930 },
      { name: 'Surgery',       x: 2200, y: 930 },
      { name: 'Cardiology',    x: 2070, y: 1000 },
      { name: 'Oncology',      x: 2180, y: 1000 },
      { name: 'Epidemiology',  x: 2120, y: 1060 },
      { name: 'Public Health', x: 1990, y: 1000 },
      { name: 'Neurology',     x: 2230, y: 920 },
    ],
  },
  {
    id: 'engineering',
    name: 'Engineering',
    description:
      'The application of scientific principles to design machines, structures, materials, and systems for human ends.',
    color: '#e08e4a',
    cx: 360, cy: 1240, r: 250, seed: 107,
    topics: [
      { name: 'Mechanical',     x: 290, y: 1170 },
      { name: 'Electrical',     x: 420, y: 1170 },
      { name: 'Civil',          x: 290, y: 1240 },
      { name: 'Chemical Eng.',  x: 430, y: 1240 },
      { name: 'Aerospace',      x: 360, y: 1310 },
      { name: 'Bioengineering', x: 270, y: 1310 },
      { name: 'Materials Eng.', x: 450, y: 1310 },
    ],
  },
  {
    id: 'earth',
    name: 'Earth Sciences',
    description:
      'The study of our planet — its rocks, oceans, atmosphere, climate, and the deep history written in stone.',
    color: '#a4744a',
    cx: 950, cy: 1280, r: 270, seed: 108,
    topics: [
      { name: 'Geology',      x: 870, y: 1220 },
      { name: 'Meteorology',  x: 1020, y: 1220 },
      { name: 'Oceanography', x: 950, y: 1280 },
      { name: 'Climatology',  x: 860, y: 1350 },
      { name: 'Geophysics',   x: 1020, y: 1350 },
      { name: 'Paleontology', x: 950, y: 1420 },
      { name: 'Volcanology',  x: 820, y: 1290 },
    ],
  },
  {
    id: 'social',
    name: 'Social Sciences',
    description:
      'The study of human society and behavior — minds, cultures, economies, and the institutions that shape them.',
    color: '#cf6da0',
    cx: 1730, cy: 1340, r: 290, seed: 109,
    topics: [
      { name: 'Psychology',        x: 1640, y: 1260 },
      { name: 'Sociology',         x: 1780, y: 1260 },
      { name: 'Economics',         x: 1820, y: 1340 },
      { name: 'Anthropology',      x: 1670, y: 1340 },
      { name: 'Linguistics',       x: 1640, y: 1420 },
      { name: 'Political Science', x: 1800, y: 1420 },
      { name: 'Archaeology',       x: 1730, y: 1480 },
      { name: 'Cognitive Science', x: 1910, y: 1340 },
    ],
  },
];

// Connections trace the canonical relationships between fields. Most are
// reductionist: an emergent science depends on the more fundamental one.
const connections = [
  // formal science branches into computation/physics
  ['compsci', 'physics'],       // computational physics, formal foundation
  ['compsci', 'engineering'],   // software, hardware, EE
  ['compsci', 'biology'],       // bioinformatics
  ['compsci', 'social'],        // computational social science
  // astronomy is physics + chemistry of the cosmos
  ['astronomy', 'physics'],
  ['astronomy', 'chemistry'],
  ['astronomy', 'earth'],       // planetary science
  // the natural-sciences spine
  ['physics', 'chemistry'],
  ['chemistry', 'biology'],
  ['biology', 'medicine'],
  // applied / planetary sciences sit beneath the spine
  ['physics', 'engineering'],
  ['chemistry', 'engineering'],
  ['chemistry', 'earth'],       // geochemistry
  ['biology', 'earth'],         // ecology, paleontology
  ['engineering', 'earth'],     // civil, mining, environmental
  // social emerges from biology, links to medicine
  ['biology', 'social'],
  ['medicine', 'social'],
];
