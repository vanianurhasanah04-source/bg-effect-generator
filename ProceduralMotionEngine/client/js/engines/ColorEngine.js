/**
 * ColorEngine
 * -----------
 * Responsible for: premium palettes, gradient generation, color harmony,
 * automatic contrast, lighting colors, accent colors.
 *
 * Contract: run(scene, params, ctx) overwrites the placeholder
 * fillColorHex/strokeColorHex that GeometryEngine assigned (documented
 * there as temporary) with a real generated palette, and adds a
 * `shape.fill` descriptor for gradient shapes. Runs after Composition (so
 * it can see which shapes are `isHero`) and before Depth/Motion.
 */
(function (global) {
  'use strict';

  var MathUtils = global.PME.MathUtils;

  function ColorEngine() {}

  // -------------------------------------------------------------------
  // Small color-space helpers local to this engine (contrast math and
  // palette generation are Color Engine's own domain, not generic math).
  // -------------------------------------------------------------------

  function hexToRgb01(hex) {
    hex = hex.replace('#', '');
    return {
      r: parseInt(hex.substring(0, 2), 16) / 255,
      g: parseInt(hex.substring(2, 4), 16) / 255,
      b: parseInt(hex.substring(4, 6), 16) / 255
    };
  }

  function rgb01ToHex(rgb) {
    function toHex(v) {
      var n = Math.round(MathUtils.clamp(v, 0, 1) * 255).toString(16);
      return n.length === 1 ? '0' + n : n;
    }
    return '#' + toHex(rgb.r) + toHex(rgb.g) + toHex(rgb.b);
  }

  function relativeLuminance(hex) {
    var c = hexToRgb01(hex);
    function lin(v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  }

  function contrastRatio(hexA, hexB) {
    var lA = relativeLuminance(hexA), lB = relativeLuminance(hexB);
    var lighter = Math.max(lA, lB), darker = Math.min(lA, lB);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function blend(hexA, hexB, t) {
    var a = hexToRgb01(hexA), b = hexToRgb01(hexB);
    return rgb01ToHex({ r: MathUtils.lerp(a.r, b.r, t), g: MathUtils.lerp(a.g, b.g, t), b: MathUtils.lerp(a.b, b.b, t) });
  }

  /**
   * Nudges `hex` toward white or away from `bgHex` (whichever direction
   * increases contrast) via bisection until `minRatio` is met or the
   * search is exhausted. Bounded iteration count guarantees termination.
   */
  function ensureContrast(hex, bgHex, minRatio) {
    if (contrastRatio(hex, bgHex) >= minRatio) return hex;
    var bgIsDark = relativeLuminance(bgHex) < 0.5;
    var target = bgIsDark ? '#FFFFFF' : '#000000';

    var lo = 0, hi = 1, best = hex;
    for (var i = 0; i < 12; i++) {
      var mid = (lo + hi) / 2;
      var candidate = blend(hex, target, mid);
      if (contrastRatio(candidate, bgHex) >= minRatio) {
        best = candidate;
        hi = mid; // try to find the *minimal* shift that satisfies the ratio
      } else {
        lo = mid;
      }
    }
    return best;
  }

  // -------------------------------------------------------------------
  // Palette generation by harmony mode
  // -------------------------------------------------------------------

  var HARMONY_OFFSETS = {
    'analogous': [-30, -15, 0, 15, 30],
    'complementary': [0, 180, 0, 180, 0],
    'triadic': [0, 120, 240, 0, 120],
    'split-complementary': [0, 150, 210, 0, 150],
    'monochrome': [0, 0, 0, 0, 0]
  };

  ColorEngine.prototype._generatePalette = function (params) {
    var offsets = HARMONY_OFFSETS[params.paletteMode] || HARMONY_OFFSETS.analogous;
    var swatches = [];
    for (var i = 0; i < offsets.length; i++) {
      var hue = params.baseHue + offsets[i];
      // Monochrome harmony varies lightness/saturation instead of hue so
      // swatches are still distinguishable from one another.
      var sat = params.saturation;
      var light = params.lightness;
      if (params.paletteMode === 'monochrome') {
        light = MathUtils.clamp(params.lightness + (i - 2) * 0.12, 0.12, 0.88);
        sat = MathUtils.clamp(params.saturation + (i - 2) * 0.05, 0.1, 1);
      } else {
        // Slight lightness variation keeps even non-monochrome palettes
        // from looking like flat, uniformly-bright swatches.
        light = MathUtils.clamp(params.lightness + (i - 2) * 0.06, 0.15, 0.85);
      }
      swatches.push(MathUtils.hslToHex(hue, sat, light));
    }
    return swatches;
  };

  // -------------------------------------------------------------------
  // Main pass
  // -------------------------------------------------------------------

  ColorEngine.prototype.run = function (scene, params, ctx) {
    var rng = ctx.rng;
    var swatches = this._generatePalette(params);
    var bg = params.backgroundColor;
    var minRatio = MathUtils.lerp(1.15, 4.5, params.contrast);

    // Lighting color: a higher-lightness tint of the base hue, handed off
    // to the Depth Engine (Phase 6) for ambient/rim-light treatment.
    var lightingColor = MathUtils.hslToHex(params.baseHue, params.saturation * 0.6, Math.min(0.92, params.lightness + 0.35));

    var contrastSafeSwatches = swatches.map(function (hex) { return ensureContrast(hex, bg, minRatio); });
    var accent = ensureContrast(params.accentColor, bg, minRatio);

    var geometryParams = ctx.params.get('geometry');
    var fillMode = geometryParams.fillMode;

    for (var i = 0; i < scene.shapes.length; i++) {
      var shape = scene.shapes[i];
      this._colorShape(shape, {
        swatches: contrastSafeSwatches,
        accent: accent,
        bg: bg,
        gradientStyle: params.gradientStyle,
        fillMode: fillMode,
        rng: rng
      });
    }

    scene.palette = {
      mode: params.paletteMode,
      swatches: contrastSafeSwatches,
      accent: accent,
      background: bg,
      lighting: lightingColor
    };
    scene.meta.color = { paletteMode: params.paletteMode, minContrastRatio: minRatio };
  };

  ColorEngine.prototype._colorShape = function (shape, ctx) {
    var swatches = ctx.swatches;
    var pick = swatches[Math.floor(ctx.rng.float(0, swatches.length))];

    // Hero shapes (flagged by Composition Engine) always get the accent
    // color, so visual hierarchy carries through geometry -> composition
    // -> color consistently instead of being scale-only.
    var primary = shape.isHero ? ctx.accent : pick;

    if (ctx.fillMode === 'outline') {
      shape.fillColorHex = null;
      shape.fillOpacity = 0;
      shape.strokeColorHex = shape.isHero ? ctx.accent : pick;
      shape.strokeWidth = shape.strokeWidth || 2;
      shape.fill = null;
      return;
    }

    var wantsGradient = ctx.fillMode === 'gradient' || (ctx.fillMode === 'mixed' && ctx.rng.bool(0.5));

    if (wantsGradient) {
      var secondary = swatches[Math.floor(ctx.rng.float(0, swatches.length))];
      shape.fill = {
        mode: 'gradient',
        style: ctx.gradientStyle,
        stops: [{ offset: 0, hex: primary }, { offset: 1, hex: secondary }]
      };
      // Host-side AE build currently renders gradient shapes as a solid
      // using the first stop (see host/lib/LayerBuilder.jsx comment) —
      // vector gradient-fill scripting in ExtendScript is notoriously
      // undocumented/inconsistent across AE versions and couldn't be
      // verified without a live AE instance, so this degrades safely
      // rather than shipping unverified property-tree code. The live SVG
      // preview renders the full gradient.
      shape.fillColorHex = primary;
    } else {
      shape.fill = { mode: 'solid', style: null, stops: [{ offset: 0, hex: primary }, { offset: 1, hex: primary }] };
      shape.fillColorHex = primary;
    }

    shape.fillOpacity = shape.isHero ? 1 : MathUtils.lerp(0.75, 1, ctx.rng.float(0, 1));

    if (ctx.fillMode === 'mixed') {
      shape.strokeColorHex = shape.isHero ? ctx.accent : null;
      shape.strokeWidth = shape.isHero ? Math.max(shape.strokeWidth || 0, 2) : 0;
    }
  };

  global.PME = global.PME || {};
  global.PME.ColorEngine = ColorEngine;
})(typeof window !== 'undefined' ? window : this);
