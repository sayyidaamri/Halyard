/* HALYARD — all behaviour, vanilla JS, no dependencies. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var sub = null;
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mobile = function () { return innerWidth <= 767; };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var store = { get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }, del: function (k) { try { sessionStorage.removeItem(k); } catch (e) {} } };

  /* ---------- easing + tween ---------- */
  var E = {
    none: function (t) { return t; },
    p1: function (t) { return 1 - (1 - t) * (1 - t); },
    p4: function (t) { return 1 - Math.pow(1 - t, 5); },
    p4io: function (t) { return t < .5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2; },
    expo: function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    expoio: function (t) { return t <= 0 ? 0 : t >= 1 ? 1 : t < .5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2; }
  };
  var tweens = [];
  function tween(o) {
    var t = { d: (o.d || 1) * 1000, delay: (o.delay || 0) * 1000, ease: o.ease || E.p4, up: o.up, done: o.done, start: performance.now(), dead: false, kill: function () { t.dead = true; } };
    if (reduced) { o.up && o.up(1); o.done && setTimeout(o.done, 0); t.dead = true; return t; }
    if (o.init !== false) t.up(t.ease(0));
    tweens.push(t);
    return t;
  }
  function runTweens(now) {
    for (var i = tweens.length - 1; i >= 0; i--) {
      var t = tweens[i];
      if (t.dead) { tweens.splice(i, 1); continue; }
      var p = (now - t.start - t.delay) / t.d;
      if (p < 0) continue;
      if (p >= 1) { tweens.splice(i, 1); t.dead = true; t.up(1); t.done && t.done(); }
      else t.up(t.ease(p));
    }
  }
  function wait(s, f) { var id = setTimeout(f, reduced ? 0 : s * 1000); return { kill: function () { clearTimeout(id); } }; }

  /* ---------- smooth wheel scrolling ----------
     One continuous damped follow instead of a new tween per wheel event, so speed never jumps.
     RATE reproduces an .82 s expo-out: 10 * ln2 / .82. */
  var RATE = 8.45, VH = innerHeight, VW = innerWidth;
  var S = { on: true, target: scrollY, cur: scrollY, mid: scrollY, active: false, wrote: scrollY, max: 0 };
  function stopScroll() { S.active = false; S.target = S.mid = S.cur = scrollY; }
  function scrollTo_(y) {
    if (!S.active) S.mid = S.cur = scrollY;
    S.max = root.scrollHeight - innerHeight;
    S.target = clamp(y, 0, S.max);
    if (reduced) { window.scrollTo(0, S.target); return; }
    S.active = true;
  }
  function runScroll(dt) {
    if (!S.active) return;
    S.mid += (S.target - S.mid) * (1 - Math.exp(-26 * dt)); /* softens each wheel notch */
    S.cur += (S.mid - S.cur) * (1 - Math.exp(-(RATE + 3) * dt));
    if (Math.abs(S.target - S.cur) < .3) { S.cur = S.target; S.active = false; }
    window.scrollTo(0, S.cur);
    S.wrote = scrollY;
  }
  /* scrollbar drag, find-in-page, etc.: hand control back to the browser */
  addEventListener("scroll", function () { if (S.active && Math.abs(scrollY - S.wrote) > 3) stopScroll(); }, { passive: true });
  addEventListener("wheel", function (e) {
    if (e.ctrlKey || reduced) return;
    var inner = e.target.closest && e.target.closest(".sub-inner,textarea,select");
    if (inner && inner.scrollHeight > inner.clientHeight + 1) return;
    if (e.cancelable) e.preventDefault();
    if (!S.on || (sub && sub.classList.contains("is-open"))) return;
    var dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? VH : 1);
    if (!dy) return;
    scrollTo_((S.active ? S.target : scrollY) + dy);
  }, { passive: false });
  addEventListener("keydown", stopScroll);
  addEventListener("pointerdown", function (e) { if (e.pointerType === "touch") stopScroll(); }, { passive: true });

  /* ---------- scroll-linked timelines ---------- */
  function top(el) { var y = 0; while (el) { y += el.offsetTop; el = el.offsetParent; } return y; }
  var links = [];
  function link(o) { links.push(o); }
  function measure() { links.forEach(function (l) { l.measure(l); l.last = null; }); }
  function runLinks(dt) {
    var y = scrollY;
    for (var i = 0; i < links.length; i++) {
      var l = links[i];
      var p = clamp((y - l.a) / ((l.b - l.a) || 1), 0, 1);
      if (l.smooth) { l.cur = l.cur == null ? p : l.cur + (p - l.cur) * (1 - Math.exp(-l.smooth * dt)); if (Math.abs(l.cur - p) < .0004) l.cur = p; p = l.cur; }
      if (p !== l.last) { l.last = p; l.up(p); }
    }
  }
  /* order matters: move the page first, then everything that depends on the position, in the same frame */
  var ticks = [], lastT = performance.now();
  requestAnimationFrame(function frame(now) {
    var dt = clamp((now - lastT) / 1000, 0, .05); lastT = now;
    runTweens(now); runScroll(dt); runLinks(dt);
    for (var i = 0; i < ticks.length; i++) ticks[i](now);
    requestAnimationFrame(frame);
  });

  /* ---------- parallax ---------- */
  $$(".prllx").forEach(function (box) {
    var v = $(".visual", box); if (!v) return;
    var from = +(box.dataset.from || -20), to = +(box.dataset.to || 20), hero = box.dataset.start === "top";
    link({
      measure: function (l) { var t = top(box), h = box.offsetHeight; l.a = hero ? Math.max(0, t) : t - VH; l.b = t + h; },
      up: function (p) { v.style.transform = "translate3d(0," + lerp(from, to, p).toFixed(3) + "%,0) scale(1.15)"; }
    });
  });

  /* ---------- stacking sections ---------- */
  $$(".stk").forEach(function (s) {
    var v = $(".stk-visual", s), c = $(".stk-content", s), f = $(".stk-fade", s);
    link({
      measure: function (l) { var b = top(s) + s.offsetHeight; l.a = b - VH; l.b = b; },
      up: function (p) {
        s.style.transform = "translate3d(0," + 50 * p + "%,0)";
        v.style.transform = "translate3d(0," + -50 * p + "%,0) rotate(" + -5 * p + "deg)";
        c.style.transform = "translate3d(0," + -100 * p + "%,0)";
        f.style.opacity = clamp((p - .5) / .5, 0, 1);
      }
    });
  });

  /* ---------- steps ---------- */
  $$(".step").forEach(function (s) {
    var n = $(".step-n", s), c = $(".step-c", s);
    link({
      measure: function (l) { var t = top(s); l.a = t - VH; l.b = t + s.offsetHeight; },
      up: function (p) { var e = E.p4(p); n.style.transform = "translate3d(0," + lerp(-150, 0, e) + "%,0)"; c.style.transform = "translate3d(" + lerp(20, 0, e) + "%,0,0)"; }
    });
  });

  /* ---------- footer reveal ---------- */
  var footWrap = $(".foot-wrap");
  if (footWrap) link({
    measure: function (l) { var t = top(footWrap.parentNode); l.a = t - VH; l.b = Math.min(t - VH * .25, root.scrollHeight - VH); },
    up: function (p) { var e = E.p1(p); footWrap.style.transform = "translate3d(0," + lerp(-40, 0, e) + "%,0)"; footWrap.style.opacity = e; }
  });

  /* ---------- stacked expertise cards ---------- */
  $$(".expertise").forEach(function (sec) {
    var track = $(".exp-track", sec), title = $(".exp-title", sec), wrap = $(".exp-cards", sec), cards = $$(".exp-card", sec), n = cards.length;
    link({
      measure: function (l) { var t = top(track); l.a = t - VH; l.b = t; },
      up: function (p) {
        var a = E.p1(clamp((p - .2) / .8, 0, 1)), b = E.p4(clamp((p - .7) / .3, 0, 1));
        title.style.transform = "translate(-50%,-50%) translateY(" + lerp(-VH, 0, a) + "px)";
        wrap.style.transform = "translateY(" + lerp(100, 0, b) + "%)";
      }
    });
    cards.forEach(function (c, i) {
      var rot = rand(-25, 25); c.style.zIndex = n - i;
      link({
        smooth: 8,
        measure: function (l) { var t = top(track), span = track.offsetHeight - VH, r = span / n, off = r * (n - 1 - i); l.a = t - off; l.b = t + span - off; },
        up: function (p) {
          var k = p * n, y = 10 * (n - 1), z = -10 * (n - 1);
          for (var s = 0; s < n - 1; s++) { var e = E.p1(clamp(k - s, 0, 1)); y -= 10 * e; z += 10 * e; }
          var q = clamp(k - (n - 1), 0, 1);
          c.style.transform = "translate(-50%,-50%) translate3d(0," + (y - q * VH) + "px," + z + "px) translateY(" + -50 * q + "%) rotate(" + rot * q + "deg) scale(" + lerp(1, 1.2, q) + ")";
        }
      });
    });
  });

  /* ---------- key figures ---------- */
  $$(".fig").forEach(function (f) {
    var t = $(".fig-text > *", f);
    t.innerHTML = t.textContent.trim().split(/\s+/).map(function (w) { return '<span class="w">' + w + "</span>"; }).join(" ");
    var words = $$(".w", t), pos = 0, on = false;
    link({ measure: function (l) { f._t = top(f); f._h = f.offsetHeight; l.a = 0; l.b = 1; }, up: function () {} });
    var total = 1.8 + .05 * (words.length - 1);
    ticks.push(function (now) {
      var dt = Math.min(.05, (now - (f._n || now)) / 1000); f._n = now;
      var m0 = scrollY + VH / 2, act = f._t <= m0 && f._t + f._h > m0;
      if (act !== on) { on = act; f.classList.toggle("on", on); }
      var np = clamp(pos + (on ? dt : -dt * 3), 0, total);
      if (np === pos) return; pos = np;
      var m = mobile();
      words.forEach(function (w, i) { var e = E.p4(clamp((pos - i * .05) / 1.8, 0, 1)); w.style.opacity = e; w.style.transform = m ? "translateY(" + 20 * (1 - e) + "px)" : "translateX(" + -40 * (1 - e) + "px)"; });
    });
  });

  /* ---------- header theme ---------- */
  var header = $(".c-header");
  if (header) {
    var zones = $$("[data-head]").filter(function (e) { return e !== header; }), def = header.dataset.head || "light", cur = null, lastY = null;
    ticks.push(function () {
      if (scrollY === lastY) return; lastY = scrollY;
      var y = header.offsetHeight / 2, th = def;
      for (var i = zones.length - 1; i >= 0; i--) { var r = zones[i].getBoundingClientRect(); if (r.top <= y && r.bottom > y) { th = zones[i].dataset.head; break; } }
      if (th !== cur) { cur = th; header.classList.toggle("is-dark", th === "dark"); header.classList.toggle("is-light", th !== "dark"); }
    });
    addEventListener("resize", function () { lastY = null; });
  }

  /* ---------- side menu ---------- */
  sub = $(".c-sub");
  if (sub) {
    var current = null, closing = null, opener = null, z = 0;
    var open = function (name) {
      var m = mobile(), items = $$(".sub-item", sub);
      closing && closing.kill();
      items.forEach(function (i) { i.style.display = m ? "block" : "none"; });
      current = m ? null : $('.sub-item[data-submenu="' + name + '"]', sub);
      if (current) current.style.display = "flex";
      sub.classList.add("is-open");
      sub.setAttribute("aria-hidden", "false");
      (m ? items : [current]).forEach(function (it, k) {
        var cap = $(".caps", it);
        tween({ d: 1.2, delay: m ? k * .1 : 0, up: function (p) { cap.style.transform = "translateX(" + -100 * (1 - p) + "%)"; } });
      });
      (m ? $$(".sub-link", sub) : $$(".sub-link", current)).forEach(function (l, k) {
        tween({ d: 1.2, delay: k * (m ? .05 : .1), up: function (p) { l.style.transform = p < 1 ? "translateX(" + 120 * (1 - p) + "px)" : ""; } });
      });
      setTimeout(function () { $(".sub-close", sub).focus({ preventScroll: true }); }, 50);
    };
    var close = function () {
      if (!sub.classList.contains("is-open")) return;
      sub.classList.remove("is-open");
      sub.setAttribute("aria-hidden", "true");
      opener && opener.focus({ preventScroll: true });
      if (!mobile()) closing = wait(.42, function () { if (current) current.style.display = "none"; });
    };
    $$(".nav-link[data-submenu]").forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); opener = a; open(a.dataset.submenu); }); });
    $(".nav-toggle").addEventListener("click", function (e) { e.preventDefault(); opener = e.currentTarget; open(); });
    $(".sub-close", sub).addEventListener("click", function (e) { e.preventDefault(); close(); });
    $(".sub-overlay", sub).addEventListener("click", close);
    addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    var vw = innerWidth; addEventListener("resize", function () { if (innerWidth !== vw) { vw = innerWidth; close(); } });
    $$(".sub-item", sub).forEach(function (it) {
      var vis = $$(".sub-visual .visual", it);
      $$(".sub-link", it).forEach(function (l, i) {
        l.addEventListener("mouseenter", function () {
          var v = vis[i]; if (!v) return;
          v.style.zIndex = ++z;
          tween({ d: .84, up: function (p) { v.style.clipPath = "inset(" + 100 * (1 - p) / 2 + "%)"; } });
        });
      });
    });
  }

  /* ---------- hero titles ---------- */
  var heroTitle = $(".js-title"), titleSpans = [], titleWords = [];
  function prepTitle() {
    if (!heroTitle) return;
    var h1 = $("h1", heroTitle), sp = $$("span", h1);
    if (sp.length) { titleSpans = sp; sp.forEach(function (s) { s.style.opacity = 0; }); return; }
    var cap = $(".caps", heroTitle), txt = h1.textContent.trim();
    h1.setAttribute("aria-label", txt);
    var indent = 0;
    if (cap && innerWidth > 991) indent = (cap.offsetWidth + 40) / parseFloat(getComputedStyle(h1).fontSize);
    if (indent) { var i = document.createElement("span"); i.style.cssText = "display:inline-block;width:" + indent + "em"; i.setAttribute("aria-hidden", "true"); h1.textContent = ""; h1.appendChild(i); h1.appendChild(document.createTextNode(txt)); }
    heroTitle._indent = indent; heroTitle._txt = txt; h1.style.opacity = 0;
  }
  function playTitle() {
    if (!heroTitle) return;
    var h1 = $("h1", heroTitle);
    if (titleSpans.length) {
      titleSpans.forEach(function (s) { var x = rand(-300, 300); if (mobile()) x *= .4; tween({ d: 2.4, ease: E.expo, up: function (p) { s.style.opacity = p; s.style.transform = p < 1 ? "translateX(" + x * (1 - p) + "px)" : ""; }, done: function () { s.style.transform = ""; s.style.display = ""; } }); });
      return;
    }
    if (h1.style.opacity === "") return;
    var before = h1.innerHTML, words = heroTitle._txt.split(/\s+/);
    var probe = words.map(function (w) { return '<span class="pw" style="display:inline-block">' + w.replace(/&/g, "&amp;") + "</span>"; }).join(" ");
    h1.innerHTML = (heroTitle._indent ? '<span class="ind" style="display:inline-block;width:' + heroTitle._indent + 'em"></span>' : "") + probe;
    var lines = [], ly = null;
    $$(".pw", h1).forEach(function (w) { var y = w.offsetTop; if (ly === null || Math.abs(y - ly) > 8) { lines.push([]); ly = y; } lines[lines.length - 1].push(w.innerHTML); });
    h1.innerHTML = lines.map(function (l, i) { return '<div style="white-space:nowrap;overflow:visible">' + (i === 0 && heroTitle._indent ? '<span style="display:inline-block;width:' + heroTitle._indent + 'em"></span>' : "") + l.map(function (w) { return '<span class="pw" style="display:inline-block">' + w + "</span>"; }).join(" ") + "</div>"; }).join("");
    h1.style.opacity = "";
    var pw = $$(".pw", h1), left = pw.length;
    pw.forEach(function (w) {
      var pad = rand(100, 200) * (mobile() ? .3 : 1);
      tween({ d: 2.4, ease: E.expo, up: function (p) { w.style.paddingLeft = pad * (1 - p) + "px"; w.style.opacity = p; }, done: function () { if (--left === 0) h1.innerHTML = before; } });
    });
  }
  function heroParts() {
    var h = $(".hero,.hero-loc");
    return { bg: h && $(".hero-bg", h), items: h ? $$(".hero-content > *,.hero-stats > *,.hero-simple > *", h) : [], line: h && $(".hero-inner > .line", h), pv: $(".page-visual"), form: $(".contact-form") };
  }
  function fromY(els, y, stag, delay) {
    els.forEach(function (el, i) { tween({ d: 2.4, delay: (delay || 0) + i * stag, ease: E.expo, up: function (p) { el.style.opacity = p; el.style.transform = p < 1 ? "translateY(" + y * (1 - p) + "px)" : ""; } }); });
  }
  function pageEnter() {
    var h = heroParts();
    [h.bg, h.pv].forEach(function (b) { if (b) tween({ d: 2.4, ease: E.expo, up: function (p) { b.style.transform = p < 1 ? "scale(" + lerp(.9, 1, p) + ")" : ""; } }); });
    fromY(h.items, 60, .03);
    if (h.line) tween({ d: 2.4, ease: E.expoio, up: function (p) { h.line.style.opacity = p; } });
    if (h.form) tween({ d: 2.4, ease: E.expo, up: function (p) { h.form.style.transform = p < 1 ? "translateY(" + 60 * (1 - p) + "px)" : ""; } });
  }

  /* ---------- opening reveal (after the gate) ---------- */
  var app = $(".app"), gate = $(".gate");
  function reveal() {
    root.classList.remove("pre");
    app.style.height = "100svh"; app.style.overflow = "hidden";
    var h = heroParts();
    if (gate) tween({ d: .8, delay: .5, ease: E.expo, init: false, up: function (p) { gate.style.opacity = 1 - p; }, done: function () { gate.remove(); } });
    tween({ d: 2.4, ease: E.expoio, up: function (p) { var v = 50 * (1 - p); app.style.clipPath = "inset(" + v + "%)"; }, done: function () { app.style.cssText = ""; S.on = true; stopScroll(); measure(); } });
    var op = h.bg ? +getComputedStyle(h.bg).opacity : 1;
    if (h.bg) tween({ d: 2.8, ease: E.expoio, up: function (p) { h.bg.style.transform = p < 1 ? "scale(" + lerp(.5, 1, p) + ")" : ""; h.bg.style.opacity = p < 1 ? lerp(1, op, p) : ""; } });
    tween({ d: 2.4, ease: E.expoio, up: function (p) { header.style.transform = p < 1 ? "translateY(" + -100 * (1 - p) + "%)" : ""; } });
    fromY(h.items, 90, .12, 1.1);
    if (h.line) tween({ d: 2.4, delay: .8, ease: E.expoio, up: function (p) { h.line.style.opacity = p; } });
    wait(1.1, playTitle);
  }

  /* ---------- gate ---------- */
  var nav = store.get("halyard:nav"); store.del("halyard:nav");
  function runGate() {
    S.on = false; app.style.height = "100svh"; app.style.overflow = "hidden";
    var paths = $$(".gate-brand path", gate), brand = $(".gate-brand", gate), inners = $$(".gate-inner", gate), m = mobile();
    paths.forEach(function (p, i) { tween({ d: 1.2, delay: i * .03, up: function (e) { p.style.transform = "translateY(" + 110 * (1 - e) + "%)"; p.style.transformBox = "fill-box"; } }); });
    tween({ d: 2.4, delay: .4, ease: E.expoio, up: function (p) { brand.style.transform = "translate(-50%,-50%) translateY(" + VH * .4 * (1 - p) + "px)"; } });
    inners.forEach(function (el, i) {
      var yp = (i === 0 ? 50 : -40) * (m ? -1 : 1);
      tween({ d: 2.4, delay: .6, ease: E.expoio, up: function (p) { el.style.transform = p < 1 ? "translateY(" + yp * (1 - p) + "%) scale(" + lerp(.4, 1, p) + ")" : ""; } });
      var bg = $(".gate-bg", el), img = $("img", bg), btn = $(".btn", el);
      tween({ d: 2.4, delay: .45, ease: E.p4io, up: function (p) { var q = 1 - p; bg.style.clipPath = p < 1 ? "inset(" + 90 * q + "% " + 91 * q + "% " + 92 * q + "% " + 93 * q + "%)" : ""; } });
      tween({ d: 2.4, delay: .45, up: function (p) { img.style.transform = p < 1 ? "scale(" + lerp(1.3, 1, p) + ")" : ""; } });
      tween({ d: 1.2, delay: 1.45 + i * .3, up: function (p) { btn.style.transform = p < 1 ? "translateY(" + 250 * (1 - p) + "%)" : ""; } });
    });
    var busy = false;
    $$(".gate-btn", gate).forEach(function (b) {
      var box = $(".gate-visuals", b), vis = $$(".visual", box), loop = null, zi = 10, clip = 0, st = null;
      b.addEventListener("click", function (e) {
        e.preventDefault(); if (busy) return; busy = true;
        var href = b.getAttribute("href");
        if (!href || href === "#") return reveal();
        store.set("halyard:nav", "gate");
        tween({ d: .5, ease: E.p1, up: function (p) { gate.style.opacity = 1 - p; }, done: function () { location.href = href; } });
      });
      if (!matchMedia("(hover:hover)").matches) return;
      b.addEventListener("mouseenter", function () {
        st && st.kill(); box.style.transform = "translate(-50%,-50%)"; box.style.opacity = 1;
        var c0 = clip;
        st = tween({ d: 1.8, ease: E.expo, up: function (p) { clip = lerp(c0, 1, p); var q = 1 - clip; box.style.clipPath = "inset(" + 90 * q + "% " + 91 * q + "% " + 92 * q + "% " + 93 * q + "%)"; } });
        vis.forEach(function (v, i) { v.style.zIndex = i; v.style.transform = "scale(0)"; });
        var t0 = performance.now(), last = vis.map(function () { return -1; });
        clearInterval(loop); loop = setInterval(function () {
          var el = (performance.now() - t0) / 1000;
          vis.forEach(function (v, i) { var lt = el - i * .6; if (lt < 0) return; var k = Math.floor(lt / 1.8); if (k !== last[i]) { last[i] = k; v.style.zIndex = ++zi; } v.style.transform = "scale(" + E.expo((lt % 1.8) / 1.8) + ")"; });
        }, 16);
      });
      b.addEventListener("mouseleave", function () {
        st && st.kill(); var c0 = clip, r = rand(-15, 15);
        st = tween({ d: 1.2, ease: E.expo, up: function (p) { clip = lerp(c0, 0, p); var q = 1 - clip; box.style.opacity = 1 - p; box.style.transform = "translate(-50%,-50%) rotate(" + r * p + "deg)"; box.style.clipPath = "inset(" + 90 * q + "% " + 91 * q + "% " + 92 * q + "% " + 93 * q + "%)"; }, done: function () { clearInterval(loop); } });
      });
    });
  }

  /* ---------- sliders ---------- */
  $$(".js-slider").forEach(function (box) {
    var track = $(".swiper-track", box), slides = $$(".swiper-slide", track), thumbs = $$(".thumb", box), prev = $(".prev", box), next = $(".next", box), i = 0, x = 0, tw = null, tl = null, n = slides.length;
    function set(v) { x = v; track.style.transform = "translate3d(" + v + "px,0,0)"; }
    function bar() {
      tl && tl.kill(); thumbs.forEach(function (t, k) { $("i", t).style.transform = ""; t.classList.toggle("on", k === i); });
      if (!thumbs.length || reduced) return;
      var b = $("i", thumbs[i]);
      tl = tween({ d: 3.2, ease: E.none, up: function (p) { b.style.transform = "translateX(" + lerp(-100, 0, p) + "%)"; }, done: function () { go(i < n - 1 ? i + 1 : 0); } });
    }
    function go(k) {
      i = clamp(k, 0, n - 1); var from = x, to = -i * track.offsetWidth;
      tw && tw.kill(); tw = tween({ d: .8, ease: E.p4, up: function (p) { set(lerp(from, to, p)); } });
      var th = thumbs[i], rail = th && th.parentNode;
      if (rail && rail.scrollWidth > rail.clientWidth) { var s0 = rail.scrollLeft, s1 = th.offsetLeft - rail.offsetLeft; tween({ d: .8, init: false, up: function (p) { rail.scrollLeft = lerp(s0, s1, p); } }); }
      if (prev) { prev.disabled = i === 0; next.disabled = i === n - 1; }
      bar();
    }
    thumbs.forEach(function (t, k) { t.addEventListener("click", function () { go(k); }); });
    if (prev) { prev.addEventListener("click", function () { go(i - 1); }); next.addEventListener("click", function () { go(i + 1); }); }
    var sx = null, bx = 0;
    track.addEventListener("pointerdown", function (e) { sx = e.clientX; bx = x; tw && tw.kill(); tl && tl.kill(); track.setPointerCapture(e.pointerId); });
    track.addEventListener("pointermove", function (e) { if (sx !== null) set(bx + e.clientX - sx); });
    var end = function (e) { if (sx === null) return; var d = e.clientX - sx; sx = null; go(i + (d < -50 ? 1 : d > 50 ? -1 : 0)); };
    track.addEventListener("pointerup", end); track.addEventListener("pointercancel", end);
    track.addEventListener("dragstart", function (e) { e.preventDefault(); });
    addEventListener("resize", function () { set(-i * track.offsetWidth); });
    go(0);
  });

  /* ---------- before / after ---------- */
  $$(".splitter").forEach(function (box) {
    var after = $(".after", box), h = $(".handle", box), cur = 50, to = 50, drag = false;
    function draw() { after.style.clipPath = "inset(0 0 0 " + cur + "%)"; h.style.left = cur + "%"; }
    draw();
    ticks.push(function () { if (Math.abs(cur - to) > .02) { cur = reduced ? to : lerp(cur, to, .12); draw(); } });
    function mv(e) { var r = box.getBoundingClientRect(); to = clamp((e.clientX - r.left) / r.width * 100, 0, 100); box.setAttribute("aria-valuenow", Math.round(to)); }
    box.addEventListener("pointerdown", function (e) { drag = true; box.setPointerCapture(e.pointerId); mv(e); });
    box.addEventListener("pointermove", function (e) { if (drag) mv(e); });
    ["pointerup", "pointercancel"].forEach(function (n) { box.addEventListener(n, function () { drag = false; }); });
    box.addEventListener("keydown", function (e) { if (e.key === "ArrowLeft") to = clamp(to - 5, 0, 100); else if (e.key === "ArrowRight") to = clamp(to + 5, 0, 100); else return; e.preventDefault(); box.setAttribute("aria-valuenow", Math.round(to)); });
  });

  /* ---------- marquees ---------- */
  $$("[data-marquee]").forEach(function (m) {
    var first = m.firstElementChild, speed = +m.dataset.marquee;
    for (var k = 0; k < 2; k++) { var c = first.cloneNode(true); c.setAttribute("aria-hidden", "true"); m.appendChild(c); }
    var lists = Array.prototype.slice.call(m.children);
    function dur() { var v = m.classList.contains("fleet-marquee") && !mobile(); lists.forEach(function (l) { l.style.animationDuration = (v ? l.offsetHeight : l.offsetWidth) / speed + "s"; }); }
    dur(); addEventListener("resize", dur); addEventListener("load", dur);
    new IntersectionObserver(function (es) { es.forEach(function (e) { lists.forEach(function (l) { l.classList.toggle("run", e.isIntersecting); }); }); }).observe(m);
  });

  /* ---------- forms (front-end only) ---------- */
  $$(".js-form").forEach(function (f) {
    var fail = $(".form-fail", f), done = f.parentNode.querySelector(".form-done");
    var q = new URLSearchParams(location.search).get("yacht"), ta = $("textarea", f);
    if (q && ta) ta.value = "I would like to know more about " + q + ".";
    f.addEventListener("input", function (e) { e.target.classList.remove("bad"); });
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var bad = $$("[required]", f).filter(function (i) { var ok = i.value.trim() && i.checkValidity(); i.classList.toggle("bad", !ok); return !ok; });
      fail.hidden = !bad.length;
      if (bad.length) { bad[0].focus(); return; }
      f.hidden = true; done.hidden = false; done.focus({ preventScroll: true }); measure();
      var y = f.parentNode.getBoundingClientRect().top + scrollY - 160; scrollTo_(y);
    });
  });
  /* pick a harbour from the hash, e.g. our-model.html#palma */
  function hashRadio() {
    var h = location.hash.slice(1).toLowerCase(); if (!h) return false;
    var r = $$('input[name="harbour"]').filter(function (i) { return i.value.toLowerCase().indexOf(h) === 0; })[0];
    if (!r) return false; r.checked = true; scrollTo_(top(r.closest(".contact-form")) - header.offsetHeight - 24); return true;
  }

  /* ---------- yacht listings ---------- */
  var ARROW = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 11.33 13.33 8 10 4.67M2.67 8h10.66" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var PHONE = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5.2 2.5 3 3.2c-.4 4.9 4.9 10.2 9.8 9.8l.7-2.2-2.7-1.6-1.4 1.2C7.7 9.6 6.4 8.3 5.6 6.6l1.2-1.4z" stroke="currentColor" stroke-linejoin="round"/></svg>';
  function btn(href, label, ic, diag) { return '<a class="btn" href="' + href + '"><span class="btn-inner"><span class="btn-icon"><span class="icon' + (diag ? " diag" : "") + '">' + ic + '</span><span class="cross"><i></i><i></i></span></span><span class="btn-title">' + label + "</span></span></a>"; }
  var gridBox = $(".loc-grid");
  if (gridBox) {
    var type = gridBox.dataset.type, all = (window.HALYARD_YACHTS || []).filter(function (y) { return y.type === type; });
    var form = $(".filters-form.js-filters"), state = { date: null, months: "", place: "", guests: 1 };
    var render = function (list, anim) {
      gridBox.innerHTML = list.length ? list.map(function (y) {
        return '<article class="card"><div class="card-visual"><img class="cover" src="' + y.img + '" alt="' + y.name + ', ' + y.kind + '" loading="lazy"></div><div class="card-content"><div class="card-head"><div class="card-infos caps"><span>' + y.place + "</span><i></i><span>" + y.length + ' m</span></div><h3 class="t-card">' + y.name + " – " + y.kind + '</h3></div><div class="card-tags">' +
          [y.guests + " guests", y.cabins + (y.cabins > 1 ? " cabins" : " cabin"), "built " + y.built].map(function (t) { return '<div class="tag ghost"><span class="caps">' + t + "</span></div>"; }).join("") +
          '</div><div class="card-actions">' + (type === "season" ? btn("contact.html?yacht=" + encodeURIComponent(y.name), "Contact us", ARROW, true) + btn("tel:+4600000000", "Call us", PHONE) : btn("contact.html?yacht=" + encodeURIComponent(y.name), "Reserve this yacht", ARROW, true)) + "</div></div></article>";
      }).join("") : '<div class="no-results serif">No yacht matches this search</div>';
      if (anim) $$(".card", gridBox).forEach(function (c, i) { tween({ d: 1.2, delay: i * .03, up: function (p) { c.style.opacity = p; c.style.transform = p < 1 ? "translateY(" + 100 * (1 - p) + "px)" : ""; } }); });
      measure();
    };
    render(all, true);
    if (form) {
      var sel = $$(".filter-select", form);
      var places = all.map(function (y) { return y.place; }).filter(function (p, i, a) { return a.indexOf(p) === i; }).sort();
      $("#f-place").innerHTML = '<option value="">Harbour</option>' + places.map(function (p) { return "<option>" + p + "</option>"; }).join("");
      var maxG = Math.max.apply(null, all.map(function (y) { return y.guests; })), o = '<option value="1">Number of people</option>';
      for (var g = 2; g <= maxG; g++) o += '<option value="' + g + '">' + g + " people</option>";
      $("#f-guests").innerHTML = o;
      sel.forEach(function (s) { s.addEventListener("change", function () { $(".filter-value", s.parentNode).textContent = s.options[s.selectedIndex].textContent; state[s.id === "f-place" ? "place" : "guests"] = s.value; }); });
      $(".filter-input", form).addEventListener("input", function (e) { state.months = e.target.value.replace(/\D/g, ""); e.target.value = state.months; });
      form.addEventListener("submit", function (e) {
        e.preventDefault(); gridBox.classList.add("loading"); document.body.style.cursor = "progress";
        setTimeout(function () {
          var list = all.filter(function (y) {
            if (y.guests < +state.guests) return false;
            if (state.place && y.place !== state.place) return false;
            if (state.months && +state.months > y.months) return false;
            if (state.date) { var m = state.date.getMonth() + 1; if (y.season && (m < y.season[0] || m > y.season[1])) return false; }
            return true;
          });
          gridBox.classList.remove("loading"); document.body.style.cursor = ""; render(list, true);
        }, reduced ? 0 : 700);
      });
      /* calendar */
      var inp = $(".filter-cal", form), item = inp.parentNode, cal = document.createElement("div"), M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      cal.className = "cal"; document.body.appendChild(cal);
      var today = new Date(); today.setHours(0, 0, 0, 0); var view = new Date(today.getFullYear(), today.getMonth(), 1);
      var draw = function () {
        var y = view.getFullYear(), m = view.getMonth(), off = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), h = "";
        ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].forEach(function (d) { h += "<span>" + d + "</span>"; });
        for (var i = 0; i < off; i++) h += "<b></b>";
        for (var d = 1; d <= days; d++) { var dt = new Date(y, m, d); h += '<button type="button" class="cal-day' + (state.date && +dt === +state.date ? " sel" : "") + '" data-d="' + d + '"' + (dt < today ? " disabled" : "") + ">" + d + "</button>"; }
        cal.innerHTML = '<div class="cal-head"><button type="button" data-m="-1" aria-label="Previous month"' + (view <= today ? " disabled" : "") + ">←</button><span>" + M[m] + " " + y + '</span><button type="button" data-m="1" aria-label="Next month">→</button></div><div class="cal-grid">' + h + "</div>";
      };
      var place = function () { var r = item.getBoundingClientRect(); cal.style.left = clamp(r.left + scrollX, 10, innerWidth - cal.offsetWidth - 10) + "px"; cal.style.top = r.bottom + scrollY + 12 + "px"; };
      var openCal = function () { draw(); place(); cal.classList.add("open"); };
      inp.addEventListener("focus", openCal); inp.addEventListener("click", openCal);
      cal.addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b) return; e.stopPropagation();
        if (b.dataset.m) { view = new Date(view.getFullYear(), view.getMonth() + +b.dataset.m, 1); draw(); return; }
        state.date = new Date(view.getFullYear(), view.getMonth(), +b.dataset.d);
        $(".filter-value", item).textContent = state.date.getDate() + " " + M[state.date.getMonth()].slice(0, 3) + ". " + state.date.getFullYear();
        cal.classList.remove("open");
      });
      document.addEventListener("click", function (e) { if (!cal.contains(e.target) && e.target !== inp) cal.classList.remove("open"); });
      addEventListener("keydown", function (e) { if (e.key === "Escape") cal.classList.remove("open"); });
      addEventListener("resize", function () { if (cal.classList.contains("open")) place(); });
    }
  }

  /* ---------- 3D deck block (raymarched, own shader) ---------- */
  var VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  var FS = [
    "precision highp float;uniform vec2 R;uniform vec2 A;uniform float T;",
    "mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}",
    "float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}",
    "float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}",
    "float fbm(vec2 p){return n(p)*.5+n(p*2.1)*.25+n(p*4.3)*.125+n(p*8.7)*.0625;}",
    "float tri(vec2 p,vec2 a,vec2 b,vec2 c){vec2 e0=b-a,e1=c-b,e2=a-c,v0=p-a,v1=p-b,v2=p-c;vec2 q0=v0-e0*clamp(dot(v0,e0)/dot(e0,e0),0.,1.),q1=v1-e1*clamp(dot(v1,e1)/dot(e1,e1),0.,1.),q2=v2-e2*clamp(dot(v2,e2)/dot(e2,e2),0.,1.);float s=sign(e0.x*e2.y-e0.y*e2.x);vec2 d=min(min(vec2(dot(q0,q0),s*(v0.x*e0.y-v0.y*e0.x)),vec2(dot(q1,q1),s*(v1.x*e1.y-v1.y*e1.x))),vec2(dot(q2,q2),s*(v2.x*e2.y-v2.y*e2.x)));return -sqrt(d.x)*sign(d.y);}",
    "float glyph(vec2 p){float a=tri(p,vec2(-.62,-.6),vec2(-.06,.66),vec2(-.06,-.6));float b=tri(p,vec2(.06,.66),vec2(.6,-.6),vec2(.06,-.6));float g=min(a,b);g=max(g,.05-abs(p.y+.34));return g;}",
    "float box(vec3 p,vec3 b,float r){vec3 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.)-r;}",
    "float seam(float x){float k=.265;return abs(mod(x+k*.5,k)-k*.5);}",
    "float map(vec3 p){float d=box(p,vec3(1.,1.,.24),.13);if(d>.12)return d;",
    "float g=glyph(p.xy);float fr=smoothstep(-.06,.06,abs(p.z)-.12);",
    "d+=fr*.055*smoothstep(.015,-.015,g);",
    "d+=.02*smoothstep(.016,.006,seam(p.y));",
    "return d;}",
    "vec3 nor(vec3 p){vec2 e=vec2(.0025,0);return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));}",
    "void main(){vec2 u=(gl_FragCoord.xy*2.-R)/min(R.x,R.y);vec3 ro=vec3(0,0,4.6),rd=normalize(vec3(u*.33,-1.));",
    "mat2 a=rot(A.x),b=rot(A.y),c=rot(.06*sin(T*.5)+.07);",
    "ro.xy*=c;rd.xy*=c;ro.yz*=b;rd.yz*=b;ro.xz*=a;rd.xz*=a;",
    "float t=2.6,d=1.;int hit=0;float glow=9.;for(int i=0;i<72;i++){vec3 p=ro+rd*t;d=map(p);glow=min(glow,d);if(d<.0015){hit=1;break;}t+=d*.8;if(t>7.)break;}",
    "if(hit==0){gl_FragColor=vec4(0.);float e=smoothstep(.035,0.,glow);gl_FragColor=vec4(vec3(.55,.66,.66)*e*.5,e*.5);return;}",
    "vec3 p=ro+rd*t,N=nor(p);",
    "float pl=floor((p.y+.1325)/.265);vec2 q=abs(N.x)>.7?p.zy:p.xy;if(abs(N.y)>.7)q=p.xz;",
    "float grain=fbm(vec2(q.x*2.2+pl*7.3,q.y*34.+pl*3.));float fine=n(vec2(q.x*6.,q.y*160.));",
    "vec3 col=mix(vec3(.45,.51,.51),vec3(.72,.76,.74),grain*1.15);col*=.9+.14*h(vec2(pl,3.));col*=.9+.16*fine;",
    "float kn=n(q*vec2(5.,9.)+pl*11.);col*=1.-.25*smoothstep(.80,.9,kn);",
    "float sm=smoothstep(.016,.007,seam(p.y));col=mix(col,vec3(.05,.12,.14),sm*.9);",
    "float g=glyph(p.xy);float ins=smoothstep(.012,-.012,g)*step(.1,abs(p.z));col=mix(col,col*.8,ins);",
    "vec3 L=normalize(vec3(-.45,.75,.8)),L2=normalize(vec3(.9,-.35,.5));",
    "L.xy*=c;L.yz*=b;L.xz*=a;L2.xy*=c;L2.yz*=b;L2.xz*=a;",
    "float df=max(dot(N,L),0.),d2=max(dot(N,L2),0.);float sp=pow(max(dot(reflect(rd,N),L),0.),22.);float rim=pow(1.-max(dot(N,-rd),0.),3.);",
    "float ao=clamp(map(p+N*.08)/.08,.3,1.);",
    "col=col*(.2+.8*df+.22*d2)*ao+vec3(.8,.9,.9)*(sp*.16+rim*.12);",
    "gl_FragColor=vec4(pow(col,vec3(.92)),1.);}"
  ].join("\n");
  var mx = 0, my = 0; addEventListener("pointermove", function (e) { mx = e.clientX / innerWidth * 2 - 1; my = e.clientY / innerHeight * 2 - 1; }, { passive: true });
  $$(".cube").forEach(function (box) {
    var cv = document.createElement("canvas"); cv.setAttribute("aria-hidden", "true");
    var gl = cv.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true }); if (!gl) return;
    box.appendChild(cv);
    function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(o)); return o; }
    var pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var lp = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 0, 0);
    var uR = gl.getUniformLocation(pr, "R"), uA = gl.getUniformLocation(pr, "A"), uT = gl.getUniformLocation(pr, "T"), vis = false, ax = .4, ay = .1, t0 = performance.now(), once = false;
    var quality = 1, slow = 0, prevNow = 0;
    function size() { var d = Math.min(devicePixelRatio || 1, 1.5) * quality; cv.width = Math.max(2, box.clientWidth * d); cv.height = Math.max(2, box.clientHeight * d); gl.viewport(0, 0, cv.width, cv.height); once = false; }
    size(); addEventListener("resize", size);
    new IntersectionObserver(function (es) { vis = es[es.length - 1].isIntersecting; }).observe(box);
    ticks.push(function (now) {
      if (!vis || (reduced && once)) { prevNow = 0; return; } once = true;
      if (prevNow) { slow = now - prevNow > 22 ? slow + 1 : Math.max(0, slow - .25); if (slow > 14 && quality > .5) { quality -= .25; slow = 0; size(); } }
      prevNow = now;
      var T = (now - t0) / 1000, r = box.getBoundingClientRect();
      var cx = (r.left + r.width / 2) / innerWidth * 2 - 1, cy = (r.top + r.height / 2) / VH * 2 - 1;
      var gx = clamp(mx - cx, -1.5, 1.5) * .6 + Math.sin(T * .6) * .14 + .18, gy = clamp(my - cy, -1.5, 1.5) * .42 + Math.cos(T * .5) * .06;
      ax = lerp(ax, gx, .06); ay = lerp(ay, gy, .06);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uR, cv.width, cv.height); gl.uniform2f(uA, -ax, -ay); gl.uniform1f(uT, reduced ? 0 : T); gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
  });

  /* ---------- page transitions between files ---------- */
  document.addEventListener("click", function (e) {
    var a = e.target.closest("a[href]"); if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target === "_blank") return;
    var href = a.getAttribute("href");
    if (href === "#") { e.preventDefault(); return; }
    if (/^(https?:|mailto:|tel:)/.test(href)) return;
    if (href.charAt(0) === "#") { var t = document.getElementById(href.slice(1)); if (t) { e.preventDefault(); scrollTo_(top(t) - header.offsetHeight - 24); } return; }
    e.preventDefault(); store.set("halyard:nav", "1"); root.classList.add("leaving"); S.on = false;
    setTimeout(function () { location.href = href; }, reduced ? 0 : 260);
  });
  addEventListener("pageshow", function (e) { if (e.persisted) { root.classList.remove("leaving", "entering"); S.on = true; } });

  /* ---------- boot ---------- */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);
  function onResize() {
    /* on touch screens ignore height-only changes (URL bar sliding in and out) */
    if (innerWidth === VW && matchMedia("(hover:none)").matches && Math.abs(innerHeight - VH) < 180) return;
    VW = innerWidth; VH = innerHeight; measure();
  }
  stopScroll(); measure(); addEventListener("resize", onResize); addEventListener("load", measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  var bodyH = 0;
  new ResizeObserver(function () { var h = document.body.offsetHeight; if (h !== bodyH) { bodyH = h; measure(); } }).observe(document.body);
  function start() {
    prepTitle();
    if (nav === "gate") { S.on = false; gate && gate.remove(); gate = null; reveal(); }
    else if (gate && nav !== "1") { root.classList.remove("pre"); runGate(); }
    else {
      gate && gate.remove(); root.classList.remove("pre");
      if (nav === "1") { root.classList.add("entering"); requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.remove("entering"); }); }); pageEnter(); }
      playTitle();
      setTimeout(hashRadio, 400);
    }
  }
  addEventListener("hashchange", hashRadio);
  var started = false, go = function () { if (!started) { started = true; start(); } };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); setTimeout(go, 900);
})();
