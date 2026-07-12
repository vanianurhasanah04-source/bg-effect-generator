/**
 * CompositionEngine
 * -----------------
 * Responsible for: balance, spacing, negative space, visual hierarchy,
 * distribution, symmetry, controlled asymmetry.
 *
 * Contract: run(scene, params, ctx) OVERWRITES the placeholder
 * position/scale that GeometryEngine assigned (documented there as
 * temporary) with real layout policy, and may CULL shapes from
 * scene.shapes to express negative space. It runs before Color/Depth/
 * Motion in the pipeline, so everything downstream — including Motion's
 * 'radial' phase-sync, which reads shape.position — sees the final,
 * composed layout.
 */
(function (global) {
  'use strict';

  var MathUtils = global.PME.MathUtils;

  function CompositionEngine() {}

  CompositionEngine.prototype.run = function (scene, params, ctx) {
    var rng = ctx.rng;
    var shapes = scene.shapes;
    var n = shapes.length;
    if (n === 0) return;

    var margin = Math.min(scene.width, scene.height) * params.marginSafeZone;
    var bounds = { x0: margin, y0: margin, x1: scene.width - margin, y1: scene.height - margin };

    var positions = this._computePositions(params, n, bounds, rng);
    for (var i = 0; i < n; i++) {
      var jittered = this._applyControlledAsymmetry(positions[i], params.asymmetryBias, bounds, rng);
      shapes[i].position = jittered;
    }

    var focalPoint = this._computeFocalPoint(bounds, rng);
    this._applyFocalHierarchy(shapes, params.focalStrength, focalPoint);
    this._applyNegativeSpace(scene, params.negativeSpace, rng);

    scene.meta.composition = {
      layout: params.layout,
      symmetry: params.symmetry,
      focalPoint: focalPoint,
      visibleShapes: scene.shapes.length,
      culledShapes: n - scene.shapes.length
    };
  };

  // -------------------------------------------------------------------
  // Layout dispatch + symmetry
  // -------------------------------------------------------------------

  var LAYOUT_FNS = {
    'grid': '_layoutGrid',
    'radial': '_layoutRadial',
    'organic-scatter': '_layoutOrganicScatter',
    'rule-of-thirds': '_layoutRuleOfThirds',
    'golden-spiral': '_layoutGoldenSpiral'
  };

  CompositionEngine.prototype._computePositions = function (params, n, bounds, rng) {
    var layoutMethod = LAYOUT_FNS[params.layout] || LAYOUT_FNS['rule-of-thirds'];
    var layoutFn = this[layoutMethod].bind(this);

    if (params.symmetry === 'radial') {
      return this._radialSymmetryPositions(n, bounds, rng);
    }
    if (params.symmetry === 'none') {
      return layoutFn(n, bounds, rng, params.density);
    }
    return this._mirrorSymmetryPositions(layoutFn, params.symmetry, n, bounds, rng, params.density);
  };

  /** horizontal/vertical/full symmetry: generate a seed in one half/quarter, then true-mirror it. */
  CompositionEngine.prototype._mirrorSymmetryPositions = function (layoutFn, symmetry, n, bounds, rng, density) {
    var cx = (bounds.x0 + bounds.x1) / 2;
    var cy = (bounds.y0 + bounds.y1) / 2;
    var seedBounds, seedCount, mirrorFns;

    if (symmetry === 'vertical') {
      // Mirrored left/right across the vertical centerline.
      seedBounds = { x0: bounds.x0, y0: bounds.y0, x1: cx, y1: bounds.y1 };
      seedCount = Math.ceil(n / 2);
      mirrorFns = [
        function (p) { return p; },
        function (p) { return { x: 2 * cx - p.x, y: p.y }; }
      ];
    } else if (symmetry === 'horizontal') {
      // Mirrored top/bottom across the horizontal centerline.
      seedBounds = { x0: bounds.x0, y0: bounds.y0, x1: bounds.x1, y1: cy };
      seedCount = Math.ceil(n / 2);
      mirrorFns = [
        function (p) { return p; },
        function (p) { return { x: p.x, y: 2 * cy - p.y }; }
      ];
    } else { // 'full'
      seedBounds = { x0: bounds.x0, y0: bounds.y0, x1: cx, y1: cy };
      seedCount = Math.ceil(n / 4);
      mirrorFns = [
        function (p) { return p; },
        function (p) { return { x: 2 * cx - p.x, y: p.y }; },
        function (p) { return { x: p.x, y: 2 * cy - p.y }; },
        function (p) { return { x: 2 * cx - p.x, y: 2 * cy - p.y }; }
      ];
    }

    var seedPts = layoutFn(seedCount, seedBounds, rng, density);
    var combined = [];
    for (var m = 0; m < mirrorFns.length && combined.length < n; m++) {
      for (var s = 0; s < seedPts.length && combined.length < n; s++) {
        combined.push(mirrorFns[m](seedPts[s]));
      }
    }
    return combined.slice(0, n);
  };

  /** Radial symmetry: seed one angular wedge, then rotate copies around center. */
  CompositionEngine.prototype._radialSymmetryPositions = function (n, bounds, rng) {
    var cx = (bounds.x0 + bounds.x1) / 2;
    var cy = (bounds.y0 + bounds.y1) / 2;
    var foldCount = 6; // fixed fold count keeps radial symmetry visually consistent across layouts
    var sectorAngle = (Math.PI * 2) / foldCount;
    var maxR = Math.min(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0) / 2;
    var seedCount = Math.ceil(n / foldCount);

    var seedPts = [];
    for (var i = 0; i < seedCount; i++) {
      var a = rng.float(0, sectorAngle);
      var r = rng.float(maxR * 0.15, maxR);
      seedPts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }

    var combined = [];
    for (var k = 0; k < foldCount && combined.length < n; k++) {
      var rot = k * sectorAngle;
      var cosR = Math.cos(rot), sinR = Math.sin(rot);
      for (var s = 0; s < seedPts.length && combined.length < n; s++) {
        var dx = seedPts[s].x - cx, dy = seedPts[s].y - cy;
        combined.push({ x: cx + (dx * cosR - dy * sinR), y: cy + (dx * sinR + dy * cosR) });
      }
    }
    return combined.slice(0, n);
  };

  // -------------------------------------------------------------------
  // Individual layout algorithms — all take (count, bounds, rng, density)
  // -------------------------------------------------------------------

  CompositionEngine.prototype._layoutGrid = function (count, bounds, rng, density) {
    var w = bounds.x1 - bounds.x0, h = bounds.y1 - bounds.y0;
    var aspect = w / h;
    var cols = Math.max(1, Math.round(Math.sqrt(count * aspect)));
    var rows = Math.max(1, Math.ceil(count / cols));
    var cellW = w / cols, cellH = h / rows;
    var jitterAmt = (1 - density) * Math.min(cellW, cellH) * 0.15;

    var positions = [];
    for (var i = 0; i < count; i++) {
      var col = i % cols, row = Math.floor(i / cols);
      var baseX = bounds.x0 + cellW * (col + 0.5);
      var baseY = bounds.y0 + cellH * (row + 0.5);
      positions.push({ x: baseX + rng.gaussian(0, jitterAmt), y: baseY + rng.gaussian(0, jitterAmt) });
    }
    return positions;
  };

  CompositionEngine.prototype._layoutRadial = function (count, bounds, rng, density) {
    var cx = (bounds.x0 + bounds.x1) / 2, cy = (bounds.y0 + bounds.y1) / 2;
    var maxR = Math.min(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0) / 2;
    var ringCount = Math.max(1, Math.round(MathUtils.lerp(1, 4, density)));
    var perRing = Math.ceil(count / ringCount);

    var positions = [];
    var idx = 0;
    for (var ring = 0; ring < ringCount && idx < count; ring++) {
      var r = maxR * ((ring + 1) / ringCount);
      var itemsInRing = Math.min(perRing, count - idx);
      var ringPts = MathUtils.pointsOnCircle(itemsInRing, r, cx, cy, ring * 27);
      for (var p = 0; p < ringPts.length; p++) { positions.push({ x: ringPts[p].x, y: ringPts[p].y }); idx++; }
    }
    return positions;
  };

  CompositionEngine.prototype._layoutOrganicScatter = function (count, bounds, rng, density) {
    var w = bounds.x1 - bounds.x0, h = bounds.y1 - bounds.y0;
    var area = w * h;
    // Poisson-disc-style rejection sampling: higher density permits closer
    // packing (smaller minimum distance).
    var minDist = Math.sqrt(area / Math.max(1, count)) * MathUtils.lerp(1.15, 0.4, density);
    var positions = [];
    var maxAttempts = count * 40;
    var attempts = 0;

    while (positions.length < count && attempts < maxAttempts) {
      attempts++;
      var cand = { x: rng.float(bounds.x0, bounds.x1), y: rng.float(bounds.y0, bounds.y1) };
      var ok = true;
      for (var k = 0; k < positions.length; k++) {
        var dx = positions[k].x - cand.x, dy = positions[k].y - cand.y;
        if (dx * dx + dy * dy < minDist * minDist) { ok = false; break; }
      }
      if (ok) positions.push(cand);
    }
    // Dense requests can exhaust rejection sampling before reaching count —
    // fall back to golden-spiral fill for the remainder rather than leaving
    // shapes stacked at the origin.
    if (positions.length < count) {
      var remaining = count - positions.length;
      var spiralPts = MathUtils.goldenSpiralPoints(remaining, Math.min(w, h) / 2, (bounds.x0 + bounds.x1) / 2, (bounds.y0 + bounds.y1) / 2);
      for (var s = 0; s < spiralPts.length; s++) positions.push({ x: spiralPts[s].x, y: spiralPts[s].y });
    }
    return positions;
  };

  CompositionEngine.prototype._layoutRuleOfThirds = function (count, bounds, rng, density) {
    var thirds = this._thirdsPoints(bounds);
    var spread = MathUtils.lerp(0.22, 0.08, density) * Math.min(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0);
    var positions = [];
    for (var i = 0; i < count; i++) {
      var c = thirds[i % 4];
      positions.push({ x: c.x + rng.gaussian(0, spread), y: c.y + rng.gaussian(0, spread) });
    }
    return positions;
  };

  CompositionEngine.prototype._layoutGoldenSpiral = function (count, bounds, rng, density) {
    // True spiral-arm placement (as opposed to organic-scatter's disc
    // fill): points trace outward along a logarithmic-feeling spiral with
    // density controlling how many turns it makes.
    var cx = (bounds.x0 + bounds.x1) / 2, cy = (bounds.y0 + bounds.y1) / 2;
    var maxR = Math.min(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0) / 2;
    var totalTurns = MathUtils.lerp(1.5, 4, density);
    var positions = [];
    var denom = Math.max(1, count - 1);
    for (var i = 0; i < count; i++) {
      var t = i / denom;
      var theta = t * totalTurns * Math.PI * 2;
      var r = t * maxR;
      positions.push({ x: cx + Math.cos(theta) * r, y: cy + Math.sin(theta) * r });
    }
    return positions;
  };

  CompositionEngine.prototype._thirdsPoints = function (bounds) {
    var w = bounds.x1 - bounds.x0, h = bounds.y1 - bounds.y0;
    return [
      { x: bounds.x0 + w / 3, y: bounds.y0 + h / 3 },
      { x: bounds.x0 + (2 * w) / 3, y: bounds.y0 + h / 3 },
      { x: bounds.x0 + w / 3, y: bounds.y0 + (2 * h) / 3 },
      { x: bounds.x0 + (2 * w) / 3, y: bounds.y0 + (2 * h) / 3 }
    ];
  };

  // -------------------------------------------------------------------
  // Controlled asymmetry, focal hierarchy, negative space
  // -------------------------------------------------------------------

  CompositionEngine.prototype._applyControlledAsymmetry = function (p, asymmetryBias, bounds, rng) {
    if (asymmetryBias <= 0) return p;
    var maxOffset = asymmetryBias * Math.min(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0) * 0.08;
    var x = MathUtils.clamp(p.x + rng.gaussian(0, maxOffset), bounds.x0, bounds.x1);
    var y = MathUtils.clamp(p.y + rng.gaussian(0, maxOffset), bounds.y0, bounds.y1);
    return { x: x, y: y };
  };

  CompositionEngine.prototype._computeFocalPoint = function (bounds, rng) {
    var thirds = this._thirdsPoints(bounds);
    return thirds[rng.int(0, thirds.length - 1)];
  };

  /** Scales up the shapes nearest the focal point so the composition reads
   * with clear visual hierarchy instead of every element competing equally. */
  CompositionEngine.prototype._applyFocalHierarchy = function (shapes, focalStrength, focalPoint) {
    if (focalStrength <= 0 || shapes.length === 0) return;
    var heroCount = Math.max(1, Math.round(shapes.length * 0.1));

    var withDist = shapes.map(function (s) {
      var dx = s.position.x - focalPoint.x, dy = s.position.y - focalPoint.y;
      return { shape: s, dist: Math.sqrt(dx * dx + dy * dy) };
    });
    withDist.sort(function (a, b) { return a.dist - b.dist; });

    for (var i = 0; i < heroCount && i < withDist.length; i++) {
      var proximityWeight = 1 - i / heroCount; // closest hero gets the biggest boost
      var factor = 1 + focalStrength * MathUtils.lerp(0.5, 1.6, proximityWeight);
      withDist[i].shape.scale = (withDist[i].shape.scale || 1) * factor;
      withDist[i].shape.isHero = true;
    }
  };

  /** Culls shapes to open up breathing room, always preserving hero shapes. */
  CompositionEngine.prototype._applyNegativeSpace = function (scene, negativeSpace, rng) {
    if (negativeSpace <= 0) return;
    var n = scene.shapes.length;
    var targetVisible = Math.max(3, Math.round(n * (1 - negativeSpace * 0.65)));
    if (targetVisible >= n) return;

    var heroes = scene.shapes.filter(function (s) { return s.isHero; });
    var normals = scene.shapes.filter(function (s) { return !s.isHero; });

    // Fisher-Yates shuffle using the shared seeded RNG so culling is
    // deterministic for a given seed, not browser Math.random().
    for (var i = normals.length - 1; i > 0; i--) {
      var j = rng.int(0, i);
      var tmp = normals[i]; normals[i] = normals[j]; normals[j] = tmp;
    }

    var keepNormalsCount = Math.max(0, targetVisible - heroes.length);
    var kept = heroes.concat(normals.slice(0, keepNormalsCount));
    var keptIds = {};
    for (var k = 0; k < kept.length; k++) keptIds[kept[k].id] = true;

    scene.shapes = scene.shapes.filter(function (s) { return keptIds[s.id]; });
  };

  global.PME = global.PME || {};
  global.PME.CompositionEngine = CompositionEngine;
})(typeof window !== 'undefined' ? window : this);
