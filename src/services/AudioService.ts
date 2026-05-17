type SfxType = "hit" | "perfect" | "error" | "buy" | "win";

export class AudioService {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicTimer = 0;
  private musicStep = 0;
  private enabledMusic = true;
  private enabledSfx = true;
  private musicVolume = 0.5;
  private sfxVolume = 0.7;

  private ensureContext(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.ctx.destination);
    this.sfxGain.connect(this.ctx.destination);
    this.applyVolumes();
  }

  startMusic(): void {
    this.ensureContext();
    if (!this.ctx || !this.enabledMusic || this.musicTimer) return;
    void this.ctx.resume();
    this.musicStep = 0;
    this.scheduleMusicStep();
    this.musicTimer = window.setInterval(() => this.scheduleMusicStep(), 380);
  }

  stopMusic(): void {
    if (!this.musicTimer) return;
    window.clearInterval(this.musicTimer);
    this.musicTimer = 0;
  }

  playSfx(type: SfxType): void {
    this.ensureContext();
    if (!this.ctx || !this.sfxGain || !this.enabledSfx) return;
    void this.ctx.resume();

    if (type === "win") {
      this.playArpeggio([523, 659, 784, 1047], 0.07, "triangle", 0.18);
      return;
    }

    if (type === "error") {
      this.playTone(150, 0.22, "sawtooth", 0.16, -70);
      this.playNoise(0.12, 0.08);
      return;
    }

    if (type === "perfect") {
      this.playArpeggio([784, 988, 1175], 0.045, "square", 0.14);
      return;
    }

    const frequency = type === "buy" ? 620 : 430;
    this.playTone(frequency, 0.14, "triangle", type === "buy" ? 0.12 : 0.1, type === "buy" ? 170 : 80);
  }

  setMusicEnabled(enabled: boolean): void {
    this.enabledMusic = enabled;
    if (!enabled) this.stopMusic();
    else this.startMusic();
  }

  setSoundsEnabled(enabled: boolean): void {
    this.enabledSfx = enabled;
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = Math.max(0, Math.min(1, music));
    this.sfxVolume = Math.max(0, Math.min(1, sfx));
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (this.musicGain) this.musicGain.gain.value = this.musicVolume * 0.075;
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume * 0.14;
  }

  private scheduleMusicStep(): void {
    if (!this.ctx || !this.musicGain || !this.enabledMusic) return;
    const scale = [196, 247, 294, 330, 392, 330, 294, 247];
    const root = scale[this.musicStep % scale.length];
    const accent = this.musicStep % 4 === 0;
    this.playMusicTone(root, accent ? 0.34 : 0.22, "triangle", accent ? 0.42 : 0.24);
    if (accent) this.playMusicTone(root * 2, 0.16, "sine", 0.1);
    this.musicStep += 1;
  }

  private playMusicTone(frequency: number, duration: number, type: OscillatorType, peak: number): void {
    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playTone(frequency: number, duration: number, type: OscillatorType, peak: number, slide: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.linearRampToValueAtTime(Math.max(40, frequency + slide), now + duration);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playArpeggio(notes: number[], step: number, type: OscillatorType, peak: number): void {
    notes.forEach((note, index) => {
      window.setTimeout(() => this.playTone(note, 0.16, type, peak, 80), index * step * 1000);
    });
  }

  private playNoise(duration: number, peak: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * duration), this.ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i += 1) {
      channel[i] = (Math.random() * 2 - 1) * (1 - i / channel.length);
    }
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = peak;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.sfxGain);
    source.start();
  }
}
