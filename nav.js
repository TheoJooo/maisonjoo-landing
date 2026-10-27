// ==== NAVIGATION FLOTTANTE ====
// À gauche, un îlot vertical suit les projets : une fine colonne de traits, à l'écart
// du texte. Au survol, ou en y glissant le doigt, il s'ouvre et nomme tous les projets ;
// un clic, ou le doigt levé, emmène au projet pointé.
// En bas, une barre (accueil, dossier, contact) revient dès qu'on remonte la page
// et s'efface quand on redescend.

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const hero = document.querySelector('.hero');
const work = document.querySelector('.work');
const projects = [...document.querySelectorAll('.project')];
const island = document.querySelector('.island');
const list = island.querySelector('.island__list');
const nowEl = island.querySelector('.island__now');
const dock = document.querySelector('.dock');
const root = document.documentElement;

const scrollToY = (y) => window.scrollTo({ top: Math.max(0, y), behavior: reduceMotion ? 'auto' : 'smooth' });

// ---- îlot : une entrée par projet, tirée de sa légende ----
const span = (cls, text = '') => {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
};
const numbers = [];
const links = projects.map((p, i) => {
  const n = p.querySelector('.caption__n')?.textContent.trim() || String(i + 1).padStart(2, '0');
  const name = p.querySelector('.caption__client')?.textContent.trim() || n;
  p.id ||= `work-${n}`;
  p.tabIndex = -1;   // pour y poser le focus après un saut
  numbers.push(n);
  const a = document.createElement('a');
  a.className = 'island__item';
  a.href = `#${p.id}`;
  a.style.setProperty('--k', i);
  const tick = span('island__tick');
  tick.setAttribute('aria-hidden', 'true');
  const label = span('island__label');
  label.append(span('island__n', n), ' ', name);
  a.append(tick, label);
  const li = document.createElement('li');
  li.appendChild(a);
  list.appendChild(li);
  return a;
});

const go = (i) => {
  const target = projects[i];
  // les images du projet visé se chargent pendant le trajet, pas à l'arrivée
  document.dispatchEvent(new CustomEvent('work:prepare', { detail: target }));
  scrollToY(target.getBoundingClientRect().top + window.scrollY - window.innerHeight * .1);
  target.focus({ preventScroll: true });
};

// ouvert, l'îlot prend la largeur du plus long nom
const measure = () => {
  const col = island.querySelector('.island__now').offsetWidth;
  const widest = Math.max(...links.map((a) => a.lastChild.offsetWidth));
  island.style.setProperty('--open-w', `${Math.ceil(col + widest)}px`);
};
measure();
document.fonts?.ready.then(measure);

// le projet pointé ressort parmi les autres ; -1 n'en pointe aucun
let hot = -1;
const point = (i) => {
  if (i === hot) return;
  hot = i;
  links.forEach((a, j) => a.classList.toggle('is-hot', j === i));
};
// le trait le plus proche d'une hauteur à l'écran
const rowAt = (y) => {
  const first = links[0].getBoundingClientRect(), last = links[links.length - 1].getBoundingClientRect();
  const k = (y - first.top) / ((last.bottom - first.top) / links.length);
  return Math.max(0, Math.min(links.length - 1, Math.floor(k)));
};

// souris : on survole, on clique ; doigt : on glisse le long des traits, on lève pour y aller
let pointer = 'mouse', scrub = null;
island.addEventListener('pointerdown', (e) => {
  pointer = e.pointerType;
  if (pointer === 'mouse') return;
  scrub = e.pointerId;
  island.setPointerCapture(e.pointerId);
  island.classList.add('is-scrub');
  point(rowAt(e.clientY));
});
island.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' || e.pointerId === scrub) point(rowAt(e.clientY));
});
const endScrub = (e, jump) => {
  if (e.pointerId !== scrub) return;
  scrub = null;
  island.classList.remove('is-scrub');
  if (jump && hot >= 0) go(hot);
  point(-1);
};
island.addEventListener('pointerup', (e) => endScrub(e, true));
island.addEventListener('pointercancel', (e) => endScrub(e, false));
island.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') point(-1); });
island.addEventListener('click', (e) => {
  e.preventDefault();
  // au doigt, le saut a déjà eu lieu au lever ; Entrée au clavier arrive avec detail 0
  if (pointer !== 'mouse' && e.detail !== 0) return;
  const a = e.target.closest('a');
  const i = a ? links.indexOf(a) : hot;
  if (i >= 0) go(i);
});
island.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) point(links.indexOf(e.target)); });
island.addEventListener('focusout', () => point(-1));

// ---- barre du bas ----
// un clic remonte en haut ; un appui long ouvre le choix des couleurs des fleurs
const home = dock.querySelector('.dock__home');
let press = 0, pressed = false;
home.addEventListener('pointerdown', () => {
  pressed = false;
  clearTimeout(press);
  press = setTimeout(() => {
    pressed = true;
    navigator.vibrate?.(8);
    document.dispatchEvent(new CustomEvent('flora:toggle'));
  }, 550);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach((type) => home.addEventListener(type, () => clearTimeout(press)));
home.addEventListener('contextmenu', (e) => e.preventDefault());   // pas de menu « ouvrir le lien » à l'appui long
home.addEventListener('click', (e) => {
  e.preventDefault();
  if (pressed) { pressed = false; return; }
  scrollToY(0);
  hero.focus({ preventScroll: true });   // le clavier repart du haut de la page
});

// ---- suivi du scroll ----
let lastY = Math.max(0, window.scrollY), travel = 0, current = -2, queued = false;

const update = () => {
  queued = false;
  const H = window.innerHeight;
  // le rebond élastique de Safari en bas de page ne doit pas compter comme une remontée
  const y = Math.min(Math.max(window.scrollY, 0), root.scrollHeight - H);

  // projet courant : le dernier dont le haut a passé le milieu de l'écran
  let cur = -1;
  projects.forEach((p, i) => { if (p.getBoundingClientRect().top < H * .5) cur = i; });
  const wr = work.getBoundingClientRect();
  island.classList.toggle('is-shown', wr.top < H * .55 && wr.bottom > H * .45);
  if (cur !== current) {
    current = cur;
    links.forEach((a, i) => {
      if (i === cur) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    nowEl.textContent = numbers[Math.max(0, cur)];
  }

  // la barre revient après une petite remontée, repart après une petite descente
  const dy = y - lastY;
  lastY = y;
  if (dy && Math.sign(dy) !== Math.sign(travel)) travel = 0;
  travel += dy;
  const past = y >= hero.offsetHeight * .6;
  if (!past) dock.classList.remove('is-shown');   // l'accueil a déjà ses boutons
  else if (travel < -30) dock.classList.add('is-shown');
  else if (travel > 30) dock.classList.remove('is-shown');
  const shown = dock.classList.contains('is-shown');
  // sur mobile, le choix des couleurs se range avec la barre, et se pose au-dessus d'elle quand elle revient
  root.classList.toggle('ui-tucked', past && !shown);
  root.classList.toggle('dock-shown', shown);
};
const queue = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(update);
};
window.addEventListener('scroll', queue, { passive: true });
window.addEventListener('resize', () => { measure(); queue(); });
update();
