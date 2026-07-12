/**
 * UIBuilder
 * ---------
 * Reads ParamSchema and renders one tab + control group per engine
 * namespace, with each field's widget type inferred from its schema
 * `type`. Adding a parameter to ParamSchema is enough to make it appear
 * in the UI correctly — nothing here needs to change per-parameter.
 */
(function (global) {
  'use strict';

  var ADVANCED_KEYS = {
    geometry: ['tessellationDepth', 'subdivision', 'curveTension'],
    motion: ['phaseOffset', 'phaseSync', 'easing', 'morphAmount'],
    composition: ['asymmetryBias', 'marginSafeZone', 'focalStrength'],
    color: ['contrast', 'gradientStyle'],
    depth: ['reflectionOpacity', 'fogDensity', 'ambientIntensity'],
    loop: ['wrapBlendFrames'],
    variation: ['maxRegenerations'],
    performance: ['maxLayers', 'expressionsBaked']
  };

  var ENGINE_LABELS = {
    geometry: 'Geometry',
    motion: 'Motion',
    composition: 'Composition',
    color: 'Color',
    depth: 'Depth',
    loop: 'Loop',
    variation: 'Variation',
    performance: 'Performance'
  };

  function el(tag, className, attrs) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (attrs) {
      for (var k in attrs) {
        if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
      }
    }
    return e;
  }

  function UIBuilder(paramController, tabsRoot, bodyRoot) {
    this.params = paramController;
    this.tabsRoot = tabsRoot;
    this.bodyRoot = bodyRoot;
    this.schema = global.PME.ParamSchema;
  }

  UIBuilder.prototype.buildAll = function () {
    var namespaces = Object.keys(this.schema).filter(function (ns) {
      return ENGINE_LABELS.hasOwnProperty(ns);
    });
    for (var i = 0; i < namespaces.length; i++) {
      this._buildTab(namespaces[i], i === 0);
      this._buildGroup(namespaces[i], i === 0);
    }
  };

  UIBuilder.prototype._buildTab = function (ns, isActive) {
    var tab = el('div', 'pme-tab' + (isActive ? ' active' : ''), { 'data-ns': ns });
    tab.textContent = ENGINE_LABELS[ns];
    tab.addEventListener('click', this._onTabClick.bind(this, ns));
    this.tabsRoot.appendChild(tab);
  };

  UIBuilder.prototype._onTabClick = function (ns) {
    var tabs = this.tabsRoot.querySelectorAll('.pme-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-ns') === ns);
    var groups = this.bodyRoot.querySelectorAll('.pme-group');
    for (var j = 0; j < groups.length; j++) groups[j].classList.toggle('active', groups[j].getAttribute('data-ns') === ns);
  };

  UIBuilder.prototype._buildGroup = function (ns, isActive) {
    var group = el('div', 'pme-group' + (isActive ? ' active' : ''), { 'data-ns': ns });
    var schemaGroup = this.schema[ns];
    var advancedKeys = ADVANCED_KEYS[ns] || [];

    var basicKeys = Object.keys(schemaGroup).filter(function (k) { return advancedKeys.indexOf(k) === -1; });

    for (var i = 0; i < basicKeys.length; i++) {
      group.appendChild(this._buildField(ns, basicKeys[i], schemaGroup[basicKeys[i]]));
    }

    if (advancedKeys.length) {
      var header = el('div', 'pme-collapsible-header');
      header.innerHTML = '<span>Advanced</span><span class="chev">›</span>';
      var advBody = el('div', 'pme-collapsible-body');
      for (var j = 0; j < advancedKeys.length; j++) {
        if (!schemaGroup[advancedKeys[j]]) continue;
        advBody.appendChild(this._buildField(ns, advancedKeys[j], schemaGroup[advancedKeys[j]]));
      }
      header.addEventListener('click', function () {
        header.classList.toggle('open');
        advBody.classList.toggle('open');
      });
      group.appendChild(header);
      group.appendChild(advBody);
    }

    this.bodyRoot.appendChild(group);
  };

  UIBuilder.prototype._buildField = function (ns, key, def) {
    var field = el('div', 'pme-field');
    var self = this;

    if (def.type === 'boolean') {
      var row = el('div', 'pme-checkbox-row');
      var checkbox = el('input', null, { type: 'checkbox' });
      checkbox.checked = !!this.params.get(ns, key);
      checkbox.addEventListener('change', function () {
        self.params.set(ns, key, checkbox.checked);
      });
      var label = el('label', 'pme-field-label');
      label.textContent = def.label || key;
      row.appendChild(checkbox);
      row.appendChild(label);
      field.appendChild(row);
      if (def.tooltip) field.setAttribute('data-tooltip', def.tooltip);
      return field;
    }

    var labelRow = el('div', 'pme-field-row');
    var labelEl = el('span', 'pme-field-label');
    labelEl.textContent = def.label || key;
    var valueEl = el('span', 'pme-field-value');
    labelRow.appendChild(labelEl);
    labelRow.appendChild(valueEl);
    field.appendChild(labelRow);

    if (def.type === 'number' || def.type === 'integer') {
      var slider = el('input', null, {
        type: 'range',
        min: def.min,
        max: def.max,
        step: def.step || (def.type === 'integer' ? 1 : 0.01)
      });
      slider.value = this.params.get(ns, key);
      valueEl.textContent = slider.value;
      slider.addEventListener('input', function () {
        var v = self.params.set(ns, key, slider.value);
        valueEl.textContent = v;
      });
      field.appendChild(slider);
    } else if (def.type === 'enum') {
      var select = el('select');
      for (var i = 0; i < def.options.length; i++) {
        var opt = el('option', null, { value: def.options[i] });
        opt.textContent = def.options[i];
        select.appendChild(opt);
      }
      select.value = this.params.get(ns, key);
      valueEl.textContent = '';
      select.addEventListener('change', function () {
        self.params.set(ns, key, select.value);
      });
      field.appendChild(select);
    } else if (def.type === 'color') {
      var colorInput = el('input', null, { type: 'color' });
      colorInput.value = this.params.get(ns, key);
      valueEl.textContent = colorInput.value;
      colorInput.addEventListener('input', function () {
        var v = self.params.set(ns, key, colorInput.value);
        valueEl.textContent = v;
      });
      field.appendChild(colorInput);
    }

    if (def.tooltip) field.setAttribute('data-tooltip', def.tooltip);
    return field;
  };

  global.PME = global.PME || {};
  global.PME.UIBuilder = UIBuilder;
})(typeof window !== 'undefined' ? window : this);
