// "Agentes": punteros que orbitan el núcleo en reposo y, al activarlo, arman
// la interfaz entre todos. Cada nodo tiene su cuadrilla de 5 punteros:
//   MOV    trae el nodo desde el núcleo hasta su lugar
//   NÚCLEO llena el centro del nodo
//   ÓRBITA dibuja el anillo que gira alrededor del nodo
//   ENLACE traza la línea que lo conecta con el núcleo
//   TEXTO  escribe el nombre y el código
// Al apagar el núcleo hacen todo al revés, se llevan los nodos y vuelven a orbitar.

import { sfx } from "./sound";
import { SPEED, newWobble, erratic, randomEase } from "./agent-kit";

// Qué tan nerviosos son los punteros cian (1 = normal)
const CHAOS = 1.4;

export interface Pt {
  x: number;
  y: number;
}
export interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CrewOptions {
  stage: HTMLElement;
  core: HTMLElement;
  nodes: HTMLButtonElement[];
  codes: string[];
  /** Posición final del nodo i, relativa al centro de la pantalla. */
  target: (i: number) => Pt;
  /** Segmento final de la conexión del nodo i (coordenadas de pantalla). */
  segment: (i: number) => Seg;
  /** Progreso de la conexión: null = oculta, 0..1 = trazándose, 1 = completa. */
  link: (i: number, progress: number | null) => void;
  reduceMotion: boolean;
  /** Órbita en 3D alrededor del núcleo (si hay escena 3D): punto de pantalla. */
  orbit3d?: (angle: number, ring: number, tilt: number) => { x: number; y: number; scale: number; occluded: boolean };
}

type Role = "mov" | "core" | "ring" | "link" | "txt";
const ROLES: Role[] = ["mov", "core", "ring", "link", "txt"];
// Todo en la misma gama de cian, solo cambia el brillo
const SHADES: Record<Role, string> = {
  mov: "#50dcff",
  core: "#a6f4ff",
  ring: "#2eb6e0",
  link: "#d4faff",
  txt: "#74d4f2",
};
const TAGS: Record<Exclude<Role, "mov">, string> = {
  core: "NÚCLEO",
  ring: "ÓRBITA",
  link: "ENLACE",
  txt: "TEXTO",
};
const ARROW = `<svg viewBox="0 0 16 18" aria-hidden="true"><path d="M1.5 1.5 4 16.5l3-5.2h7.5z"/></svg>`;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Agent {
  el: HTMLElement;
  tag: HTMLElement;
  pos: Pt;
  mode: "orbit" | "task" | "hidden";
  angle: number;
  speed: number;
  ring: number;
  phase: number;
  // Temblor en órbita: desvío actual, desvío buscado y cuándo cambia
  jx: number;
  jy: number;
  tx: number;
  ty: number;
  nextJump: number;
  surge: number;
  // En 3D: escala por profundidad y si lo tapa el núcleo
  depth: number;
  hidden: boolean;
}

interface Team {
  mov: Agent;
  core: Agent;
  ring: Agent;
  link: Agent;
  txt: Agent;
  sel: HTMLElement;
}

