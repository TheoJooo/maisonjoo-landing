// ==== FLEURS AQUARELLE ====
// Un clic plante une fleur : la tige pousse depuis le point cliqué, un bouton
// apparaît puis éclot, puis la fleur ondule doucement au vent. Chaque tête est
// peinte une seule fois hors écran (couches de lavis presque transparentes,
// façon aquarelle), puis simplement animée.
// Les fleurs vivent dans le document et défilent avec la page : le canvas couvre
// une bande autour de l'écran et se recale quand on s'approche de son bord.

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = window.innerWidth < 768;
const DPR = Math.min(window.devicePixelRatio || 1, isMobile ? 2 : 1.5);
const SPRITE_DPR = Math.min(DPR, 1.5);   // têtes un peu plus douces, et moins de mémoire
const MAX_FLOWERS = isMobile ? 36 : 64;  // au-delà, les plus anciennes s'effacent
const FADE_MS = 900;
const SWAP_MS = 700;                     // fondu d'une couleur à l'autre quand on change de mode
const SWAY_FPS = 30;                     // le vent est lent : 30 fps suffisent
const IGNORE = 'a, button, input, textarea, select, label, iframe, .pdf-modal, .blot, [data-no-flower]';

// palette relevée sur la vidéo de référence
const PALETTE = {
  pompom: ['#f43f7f', '#f2508f', '#ea3fc4', '#ff8a4a', '#f45b5b'],
  spiky:  ['#f04a3a', '#ff6d3a', '#f2614f'],
  tulip:  ['#d63fd0', '#f6a531'],
  small:  ['#f8c73e', '#ff9640', '#f0603a'],
};
const TYPES = [['pompom', .42], ['spiky', .24], ['tulip', .16], ['small', .18]];
// rayon de la tête, en fraction de U (≈ petit côté de l'écran)
const SIZES = { pompom: [.055, .09], spiky: [.042, .066], tulip: [.03, .046], small: [.016, .027] };
const STEM = [63, 125, 58];
const STEM_LIGHT = [150, 196, 128];
const LEAF = [146, 196, 124];
const PAPER = [253, 250, 250];

// modes de couleur : vif (la palette d'origine), poudré, ou encre noire
const luma = ([r, g, b]) => .299 * r + .587 * g + .114 * b;
const TONE = {
  vivid: (c) => c,
  // à moitié désaturé, puis dilué dans le papier
  soft: (c) => { const l = luma(c); return c.map((v, i) => Math.round((v + (l - v) * .55) * .7 + PAPER[i] * .3)); },
  // la clarté de la couleur d'origine devient un gris d'encre
  mono: (c) => { const g = Math.round(34 + luma(c) * .5); return [g, g, g]; },
};

const TAU = Math.PI * 2;
// hasard déterministe pendant la peinture d'une tête : repeinte avec la même graine,
// elle garde exactement sa forme et ne change que de couleur
const seeded = (seed) => () => {
  seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
let random = Math.random;
const rand = (a, b) => a + random() * (b - a);
const pick = (list) => list[random() * list.length | 0];
const gauss = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(TAU * random());
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
const easeOut = (p) => 1 - (1 - p) ** 3;
const easeInOut = (p) => p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
const easeOutBack = (p, s = 1.3) => 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2;
const pickWeighted = (list) => {
  let r = random();
  for (const [k, w] of list) if ((r -= w) <= 0) return k;
  return list[0][0];
};

const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const jitter = (rgb, amt) => rgb.map((c) => Math.max(0, Math.min(255, Math.round(c + gauss() * amt))));
const shade = (rgb, k) => rgb.map((c) => Math.round(c * k));
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// ---- aquarelle ----
// polygone de sommets [x, y, v] : v module la liberté de chaque sommet
const ellipse = (cx, cy, rx, ry, rot, n) => {
  const c = Math.cos(rot), s = Math.sin(rot), pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    pts.push([cx + x * c - y * s, cy + x * s + y * c, rand(.7, 1.3)]);
  }
  return pts;
};

