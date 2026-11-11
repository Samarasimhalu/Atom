/* ATOM Test Workspace Launch Confirmation Modal */
(function () {
  'use strict';

  var hostname = (window.location && window.location.hostname) || '';
  var isLocal = Boolean(
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.endsWith('.local') ||
    (window.location && window.location.protocol === 'file:')
  );

  // In local development, direct to Vite dev server on port 5173.
  // In production (e.g. https://www.atomworld.net/), launch the live web workspace directly at /app/#test-workspace without localhost.
  var APP_URL = isLocal
    ? 'http://localhost:5173/#test-workspace'
    : ((window.location && window.location.origin ? window.location.origin : 'https://www.atomworld.net') + '/app/#test-workspace');

  var noteHtml = isLocal
    ? '<div class="app-confirm-note">' +
        '<span>Local development destination: <code>http://localhost:5173</code></span>' +
        '<small>Make sure your local development server is running via <code>npm.cmd run dev</code>.</small>' +
      '</div>'
    : '';

  var overlay = document.createElement('div');
  overlay.className = 'app-confirm-overlay';
  overlay.innerHTML =
    '<div class="app-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="appConfirmTitle">' +
      '<button type="button" class="app-confirm-close" id="appConfirmClose" aria-label="Close dialog">&times;</button>' +
      '<div class="app-confirm-header">' +
        '<div class="app-confirm-icon">' +
          '<img src="assets/atom-logo.png" alt="ATOM" width="34" height="34" />' +
        '</div>' +
        '<div>' +
          '<div class="app-confirm-badge">LAUNCH APPLICATION WORKSPACE</div>' +
          '<h2 class="app-confirm-title" id="appConfirmTitle">ATOM Test Workspace</h2>' +
        '</div>' +
      '</div>' +
      '<p class="app-confirm-lead">' +
        'You are about to launch the <strong>ATOM Test Workspace</strong>, an enterprise-grade execution environment for governed AI testing.' +
      '</p>' +
      '<div class="app-confirm-features">' +
        '<div class="app-confirm-feature">' +
          '<strong>Multi-surface test creation</strong>' +
          '<span>Turn plain-language requirements into Playwright web, chained API, visual, and native Appium mobile tests.</span>' +
        '</div>' +
        '<div class="app-confirm-feature">' +
          '<strong>Policy &amp; approval gates</strong>' +
          '<span>Review generated code with automatic sensitive data redaction and approval bindings before execution.</span>' +
        '</div>' +
        '<div class="app-confirm-feature">' +
          '<strong>Isolated worker runs &amp; durable evidence</strong>' +
          '<span>Execute in sealed containers and capture replayable event streams and audit-ready test reports.</span>' +
        '</div>' +
      '</div>' +
      noteHtml +
      '<div class="app-confirm-actions">' +
        '<button type="button" class="app-confirm-btn app-confirm-btn--cancel" id="appConfirmCancel">Stay on website</button>' +
        '<button type="button" class="app-confirm-btn app-confirm-btn--confirm" id="appConfirmGo">Confirm &amp; Launch Workspace &rarr;</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  var lastFocus = null;

  function openModal(trigger) {
    lastFocus = trigger || document.activeElement;
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    var confirmBtn = overlay.querySelector('#appConfirmGo');
    if (confirmBtn) confirmBtn.focus();
  }

  function closeModal() {
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function confirmLaunch() {
    closeModal();
    window.open(APP_URL, '_blank', 'noopener,noreferrer');
  }

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest && event.target.closest('[data-launch-app]');
    if (trigger) {
      event.preventDefault();
      openModal(trigger);
    }
  });

  overlay.querySelector('#appConfirmClose').addEventListener('click', closeModal);
  overlay.querySelector('#appConfirmCancel').addEventListener('click', closeModal);
  overlay.querySelector('#appConfirmGo').addEventListener('click', confirmLaunch);

  overlay.addEventListener('mousedown', function (event) {
    if (event.target === overlay) closeModal();
  });

  document.addEventListener('keydown', function (event) {
    if (!overlay.classList.contains('is-open')) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeModal();
    }
    if (event.key === 'Tab') {
      var focusables = overlay.querySelectorAll('button');
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
})();
