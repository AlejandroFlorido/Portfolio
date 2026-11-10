// Sonido "cibernético" sintetizado con Web Audio (sin archivos de audio).
// Todo pasa por una cadena común: compresor + eco corto + reverb metálica, que
// le da ese brillo de interfaz holográfica.
// El navegador solo permite sonar después de una interacción del usuario,
// así que el contexto se crea en el primer clic.

const STORAGE_KEY = "portfolio-sound";
// Frecuencias tomadas tal cual de la grabación de referencia de Ale (hudSound)
const PITCH = 1;
const VOL = 5;
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


// ---------- Paleta sacada de la referencia "Digital HUD Sounds" ----------
// Análisis de la grabación:
//  - Colchón de "cómputo": senos en 311 / 415 / 622 / 830 Hz (Re# y Sol#,
//    quintas apiladas) que parpadean en volumen al azar cada ~0,1 s.
//  - Ráfagas de datos: un tono agudo cortado a ~40 Hz (6834, 4571, 12868 Hz…).
//  - Barridos finos: senos que caen en curva desde ~12 kHz, o que suben y se
//    quedan clavados en una nota.
//  - Guiones cortos de tono puro (2000, 2900, 3800 Hz) y algún golpe grave.

const BED = [311, 415, 622, 830];
const DASH = [2000, 2310, 2900, 3820, 4570];

/** Colchón de cómputo: los cuatro tonos parpadeando al azar. */
function bed(duration: number, volume: number, delay = 0) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const g = ac.createGain();
  env(g, t0, volume * VOL, Math.min(0.25, duration * 0.2), duration);
  BED.forEach((f, i) => {
    const o = ac.createOscillator();
    o.frequency.value = hz(f);
    const flick = ac.createGain();
    flick.gain.setValueAtTime(0, t0);
    for (let t = 0; t < duration; t += 0.06 + Math.random() * 0.1) {
      flick.gain.setTargetAtTime(Math.random() < 0.3 ? 0.08 : 0.5 + Math.random() * 0.5, t0 + t, 0.02);
    }
    const lvl = ac.createGain();
    lvl.gain.value = [1, 0.9, 0.6, 0.35][i];
    o.connect(flick).connect(lvl).connect(g);
    o.start(t0);
    o.stop(t0 + duration + 0.05);
  });
  out(g, 0.3);
}

/** Ráfaga de datos: un tono agudo cortado en pulsos rápidos. */
function stutter(freq: number, pulses: number, volume: number, delay = 0, rate = 38, pan = 0) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const o = ac.createOscillator();
  o.frequency.value = hz(freq);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t0);
  const per = 1 / rate;
  for (let i = 0; i < pulses; i++) {
    const t = t0 + i * per;
    g.gain.setValueAtTime(volume * VOL, t);
    g.gain.setValueAtTime(0, t + per * 0.55);
  }
  o.connect(g);
  out(g, 0.3, pan);
  o.start(t0);
  o.stop(t0 + pulses * per + 0.05);
}

/** Barrido fino de seno: cae (o sube) en curva. */
function zip(from: number, to: number, duration: number, volume: number, delay = 0, pan = 0) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const o = ac.createOscillator();
  o.frequency.setValueAtTime(hz(from), t0);
  o.frequency.setTargetAtTime(hz(to), t0, duration / 3);
  const g = ac.createGain();
  env(g, t0, volume * VOL, 0.01, duration);
  o.connect(g);
  out(g, 0.35, pan);
  o.start(t0);
  o.stop(t0 + duration + 0.05);
}

/** Sube rápido y se queda clavado en la nota. */
function lock(from: number, to: number, rise: number, hold: number, volume: number, delay = 0, pan = 0) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const o = ac.createOscillator();
  o.frequency.setValueAtTime(hz(from), t0);
  o.frequency.exponentialRampToValueAtTime(hz(to), t0 + rise);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(volume * VOL, t0 + rise * 0.5);
  g.gain.setValueAtTime(volume * VOL, t0 + rise + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + rise + hold + 0.04);
  o.connect(g);
  out(g, 0.3, pan);
  o.start(t0);
  o.stop(t0 + rise + hold + 0.1);
}

/** Guion corto de tono puro. */
function dash(freq: number, duration: number, volume: number, delay = 0, pan = 0) {
  tone({ from: freq, duration, volume, delay, attack: 0.004, send: 0.25, pan });
}

/** Estática digital (ruido agudo) como la de la referencia. */
function staticBurst(duration: number, volume: number, delay = 0) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * duration), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1600;
  const g = ac.createGain();
  env(g, t0, volume * VOL, 0.005, duration);
  src.connect(hp).connect(g);
  out(g, 0.2);
  src.start(t0);
}

