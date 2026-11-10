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
let crush: WaveShaperNode | null = null; // reductor de bits: textura digital
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

    // Reductor de bits: escalona la onda en 24 niveles (grano digital, robótico)
    crush = ctx.createWaveShaper();
    const steps = 24;
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.round(x * steps) / steps;
    }
    crush.curve = curve;
    crush.connect(master);

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

/** Salida por el reductor de bits, con algo de reverb. */
function outDigital(node: AudioNode, send = 0.25, pan = 0) {
  if (!ctx || !crush || !wet) return;
  let last: AudioNode = node;
  if (pan) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    node.connect(p);
    last = p;
  }
  last.connect(crush);
  const sg = ctx.createGain();
  sg.gain.value = send;
  last.connect(sg).connect(wet);
}

/**
 * "Computadora pensando": un zumbido de diente de sierra por un filtro muy
 * resonante que salta a frecuencias al azar en cada paso (sample & hold).
 */
function think(steps: number, stepDur: number, volume: number, delay = 0, lo = 800, hi = 3500, pan = 0) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const dur = steps * stepDur;
  const o = ac.createOscillator();
  o.type = "sawtooth";
  o.frequency.value = hz(92);
  const o2 = ac.createOscillator();
  o2.type = "sawtooth";
  o2.frequency.value = hz(92) * 1.5;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 22;
  for (let i = 0; i < steps; i++) {
    bp.frequency.setValueAtTime(hz(lo + Math.random() * (hi - lo)), t0 + i * stepDur);
  }
  // Compuerta: cada paso suena como un pulso separado
  const gate = ac.createGain();
  gate.gain.setValueAtTime(0, t0);
  for (let i = 0; i < steps; i++) {
    const t = t0 + i * stepDur;
    gate.gain.setValueAtTime(1, t);
    gate.gain.setValueAtTime(0.05, t + stepDur * 0.7);
  }
  gate.gain.setValueAtTime(0, t0 + dur);
  const g = ac.createGain();
  g.gain.value = volume * VOL * 6;
  o.connect(bp);
  o2.connect(bp);
  bp.connect(gate).connect(g);
  outDigital(g, 0.2, pan);
  [o, o2].forEach((x) => {
    x.start(t0);
    x.stop(t0 + dur + 0.05);
  });
}

/** Rayo de energía: FM metálica (razón inarmónica) con barrido rápido. */
function zap(from: number, to: number, duration: number, volume: number, delay = 0, pan = 0) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const car = ac.createOscillator();
  car.frequency.setValueAtTime(hz(from), t0);
  car.frequency.exponentialRampToValueAtTime(hz(to), t0 + duration);
  const mod = ac.createOscillator();
  mod.frequency.setValueAtTime(hz(from) * 3.71, t0);
  mod.frequency.exponentialRampToValueAtTime(hz(to) * 3.71, t0 + duration);
  const idx = ac.createGain();
  idx.gain.setValueAtTime(hz(from) * 2.5, t0);
  idx.gain.exponentialRampToValueAtTime(hz(to) * 0.3, t0 + duration);
  mod.connect(idx).connect(car.frequency);
  const g = ac.createGain();
  env(g, t0, volume * VOL, 0.004, duration);
  car.connect(g);
  outDigital(g, 0.3, pan);
  [car, mod].forEach((x) => {
    x.start(t0);
    x.stop(t0 + duration + 0.05);
  });
}

/**
 * Carga de energía (o descarga): zumbido que sube de tono, modulado en
 * amplitud a velocidad de audio (modulación en anillo) que se acelera.
 */
function charge(from: number, to: number, duration: number, volume: number, delay = 0) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const o = ac.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(hz(from), t0);
  o.frequency.exponentialRampToValueAtTime(hz(to), t0 + duration);
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 8;
  lp.frequency.setValueAtTime(hz(from) * 3, t0);
  lp.frequency.exponentialRampToValueAtTime(hz(to) * 4, t0 + duration);
  const ring = ac.createGain();
  ring.gain.value = 0;
  const rm = ac.createOscillator();
  rm.frequency.setValueAtTime(from < to ? 18 : 140, t0);
  rm.frequency.exponentialRampToValueAtTime(from < to ? 140 : 18, t0 + duration);
  rm.connect(ring.gain);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(volume * VOL, t0 + duration * (from < to ? 0.9 : 0.1));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  o.connect(lp).connect(ring).connect(g);
  outDigital(g, 0.3);
  [o, rm].forEach((x) => {
    x.start(t0);
    x.stop(t0 + duration + 0.05);
  });
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
    // Arranque del reactor: carga de energía, descarga y el sistema "piensa"
    relay(0.02);
    charge(70, 600, 1.3, 0.05);
    zap(2600, 220, 0.35, 0.05, 1.3);
    think(12, 0.055, 0.035, 1.4, 600, 3800);
    zap(900, 1800, 0.12, 0.035, 2.1);
  },
  sleep() {
    // Apagado: el sistema piensa más lento y la energía se descarga
    think(5, 0.08, 0.03, 0, 400, 1600);
    charge(600, 50, 1.2, 0.045, 0.3);
  },
  hover() {
    think(2, 0.035, 0.022, 0, 1500, 3500);
  },
  open() {
    // Acceso: rayo que sube y procesamiento rápido
    zap(250, 2600, 0.2, 0.04);
    think(9, 0.045, 0.032, 0.15, 800, 4200);
  },
  close() {
    // Cierre en alerta: pulsos graves alternados y descarga
    think(4, 0.1, 0.035, 0, 450, 700);
    zap(2000, 150, 0.4, 0.04, 0.4);
  },
  /** Chequeo del puntero amarillo: dos rayos cortos ascendentes de "OK". */
  check() {
    zap(700, 1400, 0.08, 0.035);
    zap(1100, 2200, 0.1, 0.035, 0.1);
  },
  grab() {
    zap(500, 1300, 0.08, 0.02);
  },
  drop() {
    zap(1600, 350, 0.12, 0.03);
    relay(0.012, 0.02);
  },
  type() {
    think(1, 0.03, 0.014, 0, 1500, 4500, Math.random() * 0.6 - 0.3);
  },
};
