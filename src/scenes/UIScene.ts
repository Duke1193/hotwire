import Phaser from 'phaser';
import { HEAT } from '../config';
import { GameScene } from './GameScene';
import { clamp, lerp } from '../util/math';

const BAR_W = 250;
const BAR_H = 15;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const LEVEL_COLORS = [0xf2c14e, 0xff8a3d, 0xff4d3d, 0xff2a6d];

export class UIScene extends Phaser.Scene {
  private game_!: GameScene;
  private g!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private speed!: Phaser.GameObjects.Text;
  private speedUnit!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private alert!: Phaser.GameObjects.Text;
  private title!: Phaser.GameObjects.Text;
  private shownHeat = 0;
  private introMs = 0;

  constructor() {
    super('ui');
  }

  create() {
    this.game_ = this.scene.get('game') as GameScene;
    this.g = this.add.graphics();

    this.label = this.add.text(20, 18, 'HEAT', {
      fontFamily: MONO,
      fontSize: '13px',
      color: '#8e97ab',
    });
    this.label.setLetterSpacing?.(3);

    this.status = this.add.text(20, 58, '', { fontFamily: MONO, fontSize: '12px', color: '#7d879b' });

    this.speed = this.add
      .text(0, 0, '0', { fontFamily: MONO, fontSize: '42px', color: '#eef2fb' })
      .setOrigin(1, 1);
    this.speedUnit = this.add
      .text(0, 0, 'KM/H', { fontFamily: MONO, fontSize: '12px', color: '#79839a' })
      .setOrigin(1, 1);

    this.prompt = this.add
      .text(0, 0, '', { fontFamily: MONO, fontSize: '14px', color: '#cfe6ff' })
      .setOrigin(0.5, 1);

    this.hint = this.add
      .text(0, 0, 'WASD DRIVE   E ENTER/EXIT   SPACE HANDBRAKE', {
        fontFamily: MONO,
        fontSize: '11px',
        color: '#5c6577',
      })
      .setOrigin(1, 0);

    this.alert = this.add
      .text(0, 0, '', { fontFamily: MONO, fontSize: '17px', color: '#ff8f6b' })
      .setOrigin(0.5, 0);

    this.title = this.add
      .text(0, 0, 'GETAWAY', { fontFamily: MONO, fontSize: '46px', color: '#f2f5fb' })
      .setOrigin(0.5, 0.5);
    this.title.setLetterSpacing?.(10);

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));

    this.hint.setAlpha(0);
  }

  private layout() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.speed.setPosition(w - 24, h - 34);
    this.speedUnit.setPosition(w - 24, h - 16);
    this.prompt.setPosition(w / 2, h - 26);
    this.hint.setPosition(w - 20, 20);
    this.alert.setPosition(w / 2, 26);
    this.title.setPosition(w / 2, h * 0.34);
  }

  override update(_time: number, delta: number) {
    const hud = this.game_?.hud;
    if (!hud) return;

    // intro: title card fades out, control hint fades in
    this.introMs += delta;
    this.title.setAlpha(1 - clamp((this.introMs - 1600) / 1300, 0, 1));
    this.hint.setAlpha(clamp((this.introMs - 300) / 800, 0, 1));

    this.shownHeat = lerp(this.shownHeat, hud.heat, clamp(delta / 90, 0, 1));

    const x = 20;
    const y = 36;
    const t = this.shownHeat / HEAT.max;
    const colour = LEVEL_COLORS[Math.min(hud.heatLevel, LEVEL_COLORS.length - 1)];

    this.g.clear();

    // frame
    this.g.fillStyle(0x0b0e14, 0.72);
    this.g.fillRoundedRect(x - 8, y - 8, BAR_W + 16, BAR_H + 16, 5);
    this.g.lineStyle(1, 0x39415a, 0.9);
    this.g.strokeRoundedRect(x - 8, y - 8, BAR_W + 16, BAR_H + 16, 5);

    // track
    this.g.fillStyle(0x1a1f2c, 1);
    this.g.fillRect(x, y, BAR_W, BAR_H);

    // fill, drawn as segments for a readable meter
    const fillW = BAR_W * t;
    this.g.fillStyle(colour, 0.92);
    this.g.fillRect(x, y, fillW, BAR_H);
    this.g.fillStyle(0xffffff, 0.12);
    this.g.fillRect(x, y, fillW, 4);

    // impact pulse
    if (hud.heatPulse > 0.01) {
      this.g.fillStyle(0xffffff, 0.35 * hud.heatPulse);
      this.g.fillRect(x, y, fillW, BAR_H);
    }

    // segment notches
    this.g.fillStyle(0x0b0e14, 0.85);
    for (let i = 1; i < 20; i++) this.g.fillRect(x + (BAR_W / 20) * i, y, 2, BAR_H);

    // level thresholds
    for (const th of HEAT.thresholds) {
      const tx = x + BAR_W * (th / HEAT.max);
      this.g.fillStyle(0xffffff, this.shownHeat >= th ? 0.85 : 0.28);
      this.g.fillRect(tx - 1, y - 5, 2, BAR_H + 10);
    }

    // pursuit level pips
    for (let i = 0; i < 3; i++) {
      const px = x + BAR_W + 22 + i * 13;
      const lit = hud.heatLevel > i;
      this.g.fillStyle(lit ? colour : 0x2b3246, 1);
      this.g.fillCircle(px, y + BAR_H / 2, lit ? 4.5 : 3);
    }

    this.status.setText(this.statusLine(hud));
    this.status.setColor(hud.status === 'pursuit' ? '#ff6b5e' : hud.status === 'evading' ? '#ffd06b' : '#7d879b');

    this.speed.setText(String(Math.round(hud.speedKmh)));
    this.speed.setAlpha(hud.driving ? 1 : 0.32);
    this.speedUnit.setAlpha(hud.driving ? 0.9 : 0.28);
    this.prompt.setText(hud.prompt);
    this.alert.setText(hud.alert).setAlpha(hud.alertAlpha);
  }

  private statusLine(hud: GameScene['hud']): string {
    switch (hud.status) {
      case 'pursuit':
        return `PURSUIT — ${hud.police} UNIT${hud.police === 1 ? '' : 'S'} ON YOU`;
      case 'evading':
        return `EVADING  ${'|'.repeat(Math.min(12, Math.floor(hud.evadeTimer * 3.4)))}`;
      case 'wanted':
        return 'UNITS SEARCHING';
      default:
        return 'CLEAR';
    }
  }
}
