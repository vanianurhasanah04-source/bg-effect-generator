/**
 * GeometryEngine
 * --------------
 * Responsible for: shape generation, tessellation, polygon creation, curve
 * generation, topology, subdivision, pattern construction.
 *
 * Contract: run(scene, params, ctx) pushes shape descriptors into
 * scene.shapes. Each descriptor is intentionally the same shape used later
 * by LayerBuilder.jsx on the host side:
 *
 *   {
 *     id, name,
 *     points: [{x,y}, ...]   // LOCAL coordinates, centered on (0,0)
 *     closed: boolean,
 *     fillColorHex, strokeColorHex, strokeWidth,
 *     position: {x, y},      // placement in the 1920x1080 canvas
 *     rotation: degrees,
 *     scale: number (1 = 100%)
 *   }
 *
 * Placement (position/rotation/scale) and final color are policy owned by
 * the Composition Engine (Phase 4) and Color Engine (Phase 5) respectively.
 * Until those exist, GeometryEngine fills in reasonable defaults so the
 * pipeline produces a complete, renderable scene at every phase instead of
 * an empty one — those defaults get overwritten once the later engines are
 * registered, per the EngineRegistry pipeline order.
 */
(function (global) {
  'use strict';

  var MathUtils = global.PME.MathUtils;

  function GeometryEngine() {}

  GeometryEngine.prototype.run = function (scene, params, ctx) {
    var rng = ctx.rng;
    var count = params.count;
    var shapes = [];

    // Tessellation branches by up to `sides` per level, so depth alone can
    // explode exponentially (sides^depth). A hard layer budget — owned
    // conceptually by the Performance Engine, enforced here since geometry
    // is where the explosion originates — keeps this commercial-safe even
    // before Phase 10 exists.
    var budget = (ctx.params.get('performance') || {}).maxLayers || 300;
    var truncated = false;

    for (var i = 0; i < count && shapes.length < budget; i++) {
      var baseShape = this._buildBaseShape(params, rng, i, count);
      var remaining = budget - shapes.length;
      var tessellated = this._tessellate(baseShape, params.tessellationDepth, rng, remaining);
      if (tessellated.length >= remaining && (i < count - 1)) truncated = true;

      for (var t = 0; t < tessellated.length && shapes.length < budget; t++) {
        var s = tessellated[t];
        s.id = 'geo_' + i + '_' + t;
        this._applyPlaceholderPlacement(s, params, rng, i, count, scene.width, scene.height);
        this._applyPlaceholderStyle(s, params, ctx);
        shapes.push(s);
      }
    }

    scene.shapes = scene.shapes.concat(shapes);
    scene.meta.geometry = {
      shapeFamily: params.shapeFamily,
      totalShapes: shapes.length,
      budgetTruncated: truncated
    };
  };

  // -------------------------------------------------------------------
  // Base shape construction per family
  // -------------------------------------------------------------------

  GeometryEngine.prototype._buildBaseShape = function (params, rng, index, total) {
    var points;
    var radius = 100; // normalized local radius; scale is applied at placement time

    switch (params.shapeFamily) {
      case 'organic':
        points = this._organicPolygon(params.sides, radius, rng, params.curveTension);
        break;
      case 'grid':
        points = this._rectPoints(radius * 1.6, radius * 1.6);
        break;
      case 'radial':
        points = this._radialSegment(radius, rng, index, total);
        break;
      case 'voronoi':
        points = this._irregularConvexPolygon(rng.int(4, 9), radius, rng);
        break;
      case 'polygon':
      default:
        points = this._regularPolygon(params.sides, radius);
        break;
    }

    // subdivision = Chaikin corner-cutting; smooths any family's silhouette
    // into an organic curve without changing its underlying topology.
    for (var d = 0; d < params.subdivision; d++) {
      points = this._chaikinSubdivide(points, params.curveTension);
    }

    return {
      name: params.shapeFamily + '_' + index,
      points: points,
      closed: true
    };
  };

  GeometryEngine.prototype._regularPolygon = function (sides, radius) {
    var pts = [];
    for (var i = 0; i < sides; i++) {
      var a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      pts.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
    }
    return pts;
  };

  GeometryEngine.prototype._organicPolygon = function (sides, radius, rng, tension) {
    // Same as regular polygon but each vertex's radius is perturbed, then
    // curveTension controls how much Chaikin smoothing (applied by the
    // caller via subdivision) will round it out.
    var pts = [];
    var jitter = MathUtils.lerp(0.35, 0.08, tension); // low tension = more jitter
    for (var i = 0; i < sides; i++) {
      var a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      var r = radius * (1 + rng.gaussian(0, jitter));
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    return pts;
  };

  GeometryEngine.prototype._rectPoints = function (w, h) {
    return [
      { x: -w / 2, y: -h / 2 },
      { x: w / 2, y: -h / 2 },
      { x: w / 2, y: h / 2 },
      { x: -w / 2, y: h / 2 }
    ];
  };

  GeometryEngine.prototype._radialSegment = function (radius, rng, index, total) {
    // A pie-slice / petal shape: two arc edges joined at a point near
    // origin, well suited to radial composition layouts.
    var spread = MathUtils.degToRad(rng.float(18, 46));
    var innerR = radius * rng.float(0.12, 0.3);
    var outerR = radius * rng.float(0.85, 1.15);
    var steps = 6;
    var pts = [{ x: Math.cos(-spread / 2) * innerR, y: Math.sin(-spread / 2) * innerR }];
    for (var i = 0; i <= steps; i++) {
      var a = MathUtils.lerp(-spread / 2, spread / 2, i / steps);
      pts.push({ x: Math.cos(a) * outerR, y: Math.sin(a) * outerR });
    }
    pts.push({ x: Math.cos(spread / 2) * innerR, y: Math.sin(spread / 2) * innerR });
    return pts;
  };

  GeometryEngine.prototype._irregularConvexPolygon = function (sides, radius, rng) {
    // Sample random angles, sort them, then place points at randomized
    // radii — guarantees a convex, cell-like polygon (Voronoi-cell look)
    // without needing a full Voronoi diagram computation per element.
    var angles = [];
    for (var i = 0; i < sides; i++) angles.push(rng.float(0, Math.PI * 2));
    angles.sort(function (a, b) { return a - b; });
    var pts = [];
    for (var j = 0; j < angles.length; j++) {
      var r = radius * rng.float(0.55, 1.15);
      pts.push({ x: Math.cos(angles[j]) * r, y: Math.sin(angles[j]) * r });
    }
    return pts;
  };

  /** Chaikin corner-cutting subdivision — standard curve-smoothing algorithm. */
  GeometryEngine.prototype._chaikinSubdivide = function (points, tension) {
    var cut = MathUtils.lerp(0.1, 0.25, tension); // higher tension = tighter corners
    var out = [];
    var n = points.length;
    for (var i = 0; i < n; i++) {
      var p0 = points[i];
      var p1 = points[(i + 1) % n];
      out.push({ x: MathUtils.lerp(p0.x, p1.x, cut), y: MathUtils.lerp(p0.y, p1.y, cut) });
      out.push({ x: MathUtils.lerp(p0.x, p1.x, 1 - cut), y: MathUtils.lerp(p0.y, p1.y, 1 - cut) });
    }
    return out;
  };

  // -------------------------------------------------------------------
  // Tessellation: recursively fans a shape into smaller child shapes
  // -------------------------------------------------------------------

  GeometryEngine.prototype._tessellate = function (shape, depth, rng, budget) {
    if (!depth || depth <= 0 || budget <= 1) return [shape];

    var pts = shape.points;
    var n = pts.length;
    var cx = 0, cy = 0;
    for (var i = 0; i < n; i++) { cx += pts[i].x; cy += pts[i].y; }
    cx /= n; cy /= n;

    // Fan-triangulate around the centroid, then randomly recurse into a
    // few fragments so tessellated shapes read as deliberate faceting
    // rather than a uniform triangle-fan mosaic. Recursion stops as soon
    // as the shared budget is exhausted so depth can never blow up runtime.
    var fragments = [];
    for (var j = 0; j < n; j++) {
      var a = pts[j];
      var b = pts[(j + 1) % n];
      fragments.push({
        name: shape.name + '_frag' + j,
        points: [{ x: cx, y: cy }, { x: a.x, y: a.y }, { x: b.x, y: b.y }],
        closed: true
      });
    }

    var result = [];
    for (var k = 0; k < fragments.length; k++) {
      if (result.length >= budget) break;
      var remaining = budget - result.length;
      if (depth > 1 && remaining > n && rng.bool(0.6)) {
        result = result.concat(this._tessellate(fragments[k], depth - 1, rng, remaining));
      } else {
        result.push(fragments[k]);
      }
    }
    return result;
  };

  // -------------------------------------------------------------------
  // Temporary placement/style (superseded by Composition/Color engines)
  // -------------------------------------------------------------------

  GeometryEngine.prototype._applyPlaceholderPlacement = function (shape, params, rng, index, total, width, height) {
    var margin = Math.min(width, height) * 0.1;
    var usableW = width - margin * 2;
    var usableH = height - margin * 2;

    var pos;
    if (params.shapeFamily === 'radial') {
      var ring = MathUtils.pointsOnCircle(total, Math.min(usableW, usableH) * 0.35, width / 2, height / 2, 0);
      pos = ring[index % ring.length];
    } else {
      var spiral = MathUtils.goldenSpiralPoints(total, Math.min(usableW, usableH) * 0.48, width / 2, height / 2);
      pos = spiral[index % spiral.length];
    }

    var scale = MathUtils.lerp(params.scaleMin, params.scaleMax, rng.float(0, 1));

    shape.position = { x: pos.x, y: pos.y };
    shape.rotation = rng.float(0, 360);
    shape.scale = scale;
  };

  GeometryEngine.prototype._applyPlaceholderStyle = function (shape, params, ctx) {
    var colorParams = ctx.params.get('color');
    var hue = colorParams.baseHue + ctx.rng.gaussian(0, 20);
    var hex = MathUtils.hslToHex(hue, colorParams.saturation, colorParams.lightness);

    var mode = params.fillMode;
    shape.fillColorHex = (mode === 'outline') ? null : hex;
    shape.strokeColorHex = (mode === 'outline' || mode === 'mixed') ? colorParams.accentColor : null;
    shape.strokeWidth = (mode === 'outline' || mode === 'mixed') ? params.strokeWeight : 0;
    shape.fillOpacity = 1;
  };

  global.PME = global.PME || {};
  global.PME.GeometryEngine = GeometryEngine;
})(typeof window !== 'undefined' ? window : this);
