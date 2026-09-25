# Three tree architectures

Researched 19 September 2026. “Redwood” is interpreted as **coast redwood**,
Sequoia sempervirens, rather than giant sequoia. These are source-informed
procedural interpretations, not calibrated botanical simulations. Scene dimensions
are normalized; the specimens do not share a real-world scale.

## Coast redwood

The NPS describes a tall, slender tree whose branches taper toward the top.
The model therefore favors a central leader, narrowing lateral reach and a
continuous inner crown. Crown-base height is an independent control: research in
a second-growth stand found live-crown ratio correlated with stand density and
relative tree height, with differences between edges and interiors. California
State Parks identifies moisture and light as important growth constraints.

**Controls:** height, crown base, leader dominance, branch elevation, crown width.
Crown base is a visible architectural outcome, not a numerical stand-density
model. The model omits old-growth reiteration, damage and resprouting.

- [NPS, Muir Woods tree architecture](https://www.nps.gov/muwo/planyourvisit/brochure-audio-description.htm)
- [Berrill, Deffress & Engle (2012), Coast redwood live crown and sapwood](https://research.fs.usda.gov/treesearch/41818)
- [California State Parks, moisture and light](https://www.parks.ca.gov/?page_id=22257)

## Hollywood juniper

This is a cultivar of Chinese juniper. RHS recognizes ‘Kaizuka’ and lists
‘Torulosa’ as a synonym. Its description emphasizes upright growth, an irregular
outline and dense foliage clusters. Oregon's landscape plant list describes
strongly upsweeping branches and a twisted appearance. The UNF Botanical Garden
likewise describes an open, irregular tree and notes sun, drainage and drought
tolerance. Consequently, contortion is present even at zero coastal exposure.

**Controls:** high branch elevation, contortion, competing limbs (low leader
dominance), cluster size and elongation. The bends are deterministic trigonometric
variations, not a measured spiral growth law. Pruning is not required to create
the preset's irregular form.

- [RHS, Juniperus chinensis ‘Kaizuka’](https://www.rhs.org.uk/plants/91774/juniperus-chinensis-kaizuka/details)
- [UNF Botanical Garden, Hollywood juniper](https://www.unf.edu/botanical-garden/plants/juniperus-chinensis.html)
- [Oregon Landscape Contractors Board, plant list: Torulosa entry](https://www.oregon.gov/lcb/Documents/ExamPlantList.pdf)

## Monterey cypress

Hesperocyparis macrocarpa is also widely known as Cupressus macrocarpa. The Forest
Service describes strongly distorted trees on coastal fringes, with more upright,
lightly branched forms a short distance inland. This supports an exposure control,
but does not provide a quantitative wind-to-shape relationship.

**Controls:** spreading forks, crown flattening, leader dominance and coastal
exposure. Exposure combines a persistent +X lean and biased lateral reach.
The flattened umbrella preset and its numeric coefficients are artistic
interpretations of a coastal specimen, not a universal species shape. The code
keeps crown flattening independently adjustable, including at zero exposure.

- [US Forest Service, Monterey cypress species review](https://research.fs.usda.gov/feis/species-reviews/hesmac)

## Shared modeling assumptions

Development (0.2–1) lengthens and thickens the skeleton and enlarges foliage;
it is not elapsed years or a physiological growth rate. Existing branch attachment
points move in this shape interpolation, unlike actual woody growth. Sun, fog,
water and soil are discussed as real drivers but are not simulated. Controls such
as leader dominance, crown flattening and contortion are normalized artistic
parameters, not measurements inferred from the sources. Branch elevation is in
degrees; other geometry uses scene units or dimensionless proportions.

Stage 1 shows a trunk and crown envelope; stage 2 exposes species architecture;
stage 3 adds coarse sinusoidal displacement, and stage 4 replaces crown volumes with leaf-bearing twigs. Turning off foliage
reveals the connected skeleton. The woody skeleton uses 3D distance fields. Foliage uses oriented twig planes with individual 2D SDF leaf cutouts.


## Leaf stage

Redwood needles follow the two-sided flat arrangement described by
[NASA GLOBE](https://observer.globe.gov/do-globe-observer/do-more/data-requests/nasa-moon-trees-coast-redwood).
Hollywood juniper primarily bears scales in four ranks
([NC State](https://plants.ces.ncsu.edu/plants/juniperus-chinensis-kaizuka/common-name/torulosa-juniper/));
Monterey cypress also has small, appressed scale leaves
([Oregon State](https://landscapeplants.oregonstate.edu/plants/hesperocyparis-macrocarpa)).
Our scale motifs simplify those ranks into overlapping scales on branchlet planes.
The planes vary in orientation and attach to the woody skeleton. Leaves are
intentionally exaggerated at tree scale; there is no physically calibrated leaf size.
The former fine sine-wave displacement and bark ripple have been removed.
