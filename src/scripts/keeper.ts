// Un único puntero amarillo, el "sano": se mueve tranquilo y en línea recta,
// sin temblar (los rojos lo esquivan a él) y se encarga de poner el aviso de
// copyright al pie de la página. Después orbita el núcleo junto a los demás
// mientras está apagado; con el núcleo activo hace la ronda por los nodos,
// dando una vuelta alrededor de cada uno para "controlar" que esté todo bien.

import { sfx } from "./sound";
import { makeAgent, render, click, show, type Pt } from "./agent-kit";

interface KeeperOptions {
  footer: HTMLElement;
  core: HTMLElement;
  /** true mientras el núcleo está apagado (los punteros orbitan). */
  asleep: () => boolean;
  /** Nodos que revisa con el núcleo activo. */
  nodes: HTMLElement[];
  /** true cuando el núcleo está activo y la interfaz ya terminó de armarse. */
  patrolling: () => boolean;
  /** Posiciones actuales de los punteros rojos (para esquivarlos). */
  threats?: () => Pt[];
  delay?: number;
}

const MAX_SPEED = 230; // px/s en calma
const WRITE_SPEED = 190; // px/s mientras escribe
const FLEE_SPEED = 1100; // px/s cuando escapa de un rojo
const SAFE = 170; // distancia a la que empieza a esquivar

