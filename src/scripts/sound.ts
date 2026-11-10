// Sonido "cibernético" sintetizado con Web Audio (sin archivos de audio) y una
// voz de asistente con la síntesis de voz del navegador.
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

/** Ráfaga de datos: pitidos rápidos al azar, como transmisión digital. */
function burst(count: number, base: number, spread: number, step: number, volume: number, delay = 0) {
  for (let i = 0; i < count; i++) {
    tone({
      type: "square",
      from: base + Math.round(Math.random() * 6) * spread,
      duration: step * 0.8,
      volume,
      delay: delay + i * step,
      send: 0.25,
      pan: Math.random() * 1.2 - 0.6,
    });
  }
}

function startHum() {
  const ac = audio();
  if (!ac || hum) return;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.03, ac.currentTime + 2.5);
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 650;
  filter.Q.value = 6;
  // El filtro "respira" despacio: zumbido de reactor vivo
  const lfo = ac.createOscillator();
  const lfoGain = ac.createGain();
  lfo.frequency.value = 0.12;
  lfoGain.gain.value = 260;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();
  const nodes: AudioScheduledSourceNode[] = [lfo];
  [55, 55.4, 110.2, 165].forEach((f, i) => {
    const o = ac.createOscillator();
    o.type = i < 2 ? "sawtooth" : "sine";
    o.frequency.value = f;
    o.connect(filter);
    o.start();
    nodes.push(o);
  });
  filter.connect(gain);
  out(gain, 0.15);
  hum = { nodes, gain };
}

function stopHum() {
  if (!ctx || !hum) return;
  const { nodes, gain } = hum;
  hum = null;
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1);
  nodes.forEach((o) => o.stop(ctx!.currentTime + 1.1));
}

// ---------- Voz del asistente ----------
// Usa la voz sintética del dispositivo: tranquila, grave y un poco lenta.
let voice: SpeechSynthesisVoice | null = null;
function pickVoice() {
  const all = window.speechSynthesis?.getVoices() ?? [];
  const es = all.filter((v) => v.lang.toLowerCase().startsWith("es"));
  // Preferimos voces masculinas o "neural"/"natural" si el sistema las tiene
  const pref = /(jorge|diego|pablo|juan|carlos|enrique|alvaro|raul|male|hombre|neural|natural|google)/i;
  voice = es.find((v) => pref.test(v.name)) ?? es[0] ?? null;
}
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  pickVoice();
  window.speechSynthesis.addEventListener?.("voiceschanged", pickVoice);
}
let lastLine = "";
let lastAt = 0;
function say(text: string) {
  if (!enabled || !("speechSynthesis" in window)) return;
  const now = performance.now();
  if (text === lastLine && now - lastAt < 4000) return; // no repetir de más
  lastLine = text;
  lastAt = now;
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "es-ES";
  u.rate = 0.98;
  u.pitch = 0.78;
  u.volume = 0.85;
  window.speechSynthesis.cancel();
  // Un "clic" de comunicación antes de hablar
  tone({ type: "sine", from: 2600, to: 1900, duration: 0.05, volume: 0.03, send: 0.6 });
  window.speechSynthesis.speak(u);
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
      window.speechSynthesis?.cancel();
    } else if (awake) startHum();
  },
  /** Una frase del asistente. */
  say,
  wake() {
    // Arranque del reactor: carga grave que sube, chispa y acorde brillante
    tone({ type: "sawtooth", from: 45, to: 380, duration: 1.2, volume: 0.07, attack: 0.5, send: 0.2 });
    noise(1.1, 0.05, 200, 3200, 0, 4, 0.2);
    tone({ from: 880, duration: 1.8, volume: 0.05, delay: 0.85, attack: 0.04, fm: 220, ratio: 3.01, send: 0.7 });
    tone({ from: 1318, duration: 1.6, volume: 0.035, delay: 0.92, attack: 0.04, send: 0.7, pan: -0.4 });
    tone({ from: 1760, duration: 1.4, volume: 0.025, delay: 0.99, attack: 0.04, send: 0.7, pan: 0.4 });
    burst(8, 1800, 220, 0.045, 0.012, 1.0);
    startHum();
    window.setTimeout(() => say("Sistemas en línea. Bienvenido."), 1200);
  },
  sleep() {
    // Apagado: el reactor baja y se desvanece
    tone({ type: "sawtooth", from: 420, to: 40, duration: 1.2, volume: 0.07, send: 0.3 });
    tone({ from: 1320, to: 660, duration: 0.5, volume: 0.03, fm: 300, ratio: 1.5, send: 0.6 });
    noise(0.9, 0.04, 3000, 150, 0.1, 3);
    stopHum();
    say("Entrando en reposo.");
  },
  hover() {
    tone({ from: 2100, to: 2600, duration: 0.06, volume: 0.025, fm: 400, ratio: 1.5, send: 0.5 });
  },
  open() {
    // Acceso: doble pitido digital, barrido de escaneo y destello
    tone({ type: "square", from: 880, duration: 0.05, volume: 0.03 });
    tone({ type: "square", from: 1320, duration: 0.07, volume: 0.03, delay: 0.06 });
    noise(0.45, 0.05, 600, 7000, 0.1, 6, 0.4);
    tone({ from: 600, to: 2400, duration: 0.4, volume: 0.035, delay: 0.12, fm: 150, ratio: 2.5, send: 0.6 });
    burst(5, 2200, 180, 0.04, 0.01, 0.4);
  },
  /** El asistente nombra la sección que se abre. */
  section(name: string) {
    say(`Accediendo a ${name.toLowerCase()}.`);
  },
  close() {
    // Alerta corta de cierre (los rojos borran)
    tone({ type: "sawtooth", from: 740, to: 520, duration: 0.18, volume: 0.04, send: 0.3 });
    tone({ type: "sawtooth", from: 740, to: 520, duration: 0.18, volume: 0.04, delay: 0.24, send: 0.3 });
    noise(0.5, 0.035, 5000, 400, 0.05, 2);
  },
  /** Chequeo del puntero amarillo. */
  check() {
    tone({ from: 1046, duration: 0.09, volume: 0.035, fm: 120, ratio: 2, send: 0.6 });
    tone({ from: 1568, duration: 0.18, volume: 0.035, delay: 0.1, fm: 120, ratio: 2, send: 0.6 });
  },
  grab() {
    // Servo que agarra
    noise(0.06, 0.03, 2500, 4500, 0, 8, 0.1);
    tone({ type: "square", from: 1400, to: 1700, duration: 0.025, volume: 0.015, send: 0.1 });
  },
  drop() {
    // Encastre: golpe grave + clic metálico
    tone({ type: "sine", from: 220, to: 70, duration: 0.16, volume: 0.09, send: 0.2 });
    tone({ from: 2400, duration: 0.05, volume: 0.025, delay: 0.02, fm: 900, ratio: 1.41, send: 0.5 });
  },
  type() {
    tone({ type: "square", from: 2600 + Math.random() * 800, duration: 0.012, volume: 0.008, send: 0.15 });
  },
};
