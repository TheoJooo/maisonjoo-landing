// ==== GALERIE : les images apparaissent à travers des trous irréguliers de la page ====
// Chaque figure reçoit un masque peint à la volée (formes organiques au bord
// d'aquarelle, même technique que les fleurs). Au scroll, le trou s'ouvre et
// l'image glisse plus lentement que la page, comme si elle était posée derrière.

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canMask = CSS.supports('mask-image', 'none') || CSS.supports('-webkit-mask-image', 'none');
const figures = [...document.querySelectorAll('.blot')];
const MASK_PX = 640;   // côté long du masque ; ses bords doux supportent l'agrandissement

const TAU = Math.PI * 2;
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
const easeOut = (p) => 1 - (1 - p) ** 3;

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

// peint le masque en coordonnées 0..1 ; noir = l'image est visible
const paintMask = (w, h, rnd, shapeIndex) => {
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

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.scale(w, h);
  for (const { pts, amt } of SHAPES[shapeIndex % SHAPES.length]()) {
    const form = deform(pts, 2, amt);
    const [mx, my] = form.reduce(([sx, sy], [x, y]) => [sx + x / form.length, sy + y / form.length], [0, 0]);
    // cœur plein, un peu en retrait : l'image y est nette
    g.fillStyle = '#000';
    fillPoly(g, deform(form.map(([x, y, v]) => [mx + (x - mx) * .9, my + (y - my) * .9, v]), 2, amt * .5));
    // bord d'aquarelle : couches presque transparentes, chacune re-déformée
    g.fillStyle = 'rgba(0,0,0,.09)';
    for (let i = 0; i < 16; i++) fillPoly(g, deform(form, 3, amt * .7));
    // quelques éclaboussures autour
    for (let i = 0, n = 4 + rnd() * 8 | 0; i < n; i++) {
      const [x, y] = form[rnd() * form.length | 0], k = 1.04 + rnd() * .1;
      g.fillStyle = `rgba(0,0,0,${.4 + rnd() * .5})`;
      g.beginPath();
      g.arc(mx + (x - mx) * k, my + (y - my) * k, .004 + rnd() * .012, 0, TAU);
      g.fill();
    }
  }
  return c;
};

const toUrl = (canvas) => new Promise((resolve) => {
  canvas.toBlob((b) => resolve(b ? URL.createObjectURL(b) : canvas.toDataURL()));
});

const reveal = async (fig) => {
  if (fig.dataset.mask) return;
  fig.dataset.mask = 'pending';
  const img = fig.querySelector('img');
  try {
    if (canMask) {
      const i = figures.indexOf(fig);
      const ar = fig.clientWidth / fig.clientHeight || 1;
      const w = Math.round(ar >= 1 ? MASK_PX : MASK_PX * ar);
      const h = Math.round(ar >= 1 ? MASK_PX / ar : MASK_PX);
      const url = await toUrl(paintMask(w, h, seeded(i * 7919 + 1), i));
      fig.style.setProperty('-webkit-mask-image', `url("${url}")`);
      fig.style.setProperty('mask-image', `url("${url}")`);
    }
    await img?.decode().catch(() => {});
  } finally {
    fig.classList.add('is-masked');   // même en cas d'échec, l'image ne doit pas rester cachée
  }
};

// ---- scroll : ouverture du trou + parallaxe ----
const visible = new Set();
let queued = false;

const update = () => {
  queued = false;
  const H = window.innerHeight;
  const rects = [...visible].map((fig) => [fig, fig.getBoundingClientRect()]);   // lectures d'abord…
  for (const [fig, r] of rects) {                                                 // …écritures ensuite
    const p = clamp01((H - r.top) / (H + r.height));         // 0 : entre par le bas, 1 : sort par le haut
    const open = easeOut(clamp01((H - r.top) / (H * .6)));   // le trou s'ouvre pendant l'entrée
    fig.style.setProperty('--drift', (p * 2 - 1).toFixed(3));
    fig.style.setProperty('--open', (.62 + .38 * open).toFixed(3));
  }
};
const queue = () => {
  if (queued || reduceMotion) return;
  queued = true;
  requestAnimationFrame(update);
};

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      visible.add(e.target);
      reveal(e.target);
    } else {
      visible.delete(e.target);
    }
  }
  queue();
}, { rootMargin: '100% 0px' });   // on prépare masque et image un écran à l'avance

figures.forEach((fig) => io.observe(fig));
window.addEventListener('scroll', queue, { passive: true });
window.addEventListener('resize', queue);
