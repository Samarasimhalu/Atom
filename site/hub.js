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

  /* ---------- Animated neural-network background ---------- */
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canvas = document.createElement('canvas');
  canvas.className = 'hub__net';
  canvas.setAttribute('aria-hidden', 'true');
  hub.insertBefore(canvas, hub.firstChild);
  var ctx = canvas.getContext('2d');
  var net = { nodes: [], w: 0, h: 0, raf: 0, mx: -9999, my: -9999, host: hub };
  var welcome = document.getElementById('welcome');
  function setNetHost(el) {
    if (canvas.parentNode !== el) el.insertBefore(canvas, el.firstChild);
    net.host = el;
  }

  function sizeNet() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = net.host.clientWidth, h = net.host.clientHeight;
    if (!w || !h) return;
    net.w = w; net.h = h;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var count = Math.max(30, Math.min(120, Math.round((w * h) / 13000)));
    while (net.nodes.length < count) {
      net.nodes.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.45, vy: (Math.random() - 0.5) * 0.45, r: 1 + Math.random() * 1.4 });
    }
    net.nodes.length = count;
  }

  function drawNet() {
    var n = net.nodes, w = net.w, h = net.h, link = 150, i, j;
    ctx.clearRect(0, 0, w, h);
    for (i = 0; i < n.length; i++) {
      var p = n[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
      if (p.y < -20) p.y = h + 20; else if (p.y > h + 20) p.y = -20;
    }
    ctx.lineWidth = 1;
    for (i = 0; i < n.length; i++) {
      for (j = i + 1; j < n.length; j++) {
        var dx = n[i].x - n[j].x, dy = n[i].y - n[j].y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < link) {
          ctx.strokeStyle = 'rgba(125, 211, 252,' + ((1 - d / link) * 0.5).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(n[i].x, n[i].y); ctx.lineTo(n[j].x, n[j].y); ctx.stroke();
        }
      }
      var mdx = n[i].x - net.mx, mdy = n[i].y - net.my, md = Math.sqrt(mdx * mdx + mdy * mdy);
      if (md < 190) {
        ctx.strokeStyle = 'rgba(167, 139, 250,' + ((1 - md / 190) * 0.7).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(n[i].x, n[i].y); ctx.lineTo(net.mx, net.my); ctx.stroke();
      }
    }
    ctx.shadowColor = '#7dd3fc'; ctx.shadowBlur = 8; ctx.fillStyle = '#bae6fd';
    for (i = 0; i < n.length; i++) {
      ctx.beginPath(); ctx.arc(n[i].x, n[i].y, n[i].r, 0, 6.2832); ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  function netLoop() {
    drawNet();
    net.raf = window.requestAnimationFrame(netLoop);
  }
  function startNet() {
    if (net.raf) return;
    sizeNet();
    if (reduceMotion) { drawNet(); return; }
    net.raf = window.requestAnimationFrame(netLoop);
  }
  function stopNet() {
    if (net.raf) window.cancelAnimationFrame(net.raf);
    net.raf = 0;
  }
  function onNetMove(e) {
    var r = net.host.getBoundingClientRect();
    net.mx = e.clientX - r.left; net.my = e.clientY - r.top;
  }
  function onNetLeave() { net.mx = net.my = -9999; }
  [hub, welcome].forEach(function (el) {
    if (!el) return;
    el.addEventListener('mousemove', onNetMove);
    el.addEventListener('mouseleave', onNetLeave);
  });
  window.addEventListener('resize', function () { if (net.raf || reduceMotion) sizeNet(); });

  /* ---------- Card -> slide right -> expand into the page ---------- */
  var busy = false;
  var origin = 'features'; // where the Back button returns: 'features' (cards) or 'welcome'

  function openCard(card, id) {
    if (busy) return;
    var rect = card.getBoundingClientRect();
    var hdrH = header ? header.offsetHeight : 64;
    var vw = window.innerWidth, vh = window.innerHeight;
    var clone = card.cloneNode(true);
    clone.classList.add('hub-card--flying');
    clone.removeAttribute('href');
    clone.style.left = rect.left + 'px';
    clone.style.top = rect.top + 'px';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    document.body.appendChild(clone);
    busy = true;
    hub.classList.add('is-leaving');

    function finish() {
      location.hash = id;           // renders the real page underneath
      var fade = clone.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, easing: 'ease-out', fill: 'forwards' });
      fade.onfinish = function () {
        clone.remove();
        hub.classList.remove('is-leaving');
        busy = false;
      };
    }

    // Enlarge the card in place until it fills the content area, then reveal the page.
    clone.classList.add('is-expanding');
    var expand = clone.animate(
      [
        { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px', borderRadius: '24px', backgroundColor: '#f1f5fb' },
        { left: '0px', top: hdrH + 'px', width: vw + 'px', height: (vh - hdrH) + 'px', borderRadius: '0px', backgroundColor: '#ffffff' }
      ],
      { duration: 650, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'forwards' }
    );
    expand.onfinish = finish;
  }

  hub.addEventListener('click', function (event) {
    var card = event.target.closest && event.target.closest('a[data-feature]');
    if (!card || event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
    event.preventDefault();
    var id = card.getAttribute('data-feature');
    origin = 'features';
    if (reduceMotion || !card.animate) { location.hash = id; return; }
    openCard(card, id);
  });

  // Routes: '' = welcome screen, '#features' = cards, '#<feature id>' = a single feature.
  function route() {
    var raw = decodeURIComponent((location.hash || '').replace(/^#\/?/, ''));
    if (raw === 'features') return 'features';
    return Object.prototype.hasOwnProperty.call(titles, raw) ? raw : 'welcome';
  }

  var backText = document.getElementById('hubBackText');

  function render() {
    var r = route();
    var isView = r !== 'welcome' && r !== 'features';
    setHeaderHeight();
    document.body.classList.toggle('welcome-mode', r === 'welcome');
    document.body.classList.toggle('hub-mode', r === 'features');
    document.body.classList.toggle('view-mode', isView);
    if (welcome) welcome.classList.toggle('is-hidden', r !== 'welcome');
    hub.classList.toggle('is-hidden', r !== 'features');
    back.classList.toggle('is-hidden', !isView);
    sections().forEach(function (section) {
      if (section === welcome) return;
      section.classList.toggle('is-hidden', !isView || !belongsTo(section, r));
    });
    if (isView) {
      backLabel.innerHTML = 'Viewing <b></b>';
      backLabel.querySelector('b').textContent = titles[r];
      if (backText) backText.textContent = origin === 'welcome' ? 'Back' : 'All features';
      stopNet();
    } else {
      if (r !== 'features') origin = 'features';
      setNetHost(r === 'welcome' && welcome ? welcome : hub);
      startNet();
    }
    jumpTop();
    // Canvases and charts size themselves from layout; nudge them after reveal.
    window.setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 30);
  }

  function go(hash) {
    if (hash) {
      location.hash = hash;
    } else if (location.hash) {
      location.hash = '';
      // Clearing the hash leaves a trailing '#'; keep the URL clean.
      if (window.history && history.replaceState) history.replaceState(null, '', location.pathname + location.search);
      render();
    } else {
      render();
    }
  }

  function goBack() { go(origin === 'welcome' ? '' : 'features'); }

  back.querySelector('button').addEventListener('click', goBack);
  window.addEventListener('hashchange', render);
  window.addEventListener('resize', setHeaderHeight);
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    var r = route();
    if (r === 'features') go('');
    else if (r !== 'welcome') goBack();
  });

  document.addEventListener('click', function (event) {
    var t = event.target.closest ? event.target : null;
    if (!t) return;
    // Welcome / hub buttons: data-go="features" | "start" | "welcome"
    var nav = t.closest('[data-go]');
    if (nav) {
      event.preventDefault();
      var dest = nav.getAttribute('data-go');
      if (dest === 'welcome') go('');
      else {
        origin = dest === 'start' && route() === 'welcome' ? 'welcome' : 'features';
        go(dest);
      }
      return;
    }
    // Logo and any "#top" link return to the welcome screen.
    var link = t.closest('a[href="#top"], a[href="#main-content"]');
    if (link && link.className.indexOf('skip-link') === -1) {
      event.preventDefault();
      go('');
    }
    // Hero lifecycle nodes jump to the walkthrough, which lives in its own view.
    var jump = t.closest('[data-jump]');
    if (jump && route() !== 'walkthrough') location.hash = 'walkthrough';
  });

  // Copy the quick-start command from the welcome screen.
  (function () {
    var btn = document.getElementById('welcomeCopy');
    var textEl = document.getElementById('welcomeCmdText');
    if (!btn || !textEl) return;
    var label = btn.querySelector('.welcome__copied');
    var timer = 0;

    function fallbackCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    }

    function done(ok) {
      btn.classList.toggle('is-copied', ok);
      label.textContent = ok ? 'Copied!' : 'Press Ctrl+C to copy';
      btn.setAttribute('aria-label', ok ? 'Copied' : 'Copy command');
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        btn.classList.remove('is-copied');
        label.textContent = '';
        btn.setAttribute('aria-label', 'Copy command');
      }, 1800);
    }

    btn.addEventListener('click', function () {
      var text = textEl.textContent.trim();
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
      } else {
        done(fallbackCopy(text)); // http://<LAN-ip> pages are not a secure context
      }
    });
  })();

  // Ensure all external destinations (like GitHub repo, docs, actions) open in a new tab,
  // while internal ATOM features and pages stay within the same window.
  (function () {
    function enforceExternalTargets() {
      var links = document.querySelectorAll('a[href^="http://"], a[href^="https://"]');
      for (var i = 0; i < links.length; i++) {
        var a = links[i];
        if (a.hostname && a.hostname !== window.location.hostname) {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        }
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', enforceExternalTargets);
    } else {
      enforceExternalTargets();
    }
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href^="http://"], a[href^="https://"]');
      if (a && a.hostname && a.hostname !== window.location.hostname) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
    }, true);
  })();

  render();
})();