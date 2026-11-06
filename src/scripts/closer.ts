// Nodo rojo para cerrar la pestaña abierta. Dos punteros rojos lo arman cuando
// se abre una sección (lo sacan del panel, le llenan el núcleo, le dibujan la
// órbita y escriben "Cerrar") y lo desarman cuando se cierra.
// Mientras tanto merodean: con el núcleo apagado orbitan el núcleo y se tiran
// encima de los punteros cian para molestarlos; con una sección abierta
// quedan dando vueltas alrededor de la pantalla. Al activar el núcleo se van.

import { sfx } from "./sound";
import { createRunner, makeAgent, render, click, show, hide, lerp, type Pt } from "./agent-kit";

/** Punteros cian a los que los rojos molestan cuando orbitan el núcleo. */
export interface Prey {
  preyCount(): number;
  preyAt(i: number): Pt | null;
  poke(i: number, from: Pt): void;
}

interface CloserOptions {
  panel: HTMLElement;
  core: HTMLElement;
  prey: Prey;
  button: HTMLElement;
  link: HTMLElement;
  reduceMotion: boolean;
}

export function createCloser(o: CloserOptions) {
  // Estado del nodo rojo: oculto, arrastrado por un puntero, o en su lugar
  const node = { mode: "hidden" as "hidden" | "driven" | "placed", pos: { x: 0, y: 0 }, s: 1, op: 0 };
  const dot = o.button.querySelector<HTMLElement>(".closer__dot")!;
  const label = o.button.querySelector<HTMLElement>(".closer__label")!;

  const mover = makeAgent("#ff4d5e", "agent--red");
  const smith = makeAgent("#ff8f80", "agent--red");

  // Esquina del panel de donde "sale" el nodo, y lugar donde queda
  function anchor(): Pt {
    const r = o.panel.getBoundingClientRect();
    return { x: r.left + 4, y: r.top + 4 };
  }
  function spot(): Pt {
    const r = o.panel.getBoundingClientRect();
    // En pantallas chicas no hay lugar a la izquierda del panel: queda arriba
    return r.left > 80 ? { x: r.left - 28, y: r.top - 28 } : { x: r.left + 34, y: r.top - 30 };
  }

  // ---------- Dibujo continuo (el panel se mueve mientras abre/cierra) ----------
  function frame() {
    if (node.mode !== "hidden") {
      const p = node.mode === "placed" ? spot() : node.pos;
      const s = o.button.style;
      s.setProperty("--px", `${p.x}px`);
      s.setProperty("--py", `${p.y}px`);
      s.setProperty("--s", String(node.mode === "placed" ? 1 : node.s));
      s.setProperty("--o", String(node.mode === "placed" ? 1 : node.op));
      const a = anchor();
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      const len = Math.max(0, Math.hypot(dx, dy) - 15);
      o.link.style.width = `${len}px`;
      o.link.style.transform = `translate(${a.x}px, ${a.y}px) rotate(${Math.atan2(dy, dx)}rad)`;
      o.link.style.opacity = node.mode === "placed" ? "1" : String(node.op);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function setMode(mode: typeof node.mode) {
    node.mode = mode;
    o.button.classList.toggle("is-placed", mode === "placed");
    o.button.tabIndex = mode === "placed" ? 0 : -1;
    if (mode === "hidden") {
      o.button.style.setProperty("--o", "0");
      o.link.style.opacity = "0";
    }
  }
  setMode("hidden");

  function setPart(part: "core" | "ring" | "txt", v: number) {
    o.button.style.setProperty(`--${part}`, String(Math.max(0, Math.min(1, v))));
  }

  // Los rojos son los que "destruyen": extremadamente erráticos
  const R = createRunner(3.2);
  const { tween, go, trace } = R;

  const dotCenter = () => spot();
  const ringAt = (ang: number) => {
    const c = dotCenter();
    const r = dot.offsetWidth / 2 + 6;
    return { x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r };
  };
  const labelAt = (u: number) => {
    const r = label.getBoundingClientRect();
    return { x: lerp(r.left, r.right, u), y: r.bottom - 2 };
  };

  async function typeLabel(g: number, from: number, to: number, dur: number) {
    let last = -1;
    return trace(
      mover,
      dur,
      g,
      (t) => labelAt(lerp(from, to, t)),
      (t) => {
        setPart("txt", lerp(from, to, t));
        const k = Math.floor(t * 7);
        if (k !== last) {
          last = k;
          sfx.type();
        }
      },
    );
  }

  // ---------- Merodeo: orbitan de forma errática el núcleo o la pantalla ----------
  type Roam = "none" | "core" | "panel";
  let roam: Roam = "none";
  interface Pest {
    a: typeof mover;
    angle: number;
    speed: number;
    jx: number;
    jy: number;
    tx: number;
    ty: number;
    nextJump: number;
    surge: number;
    nextDash: number;
    dash: null | { i: number; corner: number; until: number };
  }
  const pests: Pest[] = [mover, smith].map((a, k) => ({
    a,
    angle: k * Math.PI + Math.random(),
    speed: (1.1 + Math.random() * 0.6) * (k ? -1 : 1),
    jx: 0,
    jy: 0,
    tx: 0,
    ty: 0,
    nextJump: 0,
    surge: 0,
    nextDash: 0,
    dash: null,
  }));

  function roamPoint(p: Pest, time: number): Pt {
    if (roam === "core") {
      const r = o.core.getBoundingClientRect();
      const rad = r.width / 2 + 70 + Math.sin(time * 2.7 + p.angle) * 26;
      return {
        x: r.left + r.width / 2 + Math.cos(p.angle) * rad * 1.15 + p.jx,
        y: r.top + r.height / 2 + Math.sin(p.angle) * rad * 0.92 + p.jy,
      };
    }
    const r = o.panel.getBoundingClientRect();
    const rx = r.width / 2 + 24 + Math.sin(time * 3.1 + p.angle) * 14;
    const ry = r.height / 2 + 22 + Math.cos(time * 2.3 + p.angle) * 12;
    const x = r.left + r.width / 2 + Math.cos(p.angle) * rx + p.jx;
    const y = r.top + r.height / 2 + Math.sin(p.angle) * ry + p.jy;
    return { x: Math.max(6, Math.min(innerWidth - 14, x)), y: Math.max(6, Math.min(innerHeight - 18, y)) };
  }

  // A qué se tiran: un puntero cian (núcleo) o una esquina / el nodo rojo (pantalla)
  function dashTarget(p: Pest): Pt | null {
    const d = p.dash!;
    if (roam === "core") return o.prey.preyAt(d.i);
    if (d.corner === 4) return spot();
    const r = o.panel.getBoundingClientRect();
    return { x: d.corner % 2 ? r.right - 4 : r.left + 4, y: d.corner < 2 ? r.top + 4 : r.bottom - 4 };
  }

  function startDash(p: Pest, time: number) {
    if (roam === "core") {
      const n = o.prey.preyCount();
      // Elige al cian que esté más cerca entre unos cuantos al azar
      let best = -1;
      let bestD = Infinity;
      for (let k = 0; k < 6; k++) {
        const i = Math.floor(Math.random() * n);
        const q = o.prey.preyAt(i);
        if (!q) continue;
        const dd = Math.hypot(q.x - p.a.pos.x, q.y - p.a.pos.y);
        if (dd < bestD) {
          bestD = dd;
          best = i;
        }
      }
      if (best < 0) return;
      p.dash = { i: best, corner: 0, until: time + 0.7 };
    } else {
      p.dash = { i: 0, corner: Math.floor(Math.random() * 5), until: time + 0.6 };
    }
  }

  let lastT = performance.now();
  function roamLoop(now: number) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    const time = now / 1000;
    if (roam !== "none") {
      for (const p of pests) {
        if (time > p.nextJump) {
          p.nextJump = time + 0.06 + Math.random() * 0.35;
          p.tx = (Math.random() - 0.5) * 70;
          p.ty = (Math.random() - 0.5) * 56;
          if (Math.random() < 0.5) p.surge = 1;
          if (Math.random() < 0.12) p.speed = -p.speed;
        }
        p.jx += (p.tx - p.jx) * Math.min(1, dt * 16);
        p.jy += (p.ty - p.jy) * Math.min(1, dt * 16);
        p.surge = Math.max(0, p.surge - dt * 3);
        p.angle += p.speed * dt * (1 + 0.8 * Math.sin(time * 3.7 + p.speed) + p.surge * 3);

        let goal = roamPoint(p, time);
        let k = dt * 9;
        if (p.dash) {
          const t = dashTarget(p);
          if (!t || time > p.dash.until) {
            p.dash = null;
            p.nextDash = time + 0.3 + Math.random() * 1.2;
          } else {
            goal = t;
            k = dt * 16;
            if (Math.hypot(t.x - p.a.pos.x, t.y - p.a.pos.y) < 16) {
              click(p.a);
              if (roam === "core") o.prey.poke(p.dash.i, p.a.pos);
              p.dash = null;
              p.surge = 1;
              p.tx = (Math.random() - 0.5) * 120;
              p.ty = (Math.random() - 0.5) * 100;
              p.nextDash = time + 0.35 + Math.random() * 1.3;
            }
          }
        } else if (time > p.nextDash) {
          startDash(p, time);
        }
        const j = 3.5;
        p.a.pos = {
          x: lerp(p.a.pos.x, goal.x, Math.min(1, k)) + (Math.random() - 0.5) * j,
          y: lerp(p.a.pos.y, goal.y, Math.min(1, k)) + (Math.random() - 0.5) * j,
        };
        render(p.a);
      }
    }
    requestAnimationFrame(roamLoop);
  }
  requestAnimationFrame(roamLoop);

  function startRoam(mode: Exclude<Roam, "none">) {
    const time = performance.now() / 1000;
    for (const p of pests) {
      p.dash = null;
      p.nextDash = time + 0.4 + Math.random() * 0.8;
      // Si no estaban a la vista, entran desde algún lugar cerca de la órbita
      if (!p.a.el.classList.contains("is-on")) {
        roam = mode;
        const q = roamPoint(p, time);
        p.a.pos = { x: q.x + (Math.random() - 0.5) * 80, y: q.y + (Math.random() - 0.5) * 80 };
        render(p.a);
      }
      p.a.el.classList.add("is-on");
      p.a.el.classList.remove("is-tagged");
    }
    roam = mode;
  }

  /** Muestra al puntero para una tarea; si ya merodeaba, sigue desde donde está. */
  function enter(a: typeof mover, at: Pt, tag: string) {
    if (a.el.classList.contains("is-on")) {
      a.tag.textContent = tag;
      a.el.classList.add("is-tagged");
    } else show(a, at, tag);
  }

  function reset() {
    roam = "none";
    setMode("hidden");
    hide(mover);
    hide(smith);
  }

  return {
    /** Arma el nodo rojo (al abrir una sección). */
    async build() {
      const g = R.next();
      if (o.reduceMotion) {
        ["core", "ring", "txt"].forEach((p) => setPart(p as "core", 1));
        setMode("placed");
        return;
      }
      roam = "none";
      (["core", "ring", "txt"] as const).forEach((p) => setPart(p, 0));
      setMode("hidden");
      const a0 = anchor();
      enter(mover, { x: a0.x + 60, y: a0.y + 70 }, "SALIDA");
      enter(smith, { x: a0.x + 110, y: a0.y + 40 }, "NÚCLEO");

      // 1. MOV agarra el nodo en la esquina del panel y lo saca
      if (!(await go(mover, anchor, 380, g))) return;
      click(mover);
      sfx.grab();
      node.pos = { ...mover.pos };
      node.s = 0.3;
      node.op = 0;
      setMode("driven");
      const smithWay = go(smith, () => ({ x: spot().x + 30, y: spot().y + 26 }), 700, g);
      const ok = await go(mover, spot, 560, g, (e) => {
        node.pos = { ...mover.pos };
        node.s = lerp(0.3, 1, e);
        node.op = Math.min(1, e * 3);
      });
      if (!ok) return;
      setMode("placed");
      click(mover);
      sfx.drop();

      // 2. En paralelo: el otro llena el núcleo y dibuja la órbita; MOV escribe "Cerrar"
      const forge = (async () => {
        if (!(await smithWay)) return false;
        if (!(await go(smith, dotCenter, 180, g))) return false;
        for (let k = 0; k < 2; k++) {
          click(smith);
          sfx.grab();
          if (!(await tween(140, (t) => setPart("core", (k + t) / 2), g))) return false;
        }
        smith.tag.textContent = "ÓRBITA";
        if (!(await go(smith, () => ringAt(-Math.PI / 2), 160, g))) return false;
        return trace(smith, 520, g, (t) => ringAt(-Math.PI / 2 + t * Math.PI * 2), (t) => setPart("ring", t));
      })();
      const write = (async () => {
        mover.tag.textContent = "TEXTO";
        if (!(await go(mover, () => labelAt(0), 220, g))) return false;
        return typeLabel(g, 0, 1, 380);
      })();
      const done = await Promise.all([forge, write]);
      if (!done.every(Boolean)) return;
      // Terminado el nodo, se quedan merodeando alrededor de la pantalla
      startRoam("panel");
    },

    /** Desarma el nodo rojo (al cerrar la sección). Resuelve cuando terminó. */
    async unbuild() {
      const g = R.next();
      if (o.reduceMotion || node.mode !== "placed") {
        reset();
        return;
      }
      roam = "none";
      o.button.classList.remove("is-placed");
      const c = spot();
      enter(mover, { x: c.x + 70, y: c.y + 50 }, "TEXTO");
      enter(smith, { x: c.x + 40, y: c.y + 70 }, "ÓRBITA");

      // 1. Borran el texto, desenrollan la órbita y vacían el núcleo
      const erase = (async () => {
        if (!(await go(mover, () => labelAt(1), 260, g))) return false;
        return typeLabel(g, 1, 0, 260);
      })();
      const unforge = (async () => {
        if (!(await go(smith, () => ringAt(-Math.PI / 2), 260, g))) return false;
        const ok = await trace(smith, 420, g, (t) => ringAt(-Math.PI / 2 + (1 - t) * Math.PI * 2), (t) => setPart("ring", 1 - t));
        if (!ok) return false;
        smith.tag.textContent = "NÚCLEO";
        if (!(await go(smith, dotCenter, 140, g))) return false;
        click(smith);
        sfx.grab();
        return tween(200, (t) => setPart("core", 1 - t), g);
      })();
      const done = await Promise.all([erase, unforge]);
      if (!done.every(Boolean)) return;
      hide(smith);

      // 2. MOV lo mete de nuevo en el panel
      mover.tag.textContent = "SALIDA";
      if (!(await go(mover, dotCenter, 160, g))) return;
      click(mover);
      sfx.grab();
      node.pos = { ...mover.pos };
      node.s = 1;
      node.op = 1;
      node.mode = "driven";
      const ok = await go(mover, anchor, 420, g, (e) => {
        node.pos = { ...mover.pos };
        node.s = lerp(1, 0.3, e);
        node.op = 1 - e;
      });
      if (!ok) return;
      reset();
    },

    /** Lo saca sin animación (por ejemplo, si se apaga todo de golpe). */
    reset() {
      R.next();
      reset();
    },

    /** Con el núcleo apagado: orbitan el núcleo molestando a los cian. */
    roamCore() {
      if (o.reduceMotion || node.mode !== "hidden") return;
      R.next();
      startRoam("core");
    },

    /** Al activar el núcleo desaparecen (hasta que se abra una sección). */
    leave() {
      if (roam !== "core") return;
      roam = "none";
      hide(mover);
      hide(smith);
    },
  };
}
