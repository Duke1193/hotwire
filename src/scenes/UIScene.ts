import Phaser from 'phaser';
import { HEAT } from '../config';
import { TouchControls } from '../ui/TouchControls';
import { hasTouch, RENDER_SCALE, UI_SCALE } from '../util/device';
import { clamp, lerp } from '../util/math';
import { GameScene } from './GameScene';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const LEVEL_COLORS = [0xf2c14e, 0xff8a3d, 0xff4d3d, 0xff2a6d];

/** Everything on screen is authored in CSS pixels and scaled to the canvas. */
const S = UI_SCALE;
const px = (n: number) => `${Math.round(n * S)}px`;

export class UIScene extends Phaser.Scene {
  private game_!: GameScene;
  private g!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private score!: Phaser.GameObjects.Text;
  private scoreGain!: Phaser.GameObjects.Text;
  private speed!: Phaser.GameObjects.Text;
  private speedUnit!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private teach!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private alert!: Phaser.GameObjects.Text;
  private job!: Phaser.GameObjects.Text;
  private runTitle!: Phaser.GameObjects.Text;
  private runSub!: Phaser.GameObjects.Text;
  private title!: Phaser.GameObjects.Text;
  private touch!: TouchControls;

  private shownHeat = 0;
  private shownScore = 0;
  private introMs = 0;
  private barW = 250 * S;
  private barH = 15 * S;

  constructor() {
    super('ui');
  }

  create() {
    this.game_ = this.scene.get('game') as GameScene;
    this.g = this.add.graphics();

    this.label = this.add.text(20 * S, 18 * S, 'HEAT', { fontFamily: MONO, fontSize: px(13), color: '#8e97ab' });
    this.label.setLetterSpacing?.(3 * S);
    this.status = this.add.text(20 * S, 64 * S, '', { fontFamily: MONO, fontSize: px(12), color: '#7d879b' });
    this.score = this.add.text(20 * S, 88 * S, 'SCORE 0', { fontFamily: MONO, fontSize: px(15), color: '#eef2fb' });
    this.scoreGain = this.add.text(20 * S, 108 * S, '', { fontFamily: MONO, fontSize: px(11), color: '#7ee0a1' });

    this.speed = this.add.text(0, 0, '0', { fontFamily: MONO, fontSize: px(42), color: '#eef2fb' }).setOrigin(1, 1);
    this.speedUnit = this.add.text(0, 0, 'KM/H', { fontFamily: MONO, fontSize: px(12), color: '#79839a' }).setOrigin(1, 1);
    this.job = this.add.text(0, 0, '', { fontFamily: MONO, fontSize: px(12), color: '#ffd257' }).setOrigin(1, 1);

    this.prompt = this.add.text(0, 0, '', { fontFamily: MONO, fontSize: px(14), color: '#cfe6ff' }).setOrigin(0.5, 1);
    this.teach = this.add.text(0, 0, '', { fontFamily: MONO, fontSize: px(15), color: '#f4f7ff' }).setOrigin(0.5, 1);
    this.teach.setLetterSpacing?.(3 * S);

    this.hint = this.add
      .text(0, 0, 'WASD DRIVE   E ENTER/EXIT   SPACE HANDBRAKE', {
        fontFamily: MONO,
        fontSize: px(11),
        color: '#5c6577',
      })
      .setOrigin(0, 1)
      .setAlpha(0);

    this.alert = this.add.text(0, 0, '', { fontFamily: MONO, fontSize: px(17), color: '#ff8f6b' }).setOrigin(0.5, 0);
    this.runTitle = this.add.text(0, 0, '', { fontFamily: MONO, fontSize: px(22), color: '#ffd257' }).setOrigin(0.5, 0);
    this.runTitle.setLetterSpacing?.(5 * S);
    this.runSub = this.add.text(0, 0, '', { fontFamily: MONO, fontSize: px(12), color: '#cfe6ff' }).setOrigin(0.5, 0);

    this.title = this.add.text(0, 0, 'GETAWAY', { fontFamily: MONO, fontSize: px(46), color: '#f2f5fb' }).setOrigin(0.5);
    this.title.setLetterSpacing?.(10 * S);

    // Thumb controls size off the raw render scale: they must stay thumb-sized.
    this.touch = new TouchControls(this, RENDER_SCALE);

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
  }

