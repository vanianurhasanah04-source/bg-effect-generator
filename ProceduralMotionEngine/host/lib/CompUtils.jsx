// CompUtils.jsx
// Shared ExtendScript helpers for locating/validating the active composition.
// ES3-compatible (ExtendScript does not support modern JS syntax).

function PME_getActiveCompOrThrow() {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    throw new Error('No active composition. Select or create a composition first.');
  }
  return comp;
}

function PME_clearGeneratedLayers(comp, tagName) {
  tagName = tagName || 'PME_GENERATED';
  for (var i = comp.numLayers; i >= 1; i--) {
    var layer = comp.layer(i);
    if (layer.comment === tagName) {
      layer.remove();
    }
  }
}

function PME_hexToRgb1(hex) {
  hex = hex.replace('#', '');
  var r = parseInt(hex.substring(0, 2), 16) / 255;
  var g = parseInt(hex.substring(2, 4), 16) / 255;
  var b = parseInt(hex.substring(4, 6), 16) / 255;
  return [r, g, b];
}
