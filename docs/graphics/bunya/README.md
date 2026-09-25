# Walnut Avenue Bunya pine

Three.js / GLSL procedural study of the Bunya at Walnut and Chestnut in Santa Cruz. Open `index.html` through an HTTP server. No build step or external runtime dependencies; the optional reference gallery loads publisher-hosted photos.

Run from the graphics directory: `python3 -m http.server 8765`, then visit http://localhost:8765/bunya/.

Orbit, zoom, portrait/profile views, structure mode, foliage thinning, breeze, rotation, and PNG export are available. Reduced-motion preferences turn wind off initially. Both camera presets frame the entire tree down to its roots.

## References and identification

- Peter Shaw, *Trees of Santa Cruz County*, June 29, 2011: https://treesofsantacruzcounty.blogspot.com/2011/06/araucaria-bidwillii-bunya-bunya.html — the first photograph explicitly identifies the Chestnut heritage tree. The same article's SLO foliage and Scotts Valley trunk photos serve only as species-detail references.
- Visit Santa Cruz County: https://www.santacruz.org/blog/discover-the-dreamy-victorians-of-walnut-avenue/ — places the Bunya on the northwest corner of Walnut and Chestnut.
- The user supplied 304 Walnut; Shaw lists 301 Walnut. This discrepancy remains unresolved. The model targets the photographed corner specimen, not an independently verified parcel address.

`references.html` provides the visual reference gallery and source attribution. No reference photos are copied into the repository or used as textures.

## Model

Seeded, irregular radial branch tiers surround a single slightly bent trunk. Bare branch interiors lead to pendant rosettes of curved, densely leafed shoots. Broad pointed leaf blades have modeled midribs. A rounded terminal crown follows the photographed silhouette. Geometry is consolidated into a wood mesh and instanced leaves; procedural GLSL provides bark bands, leaf variation, and wind shared by visible and shadow passes.

Proportions and unseen structure are inferred, not measured. The 2011 article does not establish the tree's current condition. The small ground vignette is illustrative.

Three.js r160 and OrbitControls are vendored under their MIT license in `vendor/LICENSE`.
