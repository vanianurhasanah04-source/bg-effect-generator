/**
 * app.js
 * ------
 * Bootstraps the panel: builds the ParamController from the schema, wires
 * the UI, connects to the ExtendScript host, and hooks up the toolbar
 * actions. Engine implementations register themselves into `window.PME.registry`
 * from their own files as each phase is built; app.js never hardcodes
 * engine-specific logic.
 */
(function () {
  'use strict';

  var PME = window.PME;

  function boot() {
    var params = new PME.ParamController(PME.ParamSchema);
    var registry = new PME.EngineRegistry(params);
    registry.register('geometry', new PME.GeometryEngine());
    registry.register('composition', new PME.CompositionEngine());
    registry.register('color', new PME.ColorEngine());
    registry.register('motion', new PME.MotionEngine());

    var tabsRoot = document.getElementById('engine-tabs');
    var bodyRoot = document.getElementById('panel-body');
    var ui = new PME.UIBuilder(params, tabsRoot, bodyRoot);
    ui.buildAll();

    var statusEl = document.getElementById('preview-status');
    var bridge = null;
    try {
      bridge = new PME.HostBridge();
    } catch (e) {
      statusEl.textContent = 'Host bridge unavailable (running outside AE?)';
    }

    // Expose for later phases / debugging from the CEF devtools console.
    window.PME.instance = { params: params, registry: registry, ui: ui, bridge: bridge };

    document.getElementById('btn-reset').addEventListener('click', function () {
      params.resetAll();
      location.reload(); // simplest correct way to resync every widget in Phase 1
    });

    document.getElementById('btn-undo').addEventListener('click', function () {
      params.undo();
    });

    var previewSvg = document.getElementById('preview-svg');

    document.getElementById('btn-generate').addEventListener('click', function () {
      runGenerationPreview(registry, statusEl, previewSvg, window.PME.instance);
    });

    document.getElementById('btn-regenerate').addEventListener('click', function () {
      params.set('variation', 'seed', Math.floor(Math.random() * 999999));
      runGenerationPreview(registry, statusEl, previewSvg, window.PME.instance);
    });

    document.getElementById('btn-send-to-ae').addEventListener('click', function () {
      sendToAfterEffects(bridge, statusEl, window.PME.instance);
    });

    // Live preview: any control change regenerates automatically. Debounced
    // so dragging a slider doesn't trigger a full regenerate per pixel.
    var liveRegenTimer = null;
    params.subscribe('*', function () {
      if (liveRegenTimer) clearTimeout(liveRegenTimer);
      liveRegenTimer = setTimeout(function () {
        runGenerationPreview(registry, statusEl, previewSvg, window.PME.instance);
      }, 120);
    });

    // Initial preview so the panel isn't blank on first open.
    runGenerationPreview(registry, statusEl, previewSvg, window.PME.instance);

    document.getElementById('btn-presets').addEventListener('click', function () {
      statusEl.textContent = 'Preset Engine not yet implemented (Phase 9).';
    });

    if (bridge) {
      bridge.call('ping').then(function (res) {
        statusEl.textContent = 'Connected to After Effects ' + (res && res.appVersion ? res.appVersion : '');
      }).catch(function () {
        statusEl.textContent = 'Could not reach After Effects host.';
      });
    }
  }

  function runGenerationPreview(registry, statusEl, previewSvg, instance) {
    var implemented = Object.keys(registry._engines || {});
    if (implemented.length === 0) {
      statusEl.textContent = 'No engines implemented yet — Phase 1 (framework) only.';
      return;
    }
    var t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    var scene = registry.generate({ width: 1920, height: 1080 });
    var t1 = (typeof performance !== 'undefined') ? performance.now() : Date.now();

    if (instance && typeof instance.stopAnimation === 'function') {
      instance.stopAnimation();
      instance.stopAnimation = null;
    }
    instance.stopAnimation = window.PME.PreviewRenderer.animateScene(previewSvg, scene);
    if (instance) instance.lastScene = scene;

    statusEl.textContent = scene.shapes.length + ' shapes · seed ' + scene.meta.seed +
      ' · ' + Math.round(t1 - t0) + 'ms';
  }

  function sendToAfterEffects(bridge, statusEl, instance) {
    if (!bridge) {
      statusEl.textContent = 'No connection to After Effects.';
      return;
    }
    if (!instance || !instance.lastScene || !instance.lastScene.shapes.length) {
      statusEl.textContent = 'Nothing to build yet — click Generate first.';
      return;
    }
    statusEl.textContent = 'Building in After Effects…';
    bridge.call('buildGeneratedScene', instance.lastScene).then(function (result) {
      statusEl.textContent = 'Built ' + result.layerCount + ' layers in "' + result.compName + '".';
    }).catch(function (err) {
      statusEl.textContent = 'Error: ' + err.message;
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
