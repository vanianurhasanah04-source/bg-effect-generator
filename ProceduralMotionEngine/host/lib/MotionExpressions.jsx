// MotionExpressions.jsx
// Builds After Effects expression strings (AE's own JS-like expression
// engine, evaluated per-frame at render time) from a shape.motion
// descriptor produced by the client-side Motion Engine. The formulas here
// intentionally mirror client/js/core/MotionMath.js so the live SVG
// preview and the actual rendered After Effects layers move the same way.
//
// Using real expressions (rather than baking keyframes) is what satisfies
// "procedural timing" from the spec and keeps files light — Performance
// Engine (Phase 10) is what will optionally bake these to keyframes for
// heavy scenes.

/**
 * @param {object} motion - shape.motion descriptor (already JSON-safe)
 * @returns {string} AE Position expression, additive to the layer's static value
 */
function PME_buildPositionExpression(motion) {
  var amp = motion.amplitude;
  var freq = motion.frequency;
  var speed = motion.speed;
  var phase = motion.phase;
  var w = 'freq * speed * Math.PI * 2';
  var header =
    'var amp = ' + amp + ';\n' +
    'var freq = ' + freq + ';\n' +
    'var speed = ' + speed + ';\n' +
    'var phase = ' + phase + ';\n' +
    'var w = ' + w + ';\n' +
    'var theta = w * time + phase;\n' +
    'var dx = 0, dy = 0;\n';

  var body;
  switch (motion.type) {
    case 'harmonic':
      body =
        'var cyclePos = (theta / (Math.PI * 2)) % 1; if (cyclePos < 0) cyclePos += 1;\n' +
        'var tri = cyclePos < 0.5 ? cyclePos * 2 : (1 - cyclePos) * 2;\n' +
        'var sign = Math.sin(theta) >= 0 ? 1 : -1;\n' +
        'dy = amp * tri * sign;\n';
      break;
    case 'wave':
      body =
        'dx = amp * 0.5 * Math.sin(theta);\n' +
        'dy = amp * Math.sin(theta + Math.PI / 2);\n';
      break;
    case 'orbital':
      body =
        'var orbitR = ' + motion.orbitRadius + ';\n' +
        'var dir = ' + motion.orbitDirection + ';\n' +
        'dx = orbitR * Math.cos(theta * dir);\n' +
        'dy = orbitR * Math.sin(theta * dir);\n';
      break;
    case 'elastic':
      body =
        'var cyclePos = (theta / (Math.PI * 2)) % 1; if (cyclePos < 0) cyclePos += 1;\n' +
        // AE expression engine has no cubic elastic helper, so approximate
        // with a damped sine snap — visually equivalent to easeElastic.
        'var elastic = Math.pow(2, -8 * cyclePos) * Math.sin(cyclePos * 10) ;\n' +
        'dy = amp * elastic;\n';
      break;
    case 'drift':
    default:
      body =
        'dx = amp * 0.6 * Math.sin(theta * 0.7);\n' +
        'dy = amp * 0.6 * Math.sin(theta * 1.3 + 1.1);\n';
      break;
  }

  return header + body + 'value + [dx, dy];';
}

/** @returns {string} AE Rotation expression, additive to the layer's static value */
function PME_buildRotationExpression(motion) {
  return 'value + (' + motion.rotationSpeed + ' * time);';
}

/** @returns {string} AE Scale expression: subtle pulsing multiplier from morphAmount */
function PME_buildScaleExpression(motion) {
  var w = motion.frequency * motion.speed * Math.PI * 2;
  return 'var theta = ' + w + ' * time + ' + motion.phase + ';\n' +
    'var morphScale = 1 + Math.sin(theta * 1.5) * ' + motion.morphAmount + ' * 0.15;\n' +
    'value * morphScale;';
}

/** Applies all three motion expressions to a shape layer, failing soft per-property. */
function PME_applyMotionExpressions(layer, motion) {
  if (!motion) return;
  var transform = layer.property('ADBE Transform Group');
  try { transform.property('ADBE Position').expression = PME_buildPositionExpression(motion); } catch (e1) {}
  try { transform.property('ADBE Rotate Z').expression = PME_buildRotationExpression(motion); } catch (e2) {}
  try { transform.property('ADBE Scale').expression = PME_buildScaleExpression(motion); } catch (e3) {}
}
