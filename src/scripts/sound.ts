// Sonido "cibernético" sintetizado con Web Audio (sin archivos de audio).
// Todo pasa por una cadena común: compresor + eco corto + reverb metálica, que
// le da ese brillo de interfaz holográfica.
// El navegador solo permite sonar después de una interacción del usuario,
// así que el contexto se crea en el primer clic.

const STORAGE_KEY = "portfolio-sound";

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
    out.gain.value = 0.55;
    comp.connect(out).connect(ctx.destination);

    master = ctx.createGain();
    master.connect(comp);

    // Reverb + eco estéreo corto (ping-pong) para el aire "holográfico"
    wet = ctx.createGain();
    wet.gain.value = 0.35;
    const verb = ctx.createConvolver();
    verb.buffer = impulse(ctx, 1.6, 3.2);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 500;
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
  const osc = ac.createOscillator();
  const gain = ac.createGain();
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
  osc.connect(gain);
  out(gain, send, pan);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/** Ruido filtrado con barrido (servos, aire, estática). */
function noise(duration: number, volume: number, from: number, to = from, delay = 0, q = 1.2, send = 0.3) {
  const ac = audio();
  if (!ac) return;
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

// ---------- Ambiente con el núcleo encendido ----------
// Basado en el análisis de las grabaciones de referencia:
//  - un zumbido grave con fundamental ~37 Hz y sus armónicos (74, 111, 148, 185…)
//  - resaltado en dos bandas, ~430 Hz y ~720 Hz (con un hueco cerca de 550 Hz)
//  - una "ola" que crece y se apaga cada ~6,6 s
//  - pitidos de datos sueltos entre 2 y 9 kHz
let swellTimer = 0;
let chatterTimer = 0;
function startHum() {
  const ac = audio();
  if (!ac || hum) return;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.05, ac.currentTime + 2.5);
  const nodes: AudioScheduledSourceNode[] = [];
  // Fuente: diente de sierra a 37 Hz (todos los armónicos) + leve desafinado
  const mix = ac.createGain();
  mix.gain.value = 0.5;
  [37, 37.15].forEach((f) => {
    const o = ac.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    o.connect(mix);
    o.start();
    nodes.push(o);
  });
  // Cuerpo grave (armónicos bajos) + las dos bandas resaltadas
  const low = ac.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 320;
  const lowG = ac.createGain();
  lowG.gain.value = 0.7;
  mix.connect(low).connect(lowG).connect(gain);
  const bands = [430, 720].map((f, i) => {
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f;
    bp.Q.value = 7;
    const g = ac.createGain();
    g.gain.value = i ? 0.9 : 1.1;
    mix.connect(bp).connect(g).connect(gain);
    return g;
  });
  // La ola: las bandas crecen y bajan cada ~6,6 s
  const swell = () => {
    if (!ctx || !hum) return;
    const t = ctx.currentTime;
    bands.forEach((g, i) => {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(i ? 3.2 : 3.8, t + 0.35);
      g.gain.exponentialRampToValueAtTime(i ? 0.9 : 1.1, t + 4);
    });
    swellTimer = window.setTimeout(swell, 6600);
  };
  // Charla de datos: pitidos agudos sueltos, muy bajitos
  const chatter = () => {
    if (!hum) return;
    if (Math.random() < 0.7) {
      const f = [2350, 3200, 4300, 6400, 8100][Math.floor(Math.random() * 5)];
      ping(f * (0.98 + Math.random() * 0.04), 0.004 + Math.random() * 0.004, 0.06, 0, Math.random() * 1.4 - 0.7);
    }
    chatterTimer = window.setTimeout(chatter, 250 + Math.random() * 900);
  };
  out(gain, 0.12);
  hum = { nodes, gain };
  swellTimer = window.setTimeout(swell, 1800);
  chatterTimer = window.setTimeout(chatter, 1200);
}

function stopHum() {
  clearTimeout(swellTimer);
  clearTimeout(chatterTimer);
  if (!ctx || !hum) return;
  const { nodes, gain } = hum;
  hum = null;
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
  nodes.forEach((o) => o.stop(ctx!.currentTime + 1.3));
}

/** Pitido "de cristal": seno puro con un toque de FM y mucha reverb. */
function ping(freq: number, volume: number, dur = 0.12, delay = 0, pan = 0) {
  tone({ from: freq, duration: dur, volume, delay, attack: 0.003, fm: freq * 0.04, ratio: 2.76, send: 0.75, pan });
}

