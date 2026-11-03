// Fondo de mapa topográfico: curvas de nivel calculadas con ruido y
// "marching squares". El relieve se deforma suavemente alrededor del mouse.

// Ruido de valor 3D simple (x, y, tiempo), suficiente para un relieve orgánico.
function hash(x: number, y: number, z: number): number {
  let h = x * 374761393 + y * 668265263 + z * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const fade = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function noise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz);
  const a = lerp(lerp(c(0, 0, 0), c(1, 0, 0), xf), lerp(c(0, 1, 0), c(1, 1, 0), xf), yf);
  const b = lerp(lerp(c(0, 0, 1), c(1, 0, 1), xf), lerp(c(0, 1, 1), c(1, 1, 1), xf), yf);
  return lerp(a, b, zf);
}
function fbm(x: number, y: number, z: number): number {
  return noise(x, y, z) * 0.6 + noise(x * 2.1, y * 2.1, z * 1.3) * 0.28 + noise(x * 4.3, y * 4.3, z * 1.7) * 0.12;
}

export interface TopoOptions {
  cell?: number; // tamaño de la grilla en px
  levels?: number; // cantidad de curvas de nivel
}

export function startTopo(canvas: HTMLCanvasElement, opts: TopoOptions = {}) {
  const ctx = canvas.getContext("2d")!;
  const cell = opts.cell ?? 16;
  const levels = opts.levels ?? 11;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let w = 0, h = 0, cols = 0, rows = 0, dpr = 1;
  let field = new Float32Array(0);
  const mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999, strength: 0, target: 0 };
  let intensity = 0.35; // 0..1, sube cuando el núcleo despierta
  let intensityTarget = 0.35;
  let t = Math.random() * 100;
  // Ondas expansivas (por ejemplo, cuando despierta el núcleo)
  const ripples: { x: number; y: number; start: number; strength: number }[] = [];

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / cell) + 1;
    rows = Math.ceil(h / cell) + 1;
    field = new Float32Array(cols * rows);
  }

  function computeField() {
    const scale = 0.0032;
    const radius = Math.min(w, h) * 0.22;
    const now = performance.now();
    for (let r = ripples.length - 1; r >= 0; r--) {
      if (now - ripples[r].start > 2600) ripples.splice(r, 1);
    }
    const waves = ripples.map((r) => {
      const age = (now - r.start) / 2600; // 0..1
      return { x: r.x, y: r.y, radius: age * Math.max(w, h) * 0.8, amp: (1 - age) * 0.18 * r.strength };
    });
    const waveWidth = 70 * 70;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const px = i * cell, py = j * cell;
        let v = fbm(px * scale, py * scale, t);
        // "Colina" que sigue al mouse y desplaza las curvas
        const dx = px - mouse.x, dy = py - mouse.y;
        const d2 = (dx * dx + dy * dy) / (radius * radius);
        v += Math.exp(-d2) * 0.22 * mouse.strength;
        for (const wv of waves) {
          const dist = Math.hypot(px - wv.x, py - wv.y) - wv.radius;
          v += Math.exp(-(dist * dist) / waveWidth) * wv.amp;
        }
        field[j * cols + i] = v;
      }
    }
  }

  // Interpolación del cruce de nivel sobre un borde
  const cross = (a: number, b: number, level: number) => (level - a) / (b - a);

  function drawContours() {
    ctx.clearRect(0, 0, w, h);
    for (let l = 0; l < levels; l++) {
      const level = 0.18 + (l / levels) * 0.7;
      const major = l % 4 === 0;
      const alpha = (major ? 0.32 : 0.14) * (0.5 + intensity);
      ctx.strokeStyle = `rgba(80, 220, 255, ${alpha})`;
      ctx.lineWidth = major ? 1.1 : 0.7;
      ctx.beginPath();
      for (let j = 0; j < rows - 1; j++) {
        for (let i = 0; i < cols - 1; i++) {
          const a = field[j * cols + i];
          const b = field[j * cols + i + 1];
          const c = field[(j + 1) * cols + i + 1];
          const d = field[(j + 1) * cols + i];
          const idx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
          if (idx === 0 || idx === 15) continue;
          const x = i * cell, y = j * cell;
          const top: [number, number] = [x + cell * cross(a, b, level), y];
          const right: [number, number] = [x + cell, y + cell * cross(b, c, level)];
          const bottom: [number, number] = [x + cell * cross(d, c, level), y + cell];
          const left: [number, number] = [x, y + cell * cross(a, d, level)];
          const seg = (p: [number, number], q: [number, number]) => {
            ctx.moveTo(p[0], p[1]);
            ctx.lineTo(q[0], q[1]);
          };
          switch (idx) {
            case 1: case 14: seg(left, bottom); break;
            case 2: case 13: seg(bottom, right); break;
            case 3: case 12: seg(left, right); break;
            case 4: case 11: seg(top, right); break;
            case 5: seg(left, top); seg(bottom, right); break;
            case 6: case 9: seg(top, bottom); break;
            case 7: case 8: seg(left, top); break;
            case 10: seg(left, bottom); seg(top, right); break;
          }
        }
      }
      ctx.stroke();
    }
  }

  function frame() {
    mouse.x += (mouse.tx - mouse.x) * 0.08;
    mouse.y += (mouse.ty - mouse.y) * 0.08;
    mouse.strength += (mouse.target - mouse.strength) * 0.05;
    intensity += (intensityTarget - intensity) * 0.03;
    t += 0.0016 + intensity * 0.002;
    computeField();
    drawContours();
    if (!reduceMotion) requestAnimationFrame(frame);
  }

  function onPointer(e: PointerEvent) {
    if (mouse.x < -1000) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    }
    mouse.tx = e.clientX;
    mouse.ty = e.clientY;
    mouse.target = 1;
  }

  resize();
  addEventListener("resize", () => {
    resize();
    if (reduceMotion) frame();
  });
  addEventListener("pointermove", onPointer, { passive: true });
  document.addEventListener("pointerleave", () => (mouse.target = 0));
  frame();

  return {
    pulse(x: number, y: number, strength = 1) {
      ripples.push({ x, y, start: performance.now(), strength });
    },
    setIntensity(v: number) {
      intensityTarget = v;
      if (reduceMotion) {
        intensity = v;
        frame();
      }
    },
  };
}