/** Golpe grave seco. */
function thump(volume: number, delay = 0) {
  tone({ from: 95, to: 45, duration: 0.35, volume, delay, attack: 0.002, send: 0.1 });
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const side = () => Math.random() * 1.2 - 0.6;

// ---------- Fondo con el núcleo encendido (como en la referencia) ----------
// El colchón de cómputo 311/415/622/830 Hz titilando sin parar, muy bajito,
// un leve rumor grave y, cada tanto, alguna ráfaga o barrido suelto.
let hum: { nodes: AudioScheduledSourceNode[]; gain: GainNode; flicks: GainNode[] } | null = null;
let flickTimer = 0;
let eventTimer = 0;

function startHum() {
  const ac = audio();
  if (!ac || hum) return;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.012 * VOL, ac.currentTime + 3);
  const nodes: AudioScheduledSourceNode[] = [];
  const flicks = BED.map((f, i) => {
    const o = ac.createOscillator();
    o.frequency.value = hz(f);
    const flick = ac.createGain();
    flick.gain.value = 0.3;
    const lvl = ac.createGain();
    lvl.gain.value = [1, 0.9, 0.55, 0.3][i];
    o.connect(flick).connect(lvl).connect(gain);
    o.start();
    nodes.push(o);
    return flick;
  });
  // Rumor grave: ruido marrón muy filtrado
  const len = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = last * 0.98 + (Math.random() * 2 - 1) * 0.02;
    d[i] = last * 5;
  }
  const rumble = ac.createBufferSource();
  rumble.buffer = buf;
  rumble.loop = true;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 180;
  const rg = ac.createGain();
  rg.gain.value = 0.5;
  rumble.connect(lp).connect(rg).connect(gain);
  rumble.start();
  nodes.push(rumble);
  out(gain, 0.25);
  hum = { nodes, gain, flicks };

  // Titileo: cada tono cambia de volumen al azar, programado de a 1 s
  const flicker = () => {
    if (!ctx || !hum) return;
    const t0 = ctx.currentTime;
    hum.flicks.forEach((g) => {
      for (let t = 0; t < 1.05; t += 0.06 + Math.random() * 0.12) {
        g.gain.setTargetAtTime(Math.random() < 0.3 ? 0.06 : 0.4 + Math.random() * 0.6, t0 + t, 0.025);
      }
    });
    flickTimer = window.setTimeout(flicker, 1000);
  };
  flicker();

  // Datos sueltos de vez en cuando, bajitos
  const events = () => {
    if (!hum) return;
    const r = Math.random();
    if (r < 0.45) stutter(pick([6834, 4571, 12868, 2900]), 3 + Math.floor(Math.random() * 4), 0.006, 0, 40, side());
    else if (r < 0.75) zip(9000 + Math.random() * 4000, 2500 + Math.random() * 2500, 0.5, 0.004, 0, side());
    else dash(pick(DASH), 0.06, 0.004, 0, side());
    eventTimer = window.setTimeout(events, 900 + Math.random() * 2200);
  };
  eventTimer = window.setTimeout(events, 1500);
}

function stopHum() {
  clearTimeout(flickTimer);
  clearTimeout(eventTimer);
  if (!ctx || !hum) return;
  const { nodes, gain } = hum;
  hum = null;
  const t = ctx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  nodes.forEach((o) => o.stop(t + 1.3));
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
    // Arranque del HUD: golpe, el colchón de cómputo entra y llueven datos
    thump(0.12);
    bed(2.4, 0.03, 0.05);
    lock(2300, 8340, 0.08, 0.25, 0.012, 0.15, -0.4);
    zip(12000, 4500, 0.5, 0.01, 0.35, 0.5);
    stutter(6834, 6, 0.02, 0.6, 38, 0.2);
    zip(13000, 2300, 0.6, 0.009, 0.8, -0.5);
    stutter(4571, 7, 0.022, 1.05, 40, -0.2);
    dash(3820, 0.09, 0.014, 1.4, 0.3);
    stutter(6834, 4, 0.02, 1.6, 38);
    startHum();
  },
  sleep() {
    // Apagado: estática, barridos que caen y el colchón que se va
    staticBurst(0.25, 0.012);
    bed(0.9, 0.025);
    zip(12000, 2000, 0.7, 0.012, 0.1, 0.4);
    zip(9000, 1500, 0.8, 0.01, 0.3, -0.4);
    thump(0.08, 0.6);
    stopHum();
  },
  hover() {
    stutter(6834, 3, 0.014, 0, 40, side());
  },
  open() {
    // Acceso: tono que sube y se clava, ráfagas de datos y cómputo
    lock(2300, 8340, 0.07, 0.18, 0.014, 0, 0.3);
    bed(1.2, 0.025, 0.05);
    stutter(4571, 6, 0.022, 0.2, 40, -0.3);
    zip(12000, 3800, 0.45, 0.01, 0.3, 0.4);
    stutter(6834, 4, 0.02, 0.5);
  },
  close() {
    // Cierre en alerta: estática, barrido que cae y ráfagas más graves
    staticBurst(0.18, 0.014);
    zip(12000, 2300, 0.45, 0.013, 0.05);
    stutter(2900, 5, 0.024, 0.2, 30);
    stutter(2310, 5, 0.024, 0.4, 30);
  },
  /** Chequeo del puntero amarillo: guion + ráfaga corta de "OK". */
  check() {
    dash(3820, 0.07, 0.016);
    stutter(6834, 4, 0.02, 0.1);
  },
  grab() {
    dash(2000, 0.05, 0.014);
  },
  drop() {
    stutter(4571, 3, 0.018);
    thump(0.05, 0.02);
  },
  type() {
    dash(pick(DASH), 0.03, 0.006, 0, side());
  },
};
