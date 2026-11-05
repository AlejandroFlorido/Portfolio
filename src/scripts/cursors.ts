// "Agentes": punteros que orbitan el núcleo en reposo y, al activarlo,
// llevan cada nodo a su lugar para armar la interfaz. Al apagarlo vuelven,
// descolocan los nodos, los meten en el núcleo y siguen orbitando.

import { sfx } from "./sound";

export interface Pt {
  x: number;
  y: number;
}

export interface CrewOptions {
  stage: HTMLElement;
  core: HTMLElement;
  nodes: HTMLButtonElement[];
  codes: string[];
  /** Posición final del nodo i, relativa al centro de la pantalla. */
  target: (i: number) => Pt;
  /** Dibuja la conexión del nodo i hacia `rel` (relativa al centro). null = conexión final (placed) u oculta. */
  link: (i: number, rel: Pt | null, placed: boolean) => void;
  reduceMotion: boolean;
}

const COLORS = ["#50dcff", "#ffb347", "#ff5fa2", "#7dff9b", "#b18cff"];
const ARROW = `<svg viewBox="0 0 14 18" aria-hidden="true"><path d="M1 1v14.5l3.8-3.6 2.7 6 2.4-1.1-2.7-5.8H13z"/></svg>`;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Agent {
  el: HTMLElement;
  tag: HTMLElement;
  sel: HTMLElement;
  pos: Pt;
  mode: "orbit" | "task" | "hidden";
  angle: number;
  speed: number;
  ring: number;
  phase: number;
  name: string;
}

