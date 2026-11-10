// Sonido "cibernético" sintetizado con Web Audio (sin archivos de audio).
// Todo pasa por una cadena común: compresor + eco corto + reverb metálica, que
// le da ese brillo de interfaz holográfica.
// El navegador solo permite sonar después de una interacción del usuario,
// así que el contexto se crea en el primer clic.

const STORAGE_KEY = "portfolio-sound";
// Ajuste global de los efectos: tono natural (más grave = más sombrío)
const PITCH = 1;
const VOL = 2.4;
const hz = (f: number) => Math.min(16000, f * PITCH);

let ctx: AudioContext | null = null;
let master: GainNode | null = null; // entrada seca
let wet: GainNode | null = null; // envío a reverb/eco
let hum: { nodes: AudioScheduledSourceNode[]; gain: GainNode } | null = null;
let enabled = true;

try {
  enabled = localStorage.getItem(STORAGE_KEY) !== "off";
} catch {
  /* sin almacenamiento: queda activado */
}

// Respuesta al impulso sintética: cola corta y brillante, como una sala metálica
function impulse(ac: AudioContext, seconds: number, decay: number) {
  const len = Math.ceil(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    const out = ctx.createGain();
    out.gain.value = 0.8;
    comp.connect(out).connect(ctx.destination);

    master = ctx.createGain();
    master.connect(comp);

    // Reverb + eco estéreo corto (ping-pong) para el aire "holográfico"
    wet = ctx.createGain();
    wet.gain.value = 0.3;
    const verb = ctx.createConvolver();
    verb.buffer = impulse(ctx, 1.2, 3.5); // sala chica, como un cuarto de servidores
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 140;
    wet.connect(hp).connect(verb).connect(comp);
    const dl = ctx.createDelay(1);
    const dr = ctx.createDelay(1);
    dl.delayTime.value = 0.13;
    dr.delayTime.value = 0.19;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const pl = ctx.createStereoPanner();
    const pr = ctx.createStereoPanner();
    pl.pan.value = -0.6;
    pr.pan.value = 0.6;
    wet.connect(dl);
    dl.connect(pl).connect(comp);
    dl.connect(dr);
    dr.connect(pr).connect(comp);
    dr.connect(fb).connect(dl);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

/** Conecta un nodo a la salida, con algo de envío a reverb/eco. */
function out(node: AudioNode, send = 0.5, pan = 0) {
  if (!ctx || !master || !wet) return;
  let last: AudioNode = node;
  if (pan) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    node.connect(p);
    last = p;
  }
  last.connect(master);
  if (send > 0) {
    const s = ctx.createGain();
    s.gain.value = send;
    last.connect(s).connect(wet);
  }
}

function env(g: GainNode, t0: number, peak: number, attack: number, dur: number) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

interface ToneOpts {
  type?: OscillatorType;
  from: number;
  to?: number;
  duration: number;
  volume?: number;
  delay?: number;
  attack?: number;
  send?: number;
  pan?: number;
  /** Modulación FM: cuánto (en Hz) y a qué razón de la portadora. */
  fm?: number;
  ratio?: number;
}

function tone({
  type = "sine",
  from,
  to = from,
  duration,
  volume = 0.2,
  delay = 0,
  attack = 0.008,
  send = 0.4,
  pan = 0,
  fm = 0,
  ratio = 2,
}: ToneOpts) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  from = hz(from);
  to = hz(to);
  fm *= PITCH;
  volume *= VOL;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  // Las ondas "duras" pasan por un filtro: nada de pitido de 8 bits
  let src: AudioNode = osc;
  if (type !== "sine") {
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.min(5000, Math.max(from, to) * 3);
    osc.connect(lp);
    src = lp;
  }
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  if (fm) {
    // FM: le da el timbre metálico / digital
    const mod = ac.createOscillator();
    const depth = ac.createGain();
    mod.frequency.setValueAtTime(from * ratio, t0);
    mod.frequency.exponentialRampToValueAtTime(to * ratio, t0 + duration);
    depth.gain.setValueAtTime(fm, t0);
    depth.gain.exponentialRampToValueAtTime(Math.max(1, fm * 0.1), t0 + duration);
    mod.connect(depth).connect(osc.frequency);
    mod.start(t0);
    mod.stop(t0 + duration + 0.05);
  }
  env(gain, t0, volume, attack, duration);
  src.connect(gain);
  out(gain, send, pan);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/** Ruido filtrado con barrido (servos, aire, estática). */
function noise(duration: number, volume: number, from: number, to = from, delay = 0, q = 1.2, send = 0.3) {
  const ac = audio();
  if (!ac) return;
  from = hz(from);
  to = hz(to);
  volume *= VOL;
  const t0 = ac.currentTime + delay;
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * duration), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  const gain = ac.createGain();
  env(gain, t0, volume, Math.min(0.05, duration * 0.3), duration);
  src.connect(filter).connect(gain);
  out(gain, send);
  src.start(t0);
}