// subdivision récursive : chaque arête reçoit un point médian décalé au hasard
const deform = (pts, depth, amt) => {
  for (let d = 0; d < depth; d++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const v = (a[2] + b[2]) / 2;
      const sd = Math.hypot(b[0] - a[0], b[1] - a[1]) * amt * v;
      out.push(a, [(a[0] + b[0]) / 2 + gauss() * sd, (a[1] + b[1]) / 2 + gauss() * sd, v * rand(.8, 1.2)]);
    }
    pts = out;
  }
  return pts;
};

const fillPoly = (g, pts) => {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fill();
};

// lavis : une même forme re-déformée et superposée en couches presque transparentes
const wash = (g, base, rgb, alpha, layers, amt) => {
  const shape = deform(base, 2, amt);
  g.fillStyle = rgba(rgb, alpha);
  for (let i = 0; i < layers; i++) fillPoly(g, deform(shape, 3, amt * .7));
};

const PAINT = {
  // pompon duveteux (dahlia, chrysanthème)
  pompom(g, R, rgb) {
    const deep = shade(rgb, .85);
    wash(g, ellipse(0, 0, R * .8, R * .8, 0, 12), rgb, .065, 30, .2);
    // petits pétales en couronne : la texture du dahlia
    for (let i = 0, n = Math.round(R * .9); i < n; i++) {
      const a = rand(0, TAU), r = R * rand(.35, .85);
      g.fillStyle = rgba(random() < .5 ? deep : rgb, rand(.08, .18));
      g.beginPath();
      g.ellipse(Math.cos(a) * r, Math.sin(a) * r, R * rand(.12, .2), R * rand(.05, .08), a, 0, TAU);
      g.fill();
    }
    // fines plumes radiales : le bord ébouriffé
    g.lineCap = 'round';
    for (let i = 0, n = Math.round(R * 4); i < n; i++) {
      const a = rand(0, TAU), b = gauss() * .1;
      const r0 = R * rand(.1, .55), r1 = R * rand(.7, 1), rm = (r0 + r1) / 2;
      g.strokeStyle = rgba(random() < .35 ? deep : rgb, rand(.08, .2));
      g.lineWidth = rand(.4, 1.3) * Math.max(1, R / 36);
      g.beginPath();
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      g.quadraticCurveTo(Math.cos(a + b) * rm, Math.sin(a + b) * rm, Math.cos(a + b * 1.8) * r1, Math.sin(a + b * 1.8) * r1);
      g.stroke();
    }
    wash(g, ellipse(0, 0, R * .32, R * .32, 0, 9), shade(rgb, .78), .05, 14, .25);
  },
  // étoile à pétales pointus, deux rangs
  spiky(g, R, rgb) {
    const n = 9 + (random() * 5 | 0), a0 = rand(0, TAU);
    const star = (r, off) => {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = a0 + off + i / n * TAU, b = a + Math.PI / n;
        pts.push([Math.cos(a) * r * rand(.86, 1.04), Math.sin(a) * r * rand(.86, 1.04), .35]);
        pts.push([Math.cos(b) * r * .4, Math.sin(b) * r * .4, 1]);
      }
      return pts;
    };
    wash(g, star(R, 0), rgb, .065, 24, .12);
    wash(g, star(R * .74, Math.PI / n), shade(rgb, .88), .05, 16, .12);
    wash(g, ellipse(0, 0, R * .17, R * .17, 0, 8), shade(rgb, .7), .07, 12, .25);
  },
  // tulipe : deux pétales qui s'écartent, un plus sombre au centre
  tulip(g, R, rgb) {
    wash(g, ellipse(-R * .25, -R * .08, R * .33, R * .58, -.4, 10), rgb, .05, 20, .13);
    wash(g, ellipse(R * .25, -R * .08, R * .33, R * .58, .4, 10), rgb, .05, 20, .13);
    wash(g, ellipse(0, R * .1, R * .3, R * .46, 0, 10), shade(rgb, .8), .045, 18, .13);
  },
  // petite fleur ronde à 5 ou 6 pétales
  small(g, R, rgb) {
    const k = 5 + (random() * 2 | 0), pts = [];
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * TAU, r = R * (.6 + .4 * Math.abs(Math.cos(k * a / 2)));
      pts.push([Math.cos(a) * r, Math.sin(a) * r, 1]);
    }
    wash(g, pts, rgb, .07, 18, .1);
    wash(g, ellipse(0, 0, R * .3, R * .3, 0, 8), shade(rgb, .72), .07, 10, .2);
  },
};

