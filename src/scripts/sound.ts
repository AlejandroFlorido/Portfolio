// Efectos de sonido sintetizados con Web Audio (sin archivos de audio).
// El navegador solo permite sonar después de una interacción del usuario,
// así que el contexto se crea en el primer clic.

const STORAGE_KEY = "portfolio-sound";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let hum: { osc: OscillatorNode[]; gain: GainNode } | null = null;
let enabled = true;

try {
  enabled = localStorage.getItem(STORAGE_KEY) !== "off";
} catch {
  /* sin almacenamiento: queda activado */
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

interface ToneOpts {
  type?: OscillatorType;
  from: number;
  to?: number;
  duration: number;
  volume?: number;
  delay?: number;
  attack?: number;
}

function tone({ type = "sine", from, to = from, duration, volume = 0.2, delay = 0, attack = 0.01 }: ToneOpts) {
  const ac = audio();
  if (!ac || !master) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function noise(duration: number, volume: number, freq: number, delay = 0) {
  const ac = audio();
  if (!ac || !master) return;
  const t0 = ac.currentTime + delay;
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * duration), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = 1.2;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter).connect(gain).connect(master);
  src.start(t0);
}

function startHum() {
  const ac = audio();
  if (!ac || !master || hum) return;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.035, ac.currentTime + 2);
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 400;
  const osc = [55, 82.5, 110.4].map((f) => {
    const o = ac.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    o.connect(filter);
    o.start();
    return o;
  });
  filter.connect(gain).connect(master);
  hum = { osc, gain };
}

function stopHum() {
  if (!ctx || !hum) return;
  const { osc, gain } = hum;
  hum = null;
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
  osc.forEach((o) => o.stop(ctx!.currentTime + 0.9));
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
    if (!value) stopHum();
    else if (awake) startHum();
  },
  wake() {
    tone({ type: "sawtooth", from: 60, to: 420, duration: 1.1, volume: 0.08, attack: 0.3 });
    tone({ from: 440, duration: 1.4, volume: 0.07, delay: 0.75, attack: 0.05 });
    tone({ from: 660, duration: 1.4, volume: 0.05, delay: 0.85, attack: 0.05 });
    tone({ from: 990, duration: 1.2, volume: 0.035, delay: 0.95, attack: 0.05 });
    noise(0.6, 0.08, 2500, 0.7);
    startHum();
  },
  sleep() {
    tone({ type: "triangle", from: 520, to: 60, duration: 1, volume: 0.12 });
    stopHum();
  },
  hover() {
    tone({ type: "triangle", from: 1500, to: 1800, duration: 0.07, volume: 0.04 });
  },
  open() {
    tone({ type: "square", from: 700, duration: 0.06, volume: 0.05 });
    tone({ type: "square", from: 1050, duration: 0.08, volume: 0.05, delay: 0.07 });
    noise(0.25, 0.06, 4000, 0.12);
    tone({ from: 1400, to: 2200, duration: 0.25, volume: 0.04, delay: 0.15 });
  },
  close() {
    tone({ type: "triangle", from: 900, to: 300, duration: 0.2, volume: 0.07 });
  },
  type() {
    tone({ type: "square", from: 2400 + Math.random() * 400, duration: 0.015, volume: 0.012 });
  },
};
