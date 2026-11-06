// Herramientas compartidas por los punteros que arman partes de la interfaz
// fuera del escenario (nodo rojo de cerrar, pantallas de cada sección).

export interface Pt {
  x: number;
  y: number;
}

export interface Agent {
  el: HTMLElement;
  tag: HTMLElement;
  pos: Pt;
}

const ARROW = `<svg viewBox="0 0 16 18" aria-hidden="true"><path d="M1.5 1.5 4 16.5l3-5.2h7.5z"/></svg>`;

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Arranca rápido, se pasa un poco del objetivo y vuelve (movimiento nervioso). */
export const easeOutBack = (t: number) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

// ---------- Movimiento errático compartido por todos los punteros ----------

/** Factor global de duración: menos de 1 = punteros más rápidos. */
export const SPEED = 0.8;

export interface Wobble {
  bend: number;
  f1: number;
  f2: number;
  p1: number;
  p2: number;
  amp: number;
}

/**
 * Parámetros al azar para un trayecto: curva, temblor y frecuencia propios.
 * `chaos` escala qué tan nervioso es (1 = normal, 3 = desquiciado).
 */
export function newWobble(chaos = 1): Wobble {
  const k = Math.sqrt(chaos);
  return {
    bend: (Math.random() - 0.5) * 1.2 * chaos,
    f1: (2 + Math.random() * 3) * k,
    f2: (5 + Math.random() * 6) * k,
    p1: Math.random() * Math.PI * 2,
    p2: Math.random() * Math.PI * 2,
    amp: (5 + Math.random() * 7) * chaos,
  };
}

/** Sacudida al azar (en px) que se suma al recorrido; 0 en los extremos. */
export function shake(chaos: number, t: number): Pt {
  if (chaos <= 1 || t >= 1) return { x: 0, y: 0 };
  const s = (chaos - 1) * 3.2 * Math.sin(Math.PI * t);
  return { x: (Math.random() - 0.5) * s, y: (Math.random() - 0.5) * s };
}

/**
 * Punto del trayecto (e de 0 a 1) entre from y to: en vez de ir en línea recta
 * hace una curva al azar y tiembla un poco, quieto en los extremos.
 */
export function erratic(from: Pt, to: Pt, e: number, w: Wobble): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = -dy / d;
  const ny = dx / d;
  const env = Math.sin(Math.PI * Math.min(1, Math.max(0, e)));
  const arc = env * w.bend * Math.min(d, 260);
  const side = env * w.amp * (Math.sin(e * w.f1 * 6.283 + w.p1) * 0.6 + Math.sin(e * w.f2 * 6.283 + w.p2) * 0.4);
  const along = env * w.amp * 0.5 * Math.sin(e * (w.f1 + w.f2) * 3.14 + w.p2);
  return {
    x: from.x + dx * e + nx * (arc + side) + (dx / d) * along,
    y: from.y + dy * e + ny * (arc + side) + (dy / d) * along,
  };
}

/** Curva de aceleración al azar para cada trayecto. */
export const randomEase = (chaos = 1) => (Math.random() < 0.4 + (chaos - 1) * 0.2 ? easeOutBack : easeInOut);

/** Crea un puntero fijo en pantalla (por encima del panel). */
export function makeAgent(color: string, extraClass: string): Agent {
  const el = document.createElement("div");
  el.className = `agent agent--fixed ${extraClass}`;
  el.setAttribute("aria-hidden", "true");
  el.style.setProperty("--c", color);
  el.innerHTML = `${ARROW}<span class="agent__tag"></span>`;
  document.body.append(el);
  return { el, tag: el.querySelector<HTMLElement>(".agent__tag")!, pos: { x: 0, y: 0 } };
}

export function render(a: Agent) {
  a.el.style.transform = `translate3d(${a.pos.x}px, ${a.pos.y}px, 0)`;
}

export function click(a: Agent) {
  a.el.classList.remove("is-click");
  void a.el.offsetWidth;
  a.el.classList.add("is-click");
}

export function show(a: Agent, at: Pt, tag: string) {
  a.pos = { ...at };
  render(a);
  a.tag.textContent = tag;
  a.el.classList.add("is-on", "is-tagged");
}

export function hide(a: Agent) {
  a.el.classList.remove("is-on", "is-tagged");
}

/**
 * Animaciones cancelables: cada `next()` invalida las animaciones anteriores
 * (sus promesas resuelven `false`).
 */
export function createRunner(chaos = 1) {
  let gen = 0;

  function tween(dur: number, fn: (t: number) => void, g: number) {
    return new Promise<boolean>((resolve) => {
      const t0 = performance.now();
      const step = (now: number) => {
        if (g !== gen) return resolve(false);
        const t = dur <= 0 ? 1 : Math.min((now - t0) / (dur * SPEED), 1);
        fn(t);
        if (t < 1) requestAnimationFrame(step);
        else resolve(true);
      };
      requestAnimationFrame(step);
    });
  }

  function go(a: Agent, to: () => Pt, dur: number, g: number, onT?: (e: number) => void, ease = randomEase(chaos)) {
    const from = { ...a.pos };
    const w = newWobble(chaos);
    return tween(
      dur * (0.75 + Math.random() * 0.4),
      (t) => {
        const e = ease(t);
        const p = erratic(from, to(), e, w);
        const j = shake(chaos, t);
        a.pos = { x: p.x + j.x, y: p.y + j.y };
        render(a);
        onT?.(e);
      },
      g,
    );
  }

  function trace(a: Agent, dur: number, g: number, path: (t: number) => Pt, work: (t: number) => void, ease = easeInOut) {
    return tween(
      dur,
      (t) => {
        const e = ease(t);
        const p = path(e);
        const j = shake(chaos, t);
        a.pos = { x: p.x + j.x, y: p.y + j.y };
        render(a);
        work(e);
      },
      g,
    );
  }

  /** El puntero persigue un objetivo que se mueve hasta que `until` termina. */
  function chase(a: Agent, target: () => Pt, until: Promise<unknown>, g: number) {
    return new Promise<boolean>((resolve) => {
      let finished = false;
      until.then(() => (finished = true));
      const step = () => {
        if (g !== gen) return resolve(false);
        const p = target();
        a.pos = { x: lerp(a.pos.x, p.x, 0.35), y: lerp(a.pos.y, p.y, 0.35) };
        render(a);
        if (finished) resolve(true);
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  return {
    next: () => ++gen,
    tween,
    go,
    trace,
    chase,
    wait: (ms: number, g: number) => tween(ms, () => {}, g),
  };
}

/** Sonido de tipeo cada tanto mientras t avanza de 0 a 1. */
export function ticker(steps: number, play: () => void) {
  let last = -1;
  return (t: number) => {
    const k = Math.floor(t * steps);
    if (k !== last) {
      last = k;
      play();
    }
  };
}
