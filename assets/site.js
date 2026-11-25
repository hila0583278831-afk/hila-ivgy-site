/* shared bits for the inner pages: reveal-on-scroll, floating WhatsApp, accessibility menu (same settings as home) */
(() => {
  // reveal on scroll
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  window.reveal = root => (root || document).querySelectorAll('.rv:not(.in)').forEach(el => io.observe(el));
  reveal();

  // floating WhatsApp
  document.body.insertAdjacentHTML('beforeend',
    `<a class="wa-float" href="https://wa.me/972559653225" target="_blank" rel="noopener" aria-label="שיחה בוואטסאפ"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="#fff" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3m0 23.7c-2 0-4-.6-5.7-1.6l-.4-.2-3.9 1 1-3.8-.3-.4A10.7 10.7 0 1 1 16 26.7m5.9-8c-.3-.2-1.9-1-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7 0a8.8 8.8 0 0 1-4.4-3.8c-.3-.6.3-.5 1-1.7.1-.2 0-.4 0-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4s-1.1 1.1-1.1 2.7 1.2 3.1 1.3 3.3 2.3 3.5 5.6 4.9c2.1.9 2.9 1 4 .8.6-.1 1.9-.8 2.2-1.5s.3-1.4.2-1.5-.3-.2-.6-.4"/></svg></a>`);

  // accessibility menu
  document.body.insertAdjacentHTML('beforeend', `
<div class="a11y-ui" dir="rtl">
  <button class="a11y-btn" type="button" aria-expanded="false" aria-controls="a11yPanel" aria-label="תפריט נגישות"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="4.2" r="2.2"/><path d="M4 7.6c2.6.7 5.3 1 8 1s5.4-.3 8-1l.5 1.9c-2 .6-4.1.9-6.2 1.1v3.2l2 7.4-1.9.6L12.2 15h-.4l-2.2 6.8-1.9-.6 2-7.4v-3.2c-2.1-.2-4.2-.5-6.2-1.1z"/></svg></button>
  <div class="a11y-panel" id="a11yPanel" role="dialog" aria-labelledby="a11yTitle" hidden>
    <h2 id="a11yTitle">הגדרות נגישות <button class="a11y-x" type="button" aria-label="סגירת תפריט הנגישות">×</button></h2>
    <div class="a11y-size" role="group" aria-label="גודל טקסט"><span>גודל טקסט</span><button type="button" data-size="-1" aria-label="הקטנת טקסט">א-</button><button type="button" data-size="1" aria-label="הגדלת טקסט">א+</button></div>
    <div class="a11y-grid">
      <button type="button" data-t="contrast" aria-pressed="false">ניגודיות גבוהה</button><button type="button" data-t="gray" aria-pressed="false">גווני אפור</button>
      <button type="button" data-t="links" aria-pressed="false">הדגשת קישורים</button><button type="button" data-t="font" aria-pressed="false">גופן קריא</button>
      <button type="button" data-t="cursor" aria-pressed="false">סמן גדול</button><button type="button" data-t="stop" aria-pressed="false">עצירת אנימציות</button>
    </div>
    <div class="a11y-foot"><button type="button" data-reset>איפוס הגדרות</button><a href="accessibility.html">הצהרת נגישות</a></div>
  </div>
</div>`);
  const H = document.documentElement, ui = document.querySelector('.a11y-ui'), btn = ui.querySelector('.a11y-btn'), panel = ui.querySelector('.a11y-panel');
  const KEY = 'hila-a11y', blank = { size: 0, contrast: false, gray: false, links: false, font: false, cursor: false, stop: false };
  let S = { ...blank };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) {}
  const style = document.createElement('style'); document.head.appendChild(style);
  function apply() {
    H.dataset.a11ySize = S.size;
    ['links', 'font', 'cursor', 'stop'].forEach(k => H.classList.toggle('a11y-' + k, !!S[k]));
    const fl = [S.contrast && 'contrast(1.35) saturate(1.15)', S.gray && 'grayscale(1)'].filter(Boolean).join(' ');
    style.textContent = fl ? `body > :not(.a11y-ui):not(script):not(style){filter:${fl}}` : '';
    panel.querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-pressed', String(!!S[b.dataset.t])));
    document.dispatchEvent(new CustomEvent('a11y', { detail: S }));
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {}
  }
  const open = o => { panel.hidden = !o; btn.setAttribute('aria-expanded', String(o)); (o ? panel.querySelector('button') : btn).focus(); };
  btn.addEventListener('click', () => open(panel.hidden));
  panel.querySelector('.a11y-x').addEventListener('click', () => open(false));
  addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) open(false); });
  document.addEventListener('click', e => { if (!panel.hidden && !e.target.closest('.a11y-ui')) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
  panel.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.t) S[b.dataset.t] = !S[b.dataset.t];
    else if (b.dataset.size) S.size = Math.max(0, Math.min(3, S.size + +b.dataset.size));
    else if (b.hasAttribute('data-reset')) S = { ...blank };
    else return;
    apply();
  });
  apply();
})();
