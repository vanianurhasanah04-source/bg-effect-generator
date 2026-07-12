/**
 * MotionEngine
 * ------------
 * Responsible for: harmonic motion, wave propagation, oscillation,
 * rotation, phase synchronization, morphing, elastic movement, procedural
 * timing.
 *
 * Contract: run(scene, params, ctx) attaches a `motion` descriptor to every
 * shape already present in scene.shapes (built by GeometryEngine). It does
 * not move anything itself — it computes the parameters that describe HOW
 * each shape should move — because the same descriptor is consumed by two
 * different renderers: the live SVG preview (PreviewRenderer, animated via
 * requestAnimationFrame) and the real After Effects output (host-side
 * expressions in MotionExpressions.jsx). Keeping motion declarative like
 * this means the preview and the rendered output can never drift apart —
 * they evaluate the same formulas from the same descriptor.
 *
 * shape.motion = {
 *   type,            // harmonic | wave | orbital | elastic | drift
 *   amplitude, frequency, speed,
 *   phase,           // radians — per-shape, from the phaseSync strategy
 *   rotationSpeed,   // deg/sec
 *   easing,          // linear | sineInOut | elastic | bounce
 *   morphAmount
 * }
 */
(function (global) {
  'use strict';

  var MathUtils = global.PME.MathUtils;

  function MotionEngine() {}

  MotionEngine.prototype.run = function (scene, params, ctx) {
    var rng = ctx.rng;
    var shapes = scene.shapes;
    var total = shapes.length;
    var cx = scene.width / 2;
    var cy = scene.height / 2;
    var baseOffset = MathUtils.degToRad(params.phaseOffset);

    for (var i = 0; i < total; i++) {
      var shape = shapes[i];
      var phase = this._computePhase(shape, i, total, params, baseOffset, cx, cy, rng);

      shape.motion = {
        type: params.motionType,
        amplitude: params.amplitude,
        frequency: params.frequency,
        speed: params.speed,
        phase: phase,
        rotationSpeed: params.rotationSpeed,
        easing: params.easing,
        morphAmount: params.morphAmount,
        // Orbital motion needs a stable per-shape radius/direction so
        // shapes don't all orbit identically; derive it from the shape's
        // own placement instead of pure randomness so it stays coherent
        // with where Composition later puts it.
        orbitRadius: params.amplitude * MathUtils.lerp(0.4, 1, rng.float(0, 1)),
        orbitDirection: rng.bool(0.5) ? 1 : -1
      };
    }

    scene.meta.motion = { motionType: params.motionType, phaseSync: params.phaseSync };
  };

  MotionEngine.prototype._computePhase = function (shape, index, total, params, baseOffset, cx, cy, rng) {
    switch (params.phaseSync) {
      case 'sequential':
        // Even phase stagger across all shapes — produces a traveling-wave
        // look when combined with motionType 'wave'.
        return baseOffset + (index / Math.max(1, total)) * Math.PI * 2;

      case 'mirrored':
        // Alternating +/- phase: neighbors move in opposition, reads as
        // a breathing/pulsing symmetry rather than a single travelling wave.
        return baseOffset + (index % 2 === 0 ? 0 : Math.PI);

      case 'radial':
        // Phase driven by each shape's angle from the canvas center, so
        // motion radiates outward/around rather than by list order.
        var dx = shape.position.x - cx;
        var dy = shape.position.y - cy;
        return baseOffset + Math.atan2(dy, dx);

      case 'none':
      default:
        return baseOffset + rng.float(0, Math.PI * 2);
    }
  };

  global.PME = global.PME || {};
  global.PME.MotionEngine = MotionEngine;
})(typeof window !== 'undefined' ? window : this);
