/*!
 * Atom Pulse capture SDK. Privacy-first: it records navigation, clicks, form submits,
 * JS errors and failed fetch calls. It NEVER records typed values, only element ids/names.
 *
 * Usage:
 *   <script src="https://YOUR-ATOM/atom-pulse.js"
 *           data-endpoint="https://YOUR-ATOM-API/api/pulse/ingest"
 *           data-key="apk_..." async></script>
 *
 * Create the key in Atom (POST /api/pulse/keys). It can only send events, never read data.
 */
(function () {
  'use strict';
  var script = document.currentScript;
  var endpoint = script && script.getAttribute('data-endpoint');
  var key = script && script.getAttribute('data-key');
  if (!endpoint || !key || navigator.doNotTrack === '1' || window.__atomPulseLoaded) return;
  window.__atomPulseLoaded = true;

  var sessionId = (function () {
    try {
      var existing = sessionStorage.getItem('atom_pulse_sid');
      if (existing) return existing;
      var id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
      sessionStorage.setItem('atom_pulse_sid', id);
      return id;
    } catch (e) { return String(Math.random()).slice(2) + Date.now(); }
  })();

  var queue = [];
  var MAX_QUEUE = 200;

  function record(type, extra) {
    if (queue.length >= MAX_QUEUE) queue.shift();
    var event = { type: type, ts: Date.now(), sessionId: sessionId, path: location.pathname };
    for (var k in extra) event[k] = extra[k];
    queue.push(event);
  }

  function describe(el) {
    if (!el || !el.getAttribute) return '';
    return el.getAttribute('data-testid') || el.id || el.getAttribute('name') || el.getAttribute('aria-label') || el.tagName.toLowerCase();
  }

  function flush() {
    if (!queue.length) return;
    var batch = queue.splice(0, 100);
    var headers = { 'Content-Type': 'application/json' };
    headers['X-Pulse-Key'] = key;
    var body = JSON.stringify({ events: batch });
    // keepalive lets the request finish while the page is unloading.
    fetch(endpoint, { method: 'POST', headers: headers, body: body, keepalive: true, credentials: 'omit' })
      .catch(function () { queue = batch.concat(queue).slice(-MAX_QUEUE); });
  }

  record('navigate', {});
  var lastPath = location.pathname;
  setInterval(function () {
    if (location.pathname !== lastPath) { lastPath = location.pathname; record('navigate', {}); }
    flush();
  }, 5000);

  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('a,button,[role=button],input[type=submit]') : null;
    if (el) record('click', { target: describe(el) });
  }, true);
  document.addEventListener('submit', function (e) { record('submit', { target: describe(e.target) }); }, true);
  window.addEventListener('error', function (e) { record('error', { message: String(e.message || 'error') }); });
  window.addEventListener('unhandledrejection', function () { record('error', { message: 'unhandled_rejection' }); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });

  var nativeFetch = window.fetch;
  if (nativeFetch) {
    window.fetch = function (input) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var promise = nativeFetch.apply(this, arguments);
      if (url.indexOf(endpoint) === 0) return promise; // never record our own beacons
      var path = url;
      try { path = new URL(url, location.href).pathname; } catch (e) { /* keep raw */ }
      promise.then(function (r) { if (r.status >= 400) record('api', { path: path, status: r.status }); },
        function () { record('api', { path: path, status: 599 }); });
      return promise;
    };
  }
})();