// grain du papier : des micro-trous qui cassent l'aplat
const grain = (g, R) => {
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0, n = R * 5; i < n; i++) {
    g.fillStyle = `rgba(0,0,0,${rand(.05, .22)})`;
    g.beginPath();
    g.arc(rand(-R, R), rand(-R, R), rand(.3, 1.1), 0, TAU);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
};

// flou bon marché, Safari compris : réductions successives par 2,
// l'image réduite est ré-agrandie au moment du dessin
const soften = (src, radius) => {
  let c = src;
  for (let s = 1; s < radius && c.width > 8; s *= 2) {
    const n = canvasOf(Math.ceil(c.width / 2), Math.ceil(c.height / 2));
    n.getContext('2d').drawImage(c, 0, 0, n.width, n.height);
    c = n;
  }
  return c;
};

const paintHead = (type, rgb, R, seed) => {
  const half = R * 1.3;
  const px = Math.ceil(half * 2 * SPRITE_DPR);
  const img = canvasOf(px, px);
  const g = img.getContext('2d');
  g.setTransform(SPRITE_DPR, 0, 0, SPRITE_DPR, px / 2, px / 2);
  random = seeded(seed);
  try {
    PAINT[type](g, R, rgb);
    grain(g, R);
  } finally {
    random = Math.random;
  }
  return { img, halo: soften(img, R * .35 * SPRITE_DPR), half };
};

// ---- tige ----
const bezier = (a, b, c, d, t) => {
  const u = 1 - t, k0 = u * u * u, k1 = 3 * u * u * t, k2 = 3 * u * t * t, k3 = t * t * t;
  return [k0 * a[0] + k1 * b[0] + k2 * c[0] + k3 * d[0], k0 * a[1] + k1 * b[1] + k2 * c[1] + k3 * d[1]];
};

// courbe échantillonnée, longueur cumulée en 3e coordonnée
const stemPath = (x, y, len) => {
  const tx = x + gauss() * len * .07;
  const c1 = [x + gauss() * len * .07, y - len * .35];
  const c2 = [tx + gauss() * len * .07, y - len * .7];
  const pts = [[x, y, 0]];
  for (let i = 1; i <= 28; i++) {
    const [px, py] = bezier([x, y], c1, c2, [tx, y - len], i / 28);
    const prev = pts[i - 1];
    pts.push([px, py, prev[2] + Math.hypot(px - prev[0], py - prev[1])]);
  }
  return pts;
};

// portion de la tige jusqu'à la longueur d
const stemTo = (pts, d) => {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (b[2] <= d) { out.push(b); continue; }
    const k = (d - a[2]) / (b[2] - a[2]);
    out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, d]);
    break;
  }
  return out;
};

// ---- vent ----
// sinus lents décalés selon x (une vague traverse le champ), modulés par des rafales
const wind = (x, t) => {
  const gust = .7 + .3 * Math.sin(t * .23) * Math.sin(t * .37 + 1.3);
  return gust * (.6 * Math.sin(t * .8 + x * .004) + .3 * Math.sin(t * 1.9 + x * .012 + 2) + .1 * Math.sin(t * 3.3 + x * .03));
};

// la tige plie comme une console : décalage ∝ (hauteur relative)², pente au sommet = 2·bend
const bendPath = (path, f, bend) => path.map(([x, y]) => {
  const u = (f.y - y) / f.h;
  return [x + bend * f.h * u * u, y];
});

