(() => {
  'use strict';
  document.documentElement.classList.add('js');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => mqReduce.matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const main = $('#main');
  const pages = $$('.page');
  const nav = $('.nav');
  const menu = $('#menu');
  const menuBtn = $('.nav__menu');
  const showHooks = [];
  let route = null;
  let shownOnce = false;

  /* ---------------- language: the page is written in English; German comes from a dictionary ---------------- */
  const DE = window.__TC_DE || {};
  // the artifact is written in English; the hosted German page arrives already in German (window.__TC_SRC = 'de')
  const SRC = window.__TC_SRC === 'de' ? 'de' : 'en';
  let EN = null;
  const enOf = (s) => {
    if (!EN) { EN = {}; Object.keys(DE).forEach((k) => { EN[DE[k].replace(/\s+/g, ' ').trim()] = k; }); }
    return EN[s];
  };
  let lang = SRC;
  let translated = false;
  const langHooks = [];
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  function t(s, vars) {
    let out = (lang === 'de' && DE[s]) || s;
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return out;
  }
  const SKIP = 'script, style, code, pre, .code, .en, .de, [translate="no"], [data-live]';
  const ATTRS = ['aria-label', 'alt', 'placeholder', 'title', 'data-title', 'data-copied'];
  const textOrig = new WeakMap();
  const attrOrig = new WeakMap();
  function translateTree(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        return !p || p.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      let orig = textOrig.get(n);
      if (orig === undefined) { orig = n.nodeValue; textOrig.set(n, orig); }
      const tr = lang === SRC ? null : lang === 'de' ? DE[norm(orig)] : enOf(norm(orig));
      n.nodeValue = tr ? orig.match(/^\s*/)[0] + tr + orig.match(/\s*$/)[0] : orig;
    }
    root.querySelectorAll(ATTRS.map((a) => '[' + a + ']').join(',')).forEach((el) => {
      if (el.closest('.en, .de, [translate="no"]')) return;
      let o = attrOrig.get(el);
      if (!o) { o = {}; ATTRS.forEach((a) => { if (el.hasAttribute(a)) o[a] = el.getAttribute(a); }); attrOrig.set(el, o); }
      Object.keys(o).forEach((a) => { const tr = lang === SRC ? null : lang === 'de' ? DE[norm(o[a])] : enOf(norm(o[a])); el.setAttribute(a, tr || o[a]); });
    });
    root.querySelectorAll('img[data-src-de]').forEach((img) => {
      if (!img.dataset.srcEn) img.dataset.srcEn = img.getAttribute('src');
      img.setAttribute('src', lang === 'de' ? img.dataset.srcDe : img.dataset.srcEn);
    });
  }
  function setTitle() {
    const page = pages.find((p) => p.dataset.route === route);
    if (page) document.title = route === 'home' ? t('tcycled: old clothes back by post, with a voucher') : page.dataset.title + ' | tcycled';
  }
  function setLang(l, save) {
    lang = l === 'de' ? 'de' : 'en';
    document.documentElement.lang = lang;
    // nothing to swap while the page is still in the language it was written in
    if (translated || lang !== SRC) { translateTree(document.body); translated = true; }
    $$('[data-site-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.siteLang === lang)));
    // the ads follow the site language; their own switch can still flip them
    $$('[data-lang]').forEach((box) => {
      box.dataset.lang = lang;
      $$('.langswitch button', box).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.set === lang)));
    });
    setTitle();
    langHooks.forEach((fn) => fn(lang));
    if (save) { try { localStorage.setItem('tc-lang', lang); } catch (e) { /* storage blocked */ } }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-site-lang]');
    if (b) setLang(b.dataset.siteLang, true);
  });

  /* ---------------- measurement: one tracked action per page, no cookies, nothing stored ---------------- */
  // Each page has one action that counts (data-track, or a form that completes). Pageviews come from the
  // analytics snippet itself, with hash-based routing. Where the visitor came from (a placement's QR code or an
  // ad link) and which headline they saw ride along as properties. Nothing is written to the device: the
  // visit lives in memory and ends with the tab.
  const PLACEMENTS = window.__TC_PLACEMENTS || {};
  const qs = new URLSearchParams(location.search);
  const visit = { placement: '', channel: '', variant: 'a' };
  (() => {
    const q = (qs.get('q') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
    if (q) {
      visit.placement = q;
      visit.channel = (PLACEMENTS[q] && PLACEMENTS[q].channel) || 'other';
    } else if (qs.get('utm_source')) {
      visit.placement = [qs.get('utm_source'), qs.get('utm_content')].filter(Boolean).join(':').toLowerCase().replace(/[^a-z0-9:_-]/g, '').slice(0, 48);
      visit.channel = (qs.get('utm_medium') || 'other').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
    }
    if ((qs.get('h') || '').toLowerCase() === 'b') visit.variant = 'b';
  })();
  const trackDebug = qs.get('debug') === 'analytics';
  const props = (extra) => Object.assign({ page: route || 'home', lang, headline: visit.variant },
    visit.placement ? { placement: visit.placement, channel: visit.channel } : {}, extra || {});
  window.__tcProps = () => props();
  const tracked = [];
  window.__tcTracked = tracked;
  function track(name, extra) {
    const pr = props(extra);
    tracked.push({ name, props: pr });
    if (typeof window.plausible === 'function') { try { window.plausible(name, { props: pr }); } catch (e) { /* analytics blocked */ } }
    if (trackDebug) console.info('[tcycled] ' + name, pr);
  }
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-track]');
    if (el) track(el.dataset.track, el.dataset.trackStore ? { store: el.dataset.trackStore } : null);
  });

  /* ---------------- toast and copy ---------------- */
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.appendChild(toast);
  let toastTimer = 0;
  function say(msg) {
    toast.textContent = msg;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-on'), 2600);
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }
  function svgFromSymbol(id, vb) {
    const sym = document.getElementById(id);
    if (!sym) return '';
    const inner = sym.innerHTML.replace(/var\(--logo-(?:mark|word|by),\s*(#[0-9A-Fa-f]{6})\)/g, '$1');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' + inner + '</svg>';
  }
  const COPY = {
    logo: () => svgFromSymbol('logo', '-8 -84 419.1 110'),
    mark: () => svgFromSymbol('mark', '0 0 100 100'),
    tokens: () => [':root {',
      '  --tc-loop: #127A47;', '  --tc-evergreen: #0F2A1D;', '  --tc-sprout: #C6F07A;', '  --tc-paper: #F5F3EC;', '  --tc-ink: #0F1F17;',
      '  --tc-tide: #0A6E9E;', '  --tc-tide-bright: #75D7F8;', '  --tc-coral: #A93A28;', '  --tc-coral-bright: #E46A55;', '  --tc-mint: #E6F2E3;',
      '  --tc-reuse: #0B5A33;', '  --tc-refashion: #2E9A5F;', '  --tc-closed-loop: #8FD19E;', '  --tc-open-loop: #C6F07A;', '  --tc-recovery: #B8B2A2;',
      '  --tc-font-display: "Bricolage Grotesque", system-ui, sans-serif;', '  --tc-font-text: "Figtree", system-ui, sans-serif;', '  --tc-font-mono: "DM Mono", ui-monospace, monospace;',
      '  --tc-radius-s: 12px;', '  --tc-radius-m: 20px;', '  --tc-radius-l: 32px;', '  --tc-ease: cubic-bezier(.2, .8, .2, 1);', '}', ''].join('\n')
  };
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    let text = b.dataset.copy;
    const asset = text.charAt(0) === '@' && COPY[text.slice(1)] ? text.slice(1) : '';
    if (asset) text = COPY[asset]();
    const ok = await copyText(text);
    if (ok && asset) track('Asset copied', { asset });
    say(ok ? (b.dataset.copied || t('Copied {x}', { x: text })) : t('Copying is blocked here. Select the text instead.'));
  });

  /* ---------------- router ---------------- */
  function setCurrent(r) {
    $$('.nav__links a, .menu__links a').forEach((a) => {
      if (a.getAttribute('href') === '#' + r) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }
  function show(r, target) {
    const page = pages.find((p) => p.dataset.route === r) || pages[0];
    const changed = page.dataset.route !== route;
    if (changed) {
      pages.forEach((p) => { p.hidden = p !== page; });
      route = page.dataset.route;
      setCurrent(route);
      setTitle();
    }
    closeMenu(false);
    if (target) {
      requestAnimationFrame(() => target.scrollIntoView({ behavior: changed || reduced() ? 'auto' : 'smooth', block: 'start' }));
    } else if (changed) {
      window.scrollTo(0, 0);
    }
    if (changed) {
      // move focus to the new page, but not on the first load: then the first Tab should reach the skip link
      if (shownOnce) main.focus({ preventScroll: true });
      shownOnce = true;
      showHooks.forEach((fn) => fn(route, page));
    }
  }
  function fromHash() {
    let h = location.hash.slice(1);
    try { h = decodeURIComponent(h); } catch (e) { /* keep raw */ }
    if (!h) return show('home');
    if (pages.some((p) => p.dataset.route === h)) return show(h);
    if (h === 'main') { main.focus(); return; }
    const el = document.getElementById(h);
    const page = el && el.closest('.page');
    if (page) return show(page.dataset.route, el);
    show(route || 'home');
  }
  window.addEventListener('hashchange', fromHash);
  // a link to the hash we're already on doesn't fire hashchange, so handle it here
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented) return;
    const h = a.getAttribute('href');
    if (h !== location.hash && !(h === '#home' && !location.hash)) return;
    e.preventDefault();
    closeMenu(false);
    const id = h.slice(1);
    if (pages.some((p) => p.dataset.route === id)) window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
    else { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); }
  });

  /* ---------------- menu and nav ---------------- */
  function openMenu() {
    menu.hidden = false;
    menuBtn.setAttribute('aria-expanded', 'true');
    document.documentElement.style.overflow = 'hidden';
    $('.menu__close', menu).focus();
  }
  function closeMenu(focusBtn = true) {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    document.documentElement.style.overflow = '';
    if (focusBtn) menuBtn.focus();
  }
  menuBtn.addEventListener('click', openMenu);
  $('.menu__close', menu).addEventListener('click', () => closeMenu());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
    if (e.key === 'Tab' && !menu.hidden) {
      const f = $$('a, button', menu);
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ---------------- living backdrops (canvas) ---------------- */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Loop: the infinity loop of twisted fibre strands (from the brand kit's loop backdrop)
  const LOOP = (() => {
    const N = 220, A = 520, S = 1.42, rot = -18 * Math.PI / 180, cr = Math.cos(rot), sr = Math.sin(rot);
    const lem = (t) => { const s = Math.sin(t), c = Math.cos(t), d = 1 + s * s; return [A * c / d, A * s * c / d * 1.25]; };
    const T = new Float32Array(N + 1), bx = new Float32Array(N + 1), by = new Float32Array(N + 1), nx = new Float32Array(N + 1), ny = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const t = 2 * Math.PI * i / N, p = lem(t), q = lem(t + 1e-3);
      const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, nX = -dy / L, nY = dx / L;
      T[i] = t;
      bx[i] = (p[0] * cr - p[1] * sr) * S; by[i] = (p[0] * sr + p[1] * cr) * S;
      nx[i] = (nX * cr - nY * sr) * S; ny[i] = (nX * sr + nY * cr) * S;
    }
    return { N, T, bx, by, nx, ny };
  })();
  function drawLoop(st, t) {
    const { ctx, w, h } = st, [ca, cb, cc] = st.colors, { N, T, bx, by, nx, ny } = LOOP;
    const place = st.canvas.dataset.place || '';
    const k = Math.max(w / 1500, h / 1150);
    const cx = w * (place === 'hero' && w > 980 ? 0.62 : 0.5), cy = h * 0.5;
    const alpha = place === 'soft' ? 0.5 : place === 'hero' ? 0.85 : 1;
    const ph = t * 0.35, strands = 14, mid = (strands - 1) / 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, 2.2 * k);
    for (let s = 0; s < strands; s++) {
      const off = (s - mid) * 7.5;
      ctx.globalAlpha = (0.28 + 0.5 * (1 - Math.abs(s - mid) / mid)) * alpha;
      ctx.strokeStyle = s % 3 ? cb : cc;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const ww = off * (0.55 + 0.45 * Math.cos(2 * T[i] + ph));
        const x = cx + (bx[i] + nx[i] * ww) * k, y = cy + (by[i] + ny[i] * ww) * k;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = ca;
    ctx.lineWidth = Math.max(1.6, 5 * k);
    ctx.beginPath();
    for (let i = 0; i <= N; i++) { const x = cx + bx[i] * k, y = cy + by[i] * k; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
    // a run of light travelling round the loop
    const run = Math.floor(N * 0.14), head = Math.floor(((t * 0.055) % 1) * N);
    ctx.globalAlpha = alpha;
    ctx.lineWidth = Math.max(2.4, 8 * k);
    ctx.beginPath();
    for (let j = 0; j <= run; j++) {
      const i = (head - run + j + N * 2) % N;
      const x = cx + bx[i] * k, y = cy + by[i] * k;
      if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  // Tide: ripples spreading from three drops
  function drawTide(st, t) {
    const { ctx, w, h } = st, [ca, cb, cc] = st.colors;
    const k = Math.max(w, h) / 1200, ox = (w - 1200 * k) / 2, oy = (h - 1200 * k) / 2;
    const ph = t * 0.22, base = Math.floor(ph), fr = ph - base;
    for (const [x0, y0, s] of [[380, 470, 1], [930, 860, 0.8], [1010, 180, 0.6]]) {
      const cx = ox + x0 * k, cy = oy + y0 * k;
      for (let i = 0; i < 48; i++) {
        const u = i + fr, r = s * (18 + 22 * u + 3.5 * u * (u - 1)) * k;
        if (r > 1600 * k) break;
        let op = Math.max(0.08, 0.62 - u * 0.028);
        if (u < 1) op *= u;
        ctx.globalAlpha = op;
        ctx.strokeStyle = (((base - i) % 3) + 3) % 3 ? ca : cb;
        ctx.lineWidth = Math.max(1, Math.max(1.2, 4.2 - u * 0.12) * Math.max(k, 0.45));
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.62, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = cc;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 9 * s * k + 1, 6 * s * k + 1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Leaf: veins that grow in, then carry a slow pulse
  const LEAF = (() => {
    const r = rng(7), P = [[-180, 1260], [300, 860], [760, 420], [1400, -120]];
    const bez = (t) => { const u = 1 - t; return [u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0], u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1]]; };
    const bezd = (t) => { const u = 1 - t; return [3 * u * u * (P[1][0] - P[0][0]) + 6 * u * t * (P[2][0] - P[1][0]) + 3 * t * t * (P[3][0] - P[2][0]), 3 * u * u * (P[1][1] - P[0][1]) + 6 * u * t * (P[2][1] - P[1][1]) + 3 * t * t * (P[3][1] - P[2][1])]; };
    const rib = [];
    for (let i = 0; i <= 80; i++) rib.push(bez(i / 80));
    const secs = [], ters = [];
    for (let k = 1; k < 15; k++) {
      const t = k / 15, [x, y] = bez(t), [dx, dy] = bezd(t), L = Math.hypot(dx, dy), tx = dx / L, ty = dy / L;
      for (const side of [1, -1]) {
        const nX = -ty * side, nY = tx * side, len = 520 + (r() * 140 - 60), pts = [[x, y]];
        for (let j = 1; j <= 40; j++) {
          const s = j / 40, ang = (58 - 34 * s) * Math.PI / 180;
          const vx = Math.cos(ang) * nX + Math.sin(ang) * tx, vy = Math.cos(ang) * nY + Math.sin(ang) * ty;
          const p = pts[pts.length - 1];
          pts.push([p[0] + vx * len / 40, p[1] + vy * len / 40]);
        }
        secs.push({ pts, t, w: 9 - 3 * t });
        for (let j = 4; j < 38; j += 4) {
          const a = pts[j], b = pts[Math.min(j + 2, 40)], dvx = b[0] - a[0], dvy = b[1] - a[1], Lv = Math.hypot(dvx, dvy) || 1, mx = -dvy / Lv, my = dvx / Lv;
          for (const sd of [1, -1]) {
            const ln = 40 + r() * 80;
            const c = [a[0] + mx * sd * ln * 0.5 + dvx / Lv * ln * 0.2, a[1] + my * sd * ln * 0.5 + dvy / Lv * ln * 0.2];
            const e = [a[0] + mx * sd * ln + (r() * 40 - 20), a[1] + my * sd * ln + (r() * 40 - 20)];
            ters.push({ a, c, e, t: t + j / 400 });
          }
        }
      }
    }
    return { rib, secs, ters };
  })();
  function poly(ctx, pts, frac, k, ox, oy) {
    const n = pts.length - 1, upto = frac * n, last = Math.floor(upto);
    ctx.moveTo(ox + pts[0][0] * k, oy + pts[0][1] * k);
    for (let i = 1; i <= last; i++) ctx.lineTo(ox + pts[i][0] * k, oy + pts[i][1] * k);
    if (last < n) {
      const f = upto - last, a = pts[last], b = pts[last + 1];
      ctx.lineTo(ox + (a[0] + (b[0] - a[0]) * f) * k, oy + (a[1] + (b[1] - a[1]) * f) * k);
    }
  }
  function drawLeafStatic(ctx, st, p) {
    const [ca, cb, cc] = st.colors, k = Math.max(st.w, st.h) / 1200, ox = (st.w - 1200 * k) / 2, oy = (st.h - 1200 * k) / 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = cc;
    ctx.lineWidth = Math.max(0.8, 2.4 * k);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (const v of LEAF.ters) {
      const f = clamp((p - 0.45 - 0.4 * v.t) / 0.2, 0, 1);
      if (f <= 0) continue;
      const ex = v.a[0] + (v.e[0] - v.a[0]) * f, ey = v.a[1] + (v.e[1] - v.a[1]) * f;
      const qx = v.a[0] + (v.c[0] - v.a[0]) * f, qy = v.a[1] + (v.c[1] - v.a[1]) * f;
      ctx.moveTo(ox + v.a[0] * k, oy + v.a[1] * k);
      ctx.quadraticCurveTo(ox + qx * k, oy + qy * k, ox + ex * k, oy + ey * k);
    }
    ctx.stroke();
    ctx.strokeStyle = cb;
    ctx.globalAlpha = 0.85;
    for (const v of LEAF.secs) {
      const f = clamp((p - 0.12 - 0.45 * v.t) / 0.35, 0, 1);
      if (f <= 0) continue;
      ctx.lineWidth = Math.max(1, v.w * k);
      ctx.beginPath();
      poly(ctx, v.pts, f, k, ox, oy);
      ctx.stroke();
    }
    ctx.strokeStyle = ca;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(2, 26 * k);
    ctx.beginPath();
    poly(ctx, LEAF.rib, clamp(p / 0.5, 0, 1), k, ox, oy);
    ctx.stroke();
  }
  function drawLeaf(st, t) {
    const { ctx } = st;
    const p = reduced() ? 1 : clamp(t / 4.2, 0, 1);
    if (p < 1) { drawLeafStatic(ctx, st, 1 - Math.pow(1 - p, 2)); return; }
    if (!st.cache || st.cache.width !== st.canvas.width || st.cache.height !== st.canvas.height) {
      st.cache = document.createElement('canvas');
      st.cache.width = st.canvas.width;
      st.cache.height = st.canvas.height;
      const c2 = st.cache.getContext('2d');
      c2.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      drawLeafStatic(c2, st, 1);
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(st.cache, 0, 0);
    ctx.restore();
    if (reduced()) return;
    const k = Math.max(st.w, st.h) / 1200, ox = (st.w - 1200 * k) / 2, oy = (st.h - 1200 * k) / 2;
    ctx.strokeStyle = st.colors[0];
    ctx.globalAlpha = 0.55;
    ctx.lineCap = 'round';
    ctx.setLineDash([26 * k + 4, 150 * k + 30]);
    ctx.lineDashOffset = -t * (70 * k + 12);
    for (const v of LEAF.secs) {
      ctx.lineWidth = Math.max(1.4, (v.w + 3) * k);
      ctx.beginPath();
      poly(ctx, v.pts, 1, k, ox, oy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Weave: a 2/1 twill that drifts slowly, like cloth on a loom
  function drawWeave(st, t) {
    const { ctx, w, h } = st, [warp, weft, fibre] = st.colors;
    const k = Math.max(w, h) / 1200, cell = 60 * k, gap = 6 * k, rad = (cell - gap) / 2;
    const R = Math.hypot(w, h) / 2 + cell * 3, n = Math.ceil(R / cell) + 1;
    const drift = reduced() ? 0 : (t * 16 * k) % (cell * 3);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-12 * Math.PI / 180);
    ctx.globalAlpha = 1;
    const pWeft = new Path2D(), pWarp = new Path2D(), pFib = new Path2D();
    const rr = (p, x, y, ww, hh, r) => { if (p.roundRect) p.roundRect(x, y, ww, hh, r); else p.rect(x, y, ww, hh); };
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        const x = i * cell + drift - cell * 1.5, y = j * cell;
        const over = ((((i + j) % 3) + 3) % 3) !== 0;
        const seed = ((((i % 3) + 3) % 3) * 31 + (((j % 7) + 7) % 7) * 7) % 10;
        const f = 0.3 + seed * 0.04;
        if (over) {
          rr(pWeft, x + k, y + gap / 2, cell - 2 * k, cell - gap, rad);
          const fy = y + gap / 2 + (cell - gap) * f;
          pFib.moveTo(x + 10 * k, fy); pFib.lineTo(x + cell - 10 * k, fy);
        } else {
          rr(pWarp, x + gap / 2, y + k, cell - gap, cell - 2 * k, rad);
          const fx = x + gap / 2 + (cell - gap) * f;
          pFib.moveTo(fx, y + 10 * k); pFib.lineTo(fx, y + cell - 10 * k);
        }
      }
    }
    ctx.fillStyle = warp; ctx.fill(pWarp);
    ctx.fillStyle = weft; ctx.fill(pWeft);
    ctx.strokeStyle = fibre; ctx.lineWidth = Math.max(0.8, 1.6 * k); ctx.lineCap = 'round'; ctx.globalAlpha = 0.55; ctx.stroke(pFib);
    ctx.restore();
  }

  const DRAW = { loop: drawLoop, tide: drawTide, leaf: drawLeaf, weave: drawWeave };
  const living = [];
  // backdrops paint a still frame straight away and start moving once the page has finished loading
  let motionOk = false;
  const letMove = () => { if (motionOk) return; motionOk = true; living.forEach((st) => { if (st.visible) st.start(); }); };
  const afterLoad = () => (window.requestIdleCallback ? requestIdleCallback(letMove, { timeout: 2500 }) : setTimeout(letMove, 1200));
  if (document.readyState === 'complete') afterLoad(); else window.addEventListener('load', afterLoad, { once: true });
  function readColors(el) {
    const cs = getComputedStyle(el);
    return ['--lv-a', '--lv-b', '--lv-c'].map((v) => cs.getPropertyValue(v).trim() || '#127A47');
  }
  function makeLiving(canvas) {
    const st = { canvas, ctx: canvas.getContext('2d'), kind: canvas.dataset.kind, w: 0, h: 0, dpr: 1, visible: false, raf: 0, t0: performance.now(), colors: readColors(canvas), cache: null };
    st.resize = () => {
      const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.round(r.width), h = Math.round(r.height);
      if (!w || !h) return false;
      if (w !== st.w || h !== st.h || dpr !== st.dpr) {
        st.w = w; st.h = h; st.dpr = dpr;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        st.cache = null;
      }
      return true;
    };
    st.paint = (now) => {
      const { ctx } = st;
      ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, st.w, st.h);
      const t = reduced() ? (st.kind === 'leaf' ? 99 : 2) : (now - st.t0) / 1000;
      DRAW[st.kind](st, t);
    };
    st.last = 0;
    st.frame = (now) => {
      st.raf = 0;
      if (!st.visible) return;
      if (now - st.last >= 32) { st.last = now; st.paint(now); }
      if (!reduced() && motionOk) st.raf = requestAnimationFrame(st.frame);
    };
    st.start = () => {
      if (!st.resize()) return;
      if (!st.raf) st.raf = requestAnimationFrame(st.frame);
    };
    st.stop = () => { if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; };
    st.restartGrow = () => { if (st.kind === 'leaf') { st.t0 = performance.now(); st.cache = null; } };
    return st;
  }
  const lvIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const st = en.target._living;
      st.visible = en.isIntersecting;
      if (st.visible) st.start(); else st.stop();
    });
  }, { rootMargin: '80px' });
  const lvRO = new ResizeObserver((entries) => {
    entries.forEach((en) => {
      const st = en.target._living;
      if (st.resize() && st.visible) { st.cache = null; st.paint(performance.now()); }
    });
  });
  $$('canvas.living').forEach((c) => {
    const st = makeLiving(c);
    c._living = st;
    living.push(st);
    lvIO.observe(c);
    lvRO.observe(c);
  });
  function recolor() {
    living.forEach((st) => { st.colors = readColors(st.canvas); st.cache = null; if (st.visible) st.paint(performance.now()); });
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', recolor);
  mqReduce.addEventListener('change', () => living.forEach((st) => { st.stop(); if (st.visible) st.start(); }));
  showHooks.push((r, page) => $$('canvas.living[data-kind="leaf"]', page).forEach((c) => c._living.restartGrow()));

  /* ---------------- hand-drawn loop around a word ---------------- */
  function drawScribble(sp) {
    const svg = $('svg', sp);
    if (!svg) return;
    const w = sp.offsetWidth, h = sp.offsetHeight;
    if (!w || !h) return;
    const fs = parseFloat(getComputedStyle(sp).fontSize) || h;
    // keep the loop inside the screen on narrow layouts
    const box = sp.getBoundingClientRect(), room = Math.max(6, Math.min(box.left, document.documentElement.clientWidth - box.right) - 6);
    const over = Math.min(fs * 0.12, room * 0.45), rx = w / 2 + over, ry = fs * 0.5, padX = over + Math.min(fs * 0.12, room * 0.55), padY = Math.max(ry - h / 2, 0) + fs * 0.12;
    const W = w + padX * 2, H = h + padY * 2, cx = W / 2, cy = H / 2 + fs * 0.05, tilt = -0.045;
    svg.setAttribute('viewBox', '0 0 ' + W.toFixed(1) + ' ' + H.toFixed(1));
    svg.style.width = W + 'px';
    svg.style.height = H + 'px';
    svg.style.left = (-padX) + 'px';
    svg.style.top = (-padY) + 'px';
    const pts = [], n = 96, t0 = 0.55, turns = 1.07;
    for (let i = 0; i <= n; i++) {
      const s = i / n, th = t0 - s * turns * Math.PI * 2, kk = 0.95 + 0.09 * s;
      const x = rx * kk * Math.cos(th), y = ry * kk * Math.sin(th);
      pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
    }
    const end = pts[n - 2], prev = pts[n - 6];
    let ux = end[0] - prev[0], uy = end[1] - prev[1];
    const L = Math.hypot(ux, uy) || 1;
    ux /= L; uy /= L;
    const size = Math.max(9, fs * 0.075), nx = -uy, ny = ux;
    $('path', svg).setAttribute('d', 'M' + pts.slice(0, n - 1).map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L'));
    $('polygon', svg).setAttribute('points', [
      [end[0] + ux * size * 1.25, end[1] + uy * size * 1.25],
      [end[0] + nx * size * 0.75 - ux * size * 0.15, end[1] + ny * size * 0.75 - uy * size * 0.15],
      [end[0] - nx * size * 0.75 - ux * size * 0.15, end[1] - ny * size * 0.75 - uy * size * 0.15]
    ].map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '));
    if (!sp.classList.contains('is-drawn')) requestAnimationFrame(() => requestAnimationFrame(() => sp.classList.add('is-drawn')));
  }
  const scribbleAll = (root = document) => $$('.scribble', root).forEach(drawScribble);
  // fonts arrive late and change the word's width, so redraw whenever a scribbled word resizes
  const scRO = new ResizeObserver((entries) => entries.forEach((en) => { if (en.contentRect.width) drawScribble(en.target); }));
  $$('.scribble').forEach((sp) => scRO.observe(sp));
  showHooks.push((r, page) => {
    $$('.scribble', page).forEach((sp) => sp.classList.remove('is-drawn'));
    requestAnimationFrame(() => scribbleAll(page));
  });

  /* ---------------- the thread ---------------- */
  const threads = $$('svg.thread').map((svg) => ({ svg, sec: svg.parentElement, path: $('path', svg), head: $('.thread__head', svg), sel: svg.dataset.thread, L: 0, ok: false, y0: 0, y1: 0 }));
  function buildThread(th) {
    const box = th.sec.getBoundingClientRect();
    th.ok = false;
    if (!box.width || !box.height) return;
    const pts = $$(th.sel, th.sec).map((el) => { const r = el.getBoundingClientRect(); return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, r: r.width / 2 }; });
    const row = pts.every((p) => Math.abs(p.y - pts[0].y) < 4), col = pts.every((p) => Math.abs(p.x - pts[0].x) < 4);
    if (pts.length < 2 || (!row && !col)) { th.svg.hidden = true; return; }
    th.svg.hidden = false;
    th.svg.setAttribute('viewBox', '0 0 ' + box.width.toFixed(1) + ' ' + box.height.toFixed(1));
    const out = [];
    const first = pts[0], last = pts[pts.length - 1];
    if (row) out.push([-20, first.y]); else out.push([first.x, first.y]);
    pts.forEach((p, i) => {
      out.push([p.x, p.y]);
      const q = pts[i + 1];
      if (!q) return;
      const dx = q.x - p.x, dy = q.y - p.y, D = Math.hypot(dx, dy), ux = dx / D, uy = dy / D, nX = uy, nY = -ux;
      const gap = D - p.r - q.r, R = Math.min(34, gap / 2 - 10);
      if (R < 12) return;
      const mx = p.x + ux * (p.r + gap / 2), my = p.y + uy * (p.r + gap / 2);
      const ccx = mx + nX * R, ccy = my + nY * R, a0 = Math.atan2(-nY, -nX);
      for (let j = 0; j <= 28; j++) {
        const phi = j / 28 * Math.PI * 2, kk = 1 + 0.07 * (j / 28), a = a0 - phi;
        out.push([ccx + Math.cos(a) * R * kk + ux * (j / 28) * 6, ccy + Math.sin(a) * R * kk + uy * (j / 28) * 6]);
      }
    });
    if (row) out.push([box.width + 20, last.y]); else out.push([last.x, last.y + 0.5]);
    th.path.setAttribute('d', 'M' + out.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L'));
    th.L = th.path.getTotalLength();
    th.path.style.strokeDasharray = th.L + ' ' + th.L;
    th.y0 = first.y; th.y1 = last.y;
    th.ok = true;
    updateThread(th);
  }
  function updateThread(th) {
    if (!th.ok) return;
    let p = 1;
    if (!reduced()) {
      const top = th.sec.getBoundingClientRect().top, vh = window.innerHeight;
      p = clamp((vh * 0.82 - (top + th.y0)) / (th.y1 - th.y0 + vh * 0.42), 0, 1);
    }
    const l = th.L * p;
    th.path.style.strokeDashoffset = (th.L - l).toFixed(1);
    if (p <= 0.01 || p >= 0.995) { th.head.style.opacity = '0'; return; }
    const a = th.path.getPointAtLength(l), b = th.path.getPointAtLength(Math.max(0, l - 3));
    const ang = Math.atan2(a.y - b.y, a.x - b.x) * 180 / Math.PI;
    th.head.setAttribute('transform', 'translate(' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + ') rotate(' + ang.toFixed(1) + ')');
    th.head.style.opacity = '1';
  }
  const buildThreads = (root) => threads.forEach((th) => { if (!root || root.contains(th.svg)) buildThread(th); });
  const thRO = new ResizeObserver((entries) => entries.forEach((en) => { const th = threads.find((x) => x.sec === en.target); if (th && en.contentRect.width) buildThread(th); }));
  threads.forEach((th) => thRO.observe(th.sec));
  showHooks.push((r, page) => requestAnimationFrame(() => buildThreads(page)));

  /* ---------------- scroll-driven bits ---------------- */
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      nav.classList.toggle('is-scrolled', window.scrollY > 8);
      threads.forEach(updateThread);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const page = pages.find((p) => !p.hidden);
      scribbleAll(page);
      buildThreads(page);
      placeToday();
      sizeDemos();
    }, 120);
  });

  // one-off reveals: the voucher printing and the footer loop drawing itself
  const once = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      el.classList.add(el.classList.contains('ticket') ? 'is-printing' : 'is-drawn');
      once.unobserve(el);
    });
  }, { threshold: 0.35 });
  $$('.printer .ticket, .foot__loop').forEach((el) => once.observe(el));

  // the brand page's mark draws itself each time the page opens
  showHooks.push((r, page) => {
    const md = $('.markdraw', page);
    if (!md) return;
    md.classList.remove('is-on');
    void md.offsetWidth;
    md.classList.add('is-on');
  });

  /* ---------------- pack-the-bag game ---------------- */
  const game = $('#game');
  if (game) {
    const items = $$('.gitem', game), msg = $('.game__msg', game), fill = $('.game__fill', game), bag = $('.game__bag', game);
    const total = items.filter((b) => b.dataset.ok === '1').length;
    let n = 0;
    let last = ['Your bag is empty.', ''];
    const setMsg = (strong, rest, vars) => {
      last = [strong, rest, vars];
      msg.textContent = '';
      const b = document.createElement('b');
      b.textContent = t(strong, vars);
      msg.append(b, rest ? ' ' + t(rest, vars) : '');
    };
    setMsg('Your bag is empty.', '');
    langHooks.push(() => setMsg(last[0], last[1], last[2]));
    items.forEach((b) => { b.dataset.say0 = b.dataset.say; });
    const fly = (from, done) => {
      if (reduced()) { done(); return; }
      const a = from.getBoundingClientRect(), z = bag.getBoundingClientRect();
      const f = document.createElement('div');
      f.className = 'flyer';
      f.innerHTML = $('svg', from).outerHTML;
      f.style.left = '0px';
      f.style.top = '0px';
      f.style.transform = 'translate(' + (a.left + a.width / 2 - 28) + 'px,' + (a.top + a.height / 2 - 28) + 'px)';
      document.body.appendChild(f);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        f.style.transform = 'translate(' + (z.left + z.width / 2 - 28) + 'px,' + (z.top + z.height * 0.55 - 28) + 'px) scale(0.45)';
        f.style.opacity = '0.2';
      }));
      setTimeout(() => { f.remove(); done(); }, 720);
    };
    items.forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.ok !== '1') {
        b.classList.remove('is-no');
        void b.offsetWidth;
        b.classList.add('is-no');
        setMsg('Keep it out.', b.dataset.say0.replace(/\s*Keep it out\.$/, ''));
        return;
      }
      if (b.classList.contains('is-in') || n >= total) return;
      b.classList.add('is-in');
      b.setAttribute('aria-disabled', 'true');
      fly(b, () => {
        n += 1;
        fill.style.setProperty('--f', (n / total).toFixed(3));
        if (n === total) { game.classList.add('is-full'); setMsg('Bag full.', 'Close the cap, scan it and send it off.'); }
        else setMsg(b.dataset.say0, '{n} of {total} in.', { n, total });
      });
    }));
    $('.game__reset', game).addEventListener('click', () => {
      n = 0;
      fill.style.setProperty('--f', '0');
      game.classList.remove('is-full');
      items.forEach((b) => { b.classList.remove('is-in', 'is-no'); b.removeAttribute('aria-disabled'); });
      setMsg('Your bag is empty.', '');
    });
  }

  /* ---------------- register a bag, with or without the app ---------------- */
  const capform = $('#capform');
  let openRegister = () => false;
  if (capform) {
    const input = $('#capcode'), help = $('#caphelp'), result = $('.capform__result', capform);
    result.setAttribute('aria-live', 'polite');
    const HELP = 'Type the 12 characters printed on the cap.', ERR = "That doesn't look like a cap code yet. It has 12 letters and numbers, without O, I, L or U.";
    const SAMPLE = '4F7K-2M9Q-H8TA';
    let helpKey = HELP, found = null;
    const showHelp = () => { help.textContent = t(helpKey); help.classList.toggle('is-error', helpKey === ERR); };
    showHelp();
    const clean = (v) => v.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-HJKMNP-TV-Z]/g, '').slice(0, 12);
    const fmt = (v) => v.replace(/(.{4})(?=.)/g, '$1-');
    input.addEventListener('input', () => {
      input.value = fmt(clean(input.value));
      if (helpKey !== HELP) { helpKey = HELP; showHelp(); }
    });
    capform.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = clean(input.value);
      if (code.length !== 12) {
        helpKey = ERR;
        showHelp();
        result.hidden = true;
        found = null;
        input.focus();
        return;
      }
      found = { pretty: fmt(code), mail: '', done: false, via: 'form' };
      renderFound(true);
    });
    function renderFound(focusMail) {
      if (!found) return;
      const sample = found.pretty === SAMPLE, open = !sample && !found.done;
      result.innerHTML = '<div class="capform__found"><span class="tile"><svg class="i" aria-hidden="true"><use href="#i-bag-simple"/></svg></span><div><b></b><br><span class="muted"></span></div></div>' +
        (open
          ? '<div class="capform__mail"><label for="capmail"></label><div class="capform__mailrow"><input id="capmail" type="email" placeholder="you@example.com" autocomplete="email" aria-describedby="capmail-note"><button class="btn btn--ink btn--sm" type="button"></button></div><p class="capform__fine" id="capmail-note"></p></div>'
          : '<p class="capform__note"></p>');
      $('b', result).textContent = t('Bag {code}', { code: found.pretty });
      if (sample) {
        $('.muted', result).textContent = t('Already registered, and on its way to Bad Oldesloe.');
        $('.capform__note', result).textContent = t("This is the sample bag from this page. One bag, one owner: a registered bag can't be claimed again.");
      } else if (found.done) {
        $('.muted', result).textContent = t('Registered to {email}.', { email: found.mail });
        const note = $('.capform__note', result);
        note.textContent = t("We'll email your voucher as soon as the carrier scans the bag. This preview doesn't send anything yet.") + ' ';
        const a = document.createElement('a');
        a.href = '#get';
        a.textContent = t('Follow every step in the app');
        note.appendChild(a);
      } else {
        $('.muted', result).textContent = t("Not registered yet. Add your email and it's yours.");
        $('.capform__mail label', result).textContent = t('Your email');
        $('.capform__mail button', result).textContent = t('Register');
        $('#capmail-note', result).textContent = t('We only use your email for this bag and its voucher.');
      }
      result.hidden = false;
      if (!open) return;
      const mail = $('#capmail', result), send = $('.capform__mail button', result);
      if (found.draft) mail.value = found.draft;
      mail.addEventListener('input', () => { found.draft = mail.value; });
      const go = () => {
        const v = mail.value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { mail.focus(); say(t('Add an email address first.')); return; }
        found.mail = v;
        found.done = true;
        track('Bag registered', { via: found.via });
        renderFound(false);
      };
      send.addEventListener('click', go);
      mail.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); go(); } });
      if (focusMail) mail.focus();
    }
    langHooks.push(() => { showHelp(); renderFound(false); });
    openRegister = (raw, via) => {
      const code = clean(String(raw || ''));
      if (code.length !== 12) return false;
      input.value = fmt(code);
      found = { pretty: fmt(code), mail: '', done: false, via };
      renderFound(false);
      return true;
    };
  }

  /* ---------------- follow a piece (tabs) ---------------- */
  $$('.explorer').forEach((ex) => {
    const tabs = $$('[role="tab"]', ex);
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
      if (focus) tab.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (e) => {
        const k = e.key;
        let j = -1;
        if (k === 'ArrowRight' || k === 'ArrowDown') j = (i + 1) % tabs.length;
        if (k === 'ArrowLeft' || k === 'ArrowUp') j = (i - 1 + tabs.length) % tabs.length;
        if (k === 'Home') j = 0;
        if (k === 'End') j = tabs.length - 1;
        if (j >= 0) { e.preventDefault(); select(tabs[j], true); }
      });
    });
  });

  /* ---------------- app tour arrows ---------------- */
  $$('[data-tour]').forEach((b) => b.addEventListener('click', () => {
    const tour = $('.tour', b.closest('.sec'));
    const fig = $('figure', tour);
    tour.scrollBy({ left: Number(b.dataset.tour) * (fig.offsetWidth + 24) * 2, behavior: reduced() ? 'auto' : 'smooth' });
  }));

  /* ---------------- story ad ---------------- */
  const story = $('#story-ad');
  if (story) {
    const toggle = $('[data-story="toggle"]'), replay = $('[data-story="replay"]');
    const restart = () => {
      $$('.story__scene, .story__drop, .story__voucher', story).forEach((el) => { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; });
      story.classList.remove('is-paused');
      label();
    };
    const label = () => {
      const paused = story.classList.contains('is-paused');
      toggle.textContent = t(paused ? 'Play' : 'Pause');
      toggle.setAttribute('aria-pressed', String(paused));
    };
    toggle.addEventListener('click', () => { story.classList.toggle('is-paused'); label(); });
    langHooks.push(label);
    replay.addEventListener('click', restart);
    showHooks.push((r) => { if (r === 'campaign') restart(); });
  }

  /* ---------------- English / Deutsch for the ads ---------------- */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.langswitch button');
    if (!b) return;
    const box = b.closest('[data-lang]');
    if (!box) return;
    box.dataset.lang = b.dataset.set;
    $$('.langswitch button', box).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.set === b.dataset.set)));
    $$('.scribble', box).forEach((sp) => { sp.classList.remove('is-drawn'); drawScribble(sp); });
  });

  /* ---------------- regulation timeline: what's past, where today is ---------------- */
  function placeToday() {
    $$('.regline').forEach((reg) => {
      const items = $$('.regline__items li', reg), today = $('.regline__today', reg), now = Date.now();
      const times = items.map((li) => Date.parse($('time', li).getAttribute('datetime')));
      items.forEach((li, i) => li.classList.toggle('is-past', times[i] <= now));
      const cols = getComputedStyle($('.regline__items', reg)).gridTemplateColumns.split(' ').length;
      const i = times.findIndex((t) => t > now);
      if (cols < items.length || i <= 0 || !reg.offsetWidth) { today.hidden = true; return; }
      const a = items[i - 1], b = items[i], f = (now - times[i - 1]) / (times[i] - times[i - 1]);
      today.style.left = (a.offsetLeft + (b.offsetLeft - a.offsetLeft) * f).toFixed(1) + 'px';
      today.hidden = false;
    });
  }
  showHooks.push((r) => { if (r === 'brands') requestAnimationFrame(placeToday); });

  /* ---------------- brand contact form ---------------- */
  const bform = $('#brandform');
  if (bform) {
    $$('.chip', bform).forEach((c) => c.addEventListener('click', () => c.setAttribute('aria-pressed', String(c.getAttribute('aria-pressed') !== 'true'))));
    const note = $('#bf-note'), done = bform.nextElementSibling;
    let noteKey = "This is a preview, so the form doesn't send anything yet.", sent = null;
    const paint = () => {
      note.textContent = t(noteKey);
      if (sent) {
        $('b', done).textContent = t('Thanks, {name}.', { name: sent.name });
        $('.formdone__msg', done).textContent = t('At launch, this goes straight to the Artus partnerships team and they reply to {email}. This preview keeps it in your browser, so nothing was sent.', { email: sent.email });
      }
    };
    paint();
    langHooks.push(paint);
    bform.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#bf-name').value.trim(), company = $('#bf-company').value.trim(), email = $('#bf-email').value.trim();
      if (!name || !company || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        noteKey = 'Please add your name, company and a work email.';
        paint();
        (!name ? $('#bf-name') : !company ? $('#bf-company') : $('#bf-email')).focus();
        return;
      }
      sent = { name: name.split(' ')[0], email };
      track('Pilot requested', { start: $$('.chip[aria-pressed="true"]', bform).map((c) => c.dataset.v).join('+') || 'none' });
      paint();
      bform.hidden = true;
      done.hidden = false;
      done.focus();
    });
  }

  /* ---------------- type playground ---------------- */
  const tpOut = $('.typeplay__out');
  if (tpOut) new IntersectionObserver((en, obs) => { if (en[0].isIntersecting) { tpOut.classList.add('is-full'); obs.disconnect(); } }, { rootMargin: '400px' }).observe(tpOut);
  if (tpOut) {
    const w = $('#tp-w'), s = $('#tp-s'), o = $('#tp-o');
    const apply = () => {
      tpOut.style.fontVariationSettings = '"wght" ' + w.value + ', "wdth" ' + s.value + ', "opsz" ' + o.value;
      $('#tp-wo').textContent = w.value;
      $('#tp-so').textContent = s.value;
      $('#tp-oo').textContent = o.value;
    };
    [w, s, o].forEach((el) => el.addEventListener('input', apply));
    apply();
  }

  /* ---------------- breakup letter maker ---------------- */
  const LT = {
    pieces: {
      jeans: { icon: 'pants',
        en: { hi: 'Dear jeans,', honest0: "It's not you. It's the waist.",
          mem: ['you were there for every first date, every festival and that one wedding where I sat down too fast.', 'you survived three moves, two bikes and a lot of curry.', 'we broke you in together. It took two years and one bathtub.'],
          fut: ['Somewhere out there is a waist that fits you better. Go and find it.', "Someone is about to have the best denim year of their life. Thanks to you."] },
        de: { hi: 'Liebe Jeans,', honest0: 'Es liegt nicht an dir. Es liegt am Bund.',
          mem: ['du warst bei jedem ersten Date dabei, bei jedem Festival und auf dieser einen Hochzeit, auf der ich mich zu schnell hingesetzt habe.', 'du hast drei Umzüge, zwei Fahrräder und sehr viel Curry überlebt.', 'wir haben dich zusammen eingetragen. Es hat zwei Jahre gedauert und eine Badewanne.'],
          fut: ['Irgendwo da draußen gibt es einen Bund, der besser zu dir passt. Geh ihn suchen.', 'Jemand hat gleich das beste Jeans-Jahr seines Lebens. Dank dir.'] } },
      hoodie: { icon: 'hoodie',
        en: { hi: 'Dear hoodie,',
          mem: ['you were there for every exam, every breakup and every Sunday.', 'you were my blanket on trains, my pillow at festivals and my armour on Mondays.', 'you kept every secret I told you at 2 a.m.'],
          fut: ['Someone else needs a hug that lasts all winter.', "There's a cold bus stop somewhere with your name on it."] },
        de: { hi: 'Lieber Hoodie,',
          mem: ['du warst bei jeder Prüfung dabei, bei jeder Trennung und an jedem Sonntag.', 'du warst meine Decke im Zug, mein Kissen auf Festivals und meine Rüstung an Montagen.', 'du kennst jedes Geheimnis, das ich dir um zwei Uhr nachts erzählt habe.'],
          fut: ['Jemand anderes braucht eine Umarmung, die den ganzen Winter hält.', 'Irgendwo wartet eine kalte Bushaltestelle auf dich.'] } },
      sneakers: { icon: 'sneaker',
        en: { hi: 'Dear sneakers,',
          mem: ['we ran for trains, for buses and once, very briefly, for fitness.', "you carried me through 4,000 steps a day and one marathon I don't talk about.", 'you went everywhere I went. The puddles too. Sorry about the puddles.'],
          fut: ["There's a second run in you. Someone is ready to take it.", 'Somebody out there is about to walk a lot further, thanks to you.'] },
        de: { hi: 'Liebe Sneaker,', pl: true,
          mem: ['wir sind Zügen hinterhergerannt, Bussen und einmal, sehr kurz, der Fitness.', 'ihr habt mich durch 4.000 Schritte am Tag getragen und durch einen Marathon, über den ich nicht rede.', 'ihr wart überall dabei, wo ich war. Auch in den Pfützen. Sorry wegen der Pfützen.'],
          fut: ['In euch steckt noch ein zweiter Lauf. Jemand ist bereit dafür.', 'Jemand da draußen kommt bald viel weiter, dank euch.'] } },
      dress: { icon: 'dress',
        en: { hi: 'Dear party dress,',
          mem: ['you were worn twice, photographed once and talked about for years.', 'you danced through a wedding, two birthdays and one very long night in Hamburg.', 'you made every entrance. I just followed you in.'],
          fut: ['You still have Saturdays ahead. Just not with me.', "Someone's next big night needs exactly you."] },
        de: { hi: 'Liebes Partykleid,',
          mem: ['du wurdest zweimal getragen, einmal fotografiert und jahrelang erwähnt.', 'du hast eine Hochzeit durchgetanzt, zwei Geburtstage und eine sehr lange Nacht in Hamburg.', 'du hattest jeden großen Auftritt. Ich bin nur hinter dir reingegangen.'],
          fut: ['Du hast noch viele Samstage vor dir. Nur nicht mit mir.', 'Die nächste große Nacht von jemandem braucht genau dich.'] } },
      jacket: { icon: 'jacket',
        en: { hi: 'Dear jacket,',
          mem: ['you kept me dry through every Hamburg summer.', 'you held my keys, my tickets and a surprising number of receipts.', 'you were there for every rainy walk home, and you never asked questions.'],
          fut: ["Somebody's first winter in a new city is waiting for you.", "Your pockets have room for someone else's stories."] },
        de: { hi: 'Liebe Jacke,',
          mem: ['du hast mich durch jeden Hamburger Sommer trocken gebracht.', 'du hast meine Schlüssel getragen, meine Tickets und erstaunlich viele Kassenbons.', 'du warst auf jedem verregneten Heimweg dabei und hast nie Fragen gestellt.'],
          fut: ['Der erste Winter von jemandem in einer neuen Stadt wartet auf dich.', 'In deinen Taschen ist Platz für die Geschichten von jemand anderem.'] } },
      tee: { icon: 't-shirt',
        en: { hi: 'Dear T-shirt,',
          mem: ['you were the free one from that concert, and somehow the best thing I own.', 'you were washed a thousand times and never once complained.', "you've been with me since the band was still good."],
          fut: ["Maybe you'll be new fibre one day. Or someone else's favourite.", "Even worn thin, there might be another life in you."] },
        de: { hi: 'Liebes T-Shirt,',
          mem: ['du warst das Gratis-Shirt von diesem Konzert und irgendwie das Beste, was ich besitze.', 'du wurdest tausendmal gewaschen und hast dich nie beschwert.', 'du bist bei mir, seit die Band noch gut war.'],
          fut: ['Vielleicht wirst du eines Tages neue Faser. Oder das Lieblingsshirt von jemand anderem.', 'Auch dünn gewaschen steckt in dir vielleicht noch ein zweites Leben.'] } },
      socks: { icon: 'sock',
        en: { hi: 'Dear socks,',
          mem: ['you went through every washing machine together. Except that one time.', 'you kept my feet warm through every Monday meeting.', "you were never a matching pair, and that's what I loved about you."],
          fut: ['Even socks deserve a proper goodbye.', 'Maybe insulation, maybe a cleaning cloth, maybe new fibre. Glow-up.'] },
        de: { hi: 'Liebe Socken,', pl: true,
          mem: ['ihr seid zusammen durch jede Waschmaschine gegangen. Bis auf das eine Mal.', 'ihr habt meine Füße durch jedes Montagsmeeting gewärmt.', 'ihr wart nie ein passendes Paar, und genau das habe ich an euch geliebt.'],
          fut: ['Auch Socken haben einen richtigen Abschied verdient.', 'Vielleicht Dämmstoff, vielleicht Putztuch, vielleicht neue Faser. Glow-up.'] } }
    },
    tones: {
      en: {
        grateful: { close: 'Thank you for everything,', lines: ['You gave me more than I ever gave you back.', "I'll always be grateful for the years we had.", 'You made a lot of ordinary days feel good.'] },
        dramatic: { close: 'Forever yours (just not in my wardrobe),', lines: ["This is the hardest letter I've ever written. In the hallway. Next to the bag.", "I'm not crying. It's the fabric softener.", 'Some loves are too big for one wardrobe.'] },
        honest: { close: 'No hard feelings,', lines: ["It's not you. It's me. And, honestly, the fit.", "We both know it's been over since that last wash.", "Let's be honest, you haven't seen daylight in two years."] }
      },
      de: {
        grateful: { close: 'Danke für alles,', lines: [{ du: 'Du hast mir mehr gegeben, als ich dir je zurückgeben konnte.', ihr: 'Ihr habt mir mehr gegeben, als ich euch je zurückgeben konnte.' }, { du: 'Ich werde dir für diese Jahre immer dankbar sein.', ihr: 'Ich werde euch für diese Jahre immer dankbar sein.' }, { du: 'Mit dir haben sich ganz normale Tage gut angefühlt.', ihr: 'Mit euch haben sich ganz normale Tage gut angefühlt.' }] },
        dramatic: { close: 'In ewiger Liebe (nur nicht im Schrank),', lines: ['Das ist der schwerste Brief, den ich je geschrieben habe. Im Flur. Neben dem Beutel.', 'Ich weine nicht. Das ist der Weichspüler.', 'Manche Lieben sind zu groß für einen Kleiderschrank.'] },
        honest: { close: 'Nichts für ungut,', lines: [{ du: 'Es liegt nicht an dir. Es liegt an mir. Und ehrlich gesagt an der Passform.', ihr: 'Es liegt nicht an euch. Es liegt an mir. Und ehrlich gesagt an der Passform.' }, 'Wir wissen beide, dass es seit der letzten Wäsche vorbei ist.', { du: 'Mal ehrlich, du hast seit zwei Jahren kein Tageslicht gesehen.', ihr: 'Mal ehrlich, ihr habt seit zwei Jahren kein Tageslicht gesehen.' }] }
      }
    },
    me: { en: 'me', de: 'ich' },
    since: { en: 'Together since {y}', de: 'Zusammen seit {y}' },
    sign: { en: "It's not goodbye.", de: 'Kein Abschied.' },
    tag: { en: '#notgoodbye', de: '#keinAbschied' }
  };
  const letterSec = $('#letter');
  if (letterSec) {
    const card = $('.lettercard', letterSec), body = $('.lettercard__body', card), tag = $('.lettercard__tag', card), sign = $('.lettercard__sign', card), stampUse = $('.lettercard__stamp use', card);
    const nameIn = $('#lt-name', letterSec), yearIn = $('#lt-year', letterSec);
    const st = { piece: 'jeans', tone: 'grateful', m: 0, l: 0, f: 0 };
    const pick = (n, not) => { let v = Math.floor(Math.random() * n); if (n > 1 && v === not) v = (v + 1) % n; return v; };
    const ltLang = () => { const box = letterSec.closest('[data-lang]'); return box && box.dataset.lang === 'de' ? 'de' : 'en'; };
    const parts = () => {
      const L = ltLang(), P = LT.pieces[st.piece][L], T = LT.tones[L][st.tone];
      let tone = T.lines[st.l % T.lines.length];
      if (st.tone === 'honest' && st.l % T.lines.length === 0 && P.honest0) tone = P.honest0;
      if (typeof tone === 'object') tone = P.pl ? tone.ihr : tone.du;
      const y = yearIn.value.trim(), now = new Date().getFullYear();
      const year = /^\d{4}$/.test(y) && +y >= 1950 && +y <= now ? y : '';
      return { hi: P.hi, since: year ? LT.since[L].replace('{y}', year) : '', mem: P.mem[st.m % P.mem.length], tone, fut: P.fut[st.f % P.fut.length],
        close: T.close, name: nameIn.value.trim() || LT.me[L], sign: LT.sign[L], tag: LT.tag[L] };
    };
    const fit = () => {
      let size = 5.4;
      body.style.setProperty('--lc', size + 'cqw');
      while (body.clientHeight && body.scrollHeight > body.clientHeight + 1 && size > 3.2) {
        size -= 0.2;
        body.style.setProperty('--lc', size.toFixed(1) + 'cqw');
      }
    };
    const render = (animate) => {
      const p = parts();
      body.textContent = '';
      const add = (cls, text) => { const el = document.createElement('p'); if (cls) el.className = cls; el.textContent = text; body.appendChild(el); return el; };
      add('lc-hi', p.hi);
      if (p.since) add('lc-since', p.since);
      add('', p.mem);
      add('', p.tone);
      add('', p.fut);
      const c = add('lc-close', p.close), b = document.createElement('b');
      b.textContent = p.name;
      c.appendChild(b);
      tag.textContent = p.tag;
      sign.textContent = p.sign;
      stampUse.setAttribute('href', '#i-' + LT.pieces[st.piece].icon);
      fit();
      if (animate && !reduced()) { card.classList.remove('is-new'); void card.offsetWidth; card.classList.add('is-new'); }
    };
    $$('[data-pick]', letterSec).forEach((group) => group.addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      $$('.chip', group).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      if (group.dataset.pick === 'piece') { st.piece = b.dataset.v; st.m = pick(3, -1); st.f = pick(2, -1); }
      else { st.tone = b.dataset.v; st.l = pick(3, -1); }
      render(true);
    }));
    [nameIn, yearIn].forEach((el) => el.addEventListener('input', () => render(false)));
    const text = () => {
      const p = parts();
      return [p.hi, p.since, p.mem, p.tone, p.fut, '', p.close, p.name, '', p.sign + ' ' + p.tag].filter((v, i) => v || i === 5 || i === 8).join('\n');
    };
    const drawPNG = async () => {
      const p = parts(), W = 1080, H = 1350, pad = 92, maxW = W - pad * 2;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const x = c.getContext('2d');
      try { await Promise.all(['italic 500 40px Figtree', '600 40px Figtree', '760 40px "Bricolage Grotesque"', '500 24px "DM Mono"'].map((f) => document.fonts.load(f))); } catch (e) { /* draw with what we have */ }
      const stretch = (v) => { if ('fontStretch' in x) x.fontStretch = v; };
      x.fillStyle = '#F5F3EC';
      x.fillRect(0, 0, W, H);
      // stamp with the piece of clothing
      x.save();
      x.translate(W - pad - 82, pad + 96);
      x.rotate(6 * Math.PI / 180);
      x.fillStyle = '#C6F07A';
      x.beginPath();
      if (x.roundRect) x.roundRect(-82, -98, 164, 196, 18); else x.rect(-82, -98, 164, 196);
      x.fill();
      x.setLineDash([10, 8]);
      x.strokeStyle = 'rgba(15,42,29,0.4)';
      x.lineWidth = 4;
      x.beginPath();
      if (x.roundRect) x.roundRect(-64, -80, 128, 160, 10); else x.rect(-64, -80, 128, 160);
      x.stroke();
      x.setLineDash([]);
      const sym = document.getElementById('i-' + LT.pieces[st.piece].icon);
      if (sym) {
        x.save();
        x.translate(-50, -50);
        x.scale(100 / 256, 100 / 256);
        $$('path', sym).forEach((pe) => {
          const path = new Path2D(pe.getAttribute('d'));
          if (pe.getAttribute('fill') === 'none') {
            x.strokeStyle = '#0F2A1D';
            x.lineWidth = +(pe.getAttribute('stroke-width') || 16);
            x.lineCap = 'round';
            x.lineJoin = 'round';
            x.stroke(path);
          } else {
            x.fillStyle = '#0F2A1D';
            x.fill(path);
          }
        });
        x.restore();
      }
      x.restore();
      x.fillStyle = '#5E6A63';
      x.font = '500 30px "DM Mono", monospace';
      x.fillText(p.tag, pad, pad + 26);
      // the letter, sized to fit
      const wrap = (str, font, cond) => {
        x.font = font;
        stretch(cond ? 'condensed' : 'normal');
        const lines = [];
        let line = '';
        str.split(' ').forEach((w) => {
          const test = line ? line + ' ' + w : w;
          if (line && x.measureText(test).width > maxW) { lines.push(line); line = w; } else line = test;
        });
        if (line) lines.push(line);
        return lines;
      };
      const top = pad + 236, bottom = H - pad - 150;
      let s = 50, blocks;
      for (; s >= 30; s -= 2) {
        blocks = [];
        blocks.push({ lines: wrap(p.hi, '760 ' + (s * 2) + 'px "Bricolage Grotesque", sans-serif', true), font: '760 ' + (s * 2) + 'px "Bricolage Grotesque", sans-serif', lh: s * 1.95, cond: true, gap: s * 0.5 });
        if (p.since) blocks.push({ lines: wrap(p.since.toUpperCase(), '500 ' + Math.round(s * 0.62) + 'px "DM Mono", monospace'), font: '500 ' + Math.round(s * 0.62) + 'px "DM Mono", monospace', lh: s * 0.8, color: '#5E6A63', gap: s * 0.6 });
        [p.mem, p.tone, p.fut, p.close].forEach((str) => blocks.push({ lines: wrap(str, 'italic 500 ' + s + 'px Figtree, sans-serif'), font: 'italic 500 ' + s + 'px Figtree, sans-serif', lh: s * 1.36, gap: s * 0.7 }));
        blocks.push({ lines: wrap(p.name, '720 ' + Math.round(s * 1.6) + 'px "Bricolage Grotesque", sans-serif', true), font: '720 ' + Math.round(s * 1.6) + 'px "Bricolage Grotesque", sans-serif', lh: s * 1.6, cond: true, gap: 0 });
        blocks[blocks.length - 2].gap = s * 0.2;
        const total = blocks.reduce((h, b) => h + b.lines.length * b.lh + b.gap, 0);
        if (total <= bottom - top) break;
      }
      let y = top;
      blocks.forEach((b) => {
        x.font = b.font;
        stretch(b.cond ? 'condensed' : 'normal');
        x.fillStyle = b.color || '#0F1F17';
        b.lines.forEach((ln) => { y += b.lh; x.fillText(ln, pad, y - b.lh * 0.22); });
        y += b.gap;
      });
      // footer: the line, the sign-off and the mark
      x.fillStyle = '#0F1F17';
      x.fillRect(pad, H - pad - 112, maxW, 5);
      x.font = '760 72px "Bricolage Grotesque", sans-serif';
      stretch('condensed');
      x.fillText(p.sign, pad, H - pad - 14);
      stretch('normal');
      x.save();
      x.translate(W - pad - 92, H - pad - 92);
      x.scale(0.92, 0.92);
      x.strokeStyle = '#127A47';
      x.fillStyle = '#127A47';
      x.lineWidth = 10;
      x.lineCap = 'round';
      x.lineJoin = 'round';
      x.stroke(new Path2D('M43.5 30 L43.5 79 A6.5 6.5 0 0 0 50 85.5 A35.5 35.5 0 0 0 50.62 14.51 A35.5 35.5 0 0 0 24.46 74.66'));
      x.stroke(new Path2D('M31.5 38.5 L58.5 38.5'));
      const arrow = new Path2D('M16.37 82.48 L34.54 85.09 L32.56 66.85 Z');
      x.lineWidth = 3;
      x.fill(arrow);
      x.stroke(arrow);
      x.restore();
      return new Promise((res) => c.toBlob(res, 'image/png'));
    };
    // the viewer's own save prompt inside claude.ai; a plain download anywhere else
    const dlReady = window.claude && typeof window.claude.use === 'function' ? window.claude.use('downloads').catch(() => null) : Promise.resolve(undefined);
    const saveBtn = $('[data-letter="save"]', letterSec);
    dlReady.then((dl) => { if (dl === null) saveBtn.hidden = true; });
    letterSec.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-letter]');
      if (!b) return;
      const act = b.dataset.letter;
      if (act === 'shuffle') { st.m = pick(3, st.m); st.l = pick(3, st.l); st.f = pick(2, st.f); render(true); }
      if (act === 'copy') {
        const ok = await copyText(text());
        say(ok ? t('Letter copied.') : t('Copying is blocked here. Select the text instead.'));
        if (ok) track('Letter saved', { how: 'text', piece: st.piece });
      }
      if (act === 'save') {
        const blob = await drawPNG();
        const filename = 'tcycled-letter-' + st.piece + '.png';
        const dl = await dlReady;
        if (dl) {
          try { await dl.save({ filename, data: blob }); track('Letter saved', { how: 'image', piece: st.piece }); } catch (err) { if (err && err.code !== 'declined') say(t('Saving is not available here.')); }
          return;
        }
        if (dl === null) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        track('Letter saved', { how: 'image', piece: st.piece });
      }
    });
    // the letter follows the ad language of its page
    new MutationObserver(() => render(false)).observe(letterSec.closest('[data-lang]'), { attributes: true, attributeFilter: ['data-lang'] });
    new ResizeObserver(() => fit()).observe(card);
    if (document.fonts) {
      document.fonts.addEventListener('loadingdone', () => fit());
      document.fonts.ready.then(() => fit());
    }
    // measure again once the page is on screen and its fonts have settled
    showHooks.push((r) => { if (r === 'campaign') [60, 400, 1200].forEach((ms) => setTimeout(fit, ms)); });
    langHooks.push(() => render(false));
    render(false);
  }

  /* ---------------- the clickable app ---------------- */
  const tryFrame = $('.tryapp__frame');
  if (tryFrame) {
    const sec = tryFrame.closest('.sec'), nowEl = $('.tryapp__screen', sec), chips = $$('[data-go]', sec);
    let loaded = false, appUrl = null;
    const target = (b) => (lang === 'de' && b.dataset.goDe) || b.dataset.go;
    const outside = () => ({ tcOutside: t('In the real app, this opens outside the app.') });
    const load = (screen) => {
      if (loaded) return;
      loaded = true;
      const inline = document.getElementById('tc-app-src');
      if (inline) appUrl = URL.createObjectURL(new Blob([inline.textContent.split('<\\/scr' + 'ipt').join('<' + '/scr' + 'ipt')], { type: 'text/html' }));
      tryFrame.src = (appUrl || tryFrame.dataset.src) + '#' + (screen || (lang === 'de' ? 'HomeDE' : 'Home'));
    };
    new IntersectionObserver((en, obs) => { if (en[0].isIntersecting) { load(); obs.disconnect(); } }, { rootMargin: '600px' }).observe(tryFrame);
    chips.forEach((b) => b.addEventListener('click', () => {
      if (!loaded) load(target(b));
      else if (tryFrame.contentWindow) tryFrame.contentWindow.postMessage({ tcGo: target(b) }, '*');
    }));
    window.addEventListener('message', (e) => {
      if (e.source !== tryFrame.contentWindow || !e.data || e.data.tcApp !== 'screen') return;
      nowEl.textContent = String(e.data.title).split(' · ')[0];
      chips.forEach((b) => b.classList.toggle('is-on', b.dataset.go === e.data.screen || b.dataset.goDe === e.data.screen));
      tryFrame.contentWindow.postMessage(outside(), '*');
    });
    langHooks.push(() => { if (loaded && tryFrame.contentWindow) tryFrame.contentWindow.postMessage(outside(), '*'); });
  }

  /* ---------------- scrollable strips: reachable by keyboard only while they actually scroll ---------------- */
  function markScrollers() {
    $$('.fan, .diagram, .tablewrap, pre.codeblock').forEach((el) => {
      const scrolls = el.scrollWidth > el.clientWidth + 2;
      if (scrolls) {
        el.tabIndex = 0;
        if (!el.hasAttribute('role')) el.setAttribute('role', 'region');
        if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', t(el.dataset.label || 'Scrollable content'));
      } else if (el.tabIndex === 0) {
        el.removeAttribute('tabindex');
        if (el.getAttribute('role') === 'region') el.removeAttribute('role');
      }
    });
  }
  window.addEventListener('resize', markScrollers);
  showHooks.push(() => requestAnimationFrame(markScrollers));
  langHooks.push(() => $$('.fan, .diagram, .tablewrap, pre.codeblock').forEach((el) => { if (el.dataset.label && el.hasAttribute('aria-label')) el.setAttribute('aria-label', t(el.dataset.label)); }));

  /* ---------------- small things ---------------- */
  $$('[data-soon]').forEach((b) => b.addEventListener('click', () => say(t('The app goes live with the campaign. Store links follow then.'))));
  function sizeDemos() {
    $$('.mdemo__stage').forEach((st) => { const ball = $('.mdemo__ball', st); if (ball) ball.style.setProperty('--w', st.clientWidth + 'px'); });
  }
  showHooks.push((r) => { if (r === 'brand') requestAnimationFrame(sizeDemos); });

  /* ---------------- start ---------------- */
  let startLang = '';
  try { startLang = localStorage.getItem('tc-lang') || ''; } catch (e) { startLang = ''; }
  if (!startLang) startLang = window.__TC_SRC ? SRC : String((navigator.languages && navigator.languages[0]) || navigator.language || 'en').toLowerCase().indexOf('de') === 0 ? 'de' : 'en';
  const qLang = (qs.get('lang') || '').toLowerCase();
  if (qLang === 'de' || qLang === 'en') startLang = qLang;
  // the paid headline test: ?h=b shows the plain headline, anything else the campaign line
  if (visit.variant === 'b') $$('[data-hv]').forEach((h) => { h.hidden = h.dataset.hv !== 'b'; });
  setLang(startLang);
  // a phone camera on the bag's cap opens tcycled.de/b/<code>, which redirects here as ?b=<code>
  if (qs.get('b') && openRegister(qs.get('b'), 'cap')) {
    if (!visit.placement) { visit.placement = 'cap'; visit.channel = 'bag'; }
    if (location.hash !== '#register') { try { history.replaceState(null, '', location.pathname + location.search + '#register'); } catch (e) { location.hash = 'register'; } }
  }
  fromHash();
  onScroll();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      const page = pages.find((p) => !p.hidden);
      scribbleAll(page);
      buildThreads(page);
      placeToday();
    });
  }
})();
