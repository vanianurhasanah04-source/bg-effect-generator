/**
 * MotionMath
 * ----------
 * Pure, stateless formulas for each motionType. Given a shape's `motion`
 * descriptor and a time in seconds, returns the transform offset to apply
 * on top of the shape's base position/rotation/scale.
 *
 * This is the single source of truth for "what does harmonic/wave/orbital/
 * elastic/drift motion actually look like" — PreviewRenderer's animation
 * loop calls this directly every frame, and MotionExpressions.jsx (host
 * side) implements the same formulas in AE's expression language so the
 * in-panel preview and the rendered AE output match.
 */
(function (global) {
  'use strict';

  var MathUtils = global.PME.MathUtils;

  function ease(t01, easing) {
    switch (easing) {
      case 'elastic': return MathUtils.easeElastic(t01);
      case 'bounce': return MathUtils.easeBounce(t01);
      case 'sineInOut': return MathUtils.easeSineInOut(t01);
      case 'linear':
      default: return t01;
    }
  }

  var MotionMath = {
    /**
     * @param {object} motion - shape.motion descriptor
     * @param {number} t - time in seconds
     * @returns {{dx:number, dy:number, dRotation:number, morphScale:number}}
     */
    evaluate: function (motion, t) {
      var w = motion.frequency * motion.speed * Math.PI * 2; // angular speed
      var theta = w * t + motion.phase;
      var dx = 0, dy = 0;

      switch (motion.type) {
        case 'harmonic':
          // Simple vertical bob with an easing curve reshaping the cycle
          // instead of a pure sine, so 'elastic'/'bounce' easing is visible.
          dy = motion.amplitude * MotionMath._easedOscillate(theta, motion.easing);
          break;

        case 'wave':
          // Horizontal + vertical combined at 90-degree offset so it reads
          // as a traveling wave rather than a straight bob.
          dx = motion.amplitude * 0.5 * Math.sin(theta);
          dy = motion.amplitude * Math.sin(theta + Math.PI / 2);
          break;

        case 'orbital':
          dx = motion.orbitRadius * Math.cos(theta * motion.orbitDirection);
          dy = motion.orbitRadius * Math.sin(theta * motion.orbitDirection);
          break;

        case 'elastic':
          // Periodic elastic "snap": ease value re-triggers every cycle.
          var cyclePos = (theta / (Math.PI * 2)) % 1;
          if (cyclePos < 0) cyclePos += 1;
          dy = motion.amplitude * (MathUtils.easeElastic(cyclePos) - 0.5) * 2;
          break;

        case 'drift':
        default:
          // Slow Lissajous-style wander: two incommensurate frequencies
          // so the path doesn't repeat on an obvious short cycle.
          dx = motion.amplitude * 0.6 * Math.sin(theta * 0.7);
          dy = motion.amplitude * 0.6 * Math.sin(theta * 1.3 + 1.1);
          break;
      }

      var dRotation = motion.rotationSpeed * t;

      // Morph: subtle pulsing scale multiplier applied to the shape's own
      // vertices (not its position) — see PreviewRenderer for vertex use.
      var morphScale = 1 + Math.sin(theta * 1.5) * motion.morphAmount * 0.15;

      return { dx: dx, dy: dy, dRotation: dRotation, morphScale: morphScale };
    },

    _easedOscillate: function (theta, easing) {
      var cyclePos = (theta / (Math.PI * 2)) % 1;
      if (cyclePos < 0) cyclePos += 1;
      // Fold into a 0->1->0 triangle then ease it, then re-sign so motion
      // still oscillates rather than only ever moving one direction.
      var tri = cyclePos < 0.5 ? cyclePos * 2 : (1 - cyclePos) * 2;
      var eased = ease(tri, easing);
      var sign = Math.sin(theta) >= 0 ? 1 : -1;
      return eased * sign;
    }
  };

  global.PME = global.PME || {};
  global.PME.MotionMath = MotionMath;
})(typeof window !== 'undefined' ? window : this);