export function createCrew(o: CrewOptions) {
  let gen = 0;
  const center = (): Pt => ({ x: innerWidth / 2, y: innerHeight / 2 });
  const coreR = () => o.core.offsetWidth / 2;
  const all: Agent[] = [];

  function makeAgent(i: number, r: number, role: Role): Agent {
    const el = document.createElement("div");
    el.className = "agent";
    el.setAttribute("aria-hidden", "true");
    el.style.setProperty("--c", SHADES[role]);
    el.innerHTML = `${ARROW}<span class="agent__tag"></span>`;
    o.stage.append(el);
    const a: Agent = {
      el,
      tag: el.querySelector<HTMLElement>(".agent__tag")!,
      pos: center(),
      mode: o.reduceMotion ? "hidden" : "orbit",
      angle: (i / o.nodes.length) * Math.PI * 2 + r * 0.45,
      speed: (0.45 + r * 0.1 + Math.random() * 0.2) * (r % 2 ? -1 : 1),
      ring: r,
      phase: i * 1.7 + r,
      jx: 0,
      jy: 0,
      tx: 0,
      ty: 0,
      nextJump: 0,
      surge: 0,
      depth: 1,
      hidden: false,
    };
    all.push(a);
    return a;
  }

  const teams: Team[] = o.nodes.map((_, i) => {
    const sel = document.createElement("div");
    sel.className = "sel";
    sel.setAttribute("aria-hidden", "true");
    sel.innerHTML = "<i></i><i></i><i></i><i></i>";
    o.stage.append(sel);
    const team = { sel } as unknown as Team;
    ROLES.forEach((role, r) => (team[role] = makeAgent(i, r, role)));
    return team;
  });

  // ---------- Órbita ----------
  function orbitPoint(a: Agent, time: number): Pt {
    if (o.orbit3d) {
      // En 3D: anillos inclinados; más grande cuanto más cerca, tapado detrás del núcleo
      const p = o.orbit3d(a.angle, a.ring, Math.sin(a.phase * 1.3) * 0.7);
      a.depth = p.scale;
      a.hidden = p.occluded;
      return { x: p.x + a.jx * 0.6 * p.scale, y: p.y + a.jy * 0.6 * p.scale };
    }
    const c = center();
    const r = coreR() + 18 + a.ring * 13;
    return {
      x: c.x + Math.cos(a.angle) * r * 1.12 + a.jx,
      y: c.y + Math.sin(a.angle) * r * 0.9 + Math.sin(time * 1.6 + a.phase) * 4 + a.jy,
    };
  }

  function render(a: Agent) {
    a.el.style.transform = `translate3d(${a.pos.x}px, ${a.pos.y}px, 0)`;
    const orbiting = a.mode === "orbit";
    a.el.style.setProperty("--k", orbiting ? a.depth.toFixed(3) : "1");
    a.el.style.setProperty("--fade", orbiting && a.hidden ? "0.08" : "1");
  }

  let lastT = performance.now();
  function loop(now: number) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    const time = now / 1000;
    for (const a of all) {
      // Cada tanto el puntero da un salto corto al azar y acelera de golpe
      if (time > a.nextJump) {
        a.nextJump = time + 0.15 + Math.random() * 0.8;
        a.tx = (Math.random() - 0.5) * 38;
        a.ty = (Math.random() - 0.5) * 30;
        if (Math.random() < 0.45) a.surge = 1;
      }
      a.jx += (a.tx - a.jx) * Math.min(1, dt * 12);
      a.jy += (a.ty - a.jy) * Math.min(1, dt * 12);
      a.surge = Math.max(0, a.surge - dt * 2.5);
      const wobble = 1 + 0.6 * Math.sin(time * 2.3 + a.phase) + a.surge * 2.2;
      a.angle += a.speed * dt * wobble;
      if (a.mode === "orbit") {
        a.pos = orbitPoint(a, now / 1000);
        render(a);
      }
    }
    requestAnimationFrame(loop);
  }
  if (!o.reduceMotion) {
    all.forEach((a) => a.el.classList.add("is-on"));
    requestAnimationFrame(loop);
  }

  // ---------- Utilidades ----------
  function tween(dur: number, fn: (t: number) => void, g: number) {
    return new Promise<boolean>((resolve) => {
      const t0 = performance.now();
      const step = (now: number) => {
        if (g !== gen) return resolve(false);
        const t = Math.min((now - t0) / (dur * SPEED), 1);
        fn(t);
        if (t < 1) requestAnimationFrame(step);
        else resolve(true);
      };
      requestAnimationFrame(step);
    });
  }
  const wait = (ms: number, g: number) => tween(ms, () => {}, g);

  function go(a: Agent, to: () => Pt, dur: number, g: number, onT?: (e: number) => void, ease = randomEase(CHAOS)) {
    const from = { ...a.pos };
    const w = newWobble(CHAOS);
    return tween(
      dur * (0.75 + Math.random() * 0.4),
      (t) => {
        const e = ease(t);
        a.pos = erratic(from, to(), e, w);
        render(a);
        onT?.(e);
      },
      g,
    );
  }

  // Mueve el puntero por una trayectoria mientras hace su trabajo
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

  function click(a: Agent) {
    a.el.classList.remove("is-click");
    void a.el.offsetWidth;
    a.el.classList.add("is-click");
  }

  function tagOn(a: Agent, text: string) {
    a.tag.textContent = text;
    a.el.classList.add("is-tagged");
  }

  function appear(a: Agent, near: Pt) {
    if (a.mode === "hidden") {
      a.pos = { x: near.x + 26, y: near.y + 34 };
      render(a);
    }
    a.mode = "task";
    a.el.classList.add("is-on");
  }

  async function leave(a: Agent, g: number) {
    a.el.classList.remove("is-on", "is-tagged");
    const away = { x: a.pos.x + 14, y: a.pos.y + 22 };
    if (await go(a, () => away, 380, g, undefined, easeOut)) a.mode = "hidden";
  }

  async function home(a: Agent, g: number) {
    a.el.classList.remove("is-tagged");
    a.el.classList.add("is-on");
    if (await go(a, () => orbitPoint(a, performance.now() / 1000), 750, g)) a.mode = "orbit";
  }

  // Tic de tipeo cada tanto mientras avanza t
  function ticker(steps: number) {
    let last = -1;
    return (t: number) => {
      const k = Math.floor(t * steps);
      if (k !== last) {
        last = k;
        sfx.type();
      }
    };
  }

  // ---------- Geometría de un nodo en pantalla ----------
  function geom(i: number) {
    const btn = o.nodes[i];
    const dot = btn.querySelector<HTMLElement>(".node__dot")!;
    const label = btn.querySelector<HTMLElement>(".node__label")!;
    const code = btn.querySelector<HTMLElement>(".node__code")!;
    const c = center();
    const t = o.target(i);
    const left = c.x + t.x - btn.offsetWidth / 2;
    const top = c.y + t.y - btn.offsetHeight / 2;
    const line = (el: HTMLElement) => ({
      x0: left + el.offsetLeft,
      x1: left + el.offsetLeft + el.offsetWidth,
      y: top + el.offsetTop + el.offsetHeight * 0.85,
    });
    return {
      n: { x: c.x + t.x, y: c.y + t.y },
      d: { x: left + dot.offsetLeft + dot.offsetWidth / 2, y: top + dot.offsetTop + dot.offsetHeight / 2 },
      r: dot.offsetWidth / 2,
      w: btn.offsetWidth,
      h: btn.offsetHeight,
      label: line(label),
      code: line(code),
    };
  }

  const PARTS = ["core", "ring", "txt", "code"] as const;
  function setPart(i: number, part: (typeof PARTS)[number], v: number) {
    o.nodes[i].style.setProperty(`--${part}`, String(Math.max(0, Math.min(1, v))));
  }

  function setNode(i: number, rel: Pt, scale: number, opacity: number) {
    const s = o.nodes[i].style;
    s.setProperty("--px", `${rel.x}px`);
    s.setProperty("--py", `${rel.y}px`);
    s.setProperty("--s", String(scale));
    s.setProperty("--o", String(opacity));
  }

  // El nodo sigue al puntero MOV (la punta queda sobre el punto del nodo)
  function follow(a: Agent, i: number, off: number, scale: number, opacity: number) {
    const c = center();
    setNode(i, { x: a.pos.x - c.x, y: a.pos.y - c.y - off }, scale, opacity);
  }

  function flash(team: Team, i: number) {
    const g = geom(i);
    const w = g.w + 18;
    const h = g.h + 14;
    const sel = team.sel;
    sel.style.width = `${w}px`;
    sel.style.height = `${h}px`;
    sel.style.transform = `translate(${g.n.x - w / 2}px, ${g.n.y - h / 2}px)`;
    sel.dataset.size = `${Math.round(w)}×${Math.round(h)}`;
    sel.classList.remove("is-flash");
    void sel.offsetWidth;
    sel.classList.add("is-flash");
  }

  // ---------- Trabajos de cada rol ----------
  async function carryIn(team: Team, i: number, g: number) {
    const a = team.mov;
    const t0 = o.target(i);
    const ang = Math.atan2(t0.y, t0.x);
    const off = geom(i).d.y - geom(i).n.y;
    appear(a, center());
    const pick = () => {
      const c = center();
      const r = coreR() * 0.4;
      return { x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r };
    };
    if (!(await go(a, pick, 420, g))) return false;

    // Agarra el "esqueleto" del nodo: solo el contorno, sin relleno ni textos
    click(a);
    sfx.grab();
    tagOn(a, o.codes[i]);
    PARTS.forEach((p) => setPart(i, p, 0));
    o.link(i, null);
    o.nodes[i].classList.add("is-driven");
    follow(a, i, off, 0.25, 0);
    if (!(await wait(120, g))) return false;

    const dest = () => geom(i).d;
    if (!(await go(a, dest, 900, g, (e) => follow(a, i, off, lerp(0.3, 1, e), Math.min(1, e * 3))))) return false;

    o.nodes[i].classList.remove("is-driven");
    o.nodes[i].classList.add("is-placed");
    flash(team, i);
    click(a);
    sfx.drop();
    return true;
  }

  async function carryOut(team: Team, i: number, g: number) {
    const a = team.mov;
    const t0 = o.target(i);
    const ang = Math.atan2(t0.y, t0.x);
    const off = geom(i).d.y - geom(i).n.y;
    const dot = () => geom(i).d;
    appear(a, dot());
    if (!(await go(a, dot, 380, g))) return false;

    flash(team, i);
    click(a);
    sfx.grab();
    tagOn(a, o.codes[i]);
    o.nodes[i].classList.remove("is-placed");
    o.nodes[i].classList.add("is-driven");
    follow(a, i, off, 1, 1);
    if (!(await wait(150, g))) return false;

    // Descolocarlo: un tirón hacia un costado
    const d = dot();
    const side = i % 2 ? 1 : -1;
    const scatter = {
      x: d.x + Math.cos(ang + (side * Math.PI) / 2) * 70 + (Math.random() - 0.5) * 50,
      y: d.y + Math.sin(ang + (side * Math.PI) / 2) * 70 + (Math.random() - 0.5) * 50,
    };
    if (!(await go(a, () => scatter, 420, g, () => follow(a, i, off, 1, 1), easeOut))) return false;

    // Y adentro del núcleo
    const into = () => {
      const c = center();
      return { x: c.x + Math.cos(ang) * coreR() * 0.3, y: c.y + Math.sin(ang) * coreR() * 0.3 };
    };
    if (!(await go(a, into, 620, g, (e) => follow(a, i, off, lerp(1, 0.2, e), 1 - e)))) return false;
    o.nodes[i].classList.remove("is-driven", "is-placed");
    sfx.grab();
    return true;
  }

  async function coreWork(a: Agent, i: number, g: number, build: boolean) {
    appear(a, geom(i).d);
    if (!(await go(a, () => geom(i).d, 450, g))) return false;
    tagOn(a, TAGS.core);
    for (let k = 0; k < 3; k++) {
      click(a);
      sfx.grab();
      const ok = await tween(150, (t) => setPart(i, "core", build ? (k + t) / 3 : 1 - (k + t) / 3), g);
      if (!ok) return false;
    }
    return true;
  }

  async function ringWork(a: Agent, i: number, g: number, build: boolean) {
    const at = (ang: number) => {
      const G = geom(i);
      const r = G.r + 8;
      return { x: G.d.x + Math.cos(ang) * r, y: G.d.y + Math.sin(ang) * r };
    };
    const start = -Math.PI / 2;
    appear(a, at(start));
    if (!(await go(a, () => at(start), 450, g))) return false;
    tagOn(a, TAGS.ring);
    click(a);
    return trace(
      a,
      750,
      g,
      (t) => at(start + (build ? t : 1 - t) * Math.PI * 2),
      (t) => setPart(i, "ring", build ? t : 1 - t),
    );
  }

  async function linkWork(a: Agent, i: number, g: number, build: boolean) {
    const along = (p: number) => {
      const s = o.segment(i);
      return { x: lerp(s.x1, s.x2, p), y: lerp(s.y1, s.y2, p) };
    };
    const from = build ? 0 : 1;
    appear(a, along(from));
    if (!(await go(a, () => along(from), 450, g))) return false;
    tagOn(a, TAGS.link);
    click(a);
    const ok = await trace(
      a,
      650,
      g,
      (t) => along(build ? t : 1 - t),
      (t) => o.link(i, build ? Math.min(t, 0.999) : Math.max(1 - t, 0.001)),
    );
    if (!ok) return false;
    o.link(i, build ? 1 : null);
    return true;
  }

  async function textWork(a: Agent, i: number, g: number, build: boolean) {
    const on = (which: "label" | "code", u: number) => {
      const L = geom(i)[which];
      return { x: lerp(L.x0, L.x1, u), y: L.y };
    };
    // Al armar escribe el nombre y después el código; al desarmar borra al revés
    const steps: ["label" | "code", "txt" | "code", number][] = build
      ? [["label", "txt", 520], ["code", "code", 320]]
      : [["code", "code", 280], ["label", "txt", 460]];
    const first = steps[0][0];
    appear(a, on(first, build ? 0 : 1));
    if (!(await go(a, () => on(first, build ? 0 : 1), 450, g))) return false;
    tagOn(a, TAGS.txt);
    for (const [which, part, dur] of steps) {
      if (!(await go(a, () => on(which, build ? 0 : 1), 140, g))) return false;
      const tick = ticker(10);
      const ok = await trace(
        a,
        dur,
        g,
        (t) => on(which, build ? t : 1 - t),
        (t) => {
          setPart(i, part, build ? t : 1 - t);
          tick(t);
        },
        (t) => t,
      );
      if (!ok) return false;
    }
    return true;
  }

  // ---------- Armar / desarmar un nodo ----------
  async function buildNode(team: Team, i: number, g: number) {
    if (!(await wait(i * 260, g))) return;
    if (!(await carryIn(team, i, g))) return;
    const job = async (a: Agent, delay: number, fn: typeof coreWork) => {
      if (!(await wait(delay, g))) return;
      if (await fn(a, i, g, true)) await leave(a, g);
    };
    await Promise.all([
      wait(250, g).then(async (ok) => { if (ok) await leave(team.mov, g); }),
      job(team.link, 0, linkWork),
      job(team.core, 90, coreWork),
      job(team.ring, 180, ringWork),
      job(team.txt, 270, textWork),
    ]);
  }

  async function unbuildNode(team: Team, i: number, g: number) {
    if (!(await wait(i * 170, g))) return;
    const homes: Promise<void>[] = [];
    const job = async (a: Agent, delay: number, fn: typeof coreWork) => {
      if (!(await wait(delay, g))) return false;
      const ok = await fn(a, i, g, false);
      if (ok) homes.push(home(a, g));
      return ok;
    };
    // Primero desarman las partes; cuando queda el esqueleto, MOV se lo lleva
    const done = await Promise.all([
      job(team.txt, 0, textWork),
      job(team.ring, 90, ringWork),
      job(team.link, 180, linkWork),
      job(team.core, 270, coreWork),
    ]);
    if (done.every(Boolean) && (await carryOut(team, i, g))) homes.push(home(team.mov, g));
    await Promise.all(homes);
  }

  return {
    /** Posición de un puntero que está orbitando (null si está ocupado u oculto). */
    preyAt(i: number): Pt | null {
      const a = all[i];
      return a && a.mode === "orbit" ? a.pos : null;
    },
    preyCount: () => all.length,
    /** Un rojo lo empuja: sale despedido, acelera y a veces cambia de sentido. */
    poke(i: number, from: Pt) {
      const a = all[i];
      if (!a || a.mode !== "orbit") return;
      const dx = a.pos.x - from.x;
      const dy = a.pos.y - from.y;
      const d = Math.hypot(dx, dy) || 1;
      a.jx += (dx / d) * 34;
      a.jy += (dy / d) * 34;
      a.tx = (dx / d) * 48;
      a.ty = (dy / d) * 48;
      a.surge = 1;
      a.nextJump = performance.now() / 1000 + 0.45;
      if (Math.random() < 0.35) a.speed = -a.speed;
      click(a);
    },
    async build() {
      const g = ++gen;
      if (o.reduceMotion) {
        o.nodes.forEach((btn, i) => {
          btn.classList.add("is-placed");
          o.link(i, 1);
        });
        return;
      }
      await Promise.all(teams.map((t, i) => buildNode(t, i, g)));
    },
    async unbuild() {
      const g = ++gen;
      if (o.reduceMotion) {
        o.nodes.forEach((btn, i) => {
          btn.classList.remove("is-placed", "is-driven");
          o.link(i, null);
        });
        return;
      }
      await Promise.all(teams.map((t, i) => unbuildNode(t, i, g)));
    },
  };
}
