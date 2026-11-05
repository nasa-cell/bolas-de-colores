/**
 * Procedural Audio Synthesizer (Web Audio API)
 * Genera sonidos musicales pentatónicos al rebotar contra los Post-its
 * sin necesidad de archivos externos.
 */

class SoundSynthesizer {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.enabled = true;
    this.volume = 0.4;
    this.style = 'marimba'; // 'marimba', 'crystal', 'arcade', 'synthwave'

    // Escala pentatónica en frecuencias (Hz) (C4, D4, E4, G4, A4, C5, D5, E5, G5, A5, C6)
    this.scale = [
      261.63, 293.66, 329.63, 392.00, 440.00,
      523.25, 587.33, 659.25, 783.99, 880.00, 1046.50
    ];

    this.lastPlayTime = 0;
    this.minInterval = 0.045; // Evitar saturación excesiva de audio
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  /**
   * Reproduce una nota armónica según la posición horizontal del impacto y la velocidad
   */
  playBounce(normX = 0.5, speed = 5) {
    if (!this.enabled || !this.ctx) return;

    const now = this.ctx.currentTime;
    if (now - this.lastPlayTime < this.minInterval) return;
    this.lastPlayTime = now;

    // Mapear posición horizontal a una nota de la escala pentatónica (izq = grave, der = agudo)
    const clampedX = Math.max(0, Math.min(1, normX));
    const noteIndex = Math.floor(clampedX * (this.scale.length - 1));
    const freq = this.scale[noteIndex] || 440;

    // La intensidad del impacto modula el volumen y duración
    const velocityGain = Math.min(1.0, Math.max(0.2, speed / 10));

    switch (this.style) {
      case 'marimba':
        this.synthMarimba(freq, velocityGain, now);
        break;
      case 'crystal':
        this.synthCrystal(freq, velocityGain, now);
        break;
      case 'arcade':
        this.synthArcade(freq, velocityGain, now);
        break;
      case 'synthwave':
        this.synthSynthwave(freq, velocityGain, now);
        break;
      default:
        this.synthMarimba(freq, velocityGain, now);
        break;
    }
  }

  synthMarimba(freq, gainMult, now) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    // Envolvente percusiva rápida tipo baqueta de madera
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5 * gainMult, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.25);
  }

  synthCrystal(freq, gainMult, now) {
    const osc = this.ctx.createOscillator();
    const harm = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    // Segundo armónico para brillo de cristal
    harm.type = 'sine';
    harm.frequency.setValueAtTime(freq * 2.01, now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.4 * gainMult, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    osc.connect(gain);
    harm.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    harm.start(now);
    osc.stop(now + 0.5);
    harm.stop(now + 0.5);
  }

  synthArcade(freq, gainMult, now) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    // Salto rápido de frecuencia típico de 8-bit
    osc.frequency.setValueAtTime(freq * 0.8, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.08);

    gain.gain.setValueAtTime(0.25 * gainMult, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.14);
  }

  synthSynthwave(freq, gainMult, now) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq * 0.5, now); // Una octava más abajo para peso analógico

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2500, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.3);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.45 * gainMult, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.38);
  }
}

window.SoundSynthesizer = SoundSynthesizer;
