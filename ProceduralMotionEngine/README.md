# Procedural Motion Engine — After Effects Plugin

A single unified procedural generation engine for premium abstract motion
backgrounds, built as an Adobe CEP panel for After Effects 2026.

## What this is (architecture)

This is **one engine**, not a library of separate generators. Nine
independent systems (Geometry, Motion, Composition, Color, Depth, Loop,
Variation, Preset, Performance) each implement a common `run(scene, params, ctx)`
contract and register with a central `EngineRegistry`. They never call each
other directly — all communication happens by reading/writing a shared
`ParamController`, which is built entirely from one declarative schema
(`ParamSchema.js`). That's what makes "millions of variations" possible from
one codebase: variation comes from parameter combinations, not from adding
more generator functions.

## Phase 5 status: Color Engine (COMPLETE)

`client/js/engines/ColorEngine.js` overwrites the placeholder colors from
Geometry Engine with a real generated palette, running after Composition
(so hero shapes get accent treatment) and before Motion.

- **5 harmony modes**: `analogous`, `complementary`, `triadic`,
  `split-complementary`, `monochrome` — real hue-offset math per mode, not
  reskinned randomness.
- **Measured auto-contrast**: implements the actual WCAG relative-luminance
  and contrast-ratio formulas, then bisection-searches the minimal blend
  toward white/black needed to hit the target ratio (driven by the
  `contrast` slider). Verified by an independent test harness re-deriving
  the same ratio formula and checking every assigned color against it —
  zero violations across 60 palette × fill-mode × contrast combinations.
- **Accent color ties Composition → Color together**: shapes flagged
  `isHero` by the Composition Engine always receive `accentColor` (itself
  contrast-checked against the background), so visual hierarchy is
  consistent from scale through color, not scale-only.
- **Gradient generation**: `shape.fill = { mode, style, stops }` is built
  for `gradient`/`mixed` fill modes and rendered as real SVG
  `linearGradient`/`radialGradient` defs in the live preview (`angular`/
  `diamond` approximated as rotated-linear/radial, since neither SVG nor
  AE has a native angular or diamond gradient type).
- **Lighting color**: a higher-lightness tint of the base hue is computed
  and stored on `scene.palette.lighting`, handed off for the Depth Engine
  (Phase 6) to use for ambient/rim-light treatment.
- **Scoped, documented limitation**: the After Effects build step
  currently renders gradient shapes as a *solid* fill (the gradient's
  first stop), not a live AE gradient. Scripting AE's native vector
  gradient-fill property tree requires an undocumented, version-
  inconsistent "Gradient Color Data" value format that I could not verify
  without a live AE instance — shipping guessed-at property-tree code
  risked silent failures or build-time errors, which would violate the
  "no runtime errors" requirement more than scoping it down does. The SVG
  preview shows the full gradient; this is flagged here and in
  `host/lib/LayerBuilder.jsx` as a known follow-up rather than silently
  degraded.

## Phase 4 status: Composition Engine (COMPLETE)

`client/js/engines/CompositionEngine.js` takes over placement policy from
Geometry Engine's temporary placeholder, running after Geometry and before
Color/Depth/Motion — so Motion's `radial` phase-sync (which reads
`shape.position`) sees the final composed layout, not a placeholder one.

- **5 real layout algorithms**: `grid` (jittered cells), `radial` (density-
  controlled ring count), `organic-scatter` (Poisson-disc-style rejection
  sampling with golden-spiral fallback for over-dense requests),
  `rule-of-thirds` (gaussian clustering around the 4 classic intersections),
  `golden-spiral` (true spiral-arm curve, distinct from organic-scatter's
  disc fill — traces outward over `density`-controlled turn count).
- **Real symmetry, not just visual coincidence**: `horizontal`/`vertical`
  generate a seed layout in one half of the canvas and true-mirror it;
  `full` seeds one quadrant and mirrors 4 ways; `radial` seeds one angular
  wedge and rotates 6 copies around the canvas center. Any of the 5 layouts
  can drive any symmetry mode.
