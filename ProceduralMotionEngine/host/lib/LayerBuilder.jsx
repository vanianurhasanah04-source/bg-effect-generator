// LayerBuilder.jsx
// Reusable ExtendScript utilities for constructing AE shape layers from
// the scene graph produced client-side by the Geometry/Composition/Color
// engines. Kept separate from main.jsx so it can be reused by every
// engine's host handler instead of duplicating shape-layer boilerplate.

/**
 * Creates a single shape layer containing one path, sized/positioned per
 * the given scene "shape" descriptor: { points:[{x,y}...], fillColorHex,
 * strokeColorHex, strokeWidth, closed }
 *
 * NOTE on gradients: shape.fill.mode may be 'gradient' (set by the Color
 * Engine), but this builder always renders a SOLID fill using
 * shape.fillColorHex (the gradient's first stop). Scripting AE's native
 * vector gradient-fill property tree ("ADBE Vector Graphic - G-Fill")
 * requires an undocumented/version-inconsistent "Gradient Color Data"
 * value format that could not be verified without a live After Effects
 * instance, so it is intentionally not attempted here rather than
 * shipping unverified property-tree code that could throw at build time.
 * The in-panel SVG preview (PreviewRenderer.js) does render the full
 * gradient. Revisit this once real-AE verification is possible.
 */
function PME_buildShapeLayer(comp, shapeDescriptor, tagName) {
  var shapeLayer = comp.layers.addShape();
  shapeLayer.name = shapeDescriptor.name || 'PME Shape';
  shapeLayer.comment = tagName || 'PME_GENERATED';

  var contents = shapeLayer.property('ADBE Root Vectors Group');

  var group = contents.addProperty('ADBE Vector Group');
  group.name = 'Path Group';
  var groupContents = group.property('ADBE Vectors Group');

  var pathProp = groupContents.addProperty('ADBE Vector Shape - Group');
  var shapeVal = new Shape();
  shapeVal.vertices = PME_pointsToVertices(shapeDescriptor.points);
  shapeVal.closed = shapeDescriptor.closed !== false;
  pathProp.property('ADBE Vector Shape').setValue(shapeVal);

  if (shapeDescriptor.fillColorHex) {
    var fill = groupContents.addProperty('ADBE Vector Graphic - Fill');
    fill.property('ADBE Vector Fill Color').setValue(PME_hexToRgb1(shapeDescriptor.fillColorHex));
    if (typeof shapeDescriptor.fillOpacity === 'number') {
      fill.property('ADBE Vector Fill Opacity').setValue(shapeDescriptor.fillOpacity * 100);
    }
  }

  if (shapeDescriptor.strokeColorHex && shapeDescriptor.strokeWidth > 0) {
    var stroke = groupContents.addProperty('ADBE Vector Graphic - Stroke');
    stroke.property('ADBE Vector Stroke Color').setValue(PME_hexToRgb1(shapeDescriptor.strokeColorHex));
    stroke.property('ADBE Vector Stroke Width').setValue(shapeDescriptor.strokeWidth);
  }

  if (shapeDescriptor.position) {
    shapeLayer.property('ADBE Transform Group').property('ADBE Position').setValue(
      [shapeDescriptor.position.x, shapeDescriptor.position.y]
    );
  }
  if (typeof shapeDescriptor.rotation === 'number') {
    shapeLayer.property('ADBE Transform Group').property('ADBE Rotate Z').setValue(shapeDescriptor.rotation);
  }
  if (typeof shapeDescriptor.scale === 'number') {
    var s = shapeDescriptor.scale * 100;
    shapeLayer.property('ADBE Transform Group').property('ADBE Scale').setValue([s, s]);
  }

  return shapeLayer;
}

function PME_pointsToVertices(points) {
  var verts = [];
  for (var i = 0; i < points.length; i++) {
    verts.push([points[i].x, points[i].y]);
  }
  return verts;
}