/** Tono con trémolo rápido (~24 Hz): el "procesando" de las referencias. */
function warble(freqs: number[], duration: number, volume: number, delay = 0, rate = 24) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const g = ac.createGain();
  env(g, t0, volume, 0.04, duration);
  const trem = ac.createGain();
  trem.gain.value = 0.5;
  const lfo = ac.createOscillator();
  const depth = ac.createGain();
  lfo.frequency.value = rate;
  depth.gain.value = 0.5;
  lfo.connect(depth).connect(trem.gain);
  freqs.forEach((f) => {
    const o = ac.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    o.connect(trem);
    o.start(t0);
    o.stop(t0 + duration + 0.05);
  });
  trem.connect(g);
  out(g, 0.45);
  lfo.start(t0);
  lfo.stop(t0 + duration + 0.05);
}

/** Golpe grave que cae (impacto / despliegue). */
function boom(volume: number, delay = 0) {
  tone({ type: "sine", from: 140, to: 32, duration: 0.7, volume, delay, attack: 0.005, send: 0.25 });
  noise(0.35, volume * 0.5, 260, 60, delay, 0.8, 0.2);
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
    // Barrido que sube desde lo grave (como en la referencia), golpe y tono de ~1 kHz
    tone({ type: "sawtooth", from: 50, to: 620, duration: 1.0, volume: 0.06, attack: 0.4, send: 0.25 });
    noise(1.0, 0.04, 120, 2600, 0, 5, 0.25);
    boom(0.16, 0.95);
    // Tono de ~1 kHz con armónicos pares fuertes (958, 2005, 3982, 5957 Hz)
    [990, 1990, 3980, 5960].forEach((f, i) =>
      tone({ from: f, duration: 1.3 - i * 0.2, volume: 0.04 / (i + 1), delay: 1.0, attack: 0.004, send: 0.7 }),
    );
    warble([440, 720], 1.2, 0.035, 1.35);
    startHum();
  },
  sleep() {
    // Lo mismo al revés: el tono se apaga y el barrido baja
    warble([720, 440], 0.6, 0.03, 0, 18);
    tone({ type: "sawtooth", from: 620, to: 45, duration: 1.2, volume: 0.06, delay: 0.2, send: 0.25 });
    noise(1.0, 0.035, 2600, 120, 0.2, 5);
    stopHum();
  },
  hover() {
    ping(2350, 0.02, 0.08);
  },
  open() {
    // Pitidos de cristal agudos + confirmación (≈1970 Hz sobre 620/700 Hz)
    ping(6390, 0.018, 0.1, 0, -0.3);
    ping(2350, 0.03, 0.14, 0.05, 0.2);
    ping(8700, 0.01, 0.08, 0.1, 0.4);
    tone({ from: 1968, duration: 0.18, volume: 0.035, delay: 0.2, send: 0.6 });
    tone({ type: "triangle", from: 620, duration: 0.2, volume: 0.04, delay: 0.2, send: 0.4 });
    tone({ type: "triangle", from: 700, duration: 0.24, volume: 0.04, delay: 0.32, send: 0.4 });
    ping(3185, 0.015, 0.1, 0.45, -0.4);
    ping(8135, 0.008, 0.08, 0.5, 0.5);
  },
  close() {
    // Alerta: dos bandas con trémolo, más tensas
    warble([466, 740], 0.7, 0.04, 0, 24);
    noise(0.5, 0.025, 5000, 400, 0.1, 2);
  },
  /** Chequeo del puntero amarillo: acorde que "late" (1071 / 1112 / 1318 Hz). */
  check() {
    [1071, 1112, 1318].forEach((f, i) => tone({ from: f, duration: 1.1, volume: 0.025, delay: i * 0.03, attack: 0.02, send: 0.6 }));
    ping(3502, 0.012, 0.3, 0.1);
  },
  grab() {
    // Servo corto + pitido de datos
    noise(0.06, 0.025, 2500, 4500, 0, 8, 0.1);
    ping(4280, 0.008, 0.05);
  },
  drop() {
    // Encastre: golpe grave + acorde corto (345 / 535 / 960 Hz)
    boom(0.08);
    [345, 535, 960].forEach((f) => tone({ type: "triangle", from: f, duration: 0.22, volume: 0.02, attack: 0.004, send: 0.4 }));
  },
  type() {
    ping(2340 + Math.floor(Math.random() * 4) * 940, 0.005, 0.03);
  },
};
