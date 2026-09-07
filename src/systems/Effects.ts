import Phaser from 'phaser';
import { isMobile } from '../util/device';

/** Skid marks, dust, sparks and impact feedback. */
export class Effects {
  private skidCount = 0;
  private dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private flame: Phaser.GameObjects.Particles.ParticleEmitter;
  private soot: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private scene: Phaser.Scene, private skidRT: Phaser.GameObjects.RenderTexture) {
    this.dust = scene.add.particles(0, 0, 'puff', {
      lifespan: 620,
      speed: { min: 6, max: 46 },
      scale: { start: 0.5, end: 1.15 },
      alpha: { start: 0.28, end: 0 },
      tint: 0xbfb9a8,
      quantity: 1,
      emitting: false,
    });
    this.dust.setDepth(9);

    this.sparks = scene.add.particles(0, 0, 'spark', {
      lifespan: { min: 180, max: 460 },
      speed: { min: 90, max: 340 },
      scale: { start: 1.1, end: 0 },
      alpha: { start: 1, end: 0 },
      gravityY: 0,
      tint: [0xfff3b0, 0xffb347, 0xff7a3d],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.sparks.setDepth(14);

    this.smoke = scene.add.particles(0, 0, 'puff', {
      lifespan: 900,
      speed: { min: 10, max: 70 },
      scale: { start: 0.7, end: 2.2 },
      alpha: { start: 0.32, end: 0 },
      tint: 0x2c2c30,
      emitting: false,
    });
    this.smoke.setDepth(15);

    // A burning car is two cheap emitters and nothing else: stepped flame
    // cells that rise and shrink, and a fat column of black over the top.
    this.flame = scene.add.particles(0, 0, 'flame', {
      lifespan: { min: 260, max: 480 },
      speed: { min: 8, max: 46 },
      scale: { start: 1.15, end: 0.15 },
      alpha: { start: 1, end: 0.5 },
      rotate: { min: -12, max: 12 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.flame.setDepth(16);

    this.soot = scene.add.particles(0, 0, 'puff', {
      lifespan: { min: 900, max: 1500 },
      speed: { min: 6, max: 34 },
      scale: { start: 0.9, end: 3 },
      alpha: { start: 0.42, end: 0 },
      tint: 0x14161b,
      emitting: false,
    });
    this.soot.setDepth(17);
  }

  /**
   * One tick of a car fire. Called on a slow cadence from the scene, so the
   * cost of a burning street is a handful of particles per frame, not a
   * simulation.
   */
  fire(x: number, y: number, strength: number) {
    const n = isMobile ? 1 : Math.random() < strength ? 2 : 1;
    this.flame.emitParticleAt(x, y, n);
    if (Math.random() < (isMobile ? 0.4 : 0.7)) this.soot.emitParticleAt(x, y - 2, 1);
  }

  /** The moment it catches: one puff of flame, no explosion. */
  ignite(x: number, y: number) {
    this.flame.emitParticleAt(x, y, isMobile ? 5 : 10);
    this.soot.emitParticleAt(x, y, isMobile ? 2 : 4);
    this.sparks.emitParticleAt(x, y, isMobile ? 4 : 10);
  }

  skid(x: number, y: number, rotation: number, alpha: number) {
    // Marks live in the baked ground layer, so they simply stop once the
    // block has seen enough abuse.
    if (this.skidCount > 12000) return;
    this.skidRT.stamp('skid', undefined, x, y, {
      alpha,
      angle: Phaser.Math.RadToDeg(rotation),
      scaleX: 1.5,
      scaleY: 0.95,
    });
    this.skidCount++;
  }

  tyreDust(x: number, y: number) {
    this.dust.emitParticleAt(x, y, 1);
  }

  impact(x: number, y: number, magnitude: number) {
    // Phones get a lighter shower; the shake and the sound carry the hit.
    const cap = isMobile ? 12 : 26;
    const n = Phaser.Math.Clamp(Math.floor(magnitude * (isMobile ? 1.4 : 2.2)), 3, cap);
    this.sparks.emitParticleAt(x, y, n);
    if (magnitude > 5 && !isMobile) this.smoke.emitParticleAt(x, y, 2);

    const cam = this.scene.cameras.main;
    const strength = Phaser.Math.Clamp(magnitude / 220, 0.0015, 0.022);
    cam.shake(Phaser.Math.Clamp(magnitude * 22, 90, 320), strength);
  }

  /** A car that is failing: smoke from under the bonnet. */
  damageSmoke(x: number, y: number, critical: boolean) {
    this.smoke.emitParticleAt(x, y, critical ? 2 : 1);
    if (critical && Math.random() < 0.3) this.sparks.emitParticleAt(x, y, 2);
  }

  /** Cheap off-screen-ish hit: a few sparks, no shake. */
  bump(x: number, y: number, count = 4) {
    this.sparks.emitParticleAt(x, y, isMobile ? 2 : count);
  }
}
