/**
 * ParamSchema
 * -----------
 * Declarative definition of every parameter in the system, grouped by
 * engine namespace. The UI builder, ParamController, and Preset Engine all
 * read this single file, so adding a new control never requires touching
 * more than one place.
 */
(function (global) {
  'use strict';

  var ParamSchema = {

    geometry: {
      shapeFamily:      { type: 'enum', options: ['polygon', 'organic', 'grid', 'radial', 'voronoi'], default: 'polygon', label: 'Shape Family' },
      sides:             { type: 'integer', min: 3, max: 24, default: 6, label: 'Polygon Sides' },
      count:             { type: 'integer', min: 1, max: 400, default: 48, label: 'Element Count' },
      scaleMin:          { type: 'number', min: 0.05, max: 5, step: 0.01, default: 0.2, label: 'Min Scale' },
      scaleMax:          { type: 'number', min: 0.05, max: 5, step: 0.01, default: 1.0, label: 'Max Scale' },
      tessellationDepth: { type: 'integer', min: 0, max: 6, default: 2, label: 'Tessellation Depth' },
      subdivision:       { type: 'integer', min: 0, max: 5, default: 1, label: 'Subdivision Level' },
      curveTension:      { type: 'number', min: 0, max: 1, step: 0.01, default: 0.5, label: 'Curve Tension' },
      strokeWeight:      { type: 'number', min: 0, max: 20, step: 0.5, default: 2, label: 'Stroke Weight' },
      fillMode:          { type: 'enum', options: ['solid', 'gradient', 'outline', 'mixed'], default: 'mixed', label: 'Fill Mode' }
    },

    motion: {
      motionType:        { type: 'enum', options: ['harmonic', 'wave', 'orbital', 'elastic', 'drift'], default: 'harmonic', label: 'Motion Type' },
      speed:             { type: 'number', min: 0.05, max: 5, step: 0.05, default: 1, label: 'Speed' },
      amplitude:         { type: 'number', min: 0, max: 500, step: 1, default: 80, label: 'Amplitude' },
      frequency:         { type: 'number', min: 0.01, max: 10, step: 0.01, default: 1, label: 'Frequency' },
      phaseOffset:       { type: 'number', min: 0, max: 360, step: 1, default: 0, label: 'Phase Offset (deg)' },
      phaseSync:         { type: 'enum', options: ['none', 'sequential', 'mirrored', 'radial'], default: 'sequential', label: 'Phase Sync' },
      rotationSpeed:     { type: 'number', min: -180, max: 180, step: 1, default: 10, label: 'Rotation Speed (deg/s)' },
      easing:            { type: 'enum', options: ['linear', 'sineInOut', 'elastic', 'bounce'], default: 'sineInOut', label: 'Easing' },
      morphAmount:       { type: 'number', min: 0, max: 1, step: 0.01, default: 0.3, label: 'Morph Amount' }
    },

    composition: {
      layout:            { type: 'enum', options: ['grid', 'radial', 'organic-scatter', 'rule-of-thirds', 'golden-spiral'], default: 'rule-of-thirds', label: 'Layout Type' },
      density:           { type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.5, label: 'Density' },
      symmetry:          { type: 'enum', options: ['none', 'horizontal', 'vertical', 'radial', 'full'], default: 'none', label: 'Symmetry' },
      asymmetryBias:     { type: 'number', min: 0, max: 1, step: 0.01, default: 0.25, label: 'Controlled Asymmetry' },
      negativeSpace:     { type: 'number', min: 0, max: 1, step: 0.01, default: 0.35, label: 'Negative Space' },
      focalStrength:      { type: 'number', min: 0, max: 1, step: 0.01, default: 0.6, label: 'Focal Point Strength' },
      marginSafeZone:    { type: 'number', min: 0, max: 0.3, step: 0.01, default: 0.08, label: 'Safe Margin' }
    },

    color: {
      paletteMode:       { type: 'enum', options: ['analogous', 'complementary', 'triadic', 'monochrome', 'split-complementary'], default: 'analogous', label: 'Palette Harmony' },
      baseHue:           { type: 'integer', min: 0, max: 360, default: 220, label: 'Base Hue' },
      saturation:        { type: 'number', min: 0, max: 1, step: 0.01, default: 0.55, label: 'Saturation' },
      lightness:         { type: 'number', min: 0, max: 1, step: 0.01, default: 0.5, label: 'Lightness' },
      contrast:          { type: 'number', min: 0, max: 1, step: 0.01, default: 0.6, label: 'Auto Contrast' },
      accentColor:       { type: 'color', default: '#FF6B4A', label: 'Accent Color' },
      backgroundColor:   { type: 'color', default: '#0B0E14', label: 'Background Color' },
      gradientStyle:     { type: 'enum', options: ['linear', 'radial', 'angular', 'diamond'], default: 'radial', label: 'Gradient Style' }
    },

    depth: {
      parallaxStrength:  { type: 'number', min: 0, max: 1, step: 0.01, default: 0.4, label: 'Parallax Strength' },
      layerCount:        { type: 'integer', min: 1, max: 12, default: 5, label: 'Depth Layers' },
      shadowSoftness:    { type: 'number', min: 0, max: 1, step: 0.01, default: 0.5, label: 'Shadow Softness' },
      reflectionOpacity: { type: 'number', min: 0, max: 1, step: 0.01, default: 0.15, label: 'Reflection Opacity' },
      fogDensity:        { type: 'number', min: 0, max: 1, step: 0.01, default: 0.2, label: 'Depth Fade Density' },
      ambientIntensity:  { type: 'number', min: 0, max: 1, step: 0.01, default: 0.5, label: 'Ambient Light Intensity' }
    },

    loop: {
      duration:          { type: 'number', min: 1, max: 60, step: 0.5, default: 8, label: 'Loop Duration (s)' },
      frameRate:         { type: 'enum', options: [24, 25, 30, 50, 60], default: 30, label: 'Frame Rate' },
      loopSafety:        { type: 'enum', options: ['strict', 'balanced', 'off'], default: 'strict', label: 'Loop Safety' },
      wrapBlendFrames:   { type: 'integer', min: 0, max: 30, default: 6, label: 'Wrap Blend Frames' }
    },

    variation: {
      seed:              { type: 'integer', min: 0, max: 999999, default: 1337, label: 'Seed' },
      randomnessWeight:  { type: 'number', min: 0, max: 1, step: 0.01, default: 0.5, label: 'Randomness Weight' },
      qualityThreshold:  { type: 'number', min: 0, max: 1, step: 0.01, default: 0.72, label: 'Quality Threshold' },
      maxRegenerations:  { type: 'integer', min: 0, max: 20, default: 6, label: 'Max Auto-Regenerations' }
    },

    performance: {
      optimizationLevel: { type: 'enum', options: ['draft', 'balanced', 'render'], default: 'balanced', label: 'Optimization Level' },
      maxLayers:         { type: 'integer', min: 10, max: 2000, default: 300, label: 'Max Layer Budget' },
      cacheEnabled:      { type: 'boolean', default: true, label: 'Enable Caching' },
      expressionsBaked:  { type: 'boolean', default: false, label: 'Bake Expressions on Render' }
    }
  };

  global.PME = global.PME || {};
  global.PME.ParamSchema = ParamSchema;
})(typeof window !== 'undefined' ? window : this);
