/**
 * EngineRegistry
 * --------------
 * Every engine (Geometry, Motion, Composition, Color, Depth, Loop,
 * Variation, Preset, Performance) registers itself here instead of being
 * called directly by name elsewhere in the codebase. The registry drives
 * the generation pipeline in a fixed, dependency-respecting order and
 * hands each engine only the ParamController + a shared "scene" object
 * that accumulates output as it passes through the pipeline.
 *
 * This is the mechanism that satisfies "each system must be independent /
 * communicate only through a central controller": engines never import
 * each other.
 */
(function (global) {
  'use strict';

  function EngineRegistry(paramController) {
    this.params = paramController;
    this._engines = {};
    this._pipelineOrder = [
      'variation',   // decides seed / mutation strategy first
      'geometry',    // builds base shapes
      'composition', // arranges shapes in frame
      'color',       // assigns palette to shapes
      'depth',       // assigns layer order / parallax / shadows
      'motion',      // attaches animation to arranged shapes
      'loop'         // wraps timing so motion loops seamlessly
    ];
  }

  EngineRegistry.prototype.register = function (name, engineInstance) {
    if (typeof engineInstance.run !== 'function') {
      throw new Error('EngineRegistry: engine "' + name + '" must implement run(scene, params, ctx).');
    }
    this._engines[name] = engineInstance;
    return this;
  };

  EngineRegistry.prototype.get = function (name) {
    return this._engines[name];
  };

  /**
   * Runs the full pipeline once and returns a populated scene graph.
   * `ctx` carries cross-cutting helpers (RNG instance, canvas size, etc.)
   */
  EngineRegistry.prototype.generate = function (ctx) {
    ctx = ctx || {};
    var seed = this.params.get('variation', 'seed');
    var scene = {
      width: ctx.width || 1920,
      height: ctx.height || 1080,
      shapes: [],
      layers: [],
      palette: null,
      timing: null,
      meta: { seed: seed }
    };

    // One shared RNG stream for the entire pipeline: every engine pulls
    // from the same deterministic sequence, so a single seed reproduces
    // the whole scene rather than just one engine's contribution.
    ctx.rng = new global.PME.MathUtils.SeededRandom(seed);
    ctx.params = this.params;

    for (var i = 0; i < this._pipelineOrder.length; i++) {
      var name = this._pipelineOrder[i];
      var engine = this._engines[name];
      if (!engine) continue; // engine not yet implemented in this phase — skip gracefully
      var nsParams = this.params.get(name);
      try {
        engine.run(scene, nsParams, ctx);
      } catch (err) {
        throw new Error('EngineRegistry: engine "' + name + '" failed during generate(): ' + err.message);
      }
    }
    return scene;
  };

  /** Runs a single named engine against an existing scene (used by Variation Engine for re-scoring). */
  EngineRegistry.prototype.runSingle = function (name, scene, ctx) {
    var engine = this._engines[name];
    if (!engine) throw new Error('EngineRegistry: engine "' + name + '" is not registered.');
    engine.run(scene, this.params.get(name), ctx || {});
    return scene;
  };

  global.PME = global.PME || {};
  global.PME.EngineRegistry = EngineRegistry;
})(typeof window !== 'undefined' ? window : this);
