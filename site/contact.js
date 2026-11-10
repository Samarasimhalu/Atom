/* Contact Us modal: collects email, name and query, then emails them to the ATOM team. */
(function () {
  'use strict';

  // Messages are delivered by FormSubmit (https://formsubmit.co), which forwards form posts
  // to this inbox. The first submission triggers a one-time activation email to this address.
  var CONTACT_EMAIL = 'samarasimhalus@gmail.com';
  var ENDPOINT = 'https://formsubmit.co/ajax/' + CONTACT_EMAIL;

  var FACTS = [
    'ATOM now has Atom Pulse, which turns real-user journeys into a ranked list of untested paths and drafts the missing tests.',
    'Every AI-generated test goes through policy checks, human approval and an audit trail before anything runs.',
    'With the \u201CHey Atom\u201D voice copilot you can ask \u201CHow well are my customers covered?\u201D and get an answer out loud.',
    'ATOM runs native iOS and Android automation through a managed, isolated execution boundary.',
    'Tests run in isolated Playwright and Appium workers, kept apart from the control plane.',
    'API tests can be chained with controlled data flow, so one response safely feeds the next request.',
    'Atom Pulse redacts emails, tokens and long numbers at ingest, so customer data never reaches your test pipeline.',
    'Every governed run is replayable, so you can see exactly what ran, who approved it and what it proved.',
    'You can try the live API simulator right on the website and export the results as JSON or PDF.',
    'ATOM keeps tenants isolated, with role-based access on every action.'
  ];

  var overlay = document.createElement('div');
  overlay.className = 'cm-overlay';
  overlay.innerHTML =
    '<div class="cm-modal" role="dialog" aria-modal="true" aria-labelledby="cmTitle">' +
      '<div class="cm-art" aria-hidden="false">' +
        '<span class="cm-orb cm-orb--1"></span><span class="cm-orb cm-orb--2"></span>' +
        '<span class="cm-orb cm-orb--3"></span><span class="cm-orb cm-orb--4"></span>' +
        '<div class="cm-fact"><span class="cm-fact__label">Do you know?</span>' +
        '<p class="cm-fact__text" id="cmFact" aria-live="polite"></p></div>' +
      '</div>' +
      '<div class="cm-panel" id="cmPanel">' +
        '<button type="button" class="cm-close" id="cmClose" aria-label="Close contact form">&times;</button>' +
        '<h2 class="cm-title" id="cmTitle">Contact Us</h2>' +
        '<p class="cm-sub">Tell us what you need and we will get back to you.</p>' +
        '<form id="cmForm" novalidate>' +
          '<label class="cm-field"><span>Email to contact</span><input type="email" name="email" id="cmEmail" autocomplete="email" placeholder="you@company.com" required></label>' +
          '<label class="cm-field"><span>Name</span><input type="text" name="name" id="cmName" autocomplete="name" placeholder="Your name" required maxlength="100"></label>' +
          '<label class="cm-field"><span>Please brief us about your query</span><textarea name="message" id="cmMessage" rows="3" placeholder="How can we help?" required maxlength="2000"></textarea></label>' +
          '<input type="text" name="_honey" class="cm-hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
          '<div class="cm-err" id="cmErr" role="alert"></div>' +
          '<button type="submit" class="cm-submit" id="cmSubmit">Submit</button>' +
          '<p class="cm-status" id="cmStatus" aria-live="polite"></p>' +
        '</form>' +
        '<div class="cm-thanks" role="status">' +
          '<div class="cm-tick"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>' +
          '<h3>Thank you for your response!</h3>' +
          '<p>We have received your message and will get back to you soon.</p>' +
          '<button type="button" class="cm-submit" id="cmDone">Close</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  var panel = overlay.querySelector('#cmPanel');
  var form = overlay.querySelector('#cmForm');
  var factEl = overlay.querySelector('#cmFact');
  var errEl = overlay.querySelector('#cmErr');
  var statusEl = overlay.querySelector('#cmStatus');
  var submitBtn = overlay.querySelector('#cmSubmit');
  var emailEl = overlay.querySelector('#cmEmail');
  var nameEl = overlay.querySelector('#cmName');
  var msgEl = overlay.querySelector('#cmMessage');
  var lastFocus = null, factTimer = 0, factIdx = Math.floor(Math.random() * FACTS.length);

  function showFact(first) {
    var next;
    do { next = Math.floor(Math.random() * FACTS.length); } while (next === factIdx && FACTS.length > 1);
    factIdx = first ? factIdx : next;
    if (first) { factEl.textContent = 'Do you know, ' + FACTS[factIdx]; return; }
    factEl.classList.add('is-out');
    window.setTimeout(function () {
      factEl.textContent = 'Do you know, ' + FACTS[factIdx];
      factEl.classList.remove('is-out');
    }, 350);
  }

  function open(trigger) {
    lastFocus = trigger || document.activeElement;
    panel.classList.remove('is-sent');
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    showFact(true);
    window.clearInterval(factTimer);
    factTimer = window.setInterval(function () { showFact(false); }, 6000);
    window.setTimeout(function () { emailEl.focus(); }, 60);
  }

  function close() {
    overlay.classList.remove('is-open');
    window.clearInterval(factTimer);
    // The cards page locks scrolling itself; only release the lock we took.
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function invalid(field, msg) {
    field.setAttribute('aria-invalid', 'true');
    errEl.textContent = msg;
    field.focus();
    return false;
  }

  function validate() {
    [emailEl, nameEl, msgEl].forEach(function (f) { f.removeAttribute('aria-invalid'); });
    errEl.textContent = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailEl.value.trim())) return invalid(emailEl, 'Please enter a valid email address.');
    if (!nameEl.value.trim()) return invalid(nameEl, 'Please tell us your name.');
    if (msgEl.value.trim().length < 5) return invalid(msgEl, 'Please brief us about your query.');
    return true;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!validate()) return;
    var data = new FormData(form);
    if (data.get('_honey')) return; // bots fill the hidden field
    var payload = {
      name: nameEl.value.trim(),
      email: emailEl.value.trim(),
      message: msgEl.value.trim(),
      _subject: 'ATOM website enquiry from ' + nameEl.value.trim(),
      _template: 'table',
      _captcha: 'false'
    };
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending\u2026';
    statusEl.textContent = '';
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok || body.success === 'false' || body.success === false) throw new Error('send_failed');
        panel.classList.add('is-sent');
        form.reset();
      });
    }).catch(function () {
      var mailto = 'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent('ATOM enquiry') +
        '&body=' + encodeURIComponent(msgEl.value);
      statusEl.innerHTML = 'We could not send that just now. Please try again, or <a href="' + mailto + '">email us directly</a>.';
    }).then(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit';
    });
  });

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest && event.target.closest('[data-open-contact]');
    if (trigger) { event.preventDefault(); open(trigger); }
  });
  overlay.querySelector('#cmClose').addEventListener('click', close);
  overlay.querySelector('#cmDone').addEventListener('click', close);
  overlay.addEventListener('mousedown', function (event) { if (event.target === overlay) close(); });
  document.addEventListener('keydown', function (event) {
    if (!overlay.classList.contains('is-open')) return;
    if (event.key === 'Escape') { event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') { // keep focus inside the dialog
      var items = overlay.querySelectorAll('button, input:not(.cm-hp), textarea');
      var visible = Array.prototype.filter.call(items, function (el) { return el.offsetParent !== null; });
      var first = visible[0], last = visible[visible.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }, true);
})();