export function createCrew(o: CrewOptions) {
  let gen = 0;
  const center = (): Pt => ({ x: innerWidth / 2, y: innerHeight / 2 });
  const coreR = () => o.core.offsetWidth / 2;

  const agents: Agent[] = o.nodes.map((_, i) => {
    const color = COLORS[i % COLORS.length];
    const el = document.createElement("div");
    el.className = "agent";
    el.setAttribute("aria-hidden", "true");
    el.style.setProperty("--c", color);
    el.innerHTML = `${ARROW}<span class="agent__tag"></span>`;
    const sel = document.createElement("div");
    sel.className = "sel";
    sel.setAttribute("aria-hidden", "true");
    sel.style.setProperty("--c", color);
    sel.innerHTML = "<i></i><i></i><i></i><i></i>";
    o.stage.append(sel, el);
    const name = `AG-0${i + 1}`;
    const tag = el.querySelector<HTMLElement>(".agent__tag")!;
    tag.textContent = name;
    return {
      el,
      tag,
      sel,
      name,
      pos: { x: innerWidth / 2, y: innerHeight / 2 },
      mode: o.reduceMotion ? "hidden" : "orbit",
      angle: (i / o.nodes.length) * Math.PI * 2,
      speed: 0.45 + ((i * 3) % 5) * 0.09,
      ring: i,
      phase: i * 1.7,
    };
  });

  function orbitPoint(a: Agent, time: number): Pt {
    const c = center();
    const r = coreR() + 22 + a.ring * 10;
    return {
      x: c.x + Math.cos(a.angle) * r * 1.12,
      y: c.y + Math.sin(a.angle) * r * 0.9 + Math.sin(time * 1.6 + a.phase) * 5,
    };
  }

  function render(a: Agent) {
    a.el.style.transform = `translate3d(${a.pos.x}px, ${a.pos.y}px, 0)`;
  }

  // Bucle de órbita: los ángulos avanzan siempre, así volver a orbitar es suave.
  let lastT = performance.now();
  function loop(now: number) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    for (const a of agents) {
      a.angle += a.speed * dt;
      if (a.mode === "orbit") {
        a.pos = orbitPoint(a, now / 1000);
        render(a);
      }
    }
    requestAnimationFrame(loop);
  }
  if (!o.reduceMotion) {
    agents.forEach((a) => a.el.classList.add("is-on"));
    requestAnimationFrame(loop);
  }

  // ---------- Utilidades de animación ----------
  function tween(dur: number, fn: (t: number) => void, g: number) {
    return new Promise<boolean>((resolve) => {
      const t0 = performance.now();
      const step = (now: number) => {
        if (g !== gen) return resolve(false);
        const t = Math.min((now - t0) / dur, 1);
        fn(t);
        if (t < 1) requestAnimationFrame(step);
        else resolve(true);
      };
      requestAnimationFrame(step);
    });
  }
  const wait = (ms: number, g: number) => tween(ms, () => {}, g);

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

  // Distancia vertical entre el centro del botón y el centro del punto del nodo
  function dotOffset(i: number) {
    const btn = o.nodes[i];
    const dot = btn.querySelector<HTMLElement>(".node__dot")!;
    return dot.offsetTop + dot.offsetHeight / 2 - btn.offsetHeight / 2;
  }

  function setNode(i: number, rel: Pt, scale: number, opacity: number) {
    const s = o.nodes[i].style;
    s.setProperty("--px", `${rel.x}px`);
    s.setProperty("--py", `${rel.y}px`);
    s.setProperty("--s", String(scale));
    s.setProperty("--o", String(opacity));
  }

  // El nodo sigue al puntero (la punta del puntero queda sobre el punto del nodo)
  function follow(a: Agent, i: number, off: number, scale: number, opacity: number) {
    const c = center();
    const rel = { x: a.pos.x - c.x, y: a.pos.y - c.y - off };
    setNode(i, rel, scale, opacity);
    o.link(i, rel, false);
  }

  function place(i: number) {
    const btn = o.nodes[i];
    btn.classList.remove("is-driven");
    btn.classList.add("is-placed");
    o.link(i, null, true);
  }

  function remove(i: number) {
    const btn = o.nodes[i];
    btn.classList.remove("is-driven", "is-placed");
    o.link(i, null, false);
  }

  // Caja de selección estilo editor alrededor del nodo
  function flash(a: Agent, i: number) {
    const btn = o.nodes[i];
    const c = center();
    const t = o.target(i);
    const w = btn.offsetWidth + 18;
    const h = btn.offsetHeight + 14;
    a.sel.style.width = `${w}px`;
    a.sel.style.height = `${h}px`;
    a.sel.style.transform = `translate(${c.x + t.x - w / 2}px, ${c.y + t.y - h / 2}px)`;
    a.sel.dataset.size = `${Math.round(w)}×${Math.round(h)}`;
    a.sel.classList.remove("is-flash");
    void a.sel.offsetWidth;
    a.sel.classList.add("is-flash");
  }

  function click(a: Agent) {
    a.el.classList.remove("is-click");
    void a.el.offsetWidth;
    a.el.classList.add("is-click");
  }

  // ---------- Armar ----------
  async function buildOne(a: Agent, i: number, g: number) {
    if (!(await wait(i * 170, g))) return;
    a.mode = "task";
    a.el.classList.add("is-on");
    const off = dotOffset(i);
    const t0 = o.target(i);
    const ang = Math.atan2(t0.y, t0.x);

    // 1. Ir al núcleo a buscar el nodo
    const pick = () => {
      const c = center();
      const r = coreR() * 0.4;
      return { x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r };
    };
    if (!(await go(a, pick, 420, g))) return;

    // 2. Agarrarlo
    click(a);
    sfx.grab();
    a.tag.textContent = o.codes[i];
    o.nodes[i].classList.add("is-driven");
    follow(a, i, off, 0.25, 0);
    if (!(await wait(130, g))) return;

    // 3. Arrastrarlo hasta su lugar
    const dest = () => {
      const c = center();
      const t = o.target(i);
      return { x: c.x + t.x, y: c.y + t.y + off };
    };
    const ok = await go(a, dest, 950, g, (e) => follow(a, i, off, lerp(0.3, 1, e), Math.min(1, e * 3)));
    if (!ok) return;

    // 4. Soltarlo
    place(i);
    flash(a, i);
    click(a);
    sfx.drop();
    a.tag.textContent = "OK";
    if (!(await wait(320, g))) return;

    // 5. Irse
    a.el.classList.remove("is-on");
    const away = { x: a.pos.x + Math.cos(ang) * 40 + 12, y: a.pos.y + Math.sin(ang) * 40 + 16 };
    if (!(await go(a, () => away, 450, g, undefined, easeOut))) return;
    a.mode = "hidden";
    a.tag.textContent = a.name;
  }

  // ---------- Desarmar ----------
  async function unbuildOne(a: Agent, i: number, g: number) {
    if (!(await wait(i * 140, g))) return;
    const off = dotOffset(i);
    const t0 = o.target(i);
    const ang = Math.atan2(t0.y, t0.x);
    const dot = () => {
      const c = center();
      const t = o.target(i);
      return { x: c.x + t.x, y: c.y + t.y + off };
    };

    // 1. Aparecer cerca del nodo y apuntarlo
    if (a.mode !== "orbit") {
      const d = dot();
      a.pos = { x: d.x + Math.cos(ang) * 60 + 18, y: d.y + Math.sin(ang) * 60 + 26 };
      render(a);
    }
    a.mode = "task";
    a.el.classList.add("is-on");
    if (!(await go(a, dot, 380, g))) return;

    // 2. Seleccionarlo y agarrarlo
    flash(a, i);
    click(a);
    sfx.grab();
    a.tag.textContent = o.codes[i];
    o.nodes[i].classList.remove("is-placed");
    o.nodes[i].classList.add("is-driven");
    follow(a, i, off, 1, 1);
    if (!(await wait(160, g))) return;

    // 3. Descolocarlo: un tirón hacia un costado
    const d = dot();
    const side = i % 2 ? 1 : -1;
    const jx = Math.cos(ang + (side * Math.PI) / 2) * 70 + (Math.random() - 0.5) * 50;
    const jy = Math.sin(ang + (side * Math.PI) / 2) * 70 + (Math.random() - 0.5) * 50;
    const scatter = { x: d.x + jx, y: d.y + jy };
    if (!(await go(a, () => scatter, 420, g, () => follow(a, i, off, 1, 1), easeOut))) return;

    // 4. Llevarlo de vuelta al núcleo, donde se apaga
    const into = () => {
      const c = center();
      return { x: c.x + Math.cos(ang) * coreR() * 0.3, y: c.y + Math.sin(ang) * coreR() * 0.3 + off * 0.2 };
    };
    const ok = await go(a, into, 650, g, (e) => follow(a, i, off, lerp(1, 0.2, e), 1 - e));
    if (!ok) return;
    remove(i);
    sfx.grab();
    a.tag.textContent = a.name;

    // 5. Volver a orbitar
    if (!(await go(a, () => orbitPoint(a, performance.now() / 1000), 700, g))) return;
    a.mode = "orbit";
  }

  return {
    async build() {
      const g = ++gen;
      if (o.reduceMotion) {
        o.nodes.forEach((_, i) => place(i));
        return;
      }
      await Promise.all(agents.map((a, i) => buildOne(a, i, g)));
    },
    async unbuild() {
      const g = ++gen;
      if (o.reduceMotion) {
        o.nodes.forEach((_, i) => remove(i));
        return;
      }
      await Promise.all(agents.map((a, i) => unbuildOne(a, i, g)));
    },
  };
}
