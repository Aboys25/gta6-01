// Procedural audio: every sound is synthesized with WebAudio — engine hum,
// ocean ambience, a two-tone siren, impacts, gunfire, pickups and a mission
// jingle. No shipped audio files, no network.
export function makeAudio() {
  let ctx = null, master = null, engineOsc = null, engineOsc2 = null, engineGain = null;
  let sirenOsc = null, sirenGain = null, sirenTimer = 0, sirenHigh = false;
  let musicTimer = 0, chordIdx = 0, muted = false;
  const CHORDS = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [146.8, 220, 293.7]];
  const BASS = [110, 87.3, 98, 73.4];

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      // engine: saw + sub sine through a lowpass
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 50;
      engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'sine'; engineOsc2.frequency.value = 25;
      const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 420;
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      engineOsc.connect(filt); engineOsc2.connect(filt); filt.connect(engineGain); engineGain.connect(master);
      engineOsc.start(); engineOsc2.start();
      // siren
      sirenOsc = ctx.createOscillator(); sirenOsc.type = 'square'; sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain); sirenGain.connect(master); sirenOsc.start();
      // ocean: looped filtered noise
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
      const nFilt = ctx.createBiquadFilter(); nFilt.type = 'lowpass'; nFilt.frequency.value = 320;
      const nGain = ctx.createGain(); nGain.gain.value = 0.035;
      noise.connect(nFilt); nFilt.connect(nGain); nGain.connect(master); noise.start();
      return true;
    } catch (e) { ctx = null; return false; }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + dur);
  }
  function noiseBurst(dur, vol, freq) {
    if (!ctx || muted) return;
    const len = ctx.sampleRate * dur;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master); src.start();
  }

  return {
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    isMuted() { return muted; },
    update(dt, speed, wantedStars) {
      if (!ctx || muted) return;
      const s = Math.abs(speed || 0);
      engineGain.gain.value = s > 0.5 ? 0.05 + Math.min(0.1, s * 0.002) : 0.02;
      const f = 42 + s * 3.4;
      engineOsc.frequency.value = f; engineOsc2.frequency.value = f / 2;
      // siren alternates while wanted
      if (wantedStars >= 1) {
        sirenGain.gain.value = 0.045;
        sirenTimer += dt;
        if (sirenTimer > 0.45) { sirenTimer = 0; sirenHigh = !sirenHigh; sirenOsc.frequency.value = sirenHigh ? 950 : 700; }
      } else sirenGain.gain.value = 0;
      // lazy sunset groove: a soft chord pad every 2.4s
      musicTimer += dt;
      if (musicTimer > 2.4) {
        musicTimer = 0;
        const chord = CHORDS[chordIdx % CHORDS.length];
        const bass = BASS[chordIdx % BASS.length];
        chordIdx++;
        for (const n of chord) blip(n, 2.2, 'triangle', 0.05);
        blip(bass, 2.2, 'sine', 0.07);
      }
    },
    thud() { noiseBurst(0.18, 0.5, 300); blip(70, 0.15, 'sine', 0.4, 40); },
    shot() { noiseBurst(0.12, 0.6, 2400); blip(900, 0.08, 'square', 0.2, 180); },
    pickup() { blip(660, 0.12, 'sine', 0.25); setTimeout(() => blip(990, 0.18, 'sine', 0.25), 90); },
    jingle() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'triangle', 0.3), i * 110)); },
    fail() { [392, 311, 233].forEach((f, i) => setTimeout(() => blip(f, 0.35, 'sawtooth', 0.18), i * 140)); },
    click() { blip(1200, 0.05, 'square', 0.12); },
  };
}