  private layout() {
    const w = this.scale.width;
    const h = this.scale.height;
    // Leave room for the thumb controls so nothing important sits under them.
    const bottom = hasTouch ? h - 118 * S : h;

    this.speed.setPosition(w - 24 * S, bottom - 34 * S);
    this.speedUnit.setPosition(w - 24 * S, bottom - 16 * S);
    this.job.setPosition(w - 24 * S, bottom - 62 * S);
    this.prompt.setPosition(w / 2, h - (hasTouch ? 150 * S : 26 * S));
    this.teach.setPosition(w / 2, h - (hasTouch ? 176 * S : 52 * S));
    this.hint.setPosition(20 * S, h - 18 * S);
    this.alert.setPosition(w / 2, 26 * S);
    this.runTitle.setPosition(w / 2, 66 * S);
    this.runSub.setPosition(w / 2, 96 * S);
    this.title.setPosition(w / 2, h * 0.34);
    this.touch?.layout();
  }

  override update(_time: number, delta: number) {
    const hud = this.game_?.hud;
    if (!hud) return;

    if (hud.live) this.introMs += delta;
    this.title.setAlpha(1 - clamp((this.introMs - 1600) / 1300, 0, 1));
    if (!hasTouch) this.hint.setAlpha(clamp((this.introMs - 300) / 800, 0, 1) * 0.9);

    this.touch.setEnabled(hasTouch && hud.live);
    this.touch.setMode(hud.driving ? 'drive' : 'foot');
    this.touch.update();

    this.shownHeat = lerp(this.shownHeat, hud.heat, clamp(delta / 90, 0, 1));
    this.shownScore = lerp(this.shownScore, hud.score, clamp(delta / 120, 0, 1));

    this.drawHeatBar(hud);

    this.status.setText(this.statusLine(hud));
    this.status.setColor(hud.status === 'pursuit' ? '#ff6b5e' : hud.status === 'evading' ? '#ffd06b' : '#7d879b');

    this.score.setText(`SCORE ${Math.round(this.shownScore).toLocaleString('en-US')}`);
    this.score.setScale(1 + hud.scorePulse * 0.09);
    this.scoreGain.setText(hud.scorePulse > 0.02 ? hud.scoreReason : '').setAlpha(clamp(hud.scorePulse, 0, 1));

    this.speed.setText(String(Math.round(hud.speedKmh)));
    this.speed.setAlpha(hud.driving ? 1 : 0.32);
    this.speedUnit.setAlpha(hud.driving ? 0.9 : 0.28);
    this.job.setText(hud.jobLabel ? `${hud.jobLabel}  ${Math.round(hud.jobDistance / 10)} M` : '');

    this.prompt.setText(hasTouch ? '' : hud.prompt);
    this.teach.setText(hud.teach);
    this.alert.setText(hud.alert).setAlpha(hud.alertAlpha);
    this.runTitle.setText(hud.runTitle);
    this.runSub.setText(hud.runSubtitle);
  }

  private drawHeatBar(hud: GameScene['hud']) {
    const x = 20 * S;
    const y = 36 * S;
    const w = this.barW;
    const h = this.barH;
    const t = this.shownHeat / HEAT.max;
    const colour = LEVEL_COLORS[Math.min(hud.heatLevel, LEVEL_COLORS.length - 1)];

    this.g.clear();
    this.g.fillStyle(0x0b0e14, 0.72);
    this.g.fillRoundedRect(x - 8 * S, y - 8 * S, w + 16 * S, h + 16 * S, 5 * S);
    this.g.lineStyle(1 * S, 0x39415a, 0.9);
    this.g.strokeRoundedRect(x - 8 * S, y - 8 * S, w + 16 * S, h + 16 * S, 5 * S);

    this.g.fillStyle(0x1a1f2c, 1);
    this.g.fillRect(x, y, w, h);

    const fillW = w * t;
    this.g.fillStyle(colour, 0.92);
    this.g.fillRect(x, y, fillW, h);
    this.g.fillStyle(0xffffff, 0.12);
    this.g.fillRect(x, y, fillW, 4 * S);

    if (hud.heatPulse > 0.01) {
      this.g.fillStyle(0xffffff, 0.35 * hud.heatPulse);
      this.g.fillRect(x, y, fillW, h);
    }

    this.g.fillStyle(0x0b0e14, 0.85);
    for (let i = 1; i < 20; i++) this.g.fillRect(x + (w / 20) * i, y, 2 * S, h);

    for (const th of HEAT.thresholds) {
      const tx = x + w * (th / HEAT.max);
      this.g.fillStyle(0xffffff, this.shownHeat >= th ? 0.85 : 0.28);
      this.g.fillRect(tx - 1 * S, y - 5 * S, 2 * S, h + 10 * S);
    }

    // Pursuit level: short upright bars, matching the meter's own language.
    for (let i = 0; i < 3; i++) {
      const bx = x + w + 20 * S + i * 11 * S;
      const lit = hud.heatLevel > i;
      this.g.fillStyle(lit ? colour : 0x2b3246, 1);
      const bh = lit ? h + 6 * S : h * 0.55;
      this.g.fillRect(bx, y + (h - bh) / 2, 4 * S, bh);
    }
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