- **Controlled asymmetry**: after symmetric placement, a gaussian jitter
  scaled by `asymmetryBias` breaks mechanical perfection — applied last so
  the underlying symmetry stays legible.
- **Focal hierarchy**: one of the 4 rule-of-thirds points is chosen as the
  focal point every generation; the nearest ~10% of shapes get scaled up
  (proportional to `focalStrength` and proximity) and flagged `isHero`.
- **Negative space via culling**: shapes are actually removed (not just
  hidden) to hit a target visible-count derived from `negativeSpace`, using
  a seeded Fisher-Yates shuffle so culling is deterministic per seed. Hero
  shapes are always preserved.
- Tested: 75 layout × symmetry × negative-space combinations, zero
  out-of-bounds or non-finite positions, hero shapes always present when
  `focalStrength > 0`; confirmed deterministic (identical seed → identical
  shape count and positions); worst-case organic-scatter performance
  (400 shapes, max density) completes in ~30ms.

## Phase 3 status: Motion Engine (COMPLETE)

`client/js/engines/MotionEngine.js` attaches a `motion` descriptor to every
shape from the Geometry Engine — it doesn't move anything itself, it
computes *how* each shape should move, so both renderers stay in sync:

- **5 motion types**: `harmonic` (eased bob), `wave` (traveling wave),
  `orbital` (per-shape orbit radius/direction), `elastic` (periodic snap),
  `drift` (Lissajous-style wander with incommensurate frequencies) — all
  implemented in `client/js/core/MotionMath.js` as pure formulas.
