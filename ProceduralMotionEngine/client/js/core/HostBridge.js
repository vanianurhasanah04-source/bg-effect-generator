/**
 * HostBridge
 * ----------
 * Thin, promise-based wrapper around the CEP CSInterface for calling into
 * host/main.jsx (ExtendScript running inside After Effects). All engines
 * that need to actually build AE layers go through here rather than
 * touching CSInterface directly, so the ExtendScript call convention only
 * has to be gotten right in one place.
 */
(function (global) {
  'use strict';

  function HostBridge() {
    if (typeof CSInterface === 'undefined') {
      throw new Error('HostBridge: CSInterface.js was not loaded before HostBridge.js.');
    }
    this.cs = new CSInterface();
  }

  /**
   * Calls an ExtendScript function defined in host/main.jsx.
   * Arguments are JSON-encoded so complex scene graphs can cross the bridge
   * safely regardless of AE version quirks with evalScript argument types.
   */
  HostBridge.prototype.call = function (fnName, args) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var argJson = JSON.stringify(args === undefined ? null : args);
      // Escape for safe embedding inside a single evalScript string.
      var escaped = argJson.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      var script = 'PME_dispatch("' + fnName + '", "' + escaped + '")';
      self.cs.evalScript(script, function (result) {
        if (result === 'EvalScript error.') {
          reject(new Error('HostBridge: ExtendScript failed to evaluate "' + fnName + '".'));
          return;
        }
        try {
          var parsed = JSON.parse(result);
          if (parsed && parsed.__pmeError) {
            reject(new Error(parsed.__pmeError));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          // Non-JSON responses (rare) are passed through as-is.
          resolve(result);
        }
      });
    });
  };

  HostBridge.prototype.getHostEnvironment = function () {
    return this.cs.getHostEnvironment();
  };

  HostBridge.prototype.openLiveWindow = function (url) {
    this.cs.openURLInDefaultBrowser(url);
  };

  global.PME = global.PME || {};
  global.PME.HostBridge = HostBridge;
})(typeof window !== 'undefined' ? window : this);
