/**
 * PreviewRenderer
 * ---------------
 * Draws a scene graph (produced by EngineRegistry.generate) into the
 * panel's SVG preview element. Deliberately dumb/stateless: it doesn't
 * know anything about engines, it just draws whatever shape descriptors
 * it's given. This keeps the preview reusable as more engines add fields
 * (depth ordering, motion, etc.) to the same shape descriptors later.
 */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function ensureDefs(svgEl) {
    var defs = svgEl.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS(SVG_NS, 'defs');
      svgEl.insertBefore(defs, svgEl.firstChild);
    } else {
      while (defs.firstChild) defs.removeChild(defs.firstChild);
    }
    return defs;
  }

  /**
   * Builds (or reuses) an SVG gradient def for a shape's fill descriptor.
   * SVG has no native "angular"/"diamond" gradient type, so — matching the
   * same approximation used by the AE host output for consistency —
   * angular falls back to a rotated linear gradient and diamond falls
   * back to radial.
   */
  function buildGradientDef(defs, shape) {
    var id = 'grad_' + shape.id;
    var style = shape.fill.style;
    var stops = shape.fill.stops;
    var node;

    if (style === 'radial' || style === 'diamond') {
      node = document.createElementNS(SVG_NS, 'radialGradient');
      node.setAttribute('cx', '50%');
      node.setAttribute('cy', '50%');
      node.setAttribute('r', '65%');
    } else {
      node = document.createElementNS(SVG_NS, 'linearGradient');
      var angle = style === 'angular' ? 45 : 0;
      node.setAttribute('gradientTransform', 'rotate(' + angle + ' 0.5 0.5)');
      node.setAttribute('x1', '0%'); node.setAttribute('y1', '0%');
      node.setAttribute('x2', '100%'); node.setAttribute('y2', '0%');
    }
    node.setAttribute('id', id);

    for (var i = 0; i < stops.length; i++) {
      var stop = document.createElementNS(SVG_NS, 'stop');
      stop.setAttribute('offset', (stops[i].offset * 100) + '%');
      stop.setAttribute('stop-color', stops[i].hex);
      node.appendChild(stop);
    }
    defs.appendChild(node);
    return 'url(#' + id + ')';
  }

  function renderSceneToSVG(svgEl, scene, timeSeconds) {
    var t = timeSeconds || 0;
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + scene.width + ' ' + scene.height);

    var defs = ensureDefs(svgEl);

    var bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', 0);
    bg.setAttribute('y', 0);
    bg.setAttribute('width', scene.width);
    bg.setAttribute('height', scene.height);
    bg.setAttribute('fill', (scene.palette && scene.palette.background) || '#0b0e14');
    svgEl.appendChild(bg);

    var MotionMath = global.PME.MotionMath;

    for (var i = 0; i < scene.shapes.length; i++) {
      var shape = scene.shapes[i];
      var offset = { dx: 0, dy: 0, dRotation: 0, morphScale: 1 };
      if (shape.motion && MotionMath) {
        offset = MotionMath.evaluate(shape.motion, t);
      }

      var poly = document.createElementNS(SVG_NS, 'polygon');
      var scale = (shape.scale || 1) * offset.morphScale;
      var rot = (((shape.rotation || 0) + offset.dRotation) * Math.PI) / 180;
      var cos = Math.cos(rot), sin = Math.sin(rot);
      var posX = shape.position.x + offset.dx;
      var posY = shape.position.y + offset.dy;

      var pointsAttr = shape.points.map(function (p) {
        var x = p.x * scale;
        var y = p.y * scale;
        var rx = x * cos - y * sin;
        var ry = x * sin + y * cos;
        return (posX + rx) + ',' + (posY + ry);
      }).join(' ');

      poly.setAttribute('points', pointsAttr);

      var fillPaint = 'none';
      if (shape.fill && shape.fill.mode === 'gradient') {
        fillPaint = buildGradientDef(defs, shape);
      } else if (shape.fillColorHex) {
        fillPaint = shape.fillColorHex;
      }
      poly.setAttribute('fill', fillPaint);
      poly.setAttribute('fill-opacity', shape.fillOpacity !== undefined ? shape.fillOpacity : 1);
      if (shape.strokeColorHex && shape.strokeWidth > 0) {
        poly.setAttribute('stroke', shape.strokeColorHex);
        poly.setAttribute('stroke-width', shape.strokeWidth);
      }
      svgEl.appendChild(poly);
    }
  }

  /**
   * Starts a requestAnimationFrame loop rendering `scene` into `svgEl`.
   * Returns a stop() function. Callers MUST call the previous scene's
   * stop() before starting a new one, or multiple loops will stack up
   * and fight over the same SVG element.
   */
  function animateScene(svgEl, scene) {
    var startTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    var rafId = null;
    var stopped = false;

    function frame() {
      if (stopped) return;
      var now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      var t = (now - startTime) / 1000;
      renderSceneToSVG(svgEl, scene, t);
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    return function stop() {
      stopped = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }

  global.PME = global.PME || {};
  global.PME.PreviewRenderer = { renderSceneToSVG: renderSceneToSVG, animateScene: animateScene };
})(typeof window !== 'undefined' ? window : this);