- **4 phase-sync strategies**: `none` (random), `sequential` (linear
  stagger — reads as a traveling wave), `mirrored` (alternating opposition),
  `radial` (phase driven by each shape's angle from canvas center).
- **Real easing curves** (`linear`, `sineInOut`, `elastic`, `bounce`) reshape
  the harmonic oscillation cycle, not just a lerp.
- **Single source of truth for motion math**: `MotionMath.js` is called
  directly by `PreviewRenderer`'s new `requestAnimationFrame` loop AND
  mirrored formula-for-formula in `host/lib/MotionExpressions.jsx`, which
  writes real AE Position/Rotation/Scale **expressions** (not baked
  keyframes) onto every generated layer — so the panel preview and the
  actual After Effects render move the same way.
- **Live animated preview**: the SVG preview now actually animates;
  `PreviewRenderer.animateScene()` returns a `stop()` function and
  `app.js` always stops the previous loop before starting a new one, so
  regenerating never stacks up stray animation loops.
- Verified with a smoke test across all 5 types × 4 phase-syncs × 4
  easings (80 combinations) simulated over time — zero NaN/Infinity
  values — plus a determinism check confirming identical seeds produce
  byte-identical per-shape phase assignment.

## Phase 2 status: Geometry Engine (COMPLETE)

`client/js/engines/GeometryEngine.js` implements `run(scene, params, ctx)`:

- **5 shape families** (`polygon`, `organic`, `grid`, `radial`, `voronoi`),
  each a real generator (regular polygon, gaussian-jittered organic
  polygon, rect, pie/petal segment, randomized convex "cell" polygon) —
  not template variants of one shape.
- **Subdivision** via Chaikin corner-cutting (standard curve-smoothing
  algorithm), applied per the `subdivision` param and driven by
  `curveTension`.
- **Tessellation** via recursive centroid fan-triangulation with
  probabilistic re-subdivision, producing faceted fragments rather than a
  uniform triangle mosaic.
- **Shared seeded RNG**: `EngineRegistry.generate()` now creates one
  `SeededRandom` from `variation.seed` and passes it through `ctx.rng` to
  every engine in the pipeline, so one seed reproduces the whole scene
  deterministically (verified in testing: identical seed → byte-identical
  shape geometry).
- **Hard layer-budget enforcement**: tessellation branches by up to
  `sides` per level, which is exponential in depth. Testing caught a
  real worst-case hang (537k shapes / 16s at max sliders), so geometry
  generation now respects `performance.maxLayers` and stops recursing the
  moment the budget is hit — confirmed worst-case is now ~20ms / capped
  at the budget.
- **Live preview**: `PreviewRenderer.js` draws the generated scene as SVG
  directly in the panel.
- **Real AE output**: `host/main.jsx` gained `buildGeneratedScene`, which
  builds actual shape layers via `LayerBuilder.jsx`, reusing the active
  comp or creating one, and clears previously-generated layers first so
  Regenerate → Build is idempotent instead of stacking layers forever.

Placement (position/rotation/scale) and color are still geometry-owned
placeholders — that's intentional, documented in the file header, and will
be taken over cleanly by the Composition Engine (Phase 4) and Color Engine
(Phase 5) without changing the shape descriptor contract.

## Phase 1 status: Framework (COMPLETE)

This drop contains:

- **CEP extension scaffold** — `CSXS/manifest.xml`, `.debug` for unsigned
  local loading, dockable panel geometry.
- **Core framework**
  - `ParamSchema.js` — full declarative parameter contract for all 9 engines.
  - `ParamController.js` — validated get/set/subscribe state store with
    undo history and serialize/deserialize (used later by the Preset Engine).
  - `EngineRegistry.js` — orchestrates the fixed-order generation pipeline;
    engines register here, nothing hardcodes cross-engine calls.
  - `MathUtils.js` — seeded PRNG (mulberry32), easing curves, golden-spiral /
    circular point distribution helpers shared by every engine.
  - `HostBridge.js` — promise-based wrapper over CSInterface for calling
    into ExtendScript.
- **ExtendScript host** (`host/main.jsx` + `host/lib/`) — a dispatch-table
  pattern (`PME_registerHandler`) so each future engine's host-side AE
  operations (building shape layers, expressions, etc.) can register
  independently instead of growing one giant switch statement.
  `LayerBuilder.jsx` already implements generic AE shape-layer construction
  from a scene-graph shape descriptor, ready for the Geometry Engine to use.
- **Dockable dark-theme UI** — `index.html` / `theme.css` / `panel.css` +
  `UIBuilder.js`, which renders tabs and controls **entirely from
  ParamSchema** (large sliders, enums, colors, checkboxes, collapsible
  "Advanced" sections, tooltips-ready). Adding a parameter to the schema is
  enough to make it appear correctly in the UI — no per-control UI code needed.
- **app.js** — boots the controller/registry/UI, wires the toolbar
  (One-Click Masterpiece, Regenerate, Undo, Reset, Build in After Effects,
  Presets placeholder), and connects to the AE host via `ping`.

At this stage, generation intentionally reports "no engines implemented yet"
— that's correct: Phase 1 is the chassis. Phases 2–10 plug engines into the
registry one at a time without touching this framework.

## Install (development / unsigned)

1. Enable unsigned extension loading in AE (one-time):
   - macOS: `defaults write com.adobe.CSXS.11 PlayerDebugMode 1`
   - Windows: add `PlayerDebugMode=1` (String) under
     `HKEY_CURRENT_USER\Software\Adobe\CSXS.11`
   (Adjust the CSXS version suffix to match your AE release if different.)
2. Copy this whole folder to your CEP extensions directory:
   - macOS: `~/Library/Application Support/Adobe/CEP/extensions/ProceduralMotionEngine`
   - Windows: `%APPDATA%\Adobe\CEP\extensions\ProceduralMotionEngine`
3. Restart After Effects → Window > Extensions > Procedural Motion Engine.

## Roadmap (unchanged from spec)

Phase 2 Geometry · Phase 3 Motion · Phase 4 Composition · Phase 5 Color ·
Phase 6 Depth · Phase 7 Loop · Phase 8 Variation · Phase 9 Preset ·
Phase 10 Performance · Phase 11 Integration · Phase 12 Testing ·
Phase 13 Optimization · Phase 14 Documentation.
