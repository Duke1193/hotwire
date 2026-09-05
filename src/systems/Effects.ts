import Phaser from 'phaser';

/** Skid marks, dust, sparks and impact feedback. */
export class Effects {
  private skidCount = 0;
  private dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter;

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
    const n = Phaser.Math.Clamp(Math.floor(magnitude * 2.2), 3, 26);
    this.sparks.emitParticleAt(x, y, n);
    if (magnitude > 5) this.smoke.emitParticleAt(x, y, 2);

    const cam = this.scene.cameras.main;
    const strength = Phaser.Math.Clamp(magnitude / 220, 0.0015, 0.022);
    cam.shake(Phaser.Math.Clamp(magnitude * 22, 90, 320), strength);
  }

  /** Cheap off-screen-ish hit: a few sparks, no shake. */
  bump(x: number, y: number, count = 4) {
    this.sparks.emitParticleAt(x, y, count);
  }
}