export function createKeeper(o: KeeperOptions) {
  const a = makeAgent("#ffd84a", "agent--keeper");
  const vel = { x: 0, y: 0 };
  let phase: "off" | "approach" | "write" | "rest" = "off";
  let u = 0; // avance de la escritura (0 a 1)
  let shown = 0;
  let lastTick = -1;
  let prev: Pt[] = [];
  let angle = Math.PI / 2; // arranca desde abajo, que es por donde viene
  let calm = 1; // baja a 0 mientras esquiva: la órbita se frena
  // Ronda de control por los nodos
  let visit = 0;
  let inspecting = false;
  let inspect = 0; // avance de la vuelta alrededor del nodo (0 a 1)
  let spin = 0;
  let pause = 0; // segundos que espera antes de ir al siguiente
  let urgent = false; // va rápido a revisar un nodo recién cerrado
  const URGENT_SPEED = 820;

  o.footer.classList.add("copyright--agent");
  const setReveal = (v: number) => o.footer.style.setProperty("--cp", String(Math.max(0, Math.min(1, v))));
  setReveal(0);

  const box = () => o.footer.getBoundingClientRect();
  const lineAt = (t: number): Pt => {
    const r = box();
    return { x: r.left + r.width * t, y: r.bottom - 2 };
  };
  const restSpot = (time: number): Pt => {
    // Si el pie está tapado (celular con una sección abierta) descansa arriba a la derecha
    if (getComputedStyle(o.footer).opacity === "0") {
      return { x: innerWidth - 46 + Math.sin(time * 0.7) * 3, y: 58 + Math.sin(time * 1.1) * 2.5 };
    }
    const r = box();
    const right = r.right + 26 < innerWidth - 20;
    return {
      x: (right ? r.right + 18 : r.left + r.width / 2) + Math.sin(time * 0.7) * 3,
      y: (right ? r.top : r.top - 26) + Math.sin(time * 1.1) * 2.5,
    };
  };

  // Órbita pareja alrededor del núcleo, entre los cian y los rojos
  const orbitSpot = (time: number): Pt => {
    const r = o.core.getBoundingClientRect();
    const rad = r.width / 2 + 52;
    return {
      x: r.left + r.width / 2 + Math.cos(angle) * rad * 1.14,
      y: r.top + r.height / 2 + Math.sin(angle) * rad * 0.92 + Math.sin(time * 0.9) * 2,
    };
  };

  const dotOf = (i: number) => o.nodes[i].querySelector<HTMLElement>(".node__dot") ?? o.nodes[i];
  const nodeSpot = (i: number): Pt => {
    const r = dotOf(i).getBoundingClientRect();
    const rad = r.width / 2 + 9;
    const ang = -Math.PI * 0.75 + spin;
    return { x: r.left + r.width / 2 + Math.cos(ang) * rad, y: r.top + r.height / 2 + Math.sin(ang) * rad };
  };

  function target(time: number): Pt {
    if (phase === "approach") return lineAt(0);
    if (phase === "write") return lineAt(u);
    if (o.asleep()) return orbitSpot(time);
    if (o.patrolling()) return nodeSpot(visit);
    return restSpot(time);
  }

  function checked(i: number) {
    const n = o.nodes[i];
    n.classList.remove("is-checked");
    void n.offsetWidth;
    n.classList.add("is-checked");
    window.setTimeout(() => n.classList.remove("is-checked"), 900);
  }

  // Ronda: llega al nodo, le da una vuelta, lo marca como revisado y sigue
  function patrol(dt: number, dist: number, danger: number) {
    if (pause > 0) {
      pause -= dt;
      if (pause <= 0) {
        visit = (visit + 1) % o.nodes.length;
        spin = 0;
        a.el.classList.remove("is-tagged");
      }
      return;
    }
    if (!inspecting) {
      if (dist < 8) {
        inspecting = true;
        inspect = 0;
        a.tag.textContent = urgent ? "¿CIERRE ABRUPTO?" : "CONTROL";
        a.el.classList.add("is-tagged");
      }
      return;
    }
    if (danger > 0) return; // si viene un rojo, primero se cuida
    inspect = Math.min(1, inspect + dt / (urgent ? 2.2 : 1.6));
    spin = inspect * Math.PI * 2;
    if (inspect >= 1) {
      inspecting = false;
      click(a);
      if (urgent) {
        sfx.check();
        sfx.say("Verificación completa. No se detectaron daños.");
      } else sfx.hover();
      checked(visit);
      a.tag.textContent = urgent ? "TODO OK ✓" : "OK ✓";
      pause = urgent ? 1.4 : 0.7;
      urgent = false;
    }
  }

  let last = performance.now();
  function loop(now: number) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const time = now / 1000;
    if (phase !== "off") {
      if (phase === "rest" && o.asleep()) angle += dt * 0.42 * calm;
      // Fuera de la ronda: reinicia el estado para la próxima
      if (phase !== "rest" || !o.patrolling()) {
        if (inspecting || pause > 0 || urgent) a.el.classList.remove("is-tagged");
        inspecting = false;
        pause = 0;
        spin = 0;
        urgent = false;
      }
      const goal = target(time);
      const dx = goal.x - a.pos.x;
      const dy = goal.y - a.pos.y;
      const dist = Math.hypot(dx, dy);

      // Velocidad deseada: directo al objetivo, frenando suave al llegar
      const top = urgent && !inspecting ? URGENT_SPEED : MAX_SPEED;
      const want = Math.min(top, phase === "write" || inspecting ? WRITE_SPEED * 1.2 + dist * 6 : dist * (urgent ? 7 : 4));
      let vx = dist > 0.01 ? (dx / dist) * want : 0;
      let vy = dist > 0.01 ? (dy / dist) * want : 0;

      // Esquivar a los rojos: se aleja de cada uno que se acerque (y de hacia dónde va)
      let danger = 0;
      const now2 = o.threats?.() ?? [];
      const seen = now2.map((t, i) => {
        // Anticipa: mira dónde va a estar el rojo en un instante
        const p = prev[i] ?? t;
        return { x: t.x + (t.x - p.x) * 6, y: t.y + (t.y - p.y) * 6 };
      });
      prev = now2.map((t) => ({ ...t }));
      for (const t of [...now2, ...seen]) {
        const ex = a.pos.x - t.x;
        const ey = a.pos.y - t.y;
        const d = Math.hypot(ex, ey) || 0.01;
        if (d < SAFE) {
          const k = Math.pow(1 - d / SAFE, 1.5);
          danger = Math.max(danger, k);
          vx += (ex / d) * FLEE_SPEED * k * 1.6;
          vy += (ey / d) * FLEE_SPEED * k * 1.6;
        }
      }
      calm += ((danger > 0 ? 0 : 1) - calm) * Math.min(1, dt * 3);
      const cap = danger > 0 ? FLEE_SPEED : top;
      const sp = Math.hypot(vx, vy);
      if (sp > cap) {
        vx = (vx / sp) * cap;
        vy = (vy / sp) * cap;
      }
      // Suavizado: nada de saltos ni temblores
      const s = Math.min(1, dt * (danger > 0 ? 22 : urgent ? 10 : 6));
      vel.x += (vx - vel.x) * s;
      vel.y += (vy - vel.y) * s;
      // Contra un borde no puede seguir retrocediendo: se desliza de costado
      const nx = a.pos.x + vel.x * dt;
      const ny = a.pos.y + vel.y * dt;
      const minX = 4, maxX = innerWidth - 16, minY = 4, maxY = innerHeight - 20;
      if (danger > 0 && (ny < minY || ny > maxY) && Math.abs(vel.x) < Math.abs(vel.y)) {
        vel.x += Math.sign(vel.x || (a.pos.x < innerWidth / 2 ? 1 : -1)) * Math.abs(vel.y);
      }
      if (danger > 0 && (nx < minX || nx > maxX) && Math.abs(vel.y) < Math.abs(vel.x)) {
        vel.y += Math.sign(vel.y || (a.pos.y < innerHeight / 2 ? 1 : -1)) * Math.abs(vel.x);
      }
      a.pos = {
        x: Math.max(minX, Math.min(maxX, a.pos.x + vel.x * dt)),
        y: Math.max(minY, Math.min(maxY, a.pos.y + vel.y * dt)),
      };
      render(a);

      if (phase === "rest" && o.patrolling()) patrol(dt, dist, danger);
      if (phase === "approach" && dist < 6) {
        click(a);
        sfx.grab();
        phase = "write";
      } else if (phase === "write") {
        // Solo avanza mientras está sobre el texto (si tuvo que esquivar, espera)
        const r = box();
        if (dist < 40 && danger === 0) u = Math.min(1, u + (dt * WRITE_SPEED) / Math.max(1, r.width));
        if (Math.abs(a.pos.y - (r.bottom - 2)) < 14) shown = Math.max(shown, (a.pos.x - r.left) / r.width);
        setReveal(shown);
        const k = Math.floor(shown * 14);
        if (k !== lastTick && shown < 1) {
          lastTick = k;
          sfx.type();
        }
        if (u >= 1 && shown >= 0.985) {
          setReveal(1);
          click(a);
          sfx.drop();
          a.el.classList.remove("is-tagged");
          phase = "rest";
        }
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  window.setTimeout(() => {
    // Entra caminando tranquilo desde abajo a la derecha
    show(a, { x: innerWidth * 0.78, y: innerHeight + 10 }, "COPYRIGHT");
    phase = "approach";
  }, o.delay ?? 1400);

  return {
    /** Va rápido a revisar un nodo que se acaba de cerrar ("¿cierre abrupto?") y da el OK. */
    checkClosed(i: number) {
      if (phase !== "rest") return;
      visit = i;
      inspecting = false;
      pause = 0;
      spin = 0;
      urgent = true;
      a.tag.textContent = "¡ALERTA!";
      a.el.classList.add("is-tagged");
    },
    /** Dónde está el amarillo (null si todavía no apareció). */
    position(): Pt | null {
      return phase === "off" ? null : a.pos;
    },
  };
}
