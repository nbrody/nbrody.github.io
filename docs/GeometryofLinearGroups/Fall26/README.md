# Geometry of Linear Groups · Fall 2026

Static seminar homepage and an interest/availability survey. Serve the repository's
`docs` directory and open `/GeometryofLinearGroups/Fall26/`. No build is required.

## Firebase connection

Connected to **GoLGF26** (`golgf26`) under `nicbrody@gmail.com`.
The web app is named **Geometry of Linear Groups — Fall 2026 survey**.

- Realtime Database: `https://golgf26-default-rtdb.firebaseio.com`
- Region: United States (`us-central1`)
- Data path: `seminars/geometry-linear-groups-fall-2026/responses`
- Anonymous Authentication: enabled; automatic account cleanup is off so returning
  participants can keep editing their responses throughout the semester.
- Billing remains on the no-cost Spark plan.

`firebase-config.js` is an ignored local file containing the public web-app
configuration. Copy `firebase-config.example.js` and fill it from Firebase Console
for a fresh local checkout. GitHub Actions generates the deployed file from the
`GOLGF26_FIREBASE_CONFIG` repository secret using `.github/workflows/deploy-pages.yml`.
The generated file is still public on the website: Firebase client configuration
is not an administrator credential. Ignoring it does not remove prior Git history
or rotate the key. Database rules and API restrictions provide access control. `database.rules.json` is the complete rules document
published to this dedicated project. Root access is denied; authenticated
participants can read survey responses and write only the response matching their
own UID. Names, time slots, and response fields are validated by the database.
`firebase-rules.fragment.json` contains the same survey subtree for reference.

No further Firebase setup is required. The HTML page still needs to be published
through the repository's normal website deployment before sharing its public URL.

Verified live: anonymous sign-in; response creation and updates; reads by a second
participant; denial of cross-participant writes, unauthenticated reads, and invalid
time slots; undecided availability; and response removal. Temporary verification
responses and test accounts were removed. The browser preview loads the live
survey without Firebase errors.

Anonymous Firebase authentication supplies a persistent per-browser identity.
Participants can edit or remove only their own response under these rules. All
participants can read names and availability, which is disclosed before saving.
No email addresses are collected. Clearing browser data or changing browsers
loses access to the previous anonymous identity; the organizer can remove any
resulting duplicates in Firebase Console. This is an open interest survey; it
is not intended to establish real-world identity or prevent duplicate signups.

## Behavior

- Monday–Friday, 8 am–8 pm, in 30-minute blocks, Pacific time (America/Los_Angeles).
- Click/drag with a mouse or pen; tap on touch devices; Tab/Space for keyboard use.
- Participants with an undecided schedule can still express interest.
- Shared heatmap and top three one-hour windows; both consecutive half-hours must
  be available for the same person to count toward a one-hour window.
- Live updates through Firebase; retry and refresh controls on connection failures.
- Writes use the authenticated UID and a timeout, so retrying does not duplicate
  a response. If a timeout is ambiguous, the UI asks the participant to retry.

`survey.js` holds time labels, response validation, and overlap calculations.
`app.js` handles the form, draft recovery, Firebase, and the SVG illustration.
`firebase-config.js` selects the dedicated GoLGF26 backend.
`style.css` contains the responsive layout.

## Interactive homepage geometry

`visualizations.js` provides three independent visualizations above the survey:

- A finite Cayley ball for SO₃(ℤ[1/3]), with generators A and B the quarter-turns
  around the x and y axes and C the rotation induced by the quaternion 1+i+j.
  Integer numerator matrices over powers of three are reduced exactly; equality
  of matrices, not proximity of plotted points, identifies vertices. Edges use
  right multiplication. The base point (1,√2,√3)/√6 has trivial stabilizer under
  rational matrices, so distinct group elements give distinct plotted vertices.
  The sphere hides the rear edges until the viewer rotates it. Arc intersections
  are not additional vertices. Word radius is limited to 1–4 for readability.
- A Farey tessellation constructed from mediants on the positive and negative real
  axes. Every edge satisfies |ps−qr|=1. Rational boundary points use the Cayley map
  (x−i)/(x+i); dragging applies the disk automorphism (z+a)/(1+conj(a)z), with
  |a| bounded away from 1. Depth controls the finite truncation.
- A figure-eight knot using ((2+cos 2t)cos 3t, (2+cos 2t)sin 3t, sin 4t).

The sphere and knot use transparent Three.js WebGL canvases with no enclosing
border or panel background. Both support pointer rotation, keyboard arrows,
Home/reset, and optional automatic rotation (off initially). Rendering is paused
when offscreen or the document is hidden. Three.js 0.171.0 and OrbitControls are
vendored locally under `vendor/`, along with the MIT license. The Farey view is
SVG and remains usable if WebGL fails. Visualization errors do not block the
Firebase survey.

Math helpers live in `visual-math.js`. Checks cover exact orthogonality and
orientation, matrix deduplication, generator adjacency, unit-length orbit points,
Farey determinants, and knot closure.

References:
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
- [Three.js OrbitControls](https://threejs.org/docs/pages/OrbitControls.html)
- [Figure-eight parametrization, Knotted Portals in Virtual Reality](https://link.springer.com/article/10.1007/s00283-020-10028-8)
