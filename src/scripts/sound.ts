// Sonido "cibernético" sintetizado con Web Audio (sin archivos de audio).
// Todo pasa por una cadena común: compresor + eco corto + reverb metálica, que
// le da ese brillo de interfaz holográfica.
// El navegador solo permite sonar después de una interacción del usuario,
// así que el contexto se crea en el primer clic.

const STORAGE_KEY = "portfolio-sound";
// Ajuste global de los efectos: tono natural (más grave = más sombrío)
const PITCH = 1;
const VOL = 1.5;
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
    wet.gain.value = 0.5;
    const verb = ctx.createConvolver();
    verb.buffer = impulse(ctx, 3.2, 3); // cola larga, de sala grande
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
  gain.gain.exponentialRampToValueAtTime(0.035, ac.currentTime + 2.5);
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
  // Charla de datos: clics sueltos, muy bajitos
  const chatter = () => {
    if (!hum) return;
    if (Math.random() < 0.7) {
      tick(0.006 + Math.random() * 0.006, 0, Math.random() * 1.4 - 0.7);
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

/** Tono con trémolo rápido (~24 Hz): el "procesando" de las referencias. */
function warble(freqs: number[], duration: number, volume: number, delay = 0, rate = 24) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const g = ac.createGain();
  env(g, t0, volume * VOL, 0.04, duration);
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
    o.frequency.value = hz(f);
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
  tone({ type: "sine", from: 110, to: 30, duration: 0.9, volume, delay, attack: 0.004, send: 0.3 });
  noise(0.4, volume * 0.4, 200, 50, delay, 0.7, 0.25);
}

/** Clic de interfaz: un transiente de ruido muy corto y agudo (sin tono). */
function tick(volume: number, delay = 0, pan = 0) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const len = Math.ceil(ac.sampleRate * 0.02);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const hp = ac.createBiquadFilter();
  hp.type = "bandpass";
  hp.frequency.value = 1800;
  hp.Q.value = 1.4;
  const g = ac.createGain();
  g.gain.value = volume * VOL * 9;
  src.connect(hp).connect(g);
  out(g, 0.35, pan);
  src.start(t0);
}

/** Ráfaga de aire que barre de un lado al otro (whoosh cinematográfico). */
function whoosh(duration: number, volume: number, from: number, to: number, delay = 0, panFrom = -0.6, panTo = 0.6) {
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
  bp.Q.value = 2.2;
  bp.frequency.setValueAtTime(from, t0);
  bp.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  const g = ac.createGain();
  // Crece y se va (forma de "swoosh")
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(volume * VOL, t0 + duration * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  const p = ac.createStereoPanner();
  p.pan.setValueAtTime(panFrom, t0);
  p.pan.linearRampToValueAtTime(panTo, t0 + duration);
  src.connect(bp).connect(g).connect(p);
  out(p, 0.5);
  src.start(t0);
}

/**
 * Pad sombrío: pares de dientes de sierra desafinados que pasan por un filtro
 * pasa-bajos que se va cerrando. Suena a "cuerda oscura" de película, nada de campanitas.
 */
function dark(freqs: number[], duration: number, volume: number, delay = 0, attack = 0.15, cutoff = 900) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 2;
  lp.frequency.setValueAtTime(cutoff * 0.4, t0);
  lp.frequency.exponentialRampToValueAtTime(cutoff, t0 + attack + 0.05);
  lp.frequency.exponentialRampToValueAtTime(Math.max(60, cutoff * 0.15), t0 + duration);
  const g = ac.createGain();
  env(g, t0, volume * VOL, attack, duration);
  freqs.forEach((f, i) => {
    [-9, 9].forEach((cents) => {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hz(f) * Math.pow(2, cents / 1200);
      const og = ac.createGain();
      og.gain.value = 1 / freqs.length;
      o.connect(og).connect(lp);
      o.start(t0 + i * 0.03);
      o.stop(t0 + duration + 0.1);
    });
  });
  lp.connect(g);
  out(g, 0.6);
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
    // Encendido sombrío: el sub sube, aire grave, impacto y un acorde menor oscuro
    tone({ from: 30, to: 110, duration: 1.2, volume: 0.12, attack: 0.7, send: 0.2 });
    whoosh(1.1, 0.07, 150, 1800, 0);
    boom(0.28, 1.0);
    tick(0.02, 1.0);
    dark([55, 82.4, 110, 130.8], 3.2, 0.16, 0.95, 0.25, 1100);
    warble([110, 164.8], 1.4, 0.03, 1.3, 9);
    startHum();
  },
  sleep() {
    // Se apaga: acorde que se hunde, aire que baja y el sub que cae
    dark([110, 87.3, 65.4], 1.6, 0.12, 0, 0.08, 700);
    whoosh(1.0, 0.06, 1500, 120, 0.05, 0.6, -0.6);
    tone({ from: 110, to: 28, duration: 1.4, volume: 0.12, delay: 0.2, send: 0.25 });
    stopHum();
  },
  hover() {
    tick(0.012);
    dark([146.8], 0.45, 0.05, 0, 0.03, 600);
  },
  open() {
    // Acceso: ráfaga grave que entra, golpe y acorde menor que queda flotando
    whoosh(0.5, 0.06, 200, 2200, 0, -0.5, 0.5);
    tick(0.02, 0.42);
    boom(0.14, 0.42);
    dark([73.4, 110, 146.8, 174.6], 2.2, 0.14, 0.4, 0.06, 1200);
  },
  close() {
    // Cierre en alerta: aire que se va, trémolo tenso y disonante que baja
    whoosh(0.6, 0.05, 1800, 180, 0, 0.5, -0.5);
    warble([116.5, 164.8], 0.8, 0.05, 0.05, 11);
    dark([58.3, 87.3, 123.5], 1.2, 0.12, 0.08, 0.05, 800);
  },
  /** Chequeo del puntero amarillo: acorde grave y corto, como "confirmado". */
  check() {
    tick(0.018);
    dark([98, 146.8, 196], 1.2, 0.11, 0.02, 0.04, 1000);
  },
  grab() {
    // Servo corto: clic + aire que sube apenas
    tick(0.016);
    whoosh(0.14, 0.025, 400, 1600, 0, 0, 0);
  },
  drop() {
    // Encastre: golpe grave + clic + nota oscura corta
    boom(0.16);
    tick(0.02);
    dark([65.4, 98], 0.5, 0.08, 0.01, 0.01, 700);
  },
  type() {
    tick(0.006 + Math.random() * 0.004, 0, Math.random() * 0.6 - 0.3);
  },
};
