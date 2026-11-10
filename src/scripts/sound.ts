// Sonido "cibernético" sintetizado con Web Audio (sin archivos de audio).
// Todo pasa por una cadena común: compresor + eco corto + reverb metálica, que
// le da ese brillo de interfaz holográfica.
// El navegador solo permite sonar después de una interacción del usuario,
// así que el contexto se crea en el primer clic.

const STORAGE_KEY = "portfolio-sound";
// Ajuste global de los efectos: agudo y presente, sonido de sintetizador
const PITCH = 1.2;
const VOL = 3.5;
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

/**
 * Pluck de sintetizador: dos dientes de sierra desafinados con un filtro que
 * se abre y se cierra rápido. La base del sonido "electrónico".
 */
function pluck(freq: number, volume: number, delay = 0, duration = 0.28, pan = 0, bright = 7) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const f = hz(freq);
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 5;
  lp.frequency.setValueAtTime(Math.min(16000, f * bright), t0);
  lp.frequency.exponentialRampToValueAtTime(f * 1.1, t0 + duration * 0.8);
  const g = ac.createGain();
  env(g, t0, volume * VOL, 0.003, duration);
  [-7, 7].forEach((c) => {
    const o = ac.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f * Math.pow(2, c / 1200);
    o.connect(lp);
    o.start(t0);
    o.stop(t0 + duration + 0.05);
  });
  lp.connect(g);
  out(g, 0.55, pan);
}

/** Arpegio: varias notas en sucesión rápida, rebotando en el eco estéreo. */
function arp(notes: number[], step: number, volume: number, delay = 0) {
  notes.forEach((n, i) => pluck(n, volume, delay + i * step, 0.25, i % 2 ? 0.35 : -0.35));
}

/** Barrido de filtro sobre un acorde de sierras: el "wooow" típico de sintetizador. */
function sweep(from: number, to: number, duration: number, volume: number, delay = 0, notes = [110, 165, 220]) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 9;
  lp.frequency.setValueAtTime(hz(from), t0);
  lp.frequency.exponentialRampToValueAtTime(hz(to), t0 + duration);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(volume * VOL, t0 + duration * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  notes.forEach((n) =>
    [-9, 9].forEach((c) => {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hz(n) * Math.pow(2, c / 1200);
      const og = ac.createGain();
      og.gain.value = 1 / notes.length;
      o.connect(og).connect(lp);
      o.start(t0);
      o.stop(t0 + duration + 0.05);
    }),
  );
  lp.connect(g);
  out(g, 0.45);
}

/** Subida de ruido filtrado (riser), como antes del "drop" en música electrónica. */
function riser(duration: number, volume: number, delay = 0) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * duration), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 3;
  bp.frequency.setValueAtTime(400, t0);
  bp.frequency.exponentialRampToValueAtTime(9000, t0 + duration);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(volume * VOL, t0 + duration * 0.95);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + 0.05);
  src.connect(bp).connect(g);
  out(g, 0.5);
  src.start(t0);
}

/** Golpe de sub-bajo que cae (el "drop"). */
function sub(volume: number, delay = 0) {
  tone({ from: 120, to: 38, duration: 0.6, volume, delay, attack: 0.003, send: 0.1 });
}

const PENTA = [880, 1047, 1175, 1319, 1568, 1760];

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
    // Encendido: subida, barrido que se abre, golpe de bajo y arpegio
    relay(0.015);
    riser(1.1, 0.03);
    sweep(150, 4500, 1.4, 0.05);
    sub(0.12, 1.15);
    arp([440, 659, 880, 1319, 1760], 0.07, 0.035, 1.2);
  },
  sleep() {
    // Apagado: arpegio que baja y el filtro que se cierra
    arp([1319, 880, 659, 440], 0.08, 0.03);
    sweep(3500, 120, 1.3, 0.045, 0.1);
  },
  hover() {
    pluck(1319, 0.022, 0, 0.18);
  },
  open() {
    // Acceso: barrido rápido y arpegio ascendente
    sweep(250, 5000, 0.45, 0.04, 0, [220, 330, 440]);
    arp([523, 784, 1047, 1568], 0.06, 0.032, 0.25);
    sub(0.06, 0.25);
  },
  close() {
    // Cierre en alerta: tres notas que bajan y el filtro que se cierra
    arp([784, 622, 466], 0.09, 0.035);
    sweep(3000, 200, 0.6, 0.035, 0.2, [117, 175, 233]);
  },
  /** Chequeo del puntero amarillo: dos notas ascendentes de "OK". */
  check() {
    pluck(880, 0.032, 0, 0.18);
    pluck(1319, 0.032, 0.1, 0.3);
  },
  grab() {
    pluck(659, 0.02, 0, 0.12, 0, 4);
  },
  drop() {
    pluck(440, 0.028, 0, 0.2);
    sub(0.05);
  },
  type() {
    pluck(PENTA[Math.floor(Math.random() * PENTA.length)], 0.01, 0, 0.1, Math.random() * 0.6 - 0.3);
  },
};