// ---------- Sala de servidores (núcleo encendido) ----------
// Zumbido eléctrico de red (50 Hz + armónicos), ventiladores (ruido filtrado
// que respira) y discos que buscan datos de vez en cuando.
let seekTimer = 0;
function startHum() {
  const ac = audio();
  if (!ac || hum) return;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.06, ac.currentTime + 2.5);
  const nodes: AudioScheduledSourceNode[] = [];
  // Zumbido de transformador: 50 Hz con armónicos impares, muy filtrado
  [50, 150, 250].forEach((f, i) => {
    const o = ac.createOscillator();
    o.frequency.value = f;
    const g = ac.createGain();
    g.gain.value = [0.35, 0.18, 0.08][i];
    o.connect(g).connect(gain);
    o.start();
    nodes.push(o);
  });
  // Ventiladores: ruido en bucle por un pasa-bajos, con un leve vaivén
  const len = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; // ruido "marrón"
    d[i] = last * 6;
  }
  const fan = ac.createBufferSource();
  fan.buffer = buf;
  fan.loop = true;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  const fanG = ac.createGain();
  fanG.gain.value = 0.9;
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.15;
  const lfoG = ac.createGain();
  lfoG.gain.value = 0.25;
  lfo.connect(lfoG).connect(fanG.gain);
  fan.connect(lp).connect(fanG).connect(gain);
  fan.start();
  lfo.start();
  nodes.push(fan, lfo);
  // Aspa del ventilador: un tono suave que gira
  const blade = ac.createOscillator();
  blade.type = "triangle";
  blade.frequency.value = 118;
  const bladeG = ac.createGain();
  bladeG.gain.value = 0.05;
  blade.connect(bladeG).connect(gain);
  blade.start();
  nodes.push(blade);
  out(gain, 0.08);
  hum = { nodes, gain };
  // Los discos trabajan solos cada tanto
  const seek = () => {
    if (!hum) return;
    if (Math.random() < 0.6) disk(3 + Math.floor(Math.random() * 8), 0.012);
    if (Math.random() < 0.25) compute(3 + Math.floor(Math.random() * 4), 0.008);
    seekTimer = window.setTimeout(seek, 1200 + Math.random() * 2600);
  };
  seekTimer = window.setTimeout(seek, 1500);
}

function stopHum() {
  clearTimeout(seekTimer);
  if (!ctx || !hum) return;
  const { nodes, gain } = hum;
  hum = null;
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.6);
  nodes.forEach((o) => o.stop(ctx!.currentTime + 1.7));
}

/** Ráfaga corta de ruido filtrado (base de clics, relés y cabezales). */
function burst(volume: number, freq: number, length: number, delay = 0, q = 2, pan = 0, send = 0.15) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const n = Math.ceil(ac.sampleRate * length);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 4);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = hz(freq);
  bp.Q.value = q;
  const g = ac.createGain();
  g.gain.value = volume * VOL * 8;
  src.connect(bp).connect(g);
  out(g, send, pan);
  src.start(t0);
}

/** Clic de interfaz. */
function tick(volume: number, delay = 0, pan = 0) {
  burst(volume, 3200, 0.012, delay, 1.5, pan);
}

