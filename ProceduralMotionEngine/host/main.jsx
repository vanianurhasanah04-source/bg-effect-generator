// main.jsx
// ExtendScript host entry point for Procedural Motion Engine.
// Runs inside After Effects' ExtendScript engine (not a browser JS engine),
// so this file intentionally avoids ES6+ syntax.

//@include "lib/json2.jsx"
//@include "lib/LayerBuilder.jsx"
//@include "lib/CompUtils.jsx"
//@include "lib/MotionExpressions.jsx"

var PME_HANDLERS = {};

/**
 * Registers a handler the panel can invoke via PME_dispatch.
 * Keeping this as a lookup table (instead of a giant switch) is what keeps
 * this file from becoming unmanageable as more engines start needing host
 * access in later phases.
 */
function PME_registerHandler(name, fn) {
  PME_HANDLERS[name] = fn;
}

/**
 * Single entry point called from the CEP panel via evalScript.
 * @param {string} fnName - registered handler name
 * @param {string} argJson - JSON-encoded argument payload
 * @returns {string} JSON-encoded result or { __pmeError: string }
 */
function PME_dispatch(fnName, argJson) {
  try {
    var args = argJson ? JSON.parse(argJson) : null;
    var handler = PME_HANDLERS[fnName];
    if (!handler) {
      return JSON.stringify({ __pmeError: 'No handler registered for "' + fnName + '".' });
    }
    var result = handler(args);
    return JSON.stringify(result === undefined ? null : result);
  } catch (err) {
    return JSON.stringify({ __pmeError: (err && err.toString) ? err.toString() : String(err) });
  }
}

// ---------------------------------------------------------------------
// Core handlers available from Phase 1. Engine-specific handlers (shape
// building, expression injection, etc.) register themselves in their own
// lib files as those phases are implemented.
// ---------------------------------------------------------------------

PME_registerHandler('ping', function () {
  return { ok: true, appVersion: app.version, buildName: app.buildName };
});

PME_registerHandler('getActiveCompInfo', function () {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    return { hasActiveComp: false };
  }
  return {
    hasActiveComp: true,
    name: comp.name,
    width: comp.width,
    height: comp.height,
    duration: comp.duration,
    frameRate: comp.frameRate,
    id: comp.id
  };
});

PME_registerHandler('createComp', function (args) {
  args = args || {};
  var name = args.name || 'Procedural Motion Engine';
  var width = args.width || 1920;
  var height = args.height || 1080;
  var duration = args.duration || 8;
  var frameRate = args.frameRate || 30;

  app.beginUndoGroup('PME: Create Composition');
  var comp;
  try {
    comp = app.project.items.addComp(name, width, height, 1, duration, frameRate);
    comp.openInViewer();
  } finally {
    app.endUndoGroup();
  }
  return { id: comp.id, name: comp.name };
});

var PME_GENERATED_TAG = 'PME_GENERATED';

/**
 * Builds real AE shape layers from a client-generated scene graph.
 * Reuses the active comp if one is open and sized reasonably close to the
 * scene, otherwise creates a fresh comp sized to the scene. Clears any
 * previously generated layers first so clicking "Build in After Effects"
 * repeatedly (after Regenerate) is idempotent rather than stacking layers.
 */
PME_registerHandler('buildGeneratedScene', function (scene) {
  if (!scene || !scene.shapes || !scene.shapes.length) {
    throw new Error('buildGeneratedScene: scene has no shapes.');
  }

  app.beginUndoGroup('PME: Build Generated Scene');
  var comp;
  try {
    var active = app.project.activeItem;
    if (active instanceof CompItem) {
      comp = active;
    } else {
      comp = app.project.items.addComp(
        'Procedural Motion Engine',
        scene.width || 1920,
        scene.height || 1080,
        1,
        8,
        30
      );
      if (scene.palette && scene.palette.background) {
        comp.bgColor = PME_hexToRgb1(scene.palette.background);
      }
      comp.openInViewer();
    }

    PME_clearGeneratedLayers(comp, PME_GENERATED_TAG);

    var built = 0;
    for (var i = 0; i < scene.shapes.length; i++) {
      var shapeDescriptor = scene.shapes[i];
      var layer = PME_buildShapeLayer(comp, shapeDescriptor, PME_GENERATED_TAG);
      PME_applyMotionExpressions(layer, shapeDescriptor.motion);
      built++;
    }
  } finally {
    app.endUndoGroup();
  }

  return { compName: comp.name, layerCount: built };
});