// ---- couleurs ----
let mode = 'vivid';
try {
  const saved = localStorage.getItem('mj-flora');
  if (TONE[saved]) mode = saved;
} catch {}

// couleurs d'une fleur dans le mode courant (la tête, elle, est repeinte)
const colorsFor = (f) => {
  const tone = TONE[mode];
  return { stem: tone(f.base.stem), light: tone(STEM_LIGHT), deep: shade(tone(f.base.head), .72), leaves: f.base.leaves.map(tone) };
};
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const mixColors = (a, b, k) => ({
  stem: mix(a.stem, b.stem, k), light: mix(a.light, b.light, k), deep: mix(a.deep, b.deep, k),
  leaves: a.leaves.map((l, i) => mix(l, b.leaves[i], k)),
});
const swapProgress = (f, now) => f.prev ? easeInOut(clamp01((now - f.swapAt) / SWAP_MS)) : 1;

// ---- dessin ----
const layer = document.createElement('div');
layer.className = 'flora';
layer.setAttribute('aria-hidden', 'true');
const canvas = canvasOf(1, 1);
layer.appendChild(canvas);
document.body.appendChild(layer);
const ctx = canvas.getContext('2d');

const strokePath = (path) => {
  ctx.beginPath();
  ctx.moveTo(path[0][0], path[0][1]);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
  ctx.stroke();
};

const drawStem = (f, path, c) => {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(c.stem, .9);
  ctx.lineWidth = f.stemW;
  strokePath(path);
  // reflets clairs en pointillés : le grain du pinceau sur la tige
  ctx.strokeStyle = rgba(c.light, .55);
  ctx.lineWidth = f.stemW * .4;
  ctx.setLineDash(f.dash);
  strokePath(path);
  ctx.setLineDash([]);
};

const drawLeaf = (f, l, rgb, bend, t, s) => {
  const u = (f.y - l.y) / f.h;
  ctx.save();
  ctx.translate(l.x + bend * f.h * u * u, l.y);
  ctx.rotate(l.angle + 2 * bend * u + .08 * Math.sin(t * 2.3 + l.phase));
  ctx.scale(s, s);
  ctx.fillStyle = rgba(rgb, l.alpha);
  // deux voiles décalés : plus foncé là où ils se chevauchent
  for (const [w, k] of [[1, 1], [.7, .9]]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(l.w * w, -l.len * .45, 0, -l.len * k);
    ctx.quadraticCurveTo(-l.w * w * .8, -l.len * .5, 0, 0);
    ctx.fill();
  }
  ctx.restore();
};