/** Relé que se cierra: clac metálico + golpe seco del chasis. */
function relay(volume: number, delay = 0) {
  burst(volume, 2400, 0.018, delay, 3);
  burst(volume * 0.8, 1300, 0.01, delay + 0.012, 4);
  tone({ from: 140, to: 60, duration: 0.12, volume: volume * 1.4, delay, attack: 0.002, send: 0.1 });
}

/** Disco duro buscando datos: ráfaga de clics secos e irregulares del cabezal. */
function disk(count: number, volume: number, delay = 0) {
  let t = delay;
  for (let i = 0; i < count; i++) {
    burst(volume * (0.6 + Math.random() * 0.6), 1800 + Math.random() * 2500, 0.004 + Math.random() * 0.006, t, 2.5, Math.random() * 0.4 - 0.2, 0.05);
    t += 0.018 + Math.random() * 0.05;
  }
}

/** "Procesando": la cascada de tonitos cortos de las computadoras de película. */
function compute(count: number, volume: number, delay = 0, base = 900, spread = 1800) {
  for (let i = 0; i < count; i++) {
    tone({
      from: base + Math.round(Math.random() * spread / 100) * 100,
      duration: 0.035,
      volume,
      delay: delay + i * 0.055,
      attack: 0.002,
      send: 0.12,
      pan: Math.random() * 0.6 - 0.3,
    });
  }
}

/** Motor (disco o ventilador) que acelera o frena. */
function motor(from: number, to: number, duration: number, volume: number, delay = 0) {
  tone({ type: "sawtooth", from, to, duration, volume, delay, attack: duration * 0.35, send: 0.1 });
  tone({ type: "triangle", from: from * 2, to: to * 2, duration, volume: volume * 0.4, delay, attack: duration * 0.35, send: 0.1 });
  noise(duration, volume * 0.8, from * 4, to * 4, delay, 0.8, 0.05);
}

export const sfx = {
  get enabled() {
    return enabled;
  },
  setEnabled(value: boolean, awake: boolean) {
    enabled = value;
    try {
      localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
    } catch {
      /* ignorar */
    }
    if (!value) {
      stopHum();
    } else if (awake) startHum();
  },
  wake() {
    // Encendido de computadora: relé de la fuente, discos que arrancan,
    // los cabezales que leen y la cascada de "sistema listo"
    relay(0.05);
    motor(30, 240, 1.6, 0.06, 0.05);
    relay(0.035, 0.45);
    disk(10, 0.03, 0.7);
    disk(8, 0.025, 1.35);
    compute(6, 0.04, 1.2, 700, 1600);
    tone({ from: 1000, duration: 0.18, volume: 0.04, delay: 1.65, attack: 0.004, send: 0.15 });
    startHum();
  },
  sleep() {
    // Apagado: cascada que baja, relé y el disco que frena
    compute(4, 0.03, 0, 500, 700);
    relay(0.05, 0.25);
    motor(240, 25, 1.6, 0.05, 0.25);
    stopHum();
  },
  hover() {
    tick(0.012);
    disk(2, 0.015, 0.02);
  },
  open() {
    // Acceso a datos: relé, el disco busca y el sistema "procesa"
    relay(0.04);
    disk(9, 0.03, 0.05);
    compute(5, 0.035, 0.25, 900, 1800);
  },
  close() {
    // Cierre en alerta: dos tonos graves de aviso y el disco guardando
    tone({ type: "triangle", from: 520, duration: 0.12, volume: 0.05, attack: 0.004, send: 0.12 });
    tone({ type: "triangle", from: 390, duration: 0.16, volume: 0.05, delay: 0.16, attack: 0.004, send: 0.12 });
    disk(7, 0.025, 0.3);
  },
  /** Chequeo del puntero amarillo: dos tonos ascendentes de "OK". */
  check() {
    tick(0.015);
    tone({ from: 880, duration: 0.07, volume: 0.04, delay: 0.02, attack: 0.003, send: 0.12 });
    tone({ from: 1320, duration: 0.12, volume: 0.04, delay: 0.11, attack: 0.003, send: 0.12 });
  },
  grab() {
    relay(0.02);
  },
  drop() {
    relay(0.035);
    disk(3, 0.015, 0.05);
  },
  type() {
    disk(1, 0.008 + Math.random() * 0.006);
  },
};
