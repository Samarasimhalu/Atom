/* ATOM feature hub: shows a card landing page; a card opens only that part of the site. */
(function () {
  'use strict';

  var main = document.getElementById('main-content');
  var hub = document.getElementById('featureHub');
  var back = document.getElementById('hubBack');
  var backLabel = document.getElementById('hubBackLabel');
  if (!main || !hub || !back) return;

  var header = document.getElementById('topHeader');
  var cards = Array.prototype.slice.call(hub.querySelectorAll('[data-feature]'));
  var titles = {};
  cards.forEach(function (card) {
    titles[card.getAttribute('data-feature')] = card.getAttribute('data-title');
  });

  function sections() {
    return Array.prototype.slice.call(main.children).filter(function (el) {
      return el.tagName === 'SECTION' && el !== hub;
    });
  }

  function belongsTo(section, id) {
    return section.id === id || section.getAttribute('data-view') === id;
  }

  function setHeaderHeight() {
    if (header) document.documentElement.style.setProperty('--hdr-h', header.offsetHeight + 'px');
  }

  function currentId() {
    var id = decodeURIComponent((location.hash || '').replace(/^#\/?/, ''));
    return Object.prototype.hasOwnProperty.call(titles, id) ? id : '';
  }

  function jumpTop() {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }

  function render() {
    var id = currentId();
    setHeaderHeight();
    document.body.classList.toggle('hub-mode', !id);
    document.body.classList.toggle('view-mode', !!id);
    hub.classList.toggle('is-hidden', !!id);
    back.classList.toggle('is-hidden', !id);
    sections().forEach(function (section) {
      section.classList.toggle('is-hidden', !id || !belongsTo(section, id));
    });
    if (id) backLabel.innerHTML = 'Viewing <b></b>';
    if (id) backLabel.querySelector('b').textContent = titles[id];
    jumpTop();
    // Canvases and charts size themselves from layout; nudge them after reveal.
    window.setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 30);
  }

  function goHub() {
    if (location.hash) {
      location.hash = '';
      // Clearing the hash leaves a trailing '#'; keep the URL clean.
      if (window.history && history.replaceState) {
        history.replaceState(null, '', location.pathname + location.search);
      }
    }
    render();
  }

  back.querySelector('button').addEventListener('click', goHub);
  window.addEventListener('hashchange', render);
  window.addEventListener('resize', setHeaderHeight);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && currentId()) goHub();
  });

  // Logo and any "#top" link return to the cards.
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href="#top"], a[href="#main-content"]');
    if (link && link.className.indexOf('skip-link') === -1) {
      event.preventDefault();
      goHub();
    }
    // Hero lifecycle nodes jump to the walkthrough, which lives in its own view.
    var jump = event.target.closest && event.target.closest('[data-jump]');
    if (jump && currentId() !== 'walkthrough') location.hash = 'walkthrough';
  });

  render();
})();
