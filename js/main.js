/* HILA IVGY — site behaviour */
(function () {
  'use strict';

  /* X-ray lens: follows the cursor over the hero */
  var hero = document.querySelector('[data-lens]');
  if (hero) {
    hero.addEventListener('mousemove', function (e) {
      var r = hero.getBoundingClientRect();
      hero.style.setProperty('--lx', (e.clientX - r.left) + 'px');
      hero.style.setProperty('--ly', (e.clientY - r.top) + 'px');
    });
  }

  /* Mobile menu */
  var head = document.querySelector('.h-head');
  var menuBtn = document.querySelector('[data-menu]');
  if (head && menuBtn) {
    menuBtn.addEventListener('click', function () {
      var open = head.classList.toggle('is-open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    head.querySelectorAll('.h-nav a').forEach(function (a) {
      a.addEventListener('click', function () {
        head.classList.remove('is-open');
        menuBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* "What do you need?" chips: single choice */
  var chips = document.querySelectorAll('.h-chip');
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (c) {
        c.classList.remove('is-on');
        c.setAttribute('aria-pressed', 'false');
      });
      chip.classList.add('is-on');
      chip.setAttribute('aria-pressed', 'true');
    });
  });

  /* Contact form: opens WhatsApp with the details filled in */
  var form = document.querySelector('[data-form]');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (form.elements.name.value || '').trim();
      var phone = (form.elements.phone.value || '').trim();
      var biz = (form.elements.biz.value || '').trim();
      var on = form.querySelector('.h-chip.is-on');
      var need = on ? on.textContent.trim() : '';
      var lines = ['היי הילה, הגעתי מהאתר שלך 🙂'];
      if (name) lines.push('שם: ' + name);
      if (phone) lines.push('טלפון: ' + phone);
      if (need) lines.push('מה אני צריך/ה: ' + need);
      if (biz) lines.push('על העסק: ' + biz);
      form.classList.add('is-sent');
      window.open('https://wa.me/972559653225?text=' + encodeURIComponent(lines.join('\n')), '_blank', 'noopener');
    });
  }

  /* Work: fly-through. Scroll moves the camera forward through the five sites */
  var fly = document.querySelector('[data-fly]');
  if (fly) {
    var reduceFly = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceFly) {
      fly.classList.add('h-fly--static');
    } else {
      var frames = fly.querySelectorAll('.h-fly__f');
      var labels = fly.querySelectorAll('.h-fly__lbl');
      var countEl = fly.querySelector('.h-fly__count b');
      var N = frames.length, D = 1300, ticking = false, lastIdx = -1;
      var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
      var render = function () {
        ticking = false;
        var r = fly.getBoundingClientRect();
        var total = r.height - window.innerHeight;
        var p = clamp(-r.top / (total || 1), 0, 1);
        if (r.bottom < -200 || r.top > window.innerHeight + 200) return;
        fly.style.setProperty('--p', p.toFixed(4));
        var span = N - 1 + 0.35;
        var raw = p * span, seg = Math.floor(raw), fr = raw - seg;
        var e = clamp((fr - 0.3) / 0.7, 0, 1);
        var pos = seg + e * e * (3 - 2 * e);
        var mobile = window.innerWidth < 980;
        for (var i = 0; i < N; i++) {
          var t = pos - i;
          if (i === N - 1) t = Math.min(t, 0);
          var side = i % 2 ? 1 : -1;
          var x = -side * (mobile ? 6 : 11) * t;
          var z = t > 0 ? t * D * 0.55 : t * D;
          var ry = side * t * -14;
          var op = t < 0 ? clamp(1 + (t + 1.2) / 1.6, 0, 1) : clamp(1 - t / 0.22, 0, 1);
          if (t < -3.2) op = 0;
          var f = frames[i];
          f.style.transform = 'translate3d(' + x.toFixed(2) + 'vw,0,' + z.toFixed(1) + 'px) rotateY(' + ry.toFixed(2) + 'deg)';
          f.style.opacity = op.toFixed(3);
          f.style.setProperty('--dim', clamp(-t * 0.45, 0, 0.75).toFixed(3));
          f.style.zIndex = String(100 - i);
          f.style.visibility = op <= 0.001 ? 'hidden' : 'visible';
          var lo = clamp(1 - Math.abs(t) * 2.6, 0, 1);
          var l = labels[i];
          l.style.opacity = lo.toFixed(3);
          l.style.transform = 'translate3d(0,' + (t * -60).toFixed(1) + 'px,0)';
        }
        var idx = clamp(Math.round(pos), 0, N - 1);
        if (idx !== lastIdx && countEl) { countEl.textContent = '0' + (idx + 1); lastIdx = idx; }
        fly.style.setProperty('--end', clamp((p - 0.9) / 0.1, 0, 1).toFixed(3));
      };
      var req = function () { if (!ticking) { ticking = true; requestAnimationFrame(render); } };
      window.addEventListener('scroll', req, { passive: true });
      window.addEventListener('resize', req);
      render();
    }
  }
})();
