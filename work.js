// ==== GALERIE : les images apparaissent à travers des trous irréguliers de la page ====
// Chaque figure reçoit un masque peint à la volée (formes organiques au bord
// d'aquarelle, même technique que les fleurs), en deux couches qui respirent
// lentement l'une contre l'autre : le bord du trou ondule comme une encre encore
// humide. Au scroll, le trou s'ouvre et l'image glisse plus lentement que la page.
// Un clic, ou une demi-seconde de survol, dissout le masque : l'image apparaît en entier.

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canMask = CSS.supports('mask-image', 'none') || CSS.supports('-webkit-mask-image', 'none');
const figures = [...document.querySelectorAll('.blot')];
const MASK_PX = 560;     // côté long du masque ; ses bords doux supportent l'agrandissement
const FPS = 30;          // la respiration est lente : 30 fps suffisent
const HOVER_MS = 500;    // survol avant que le masque ne se dissolve
const OPEN_MS = 1800;    // lent : le papier boit l'encre, il ne s'ouvre pas d'un coup
const CLOSE_MS = 1300;

const TAU = Math.PI * 2;
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
const easeOut = (p) => 1 - (1 - p) ** 3;
const easeInOut = (p) => (1 - Math.cos(Math.PI * p)) / 2;   // sinus : départ et arrivée sans à-coup
const smooth = (a, b, v) => { const k = clamp01((v - a) / (b - a)); return k * k * (3 - 2 * k); };

// hasard déterministe : chaque image garde sa forme d'une visite à l'autre
const seeded = (seed) => () => {
  seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

const fillPoly = (g, pts) => {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fill();
};

// peint les deux couches du masque en coordonnées 0..1 ; noir = l'image est visible.
// Même forme de base, bords re-déformés différemment : en bougeant l'une contre
// l'autre, leur union fait onduler le contour.
const paintMasks = (w, h, rnd, shapeIndex) => {
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(TAU * rnd());
  const deform = (pts, depth, amt) => {
    for (let d = 0; d < depth; d++) {
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const v = (a[2] + b[2]) / 2;
        const sd = Math.hypot(b[0] - a[0], b[1] - a[1]) * amt * v;
        out.push(a, [(a[0] + b[0]) / 2 + gauss() * sd, (a[1] + b[1]) / 2 + gauss() * sd, v * (.8 + rnd() * .4)]);
      }
      pts = out;
    }
    return pts;
  };
  const blob = (cx, cy, rx, ry, n) => ({
    amt: .22,
    pts: Array.from({ length: n }, (_, i) => {
      const a = (i + rnd() * .3) / n * TAU, k = .9 + rnd() * .2;
      return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k, .7 + rnd() * .6];
    }),
  });
  // fenêtre au bord déchiré : un rectangle très finement grignoté
  const torn = (x0, y0, x1, y1, n) => {
    const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], pts = [];
    corners.forEach(([ax, ay], c) => {
      const [bx, by] = corners[(c + 1) % 4];
      for (let i = 0; i < n; i++) pts.push([ax + (bx - ax) * i / n, ay + (by - ay) * i / n, .6 + rnd() * .8]);
    });
    return { amt: .07, pts };
  };
  const SHAPES = [
    () => [blob(.5, .5, .38, .38, 14)],                               // une grande tache
    () => [torn(.08, .08, .92, .92, 7)],                              // une fenêtre déchirée
    () => [blob(.42, .42, .32, .31, 12), blob(.6, .62, .3, .29, 12)], // deux taches qui se chevauchent
    () => [blob(.47, .52, .36, .37, 13), blob(.83, .17, .08, .07, 8)], // une tache et un éclat
  ];
  const forms = SHAPES[shapeIndex % SHAPES.length]().map(({ pts, amt }) => ({ form: deform(pts, 2, amt), amt }));

  return [0, 1].map((layer) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.scale(w, h);
    for (const { form, amt } of forms) {
      const [mx, my] = form.reduce(([sx, sy], [x, y]) => [sx + x / form.length, sy + y / form.length], [0, 0]);
      // cœur plein, un peu en retrait : l'image y est nette
      g.fillStyle = '#000';
      fillPoly(g, deform(form.map(([x, y, v]) => [mx + (x - mx) * .9, my + (y - my) * .9, v]), 2, amt * .5));
      // bord d'aquarelle : couches presque transparentes, chacune re-déformée
      g.fillStyle = 'rgba(0,0,0,.07)';
      for (let i = 0; i < 11; i++) fillPoly(g, deform(form, 3, amt * .7));
      // quelques éclaboussures autour, sur la couche qui bouge le plus
      if (layer === 1) {
        for (let i = 0, n = 4 + rnd() * 8 | 0; i < n; i++) {
          const [x, y] = form[rnd() * form.length | 0], k = 1.04 + rnd() * .1;
          g.fillStyle = `rgba(0,0,0,${.4 + rnd() * .5})`;
          g.beginPath();
          g.arc(mx + (x - mx) * k, my + (y - my) * k, .004 + rnd() * .012, 0, TAU);
          g.fill();
        }
      }
    }
    return c;
  });
};

