// Nodo rojo para cerrar la pestaña abierta. Dos punteros rojos lo arman cuando
// se abre una sección (lo sacan del panel, le llenan el núcleo, le dibujan la
// órbita y escriben "Cerrar") y lo desarman cuando se cierra. Solo aparecen
// para eso; no orbitan el núcleo.

import { sfx } from "./sound";
import { createRunner, makeAgent, click, show, hide, lerp, type Pt } from "./agent-kit";

interface CloserOptions {
  panel: HTMLElement;
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

  const R = createRunner();
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

  function reset() {
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
      (["core", "ring", "txt"] as const).forEach((p) => setPart(p, 0));
      setMode("hidden");
      const a0 = anchor();
      show(mover, { x: a0.x + 60, y: a0.y + 70 }, "SALIDA");
      show(smith, { x: a0.x + 110, y: a0.y + 40 }, "NÚCLEO");

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
      hide(mover);
      hide(smith);
    },

    /** Desarma el nodo rojo (al cerrar la sección). Resuelve cuando terminó. */
    async unbuild() {
      const g = R.next();
      if (o.reduceMotion || node.mode !== "placed") {
        reset();
        return;
      }
      o.button.classList.remove("is-placed");
      const c = spot();
      show(mover, { x: c.x + 70, y: c.y + 50 }, "TEXTO");
      show(smith, { x: c.x + 40, y: c.y + 70 }, "ÓRBITA");

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
  };
}