const drawBud = (f, tip, sway, grow, a, deep) => {
  const r = f.R * (.05 + .1 * grow);
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(tip[0], tip[1]);
  ctx.rotate(f.tilt + sway);
  ctx.fillStyle = rgba(deep, .9);
  ctx.beginPath();
  ctx.ellipse(0, -r * .6, r * .75, r * 1.1, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
};

// fondu exact entre deux têtes peintes avec la même graine : même couverture, seule la
// couleur change. Dessinées l'une sur l'autre, elles pâliraient à mi-chemin.
const scratch = [canvasOf(1, 1), canvasOf(1, 1)];
const crossfade = (slot, a, b, k) => {
  const c = scratch[slot];
  if (c.width < a.width || c.height < a.height) {
    c.width = Math.max(c.width, a.width);
    c.height = Math.max(c.height, a.height);
  }
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'copy';
  g.globalAlpha = 1 - k;
  g.drawImage(a, 0, 0);
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = k;
  g.drawImage(b, 0, 0);
  return c;
};

const drawHead = (f, tip, sway, bp, age, swap) => {
  const s = .1 + .9 * easeOutBack(bp);
  // auréole : le pigment qui continue de diffuser dans le papier mouillé
  const hp = easeOut(clamp01((age - f.bloomAt - 150) / (f.bloomDur + 300)));
  const hs = s * (.95 + .2 * hp);
  const base = ctx.globalAlpha;
  ctx.save();
  ctx.translate(tip[0], tip[1]);
  ctx.rotate(f.tilt + sway);
  ctx.translate(0, -f.lift * s);
  ctx.rotate(f.rot - (1 - easeOut(bp)) * f.spin);
  ctx.globalCompositeOperation = 'source-over';   // la tête couvre le haut de sa tige
  // changement de mode : l'ancienne peinture se fond dans la nouvelle
  const { img, halo, half } = f.head;
  const im = swap < 1 ? crossfade(0, f.prev.img, img, swap) : img;
  const ha = swap < 1 ? crossfade(1, f.prev.halo, halo, swap) : halo;
  ctx.globalAlpha = base * .35 * hp;
  ctx.drawImage(ha, 0, 0, halo.width, halo.height, -half * hs, -half * hs, half * 2 * hs, half * 2 * hs);
  ctx.globalAlpha = base * Math.min(1, .35 + bp * 2);
  ctx.drawImage(im, 0, 0, img.width, img.height, -half * s, -half * s, half * 2 * s, half * 2 * s);
  ctx.restore();
};

const drawFlower = (f, now, t) => {
  const age = now - f.born;
  const grow = easeOut(clamp01(age / f.stemDur));
  const bp = clamp01((age - f.bloomAt) / f.bloomDur);
  // la jeune pousse se raidit d'abord, puis se laisse prendre par le vent
  const bend = grow * f.flex * (wind(f.x, t) + .3 * Math.sin(t * f.freq + f.phase));
  const path = bendPath(stemTo(f.stem, f.len * grow), f, bend);
  const tip = path[path.length - 1];
  const swap = swapProgress(f, now);
  const c = swap < 1 ? mixColors(f.colPrev, f.col, swap) : f.col;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';   // tiges et feuilles se mélangent comme des pigments
  if (f.dying) ctx.globalAlpha = 1 - clamp01((now - f.dying) / FADE_MS);
  drawStem(f, path, c);
  f.leaves.forEach((l, i) => {
    const lp = clamp01((grow - l.t) / .2);
    if (lp > 0) drawLeaf(f, l, c.leaves[i], bend, t, easeOutBack(lp));
  });
  if (bp < .3) drawBud(f, tip, 2 * bend, grow, 1 - bp / .3, c.deep);
  if (bp > 0) drawHead(f, tip, 2 * bend, bp, age, swap);
  ctx.restore();
};

// ---- état & boucle ----
let W = 0, H = 0, U = 0;
let CH = 0, top = -1;   // hauteur et position (dans le document) de la bande couverte par le canvas
let flowers = [];
let raf = 0, lastDraw = 0, dirty = false;

// recale le canvas autour de l'écran ; renvoie true s'il a bougé (il faut alors redessiner)
const place = () => {
  const docH = layer.clientHeight;
  const want = Math.max(1, Math.min(docH, Math.round(H * 2)));
  if (canvas.width !== Math.round(W * DPR) || want > CH || want < CH * .8) {
    CH = want;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(CH * DPR);
    canvas.style.height = `${CH}px`;
    top = -1;
  }
  const y = window.scrollY, m = Math.max(0, (CH - H) / 4);
  const lo = top > 0 ? top + m : 0;               // pas de marge au bord du document
  const hi = top + CH < docH ? top + CH - m : docH;
  if (top >= 0 && y >= lo && y + H <= hi) return false;
  const next = Math.max(0, Math.min(docH - CH, Math.round(y - (CH - H) / 2)));
  if (next === top) return false;
  top = next;
  canvas.style.transform = `translate3d(0,${top}px,0)`;
  return true;
};

const inBand = (f) => f.y + 4 > top && f.y - f.h - f.R * 2 < top + CH;

const draw = (now) => {
  const t = reduceMotion ? 0 : now / 1000;
  flowers = flowers.filter((f) => !f.dying || now - f.dying < FADE_MS);
  for (const f of flowers) if (f.prev && now - f.swapAt >= SWAP_MS) f.prev = f.colPrev = null;
  ctx.setTransform(DPR, 0, 0, DPR, 0, -top * DPR);
  ctx.clearRect(0, top, W, CH);
  for (const f of flowers) if (inBand(f)) drawFlower(f, now, t);
};

// après un changement de mode : quelques têtes repeintes par image, celles à l'écran d'abord
const repaint = (now) => {
  const t0 = performance.now();
  const stale = flowers.filter((f) => f.stale && !f.dying).sort((a, b) => inBand(b) - inBand(a));
  for (const f of stale) {
    const p = swapProgress(f, now);
    f.colPrev = f.prev ? mixColors(f.colPrev, f.col, p) : f.col;
    // second changement en plein fondu : on part de la peinture qui domine encore
    if (!f.prev || p >= .5) f.prev = f.head;
    f.head = paintHead(f.type, TONE[mode](f.base.head), f.R, f.seed);
    f.col = colorsFor(f);
    f.swapAt = reduceMotion ? -Infinity : now;
    f.stale = false;
    if (performance.now() - t0 > 8) break;
  }
  return stale.length > 0;
};

const tick = (now) => {
  raf = 0;
  const moved = place();
  if (repaint(now)) dirty = true;
  // pousse, s'efface, ou change de couleur
  const busy = flowers.some((f) => f.dying || f.stale || now - f.born < f.end || (f.prev && now - f.swapAt < SWAP_MS));
  const swaying = !reduceMotion && flowers.some(inBand);
  if (moved || busy || dirty || (swaying && now - lastDraw >= 1000 / SWAY_FPS - 4)) {
    draw(now);
    lastDraw = now;
    dirty = false;
  }
  if (busy || swaying) raf = requestAnimationFrame(tick);
};
const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };

// au-delà de MAX_FLOWERS, les plus anciennes s'effacent
const trim = (now) => {
  const alive = flowers.filter((f) => !f.dying);
  for (let i = 0; i < alive.length - MAX_FLOWERS; i++) alive[i].dying = now;
};

// x, y : coordonnées dans le document
const plant = (x, y) => {
  const now = performance.now();
  const type = pickWeighted(TYPES);
  const rgb = jitter(hexToRgb(pick(PALETTE[type])), 9);   // couleur d'origine, avant le mode
  const R = U * rand(...SIZES[type]);
  const stem = stemPath(x, y, Math.max(16, Math.min(H * rand(.24, .52), y - R - 12)));
  const len = stem[stem.length - 1][2];
  const [ax, ay] = stem[stem.length - 3], [bx, by] = stem[stem.length - 1];

  const leaves = [];
  const nLeaves = 1 + (Math.random() * Math.min(4, len / (U * .1)) | 0);
  for (let i = 0, side = Math.random() < .5 ? 1 : -1; i < nLeaves; i++, side = -side) {
    const t = rand(.1, .72);
    const [lx, ly] = stemTo(stem, len * t).pop();
    leaves.push({
      t, x: lx, y: ly,
      angle: side * rand(.45, 1.05),
      phase: rand(0, TAU),
      len: U * rand(.022, .042),
      w: U * rand(.008, .013),
      alpha: rand(.3, .48),
    });
  }

  const radial = type !== 'tulip';
  const stemDur = 380 + len * .9;
  const bloomDur = rand(1000, 1400);
  const f = {
    born: reduceMotion ? -Infinity : now,
    x, y, h: Math.max(1, y - by), R, type, stem, len, leaves,
    seed: Math.random() * 4294967296 | 0,
    base: { head: rgb, stem: jitter(STEM, 10), leaves: leaves.map(() => jitter(LEAF, 12)) },
    tilt: Math.atan2(bx - ax, ay - by),
    rot: radial ? rand(0, TAU) : gauss() * .1,
    spin: radial ? rand(.4, .9) : .12,
    lift: radial ? 0 : R * .5,           // la tulipe repose sur la tige
    flex: rand(.03, .055),               // souplesse de la tige au vent
    freq: rand(.9, 1.6), phase: rand(0, TAU),
    stemW: rand(1.1, 1.7) * Math.max(1, U / 700),
    dash: [rand(2, 5), rand(3, 8)],
    stemDur, bloomAt: stemDur * .8, bloomDur,
    end: stemDur * .8 + bloomDur + 500,
  };
  f.head = paintHead(type, TONE[mode](rgb), R, f.seed);
  f.col = colorsFor(f);
  flowers.push(f);
  trim(now);
  dirty = true;
  wake();
};