const toUrl = (canvas) => new Promise((resolve) => {
  canvas.toBlob((b) => resolve(b ? URL.createObjectURL(b) : canvas.toDataURL()));
});

// ---- état de chaque figure ----
const state = new Map(figures.map((fig, i) => [fig, {
  i,
  phase: seeded(i * 104729 + 7)() * TAU,   // chaque masque respire à son rythme
  urls: null,
  open: .62,                                // ouverture liée au scroll
  from: 0, to: 0, t0: 0, dur: 0,            // dissolution : 0 masqué … 1 image entière
  hover: 0, pointer: 'mouse',
  maskKey: '',
}]));

const dissolve = (st, now) => st.dur > 0 ? st.from + (st.to - st.from) * clamp01((now - st.t0) / st.dur) : st.to;
const tweening = (st, now) => st.dur > 0 && now - st.t0 < st.dur;

const setOpen = (fig, open) => {
  const st = state.get(fig), now = performance.now();
  const target = open ? 1 : 0;
  if (st.to === target) return;
  const cur = dissolve(st, now);
  st.from = cur;
  st.to = target;
  st.t0 = now;
  st.dur = (open ? OPEN_MS : CLOSE_MS) * Math.abs(target - cur);
  fig.classList.toggle('is-open', open);
  wake();
};

const reveal = async (fig) => {
  if (fig.dataset.mask) return;
  fig.dataset.mask = 'pending';
  const st = state.get(fig);
  const img = fig.querySelector('img');
  try {
    if (canMask) {
      const ar = fig.clientWidth / fig.clientHeight || 1;
      const w = Math.round(ar >= 1 ? MASK_PX : MASK_PX * ar);
      const h = Math.round(ar >= 1 ? MASK_PX / ar : MASK_PX);
      st.urls = await Promise.all(paintMasks(w, h, seeded(st.i * 7919 + 1), st.i).map(toUrl));
      scrolled = true;   // force un rendu : le masque doit être posé avant que l'image n'apparaisse
      render(performance.now());
      wake();            // et relance la respiration
    }
    await img?.decode().catch(() => {});
  } finally {
    fig.classList.add('is-masked');   // même en cas d'échec, l'image ne doit pas rester cachée
  }
};

// ---- rendu : ouverture au scroll, respiration, dissolution, parallaxe ----
const visible = new Set();
const setMask = (fig, prop, value) => {
  fig.style.setProperty(`-webkit-mask-${prop}`, value);
  fig.style.setProperty(`mask-${prop}`, value);
};

const writeMask = (fig, st, w, h, now) => {
  const e = easeInOut(dissolve(st, now));
  const [a, b] = st.urls;
  fig.style.setProperty('--settle', (1 - e).toFixed(3));   // l'image se pose doucement en se dévoilant
  if (e >= 1) {
    if (st.maskKey !== 'none') { setMask(fig, 'image', 'none'); st.maskKey = 'none'; }
    return;
  }
  const t = now / 1000, ph = st.phase;
  const calm = reduceMotion ? 0 : 1 - e;                      // la respiration s'apaise pendant la dissolution
  const grow = reduceMotion ? 1 : 1 + 1.25 * e;                                   // le trou s'étend comme une encre qui boit le papier
  const sa = st.open * grow * (1 + calm * .022 * Math.sin(t * .37 + ph));
  const sb = st.open * grow * (1 + calm * .03 * Math.sin(t * .27 + ph + 2));
  const ax = w * calm * (.010 * Math.sin(t * .29 + ph) + .005 * Math.sin(t * .71 + ph * 1.7));
  const ay = h * calm * (.010 * Math.cos(t * .33 + ph * 1.3) + .005 * Math.sin(t * .53 + ph));
  const bx = w * calm * (.016 * Math.sin(t * .23 + ph + 1) + .007 * Math.sin(t * .61 + ph * .6));
  const by = h * calm * (.014 * Math.cos(t * .19 + ph + .5) + .006 * Math.cos(t * .83 + ph * 2.1));
  const px = (v) => `${v.toFixed(1)}px`;
  const box = (s, dx, dy) => [`${px(w * s)} ${px(h * s)}`, `${px((w - w * s) / 2 + dx)} ${px((h - h * s) / 2 + dy)}`];
  const [szA, posA] = box(sa, ax, ay), [szB, posB] = box(sb, bx, by);
  // en même temps, le reste de l'image affleure depuis le centre : les coins arrivent en dernier
  const r = smooth(.05, 1, e);
  const edge = Math.round((-25 + 130 * r) * 2) / 2;          // rayon opaque, en % de la distance au coin
  const key = r > 0 ? `r${edge}` : 'm';
  if (st.maskKey !== key) {
    const fill = r > 0 ? `, radial-gradient(farthest-corner, #000 ${edge}%, transparent ${edge + 30}%)` : '';
    setMask(fig, 'image', `url("${a}"), url("${b}")${fill}`);
    st.maskKey = key;
  }
  setMask(fig, 'size', `${szA}, ${szB}, 100% 100%`);
  setMask(fig, 'position', `${posA}, ${posB}, 0 0`);
};

