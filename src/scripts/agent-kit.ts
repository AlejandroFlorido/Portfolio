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
export function createRunner() {
  let gen = 0;

  function tween(dur: number, fn: (t: number) => void, g: number) {
    return new Promise<boolean>((resolve) => {
      const t0 = performance.now();
      const step = (now: number) => {
        if (g !== gen) return resolve(false);
        const t = dur <= 0 ? 1 : Math.min((now - t0) / dur, 1);
        fn(t);
        if (t < 1) requestAnimationFrame(step);
        else resolve(true);
      };
      requestAnimationFrame(step);
    });
  }

  function go(a: Agent, to: () => Pt, dur: number, g: number, onT?: (e: number) => void, ease = easeInOut) {
    const from = { ...a.pos };
    return tween(
      dur,
      (t) => {
        const e = ease(t);
        const p = to();
        a.pos = { x: lerp(from.x, p.x, e), y: lerp(from.y, p.y, e) };
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
        a.pos = path(e);
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