const resize = () => {
  W = document.documentElement.clientWidth;
  H = window.innerHeight;
  U = Math.min(Math.max(Math.min(W, H), 360), 1000);
  place();
  // redessin immédiat : réallouer le canvas l'a vidé, il ne doit pas rester blanc une frame
  if (flowers.length) {
    const now = performance.now();
    draw(now);
    lastDraw = now;
    wake();
  }
};

let resizeQueued = false;
window.addEventListener('resize', () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => { resizeQueued = false; resize(); });
});
// le canvas défile avec la page ; on ne le recale que près de son bord
window.addEventListener('scroll', () => { if (flowers.length) wake(); }, { passive: true });
resize();

// ---- interactions ----
// souris : on plante dès l'appui, et en glissant ; tactile : seulement sur un vrai tap
// (court et immobile). Un appui qui fait défiler la page se termine par pointercancel
// et ne plante rien. Pas d'écoute de 'click' : iOS n'en envoie pas sur du contenu
// non cliquable.
let drag = null;
let tap = null;
const canPlant = (e) => !e.target.closest?.(IGNORE);

document.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse') {
    tap = e.isPrimary && canPlant(e) ? { id: e.pointerId, x: e.pageX, y: e.pageY, t: e.timeStamp } : null;
    return;
  }
  // un appui sur la barre de défilement n'est pas un clic dans la page
  if (!e.isPrimary || e.button !== 0 || e.clientX >= document.documentElement.clientWidth || !canPlant(e)) return;
  plant(e.pageX, e.pageY);
  drag = { id: e.pointerId, x: e.pageX, y: e.pageY };
});
document.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!(e.buttons & 1)) { drag = null; return; }
  if (Math.hypot(e.pageX - drag.x, e.pageY - drag.y) < U * .08 || !canPlant(e)) return;
  drag.x = e.pageX;
  drag.y = e.pageY;
  plant(e.pageX, e.pageY);
});
const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
document.addEventListener('pointerup', (e) => {
  if (tap && e.pointerId === tap.id && e.timeStamp - tap.t < 600 && Math.hypot(e.pageX - tap.x, e.pageY - tap.y) < 10) {
    plant(tap.x, tap.y);
  }
  tap = null;
  endDrag(e);
});
document.addEventListener('pointercancel', (e) => { tap = null; endDrag(e); });
// ---- modes de couleur ----
const modeButtons = [...document.querySelectorAll('[data-flora-mode]')];
const setMode = (next) => {
  if (!TONE[next]) return;
  document.documentElement.dataset.flora = next;
  for (const b of modeButtons) b.setAttribute('aria-pressed', String(b.dataset.floraMode === next));
  if (next === mode) return;
  mode = next;
  try { localStorage.setItem('mj-flora', next); } catch {}
  for (const f of flowers) f.stale = true;
  wake();
};
modeButtons.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.floraMode)));
setMode(mode);

// le choix des couleurs reste caché : la touche F l'ouvre ou le referme, Échap le referme
const tint = document.querySelector('.tint');
const showTint = (open) => {
  if (!tint) return;
  tint.classList.toggle('is-open', open);
  tint.inert = !open;
  if (!open && tint.contains(document.activeElement)) document.activeElement.blur();
};
showTint(false);
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  if (document.documentElement.classList.contains('modal-open')) return;
  if (e.key === 'f' || e.key === 'F') showTint(!tint?.classList.contains('is-open'));
  else if (e.key === 'Escape') showTint(false);
});

// sans ça, glisser depuis une photo lance le glisser-déposer natif et coupe la traînée de fleurs
document.addEventListener('dragstart', (e) => e.preventDefault());
