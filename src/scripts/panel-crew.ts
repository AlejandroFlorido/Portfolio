// Tres punteros azules (más chicos) que arman y desarman la pantalla de cada sección:
//   MARCO     dibuja el borde del nodo ampliado dando la vuelta al círculo
//   TÍTULO    escribe el código y el título
//   CONTENIDO va revelando el contenido de arriba hacia abajo
// Al cerrar borran todo al revés el MARCO borra el borde y el nodo se repliega.

import { sfx } from "./sound";
import { createRunner, makeAgent, click, show, hide, lerp, ticker, type Pt } from "./agent-kit";

interface PanelCrewOptions {
  panel: HTMLElement;
  code: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
  reduceMotion: boolean;
}

export function createPanelCrew(o: PanelCrewOptions) {
  const R = createRunner(1.4);
  const { go, trace, chase, tween } = R;

  const framer = makeAgent("#50dcff", "agent--panel");
  const writer = makeAgent("#a6f4ff", "agent--panel");
  const filler = makeAgent("#74d4f2", "agent--panel");
  const crew = [framer, writer, filler];

  // Rectángulo "borrador" estilo editor que sigue al MARCO
  const draft = document.createElement("div");
  draft.className = "sel sel--draft";
  draft.setAttribute("aria-hidden", "true");
  draft.innerHTML = "<i></i><i></i><i></i><i></i>";
  document.body.append(draft);

  if (!o.reduceMotion) o.panel.classList.add("panel--agents");

  const set = (el: HTMLElement, name: string, v: number) =>
    el.style.setProperty(name, String(Math.max(0, Math.min(1, v))));
  const rect = () => o.panel.getBoundingClientRect();
  // Punto del borde del círculo: t = 0 arriba, da la vuelta en sentido horario
  const rimAt = (t: number): Pt => {
    const r = rect();
    const ang = -Math.PI / 2 + t * Math.PI * 2;
    return { x: r.left + r.width / 2 + Math.cos(ang) * (r.width / 2), y: r.top + r.height / 2 + Math.sin(ang) * (r.height / 2) };
  };

  function setFrame(p: number) {
    set(o.panel, "--pw", p);
    set(o.panel, "--ph", p);
    // Caja de selección alrededor del nodo ampliado mientras se dibuja su borde
    const r = rect();
    draft.style.width = `${r.width}px`;
    draft.style.height = `${r.height}px`;
    draft.style.transform = `translate(${r.left}px, ${r.top}px)`;
    draft.dataset.size = `${Math.round(r.width)}×${Math.round(r.height)}`;
  }

  function flashDraft() {
    draft.classList.remove("is-drag", "is-flash");
    void draft.offsetWidth;
    draft.classList.add("is-flash");
  }

  // Punto sobre una línea de texto (u = 0 inicio, 1 final)
  const along = (el: HTMLElement, u: number): Pt => {
    const r = el.getBoundingClientRect();
    return { x: lerp(r.left, r.right, u), y: r.bottom - 3 };
  };
  // Recorrido en zigzag por el contenido, como si lo fuera pintando
  const sweep = (p: number): Pt => {
    const r = o.body.getBoundingClientRect();
    const h = Math.min(r.height, o.panel.getBoundingClientRect().bottom - r.top);
    const zig = Math.sin(p * Math.PI * 5) * 0.5 + 0.5;
    return { x: r.left + 8 + zig * Math.min(r.width * 0.7, 260), y: r.top + h * p };
  };

  function hideAll() {
    crew.forEach(hide);
    draft.classList.remove("is-drag");
  }

  return {
    /** Deja la pantalla lista para armarse: sin contenido visible (y sin marco si es nueva). */
    prepare(fresh: boolean) {
      if (o.reduceMotion) return;
      R.next();
      set(o.panel, "--code", 0);
      set(o.panel, "--ttl", 1);
      set(o.panel, "--body", 0);
      if (fresh) setFrame(0);
    },

    /** MARCO dibuja el borde del nodo ampliado dando la vuelta al círculo. */
    async frameIn() {
      if (o.reduceMotion) return true;
      const g = R.next();
      const r0 = rect();
      show(framer, { x: r0.left + r0.width / 2 - 60, y: r0.top - 40 }, "MARCO");
      if (!(await go(framer, () => rimAt(0), 300, g))) return false;
      click(framer);
      sfx.grab();
      draft.classList.add("is-drag");
      const ok = await trace(framer, 820, g, rimAt, (t) => setFrame(t), (t) => t);
      if (!ok) return false;
      setFrame(1);
      flashDraft();
      click(framer);
      sfx.drop();
      hide(framer);
      return true;
    },

    /** TÍTULO escribe código y título; CONTENIDO revela el cuerpo. */
    async fill(typeTitle: () => Promise<void>) {
      if (o.reduceMotion) {
        await typeTitle();
        return true;
      }
      const g = R.next();
      const write = (async () => {
        show(writer, { x: rect().left + 30, y: rect().top + 60 }, "TÍTULO");
        if (!(await go(writer, () => along(o.code, 0), 220, g))) return false;
        const tick = ticker(8, sfx.type);
        const ok = await trace(writer, 320, g, (t) => along(o.code, t), (t) => {
          set(o.panel, "--code", t);
          tick(t);
        }, (t) => t);
        if (!ok) return false;
        // El título lo tipea la página; el puntero va siguiendo la última letra
        if (!(await chase(writer, () => along(o.title, 1), typeTitle(), g))) return false;
        hide(writer);
        return true;
      })();
      const fill = (async () => {
        show(filler, { x: rect().left + 60, y: rect().top + 110 }, "CONTENIDO");
        if (!(await go(filler, () => sweep(0), 260, g))) return false;
        click(filler);
        const ok = await trace(filler, 700, g, sweep, (t) => set(o.panel, "--body", t), (t) => t);
        if (!ok) return false;
        hide(filler);
        return true;
      })();
      const done = await Promise.all([write, fill]);
      return done.every(Boolean);
    },

    /** Borran contenido y textos (antes de plegar el marco). */
    async clear() {
      if (o.reduceMotion) return true;
      const g = R.next();
      const erase = (async () => {
        show(writer, { x: rect().right - 20, y: rect().top + 50 }, "TÍTULO");
        if (!(await go(writer, () => along(o.title, 1), 220, g))) return false;
        const tick = ticker(6, sfx.type);
        let ok = await trace(writer, 260, g, (t) => along(o.title, 1 - t), (t) => {
          set(o.panel, "--ttl", 1 - t);
          tick(t);
        }, (t) => t);
        if (!ok) return false;
        if (!(await go(writer, () => along(o.code, 1), 140, g))) return false;
        ok = await trace(writer, 220, g, (t) => along(o.code, 1 - t), (t) => set(o.panel, "--code", 1 - t), (t) => t);
        if (!ok) return false;
        hide(writer);
        return true;
      })();
      const empty = (async () => {
        show(filler, { x: rect().left + 80, y: rect().bottom - 10 }, "CONTENIDO");
        if (!(await go(filler, () => sweep(1), 220, g))) return false;
        click(filler);
        const ok = await trace(filler, 480, g, (t) => sweep(1 - t), (t) => set(o.panel, "--body", 1 - t), (t) => t);
        if (!ok) return false;
        hide(filler);
        return true;
      })();
      const done = await Promise.all([erase, empty]);
      return done.every(Boolean);
    },

    /** MARCO borra el borde dando la vuelta al revés; después el nodo se repliega. */
    async collapse() {
      if (o.reduceMotion) return true;
      const g = R.next();
      const r0 = rect();
      show(framer, { x: r0.right + 30, y: r0.top + r0.height / 2 }, "MARCO");
      if (!(await go(framer, () => rimAt(1), 240, g))) return false;
      click(framer);
      sfx.grab();
      draft.classList.remove("is-flash");
      draft.classList.add("is-drag");
      setFrame(1);
      const ok = await trace(framer, 560, g, (t) => rimAt(1 - t), (t) => setFrame(1 - t), (t) => t);
      if (!ok) return false;
      setFrame(0);
      hideAll();
      await tween(0, () => {}, g);
      return true;
    },

    /** Corta cualquier animación y deja la pantalla oculta. */
    reset() {
      R.next();
      hideAll();
      if (!o.reduceMotion) setFrame(0);
    },
  };
}
