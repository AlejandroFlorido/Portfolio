// Nodo "Reconstruir": una cuadrilla de punteros arma una página tipo CV parte
// por parte. Cada puntero marca la esquina, arrastra un recuadro con sus medidas
// y después el bloque aparece (o se escribe letra por letra). La portada se arma
// sola; cada sección de abajo se arma cuando llega a la pantalla.
// Al terminar quedan unos pocos punteros "controlando" la página.

import { sfx } from "./sound";
import { SPEED, newWobble, erratic, easeInOut, easeOutBack, type Pt } from "./agent-kit";

const ARROW = `<svg viewBox="0 0 16 18" aria-hidden="true"><path d="M1.5 1.5 4 16.5l3-5.2h7.5z"/></svg>`;
const SHADES = ["#50dcff", "#a6f4ff", "#2eb6e0", "#d4faff", "#74d4f2"];
const BUILDERS = 10;
const PATROL = 3;
const FOLLOWERS = 3;
const CHAOS = 1.2;

interface Bot {
  el: HTMLElement;
  tag: HTMLElement;
  pos: Pt;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RebuilderOptions {
  /** Contenedor con scroll (pantalla completa). */
  root: HTMLElement;
  /** Página: los punteros y recuadros se ubican relativos a ella. */
  page: HTMLElement;
  back: HTMLButtonElement;
}

export function createRebuilder(o: RebuilderOptions) {
  let gen = 0;
  const all = [...o.page.querySelectorAll<HTMLElement>("[data-b]")];
  const sections = [...o.page.querySelectorAll<HTMLElement>("[data-rb-sec]")];
  // Texto original de lo que se escribe letra por letra
  all.forEach((el) => {
    if (el.dataset.b === "type") el.dataset.text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  });

  // ---------- Punteros ----------
  function makeBot(color: string): Bot {
    const el = document.createElement("div");
    el.className = "agent";
    el.setAttribute("aria-hidden", "true");
    el.style.setProperty("--c", color);
    el.innerHTML = `${ARROW}<span class="agent__tag"></span>`;
    o.page.append(el);
    return { el, tag: el.querySelector<HTMLElement>(".agent__tag")!, pos: { x: 0, y: 0 } };
  }
  const builders = Array.from({ length: BUILDERS }, (_, i) => makeBot(SHADES[i % SHADES.length]));
  const patrol = Array.from({ length: PATROL }, () => makeBot("#d4faff"));
  // El puntero amarillo también viene a la página: tranquilo, revisa todo y el pie
  const keeper = makeBot("#ffd84a");
  keeper.el.classList.add("agent--keeper");
  const foot = o.page.querySelector<HTMLElement>(".rb-foot");
  // Los rojos también vienen: depuran la página y, al salir, la borran
  const reds = [makeBot("#ff4d5e"), makeBot("#ff8f80")];
  reds.forEach((b) => b.el.classList.add("agent--red"));
  // Y unos cian que siguen al puntero del visitante, en fila y sin apuro
  const followers = Array.from({ length: FOLLOWERS }, (_, i) => makeBot(SHADES[(i + 1) % SHADES.length]));
  const others = () => [...patrol, keeper, ...reds, ...followers];

  const render = (b: Bot) => (b.el.style.transform = `translate3d(${b.pos.x}px, ${b.pos.y}px, 0)`);
  function show(b: Bot, at: Pt, tag = "") {
    b.pos = { ...at };
    render(b);
    b.tag.textContent = tag;
    b.el.classList.toggle("is-tagged", !!tag);
    b.el.classList.add("is-on");
  }
  const hide = (b: Bot) => b.el.classList.remove("is-on", "is-tagged");
  function tagOf(b: Bot, text: string) {
    b.tag.textContent = text;
    b.el.classList.toggle("is-tagged", !!text);
  }
  function click(b: Bot) {
    b.el.classList.remove("is-click");
    void b.el.offsetWidth;
    b.el.classList.add("is-click");
  }

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
  const wait = (ms: number, g: number) => tween(ms, () => {}, g);

  function move(b: Bot, to: Pt, dur: number, g: number) {
    const from = { ...b.pos };
    const w = newWobble(CHAOS);
    const ease = Math.random() < 0.45 ? easeOutBack : easeInOut;
    return tween(
      dur * (0.8 + Math.random() * 0.4),
      (t) => {
        b.pos = erratic(from, to, ease(t), w);
        render(b);
      },
      g,
    );
  }

  // ---------- Geometría (relativa a la página, así se mueve con el scroll) ----------
  function rel(el: Element): Box {
    const r = el.getBoundingClientRect();
    const p = o.page.getBoundingClientRect();
    return { x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height };
  }
  const view = () => ({ top: o.root.scrollTop - o.page.offsetTop, h: o.root.clientHeight, w: o.page.clientWidth });

  const extras = new Set<HTMLElement>();
  function wire(x: number, y: number, cls = "") {
    const el = document.createElement("div");
    el.className = `rb-wire ${cls}`;
    el.innerHTML = `<span class="rb-wire__size"></span>`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    o.page.append(el);
    extras.add(el);
    return { el, size: el.firstElementChild as HTMLElement };
  }
  function fadeOut(el: HTMLElement, after = 0) {
    window.setTimeout(() => {
      el.classList.add("is-done");
      window.setTimeout(() => {
        el.remove();
        extras.delete(el);
      }, 650);
    }, after);
  }
  function mark(p: Pt) {
    const el = document.createElement("span");
    el.className = "rb-mark";
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    o.page.append(el);
    extras.add(el);
    fadeOut(el, 1400);
  }

  // ---------- Construir un elemento ----------
  async function construct(b: Bot, el: HTMLElement, g: number) {
    const kind = el.dataset.b;
    let r = rel(el);
    tagOf(b, kind === "type" ? "TEXTO" : kind === "big" ? "TÍTULO" : "BLOQUE");
    if (!(await move(b, { x: r.x, y: r.y }, 520, g))) return;
    r = rel(el); // por si cambió algo mientras viajaba
    click(b);
    sfx.grab();
    mark({ x: r.x, y: r.y });
    const wf = wire(r.x, r.y);
    tagOf(b, `${Math.round(r.x)}, ${Math.round(r.y)}`);
    const dragged = await tween(
      Math.min(700, 300 + (r.w + r.h) * 0.35),
      (t) => {
        const e = easeInOut(t);
        const w = r.w * e;
        const h = r.h * e;
        wf.el.style.width = `${w}px`;
        wf.el.style.height = `${h}px`;
        wf.size.textContent = `${Math.round(w)} × ${Math.round(h)}`;
        b.pos = { x: r.x + w, y: r.y + h };
        render(b);
      },
      g,
    );
    if (!dragged) return;
    sfx.drop();
    mark({ x: r.x + r.w, y: r.y + r.h });

    if (kind === "type") {
      const text = el.dataset.text ?? "";
      el.style.minHeight = `${r.h}px`;
      el.textContent = "";
      const node = document.createTextNode("");
      const caret = document.createElement("span");
      caret.className = "rb-caret";
      el.append(node, caret);
      el.classList.add("is-typing");
      fadeOut(wf.el, 200);
      tagOf(b, "TEXTO");
      let last = 0;
      const ok = await tween(
        Math.min(1800, 200 + text.length * 16),
        (t) => {
          const n = Math.round(text.length * t);
          if (n === last) return;
          node.data = text.slice(0, n);
          if (n % 3 === 0) sfx.type();
          last = n;
          const c = rel(caret);
          b.pos = { x: b.pos.x + (c.x + 4 - b.pos.x) * 0.5, y: b.pos.y + (c.y + c.h - b.pos.y) * 0.5 };
          render(b);
        },
        g,
      );
      if (!ok) return;
      node.data = text;
      caret.remove();
      el.style.minHeight = "";
      el.classList.remove("is-typing");
      el.classList.add("is-built");
      return;
    }

    if (kind === "big") {
      el.classList.add("is-filling");
      fadeOut(wf.el, 300);
      tagOf(b, "TRAZO");
      const w = newWobble(CHAOS);
      const ok = await tween(
        1500,
        (t) => {
          const e = easeInOut(t);
          el.style.setProperty("--draw", e.toFixed(3));
          const p = erratic({ x: r.x, y: r.y + r.h * 0.55 }, { x: r.x + r.w, y: r.y + r.h * 0.45 }, e, w);
          b.pos = { x: p.x, y: p.y + Math.sin(e * 40) * r.h * 0.25 };
          render(b);
          if (Math.random() < 0.08) sfx.type();
        },
        g,
      );
      if (!ok) return;
      el.classList.remove("is-filling");
      el.style.removeProperty("--draw");
      el.classList.add("is-built");
      return;
    }

    // Bloque: aparece barriendo de izquierda a derecha
    el.classList.add("is-filling");
    fadeOut(wf.el, 250);
    if (!(await wait(260, g))) return;
    el.classList.remove("is-filling");
    el.classList.add("is-built");
  }

  // ---------- Construir una sección (los punteros se reparten los bloques) ----------
  async function buildSection(els: HTMLElement[], g: number) {
    const queue = els.filter((el) => !el.classList.contains("is-built"));
    if (!queue.length || g !== gen) return g === gen;
    const first = rel(queue[0]);
    const v = view();
    const crew = builders.slice(0, Math.min(BUILDERS, Math.max(3, Math.ceil(queue.length / 2))));
    // Entran desde los bordes de la pantalla
    crew.forEach((b, i) => {
      const left = i % 2 === 0;
      show(b, { x: left ? -20 : v.w + 20, y: Math.max(first.y, v.top) + Math.random() * v.h * 0.6 });
    });
    await Promise.all(
      crew.map(async (b, i) => {
        await wait(i * 90, g);
        while (queue.length && g === gen) await construct(b, queue.shift()!, g);
        if (g !== gen) return;
        // Se van saliendo por el costado más cercano
        const v2 = view();
        tagOf(b, "");
        await move(b, { x: b.pos.x < v2.w / 2 ? -30 : v2.w + 30, y: b.pos.y }, 700, g);
        hide(b);
      }),
    );
    return g === gen;
  }

  // ---------- Punteros que patrullan la página terminada ----------
  async function patrolLoop(b: Bot, i: number, g: number) {
    const calm = b === keeper;
    const red = reds.includes(b);
    const label = calm ? "REVISIÓN" : red ? "DEPURAR" : "CONTROL";
    const v = view();
    show(
      b,
      { x: calm ? v.w * 0.8 : red ? (i % 2 ? v.w + 20 : -20) : v.w * (0.2 + i * 0.3), y: v.top + v.h * (calm ? 1 : red ? 0.4 : 0.85) },
      label,
    );
    await wait(400 + i * 700, g);
    while (g === gen) {
      const v2 = view();
      const visible = all.filter((el) => {
        if (!el.classList.contains("is-built")) return false;
        const r = rel(el);
        return r.y + r.h > v2.top + 70 && r.y < v2.top + v2.h - 20;
      });
      let target: Pt;
      let pick: HTMLElement | null = null;
      // El amarillo, si el pie está a la vista, a veces va a revisar el copyright
      if (calm && foot?.classList.contains("is-built") && visible.includes(foot) && Math.random() < 0.5) {
        pick = foot;
        const r = rel(foot);
        target = { x: r.x + r.w * 0.5, y: r.y + r.h * 0.5 };
      } else if (visible.length) {
        pick = visible[Math.floor(Math.random() * visible.length)];
        const r = rel(pick);
        target = { x: r.x + r.w * (0.15 + Math.random() * 0.7), y: r.y + r.h * (0.2 + Math.random() * 0.6) };
      } else {
        target = { x: v2.w * (0.1 + Math.random() * 0.8), y: v2.top + v2.h * (0.2 + Math.random() * 0.7) };
      }
      tagOf(b, pick === foot && calm ? "COPYRIGHT" : label);
      if (!(await move(b, target, (calm ? 2600 : red ? 1000 : 1700) + Math.random() * (red ? 700 : 1400), g))) return;
      // Los rojos buscan errores: marcan el bloque en rojo y después lo dan por bueno
      if (red && pick && Math.random() < 0.45) {
        const r = rel(pick);
        const wf = wire(r.x - 4, r.y - 4, "is-bug");
        wf.el.style.width = `${r.w + 8}px`;
        wf.el.style.height = `${r.h + 8}px`;
        wf.size.textContent = "¿BUG?";
        click(b);
        tagOf(b, "¿BUG?");
        if (!(await wait(650, g))) return;
        wf.size.textContent = "0 ERRORES";
        tagOf(b, "LIMPIO ✓");
        fadeOut(wf.el, 500);
      } else if (!red && pick && Math.random() < 0.35) {
        // A veces revisa el bloque: lo enmarca un momento y da el OK
        const r = rel(pick);
        const wf = wire(r.x - 4, r.y - 4, "is-check");
        wf.el.style.width = `${r.w + 8}px`;
        wf.el.style.height = `${r.h + 8}px`;
        wf.size.textContent = "OK";
        click(b);
        tagOf(b, "OK ✓");
        fadeOut(wf.el, 700);
      }
      if (!(await wait((red ? 300 : 700) + Math.random() * (red ? 700 : 1500), g))) return;
    }
  }

  // ---------- Punteros que siguen al mouse del visitante ----------
  // El primero va detrás del mouse y cada uno sigue al anterior, como una fila.
  // Van a velocidad normal tirando a lenta y nunca se le suben encima.
  const mouse = { x: 0, y: 0, seen: false, moved: 0 };
  o.root.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.seen = true;
    mouse.moved = performance.now();
  });
  function followLoop(g: number) {
    const v = view();
    followers.forEach((b, i) => show(b, { x: -30 - i * 30, y: v.top + v.h * (0.3 + i * 0.15) }, "SIGUIENDO"));
    let last = performance.now();
    const step = (now: number) => {
      if (g !== gen) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const p = o.page.getBoundingClientRect();
      const vv = view();
      // Sin mouse (por ejemplo en el celular) se quedan rondando la pantalla
      const lead: Pt = mouse.seen
        ? { x: mouse.x - p.left, y: mouse.y - p.top }
        : { x: vv.w * (0.5 + Math.sin(now / 2600) * 0.35), y: vv.top + vv.h * (0.55 + Math.sin(now / 1900) * 0.25) };
      const idle = !mouse.seen || now - mouse.moved > 2500;
      followers.forEach((b, i) => {
        const ahead = i === 0 ? lead : followers[i - 1].pos;
        const gap = i === 0 ? 34 : 26;
        const dx = ahead.x - b.pos.x;
        const dy = ahead.y - b.pos.y;
        const d = Math.hypot(dx, dy) || 1;
        // Se acerca hasta quedar a cierta distancia, con un leve vaivén
        const pull = Math.max(0, d - gap) / d;
        const k = 1 - Math.exp(-dt * (i === 0 ? 2.2 : 3));
        const sway = Math.sin(now / 420 + i * 1.7) * 0.6;
        b.pos = { x: b.pos.x + dx * pull * k - (dy / d) * sway, y: b.pos.y + dy * pull * k + (dx / d) * sway };
        render(b);
        const label = idle ? "ESPERANDO" : "SIGUIENDO";
        if (b.tag.textContent !== label) tagOf(b, label);
      });
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- Observador: arma cada sección al llegar a la pantalla ----------
  let chain: Promise<unknown> = Promise.resolve();
  let observer: IntersectionObserver | null = null;
  function watch(g: number) {
    observer?.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          observer?.unobserve(en.target);
          const els = [...en.target.querySelectorAll<HTMLElement>("[data-b]")];
          chain = chain.then(() => (g === gen ? buildSection(els, g) : false));
        });
      },
      { root: o.root, threshold: 0.12 },
    );
    sections.slice(2).forEach((s) => observer!.observe(s));
  }

  function reset() {
    observer?.disconnect();
    all.forEach((el) => {
      el.classList.remove("is-built", "is-filling", "is-typing");
      el.style.removeProperty("--draw");
      el.style.minHeight = "";
      if (el.dataset.b === "type") el.textContent = el.dataset.text ?? "";
    });
    extras.forEach((el) => el.remove());
    extras.clear();
    [...builders, ...others()].forEach(hide);
    o.back.classList.remove("is-ready");
    o.root.scrollTop = 0;
  }

  return {
    /** Arma la portada; las demás secciones se arman al hacer scroll. */
    async build() {
      const g = ++gen;
      reset();
      chain = Promise.resolve();
      o.root.removeAttribute("aria-hidden");
      o.root.focus({ preventScroll: true });
      // Barra superior y portada juntas
      const first = sections.slice(0, 2).flatMap((s) => [...s.querySelectorAll<HTMLElement>("[data-b]")]);
      const done = await buildSection(first, g);
      if (!done) return;
      // Terminó la portada: aparece el botón para volver y quedan pocos punteros controlando
      sfx.check();
      o.back.classList.add("is-ready");
      watch(g);
      [...patrol, keeper, ...reds].forEach((b, i) => patrolLoop(b, i, g));
      followLoop(g);
    },

    /** Desarma lo que se ve en pantalla (rápido) y deja todo listo para la próxima. */
    async unbuild() {
      const g = ++gen;
      observer?.disconnect();
      o.back.classList.remove("is-ready");
      [...patrol, keeper, ...followers].forEach((b) => tagOf(b, ""));
      const v = view();
      const visible = all
        .filter((el) => el.classList.contains("is-built") || el.classList.contains("is-typing"))
        .filter((el) => {
          const r = rel(el);
          return r.y + r.h > v.top && r.y < v.top + v.h;
        })
        .reverse();
      // Los rojos encabezan el borrado
      const crew = [...reds, ...builders.slice(0, 4)];
      crew.forEach((b, i) => show(b, { x: (v.w / 6) * (i + 0.5), y: v.top + v.h * 0.5 }, "BORRAR"));
      sfx.close();
      await Promise.all(
        visible.map(async (el, i) => {
          await wait(i * 45, g);
          const r = rel(el);
          const b = crew[i % crew.length];
          b.pos = { x: r.x + r.w, y: r.y + r.h };
          render(b);
          const wf = wire(r.x, r.y);
          wf.el.style.width = `${r.w}px`;
          wf.el.style.height = `${r.h}px`;
          wf.size.textContent = "0 × 0";
          el.classList.remove("is-built", "is-typing");
          fadeOut(wf.el, 120);
        }),
      );
      await wait(650, g);
      gen++;
      reset();
      o.root.setAttribute("aria-hidden", "true");
    },
  };
}
