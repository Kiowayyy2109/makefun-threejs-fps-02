// Synthesized sound effects: no audio assets anywhere. Everything is an
// oscillator or filtered noise through one master gain. The AudioContext is
// created lazily on the first user gesture (unlock); before that, and in
// headless captures where no gesture ever comes, every call is a no-op.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.16;
      master.connect(ctx.destination);
      const length = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
  }

  function noise(dur, freq, gain, type = 'lowpass', when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, gain, type = 'square', slideTo = null, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // vol scales with distance for other people's guns.
  function shot(kind, vol = 1) {
    if (!ctx) return;
    if (kind === 'scatter') {
      noise(0.3, 850, 0.95 * vol);
      tone(130, 0.16, 0.5 * vol, 'sawtooth', 55);
    } else if (kind === 'rifle') {
      noise(0.16, 1700, 0.7 * vol);
      tone(190, 0.09, 0.34 * vol, 'square', 70);
    } else if (kind === 'smg') {
      noise(0.1, 2300, 0.55 * vol);
      tone(240, 0.06, 0.26 * vol, 'square', 90);
    } else {
      noise(0.09, 2700, 0.5 * vol);
      tone(320, 0.05, 0.24 * vol, 'square', 120);
    }
  }

  return {
    unlock,
    shot,
    dry() { tone(1400, 0.04, 0.12, 'square'); },
    reload() {
      noise(0.07, 1200, 0.25, 'bandpass');
      tone(500, 0.05, 0.12, 'square', 300, 0.09);
      noise(0.06, 1800, 0.22, 'bandpass', 0, 0.22);
    },
    hit(kill) {
      tone(kill ? 1560 : 1180, kill ? 0.14 : 0.06, 0.2, 'sine');
      if (kill) tone(780, 0.16, 0.16, 'sine', null, 0.05);
    },
    hurt() { tone(140, 0.12, 0.3, 'sawtooth', 80); },
    throwIt() { noise(0.18, 600, 0.15, 'bandpass'); },
    explosion() {
      noise(0.9, 220, 1.0);
      tone(70, 0.7, 0.6, 'sine', 34);
      noise(0.35, 900, 0.4, 'lowpass', 0.03);
    },
    beep(urgent = false) { tone(urgent ? 1560 : 1180, 0.07, 0.18, 'sine'); },
    plantDone() {
      tone(880, 0.09, 0.2, 'sine');
      tone(1320, 0.12, 0.2, 'sine', null, 0.1);
    },
    defused() {
      tone(1320, 0.09, 0.18, 'sine');
      tone(660, 0.16, 0.18, 'sine', null, 0.1);
    },
    sting(win) {
      if (win) {
        tone(523, 0.14, 0.2, 'triangle');
        tone(659, 0.14, 0.2, 'triangle', null, 0.12);
        tone(784, 0.24, 0.22, 'triangle', null, 0.24);
      } else {
        tone(392, 0.16, 0.2, 'triangle');
        tone(330, 0.16, 0.2, 'triangle', null, 0.13);
        tone(262, 0.28, 0.22, 'triangle', null, 0.26);
      }
    },
  };
}