const render = (now) => {
  const H = window.innerHeight;
  const rects = [...visible].map((fig) => [fig, fig.getBoundingClientRect()]);   // lectures d'abord…
  for (const [fig, r] of rects) {                                                 // …écritures ensuite
    const st = state.get(fig);
    const p = clamp01((H - r.top) / (H + r.height));         // 0 : entre par le bas, 1 : sort par le haut
    st.open = reduceMotion ? 1 : .62 + .38 * easeOut(clamp01((H - r.top) / (H * .6)));   // le trou s'ouvre pendant l'entrée
    st.onscreen = r.bottom > 0 && r.top < H;
    if (!reduceMotion) fig.style.setProperty('--drift', (p * 2 - 1).toFixed(3));
    if (canMask && st.urls) writeMask(fig, st, r.width, r.height, now);
  }
};

let raf = 0, last = 0, scrolled = true;
const tick = (now) => {
  raf = 0;
  const moving = [...visible].some((fig) => tweening(state.get(fig), now));
  // seuls les masques réellement à l'écran respirent
  const breathes = () => canMask && !reduceMotion && [...visible].some((fig) => {
    const st = state.get(fig);
    return st.onscreen && st.urls && st.maskKey !== 'none';
  });
  if (scrolled || moving || (breathes() && now - last >= 1000 / FPS - 4)) {
    render(now);
    last = now;
    scrolled = false;
  }
  const breathing = breathes();
  if (moving || breathing) raf = requestAnimationFrame(tick);
};
function wake() { if (!raf) raf = requestAnimationFrame(tick); }
const queue = () => { scrolled = true; wake(); };

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      visible.add(e.target);
      reveal(e.target);
    } else {
      visible.delete(e.target);
      // une image dévoilée se referme une fois sortie de l'écran, masque reposé tout de suite
      setOpen(e.target, false);
      const st = state.get(e.target);
      st.dur = 0;
      st.onscreen = false;
      if (canMask && st.urls) writeMask(e.target, st, e.boundingClientRect.width, e.boundingClientRect.height, performance.now());
    }
  }
  queue();
}, { rootMargin: '100% 0px' });   // on prépare masque et image un écran à l'avance

figures.forEach((fig) => io.observe(fig));
// l'îlot annonce un saut : masques et images du projet visé sont préparés tout de suite
document.addEventListener('work:prepare', (e) => {
  for (const fig of e.detail.querySelectorAll('.blot')) {
    const img = fig.querySelector('img');
    if (img) img.loading = 'eager';
    reveal(fig);
  }
});
window.addEventListener('scroll', queue, { passive: true });
window.addEventListener('resize', queue);

// ---- dissolution : survol d'une demi-seconde ou clic ----
// souris : le masque se dissout après un court survol (ou tout de suite au clic) et se
// referme quand on sort ; tactile : un tap ouvre ou referme, et ferme les autres.
if (canMask) {
  for (const fig of figures) {
    const st = state.get(fig);
    fig.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(st.hover);
      st.hover = setTimeout(() => setOpen(fig, true), HOVER_MS);
    });
    fig.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(st.hover);
      setOpen(fig, false);
    });
    fig.addEventListener('pointerdown', (e) => { st.pointer = e.pointerType; });
    // un écouteur de clic posé sur la figure : iOS envoie alors bien le tap
    fig.addEventListener('click', () => {
      clearTimeout(st.hover);
      if (st.pointer === 'mouse') { setOpen(fig, true); return; }
      const open = st.to !== 1;
      if (open) for (const other of figures) if (other !== fig) setOpen(other, false);
      setOpen(fig, open);
    });
  }
}

// ---- apparition des informations : un flou qui se dissipe ----
document.documentElement.classList.add('has-reveal');
const rio = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add('is-in');
    rio.unobserve(e.target);
  }
}, { rootMargin: '0px 0px -12% 0px' });
document.querySelectorAll('.reveal').forEach((el) => rio.observe(el));
