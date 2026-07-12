/**
 * MathUtils
 * ---------
 * Deterministic, seedable math helpers shared by every engine. Using a
 * seeded PRNG (mulberry32) instead of Math.random() is what lets the
 * Variation Engine reproduce, mutate, and score a design deterministically,
 * and lets the Preset Engine save a single integer seed instead of an
 * entire generated scene graph.
 */
(function (global) {
  'use strict';

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function SeededRandom(seed) {
    this.seed = seed >>> 0;
    this._rand = mulberry32(this.seed);
  }

  SeededRandom.prototype.reset = function (seed) {
    if (seed !== undefined) this.seed = seed >>> 0;
    this._rand = mulberry32(this.seed);
  };

  /** Uniform float in [min, max). */
  SeededRandom.prototype.float = function (min, max) {
    if (min === undefined) { min = 0; max = 1; }
    if (max === undefined) { max = min; min = 0; }
    return min + this._rand() * (max - min);
  };

  /** Uniform integer in [min, max] inclusive. */
  SeededRandom.prototype.int = function (min, max) {
    return Math.floor(this.float(min, max + 1));
  };

  SeededRandom.prototype.bool = function (probability) {
    if (probability === undefined) probability = 0.5;
    return this._rand() < probability;
  };

  /** Pick an element with optional per-item weights. */
  SeededRandom.prototype.weightedPick = function (items, weights) {
    if (!weights) return items[this.int(0, items.length - 1)];
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var r = this.float(0, total);
    var acc = 0;
    for (var i = 0; i < items.length; i++) {
      acc += weights[i];
      if (r <= acc) return items[i];
    }
    return items[items.length - 1];
  };

  /** Gaussian sample via Box-Muller, useful for "natural-feeling" variation. */
  SeededRandom.prototype.gaussian = function (mean, stdDev) {
    mean = mean === undefined ? 0 : mean;
    stdDev = stdDev === undefined ? 1 : stdDev;
    var u1 = Math.max(this._rand(), 1e-9);
    var u2 = this._rand();
    var z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * stdDev;
  };

  var MathUtils = {
    SeededRandom: SeededRandom,

    clamp: function (v, min, max) { return Math.max(min, Math.min(max, v)); },

    lerp: function (a, b, t) { return a + (b - a) * t; },

    inverseLerp: function (a, b, v) { return b === a ? 0 : (v - a) / (b - a); },

    remap: function (v, inMin, inMax, outMin, outMax) {
      var t = MathUtils.inverseLerp(inMin, inMax, v);
      return MathUtils.lerp(outMin, outMax, t);
    },

    degToRad: function (d) { return (d * Math.PI) / 180; },
    radToDeg: function (r) { return (r * 180) / Math.PI; },

    // Sine ease in/out, matches AE's "ease" expression family conceptually.
    easeSineInOut: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },

    easeElastic: function (t) {
      var c4 = (2 * Math.PI) / 3;
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },

    easeBounce: function (t) {
      var n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75; }
      if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375; }
      t -= 2.625 / d1; return n1 * t * t + 0.984375;
    },

    // Golden ratio, used by Composition Engine's spiral layout.
    PHI: 1.6180339887498949,

    /** h: 0-360, s/l: 0-1. Returns "#RRGGBB". Used until the full Color
     * Engine (Phase 5) owns palette assignment; kept here since it's a
     * generic color-space conversion, not a Color Engine policy. */
    hslToHex: function (h, s, l) {
      h = ((h % 360) + 360) % 360;
      var c = (1 - Math.abs(2 * l - 1)) * s;
      var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      var m = l - c / 2;
      var r = 0, g = 0, b = 0;
      if (h < 60) { r = c; g = x; b = 0; }
      else if (h < 120) { r = x; g = c; b = 0; }
      else if (h < 180) { r = 0; g = c; b = x; }
      else if (h < 240) { r = 0; g = x; b = c; }
      else if (h < 300) { r = x; g = 0; b = c; }
      else { r = c; g = 0; b = x; }
      var toHex = function (v) {
        var n = Math.round((v + m) * 255);
        var s2 = MathUtils.clamp(n, 0, 255).toString(16);
        return s2.length === 1 ? '0' + s2 : s2;
      };
      return '#' + toHex(r) + toHex(g) + toHex(b);
    },

    /** Points evenly distributed on a circle. */
    pointsOnCircle: function (count, radius, cx, cy, phaseDeg) {
      var pts = [];
      var phase = MathUtils.degToRad(phaseDeg || 0);
      for (var i = 0; i < count; i++) {
        var a = (i / count) * Math.PI * 2 + phase;
        pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius, angle: a });
      }
      return pts;
    },

    /** Fibonacci/golden-angle spiral distribution, good for organic-scatter layouts. */
    goldenSpiralPoints: function (count, maxRadius, cx, cy) {
      var pts = [];
      var goldenAngle = Math.PI * (3 - Math.sqrt(5));
      for (var i = 0; i < count; i++) {
        var r = maxRadius * Math.sqrt(i / count);
        var a = i * goldenAngle;
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, angle: a, radiusFraction: i / count });
      }
      return pts;
    }
  };

  global.PME = global.PME || {};
  global.PME.MathUtils = MathUtils;
})(typeof window !== 'undefined' ? window : this);
