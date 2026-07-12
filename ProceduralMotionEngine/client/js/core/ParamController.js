/**
 * ParamController
 * ----------------
 * The single source of truth for every parameter in the Procedural Motion
 * Engine. Engines never talk to each other directly — they read/write
 * through this controller, which validates, clamps, and broadcasts changes.
 *
 * This is what makes the "one engine, millions of outputs" model work:
 * every engine subscribes to a namespaced slice of state and reacts to
 * changes instead of being hard-coded to call each other.
 */
(function (global) {
  'use strict';

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function ParamController(schema) {
    if (!schema || typeof schema !== 'object') {
      throw new Error('ParamController: a schema object is required.');
    }
    this._schema = schema;
    this._state = {};
    this._listeners = {}; // namespace -> [callback]
    this._globalListeners = [];
    this._history = [];
    this._historyLimit = 50;
    this._initFromSchema();
  }

  ParamController.prototype._initFromSchema = function () {
    var namespaces = Object.keys(this._schema);
    for (var i = 0; i < namespaces.length; i++) {
      var ns = namespaces[i];
      var group = this._schema[ns];
      var keys = Object.keys(group);
      var values = {};
      for (var j = 0; j < keys.length; j++) {
        values[keys[j]] = group[keys[j]].default;
      }
      this._state[ns] = values;
      this._listeners[ns] = [];
    }
  };

  /** Validate + clamp a single value against its schema definition. */
  ParamController.prototype._coerce = function (ns, key, value) {
    var def = this._schema[ns] && this._schema[ns][key];
    if (!def) {
      throw new Error('ParamController: unknown parameter "' + ns + '.' + key + '"');
    }
    var v = value;
    switch (def.type) {
      case 'number':
        v = Number(v);
        if (isNaN(v)) v = def.default;
        if (typeof def.min === 'number') v = Math.max(def.min, v);
        if (typeof def.max === 'number') v = Math.min(def.max, v);
        if (def.step) v = Math.round(v / def.step) * def.step;
        break;
      case 'integer':
        v = Math.round(Number(v));
        if (isNaN(v)) v = def.default;
        if (typeof def.min === 'number') v = Math.max(def.min, v);
        if (typeof def.max === 'number') v = Math.min(def.max, v);
        break;
      case 'boolean':
        v = !!v;
        break;
      case 'enum':
        if (def.options.indexOf(v) === -1) v = def.default;
        break;
      case 'color':
        if (!/^#([0-9A-Fa-f]{6})$/.test(v)) v = def.default;
        break;
      case 'array':
        if (!Array.isArray(v)) v = def.default;
        break;
      default:
        break;
    }
    return v;
  };

  /** Get a full namespace slice, or a single value. */
  ParamController.prototype.get = function (ns, key) {
    if (!this._state[ns]) return undefined;
    if (key === undefined) return deepClone(this._state[ns]);
    return this._state[ns][key];
  };

  ParamController.prototype.getAll = function () {
    return deepClone(this._state);
  };

  /** Set one parameter. Validates, clamps, records history, notifies listeners. */
  ParamController.prototype.set = function (ns, key, value, opts) {
    opts = opts || {};
    var coerced = this._coerce(ns, key, value);
    var prev = this._state[ns][key];
    if (prev === coerced && !opts.force) return coerced;

    if (!opts.silentHistory) {
      this._pushHistory();
    }

    this._state[ns][key] = coerced;

    if (!opts.silent) {
      this._notify(ns, key, coerced, prev);
    }
    return coerced;
  };

  /** Batch-set many parameters in one namespace without firing N notifications. */
  ParamController.prototype.setMany = function (ns, values, opts) {
    opts = opts || {};
    if (!opts.silentHistory) this._pushHistory();
    var keys = Object.keys(values);
    var changed = {};
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var coerced = this._coerce(ns, k, values[k]);
      if (this._state[ns][k] !== coerced) {
        changed[k] = coerced;
        this._state[ns][k] = coerced;
      }
    }
    if (!opts.silent) {
      var changedKeys = Object.keys(changed);
      for (var j = 0; j < changedKeys.length; j++) {
        this._notify(ns, changedKeys[j], changed[changedKeys[j]]);
      }
    }
    return changed;
  };

  ParamController.prototype.subscribe = function (ns, callback) {
    if (ns === '*') {
      this._globalListeners.push(callback);
      return function unsubscribe() {
        var idx = this._globalListeners.indexOf(callback);
        if (idx !== -1) this._globalListeners.splice(idx, 1);
      }.bind(this);
    }
    if (!this._listeners[ns]) this._listeners[ns] = [];
    this._listeners[ns].push(callback);
    return function unsubscribe() {
      var idx = this._listeners[ns].indexOf(callback);
      if (idx !== -1) this._listeners[ns].splice(idx, 1);
    }.bind(this);
  };

  ParamController.prototype._notify = function (ns, key, value, prevValue) {
    var payload = { namespace: ns, key: key, value: value, prevValue: prevValue, state: this.get(ns) };
    var list = this._listeners[ns] || [];
    for (var i = 0; i < list.length; i++) list[i](payload);
    for (var j = 0; j < this._globalListeners.length; j++) this._globalListeners[j](payload);
  };

  ParamController.prototype._pushHistory = function () {
    this._history.push(deepClone(this._state));
    if (this._history.length > this._historyLimit) this._history.shift();
  };

  ParamController.prototype.undo = function () {
    if (this._history.length === 0) return false;
    this._state = this._history.pop();
    this._notify('*', 'undo', this._state);
    return true;
  };

  ParamController.prototype.resetNamespace = function (ns) {
    if (!this._schema[ns]) return;
    var keys = Object.keys(this._schema[ns]);
    var defaults = {};
    for (var i = 0; i < keys.length; i++) defaults[keys[i]] = this._schema[ns][keys[i]].default;
    this.setMany(ns, defaults);
  };

  ParamController.prototype.resetAll = function () {
    this._initFromSchema();
    this._notify('*', 'reset', this._state);
  };

  ParamController.prototype.serialize = function () {
    return JSON.stringify({ version: 1, state: this._state });
  };

  ParamController.prototype.deserialize = function (json) {
    var parsed = typeof json === 'string' ? JSON.parse(json) : json;
    if (!parsed || !parsed.state) throw new Error('ParamController: invalid preset data.');
    var namespaces = Object.keys(this._schema);
    for (var i = 0; i < namespaces.length; i++) {
      var ns = namespaces[i];
      if (parsed.state[ns]) {
        this.setMany(ns, parsed.state[ns], { silentHistory: true });
      }
    }
  };

  global.PME = global.PME || {};
  global.PME.ParamController = ParamController;
})(typeof window !== 'undefined' ? window : this);
