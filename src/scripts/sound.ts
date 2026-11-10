// Sonido "cibernético" sintetizado con Web Audio (sin archivos de audio).
// Todo pasa por una cadena común: compresor + eco corto + reverb metálica, que
// le da ese brillo de interfaz holográfica.
// El navegador solo permite sonar después de una interacción del usuario,
// así que el contexto se crea en el primer clic.

const STORAGE_KEY = "portfolio-sound";
// Ajuste global de los efectos: bastante agudo, sonido de equipo electrónico
const PITCH = 1.6;
const VOL = 4.5;
const hz = (f: number) => Math.min(16000, f * PITCH);

let ctx: AudioContext | null = null;
let master: GainNode | null = null; // entrada seca
let wet: GainNode | null = null; // envío a reverb/eco
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

// Sin ambiente de fondo: Ale lo encontró molesto. Solo suenan las acciones.
function startHum() {}
function stopHum() {}

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

/** Relé que se cierra: clac metálico + golpe seco del chasis. */
function relay(volume: number, delay = 0) {
  burst(volume, 2400, 0.018, delay, 3);
  burst(volume * 0.8, 1300, 0.01, delay + 0.012, 4);
  tone({ from: 140, to: 60, duration: 0.12, volume: volume * 1.4, delay, attack: 0.002, send: 0.1 });
}

/** Zumbido de disco que gira: un silbido electrónico que sube o baja, con leve vibrato. */
function whir(from: number, to: number, duration: number, volume: number, delay = 0) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const o = ac.createOscillator();
  o.frequency.setValueAtTime(hz(from), t0);
  o.frequency.exponentialRampToValueAtTime(hz(to), t0 + duration);
  const vib = ac.createOscillator();
  vib.frequency.value = 7;
  const vibG = ac.createGain();
  vibG.gain.value = hz(from) * 0.01;
  vib.connect(vibG).connect(o.frequency);
  const g = ac.createGain();
  env(g, t0, volume * VOL, duration * 0.4, duration);
  o.connect(g);
  out(g, 0.25);
  o.start(t0);
  vib.start(t0);
  o.stop(t0 + duration + 0.05);
  vib.stop(t0 + duration + 0.05);
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
    // Encendido de servidor: relé, el disco que toma vueltas y el flujo de datos
    relay(0.025);
    whir(300, 2600, 1.4, 0.035, 0.05);
    compute(12, 0.03, 0.55, 1100, 2200);
    tone({ from: 1500, duration: 0.25, volume: 0.035, delay: 1.25, attack: 0.004, send: 0.25 });
  },
  sleep() {
    // Apagado: datos que bajan y el disco que pierde vueltas
    compute(5, 0.025, 0, 600, 900);
    whir(2600, 250, 1.2, 0.03, 0.2);
  },
  hover() {
    compute(2, 0.018, 0, 1600, 1400);
  },
  open() {
    // Acceso a datos: el disco acelera y el servidor transmite
    whir(700, 2200, 0.45, 0.025);
    compute(9, 0.028, 0.12, 1100, 2400);
  },
  close() {
    // Cierre en alerta: dos tonos de aviso y datos que se guardan
    tone({ type: "triangle", from: 620, duration: 0.12, volume: 0.045, attack: 0.004, send: 0.2 });
    tone({ type: "triangle", from: 470, duration: 0.16, volume: 0.045, delay: 0.16, attack: 0.004, send: 0.2 });
    compute(5, 0.022, 0.35, 900, 1400);
  },
  /** Chequeo del puntero amarillo: dos tonos ascendentes de "OK". */
  check() {
    tone({ from: 1000, duration: 0.07, volume: 0.04, attack: 0.003, send: 0.2 });
    tone({ from: 1500, duration: 0.12, volume: 0.04, delay: 0.09, attack: 0.003, send: 0.2 });
  },
  grab() {
    whir(900, 1600, 0.15, 0.015);
  },
  drop() {
    compute(2, 0.025, 0, 1400, 600);
    relay(0.012, 0.02);
  },
  type() {
    compute(1, 0.012, 0, 1400, 2200);
  },
};
