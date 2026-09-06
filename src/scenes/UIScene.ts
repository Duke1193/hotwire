import Phaser from 'phaser';
import { HEAT } from '../config';
import { TouchControls } from '../ui/TouchControls';
import { hasTouch, RENDER_SCALE, safeAreaInsets, UI_SCALE } from '../util/device';
import { clamp, lerp } from '../util/math';
import { GameScene } from './GameScene';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const LEVEL_COLORS = [0xf2c14e, 0xff8a3d, 0xff4d3d, 0xff2a6d];

const S = UI_SCALE;
const px = (n: number) => `${Math.round(n * S)}px`;

/**
 * The canvas half of the HUD.
 *
 * Ownership is split by screen region so two elements can never collide: the
 * canvas draws the top-left meters, the bottom-right driving readout and the
 * centre notification, while the DOM overlay owns the whole top-right column
 * (room, invite, settings, objective). The bottom edge is computed from where
 * the touch controls actually are, not from a fixed offset, so the speed
 * readout sits above real thumbs on any screen.
 */
export class UIScene extends Phaser.Scene {
  private game_!: GameScene;
  private g!: Phaser.GameObjects.Graphics;
  private heatLabel!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private score!: Phaser.GameObjects.Text;
  private scoreGain!: Phaser.GameObjects.Text;
  private speed!: Phaser.GameObjects.Text;
  private speedUnit!: Phaser.GameObjects.Text;
  private weapon!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private teach!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private alert!: Phaser.GameObjects.Text;
  private annKicker!: Phaser.GameObjects.Text;
  private annTitle!: Phaser.GameObjects.Text;
  private annLine!: Phaser.GameObjects.Text;
  private captureText!: Phaser.GameObjects.Text;
  private title!: Phaser.GameObjects.Text;
  private nav!: Phaser.GameObjects.Image;
  private vignette!: Phaser.GameObjects.Image;
  private touch!: TouchControls;

  private shownHeat = 0;
  private shownScore = 0;
  private introMs = 0;
  private region = { left: 0, right: 0, top: 0, bottom: 0, cx: 0, cy: 0 };

  constructor() {
    super('ui');
  }

  create() {
    this.game_ = this.scene.get('game') as GameScene;
    this.g = this.add.graphics();

    this.heatLabel = this.add.text(0, 0, 'HEAT', { fontFamily: MONO, fontSize: px(13), color: '#8e97ab' });
    this.heatLabel.setLetterSpacing?.(3 * S);
    this.status = this.add.text(0, 0, '', { fontFamily: MONO, fontSize: px(12), color: '#7d879b' });
    this.score = this.add.text(0, 0, 'SCORE 0', { fontFamily: MONO, fontSize: px(15), color: '#eef2fb' });
    this.scoreGain = this.add.text(0, 0, '', { fontFamily: MONO, fontSize: px(11), color: '#7ee0a1' });

    this.speed = this.add.text(0, 0, '0', { fontFamily: MONO, fontSize: px(40), color: '#eef2fb' }).setOrigin(1, 1);
    this.speedUnit = this.add.text(0, 0, 'KM/H', { fontFamily: MONO, fontSize: px(12), color: '#79839a' }).setOrigin(1, 1);
    this.weapon = this.add.text(0, 0, '', { fontFamily: MONO, fontSize: px(13), color: '#ffd257' }).setOrigin(1, 1);

    this.prompt = this.add.text(0, 0, '', { fontFamily: MONO, fontSize: px(14), color: '#cfe6ff' }).setOrigin(0.5, 1);
    this.teach = this.add.text(0, 0, '', { fontFamily: MONO, fontSize: px(15), color: '#f4f7ff' }).setOrigin(0.5, 1);
    this.teach.setLetterSpacing?.(3 * S);

    this.hint = this.add
      .text(0, 0, 'WASD DRIVE   E ENTER/EXIT   SPACE HANDBRAKE   TAB SCORES', {
        fontFamily: MONO,
        fontSize: px(11),
        color: '#5c6577',
      })
      .setOrigin(0, 1)
      .setAlpha(0);

    this.alert = this.add.text(0, 0, '', { fontFamily: MONO, fontSize: px(17), color: '#ff8f6b' }).setOrigin(0.5, 0);

    this.annKicker = this.add.text(0, 0, '', { fontFamily: MONO, fontSize: px(12), color: '#8e97ab' }).setOrigin(0.5, 1);
    this.annKicker.setLetterSpacing?.(6 * S);
    this.annTitle = this.add.text(0, 0, '', { fontFamily: MONO, fontSize: px(34), color: '#f4f7ff' }).setOrigin(0.5, 1);
    this.annTitle.setLetterSpacing?.(8 * S);
    this.annLine = this.add.text(0, 0, '', { fontFamily: MONO, fontSize: px(14), color: '#cfe6ff' }).setOrigin(0.5, 0);
    this.annLine.setLetterSpacing?.(2 * S);

    this.captureText = this.add
      .text(0, 0, '', { fontFamily: MONO, fontSize: px(13), color: '#ff6b5e' })
      .setOrigin(0.5, 1);
    this.captureText.setLetterSpacing?.(3 * S);

    this.nav = this.add.image(0, 0, 'wedge').setVisible(false).setScale(S);

    this.title = this.add.text(0, 0, 'GETAWAY', { fontFamily: MONO, fontSize: px(46), color: '#f2f5fb' }).setOrigin(0.5);
    this.title.setLetterSpacing?.(10 * S);

    // Sits under every HUD element and over the world.
    this.vignette = this.add.image(0, 0, 'vignette').setOrigin(0, 0).setDepth(-5).setAlpha(0.85);

    this.touch = new TouchControls(this, RENDER_SCALE);

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));

    const keys = this.input.keyboard;
    keys?.on('keydown-TAB', (e: KeyboardEvent) => {
      e.preventDefault();
      this.game_.overlay?.toggleScoreboard();
    });
    keys?.on('keydown-ESC', () => this.game_.overlay?.openSettings());
  }

  /** Recomputed on every resize and whenever the touch layout changes. */
  private layout() {
    const w = this.scale.width;
    const h = this.scale.height;
    const inset = safeAreaInsets();

    this.region.left = 20 * S + inset.left * RENDER_SCALE;
    this.region.right = w - 22 * S - inset.right * RENDER_SCALE;
    this.region.top = 18 * S + inset.top * RENDER_SCALE;
    this.region.bottom = h - 16 * S - inset.bottom * RENDER_SCALE;
    this.region.cx = w / 2;
    this.region.cy = h / 2;
    this.vignette?.setDisplaySize(this.scale.width, this.scale.height);
    this.touch?.layout();
    this.place();
  }

  /** Positions everything from the current regions. */
  private place() {
    const r = this.region;
    // The bottom row has to clear the on-screen buttons, wherever they are.
    const thumbTop = this.touch ? this.touch.occludedTop : Number.POSITIVE_INFINITY;
    const bottom = Math.min(r.bottom, thumbTop - 14 * S);

    this.heatLabel.setPosition(r.left, r.top);
    this.status.setPosition(r.left, r.top + 46 * S);
    this.score.setPosition(r.left, r.top + 70 * S);
    this.scoreGain.setPosition(r.left, r.top + 90 * S);

    // The lower-right block stacks upward from the clearance line using each
    // element's measured height, so nothing can grow into anything else
    // whatever the font metrics or the size of the numbers turn out to be.
    const gap = 4 * S;
    let stack = bottom;
    this.speedUnit.setPosition(r.right, stack);
    stack -= this.speedUnit.height + gap;
    this.speed.setPosition(r.right, stack);
    stack -= this.speed.height + gap * 2;
    this.weapon.setPosition(r.right, stack);

    // Same idea along the bottom centre.
    let centre = bottom;
    this.prompt.setPosition(r.cx, centre);
    centre -= this.prompt.height + gap;
    this.teach.setPosition(r.cx, centre);
    centre -= this.teach.height + gap * 3;
    this.captureText.setPosition(r.cx, centre);
    this.hint.setPosition(r.left, this.scale.height - 14 * S);

    this.alert.setPosition(r.cx, r.top + 6 * S);
    const annY = this.scale.height * 0.3;
    this.annKicker.setPosition(r.cx, annY - this.annTitle.height - 6 * S);
    this.annTitle.setPosition(r.cx, annY);
    this.annLine.setPosition(r.cx, annY + 8 * S);
    this.title.setPosition(r.cx, this.scale.height * 0.32);
  }

  override update(_time: number, delta: number) {
    const hud = this.game_?.hud;
    if (!hud) return;

    if (hud.live) this.introMs += delta;
    // The intro title steps aside the moment the game has something to say.
    const introFade = 1 - clamp((this.introMs - 1600) / 1300, 0, 1);
    this.title.setAlpha(introFade * (1 - hud.announceAlpha));
    if (!hasTouch) this.hint.setAlpha(clamp((this.introMs - 300) / 800, 0, 1) * 0.9);

    this.touch.setEnabled(hasTouch && hud.live);
    this.touch.setMode(hud.driving ? 'drive' : 'foot');
    this.touch.setArmed(Boolean(hud.weapon));
    this.touch.update();
    this.place();

    this.shownHeat = lerp(this.shownHeat, hud.heat, clamp(delta / 90, 0, 1));
    this.shownScore = lerp(this.shownScore, hud.score, clamp(delta / 120, 0, 1));

    this.g.clear();
    this.drawHeatBar(hud);
    this.drawVitals(hud);
    this.drawDriverPlate(hud);
    this.drawCapture(hud);
    this.drawNav(hud);

    this.status.setText(this.statusLine(hud));
    this.status.setColor(hud.status === 'pursuit' ? '#ff6b5e' : hud.status === 'evading' ? '#ffd06b' : '#7d879b');

    this.score.setText(`SCORE ${Math.round(this.shownScore).toLocaleString('en-US')}`);
    this.score.setColor(hud.scorePulse > 0.02 ? '#ffffff' : '#eef2fb');
    this.score.setScale(1 + hud.scorePulse * 0.09);
    this.scoreGain.setText(hud.scorePulse > 0.02 ? hud.scoreReason : '').setAlpha(clamp(hud.scorePulse, 0, 1));

    this.speed.setText(String(Math.round(hud.speedKmh)));
    this.speed.setAlpha(hud.driving ? 1 : 0.32);
    this.speedUnit.setAlpha(hud.driving ? 0.9 : 0.28);
    this.weapon.setText(hud.weapon ? `${hud.weapon}  ${hud.ammo}` : '');

    this.prompt.setText(hasTouch ? '' : hud.prompt);
    this.teach.setText(hud.teach);
    this.alert.setText(hud.alert).setAlpha(hud.alertAlpha);

    // Snap in with a small scale punch, then settle: arcade, not cinematic.
    const punch = 1 + hud.announcePunch * 0.16;
    this.annKicker.setText(hud.announceKicker).setAlpha(hud.announceAlpha * 0.9);
    this.annTitle.setText(hud.announceTitle).setAlpha(hud.announceAlpha).setScale(punch);
    this.annLine.setText(hud.announceLine).setAlpha(hud.announceAlpha * 0.9);
  }

  // ------------------------------------------------------------- painting

  /** A flat dark plate with a hairline edge: the HUD's one repeated shape. */
  private plate(x: number, y: number, w: number, h: number, accent = 0x39415a, alpha = 0.78) {
    this.g.fillStyle(0x080a0f, alpha);
    this.g.fillRect(x, y, w, h);
    this.g.fillStyle(accent, 0.85);
    this.g.fillRect(x, y, 3 * S, h);
    this.g.lineStyle(1 * S, 0x39415a, 0.75);
    this.g.strokeRect(x, y, w, h);
  }

  private drawHeatBar(hud: GameScene['hud']) {
    const x = this.region.left;
    const y = this.region.top + 20 * S;
    const w = Math.min(250 * S, this.scale.width * 0.34);
    const h = 19 * S;
    const t = this.shownHeat / HEAT.max;
    const colour = LEVEL_COLORS[Math.min(hud.heatLevel, LEVEL_COLORS.length - 1)];

    this.plate(x - 9 * S, y - 26 * S, w + 30 * S, h + 36 * S, colour);

    this.g.fillStyle(0x141822, 1);
    this.g.fillRect(x, y, w, h);
    this.g.lineStyle(1 * S, 0x000000, 0.6);
    this.g.strokeRect(x, y, w, h);

    const fillW = w * t;
    this.g.fillStyle(colour, 0.92);
    this.g.fillRect(x, y, fillW, h);
    this.g.fillStyle(0xffffff, 0.12);
    this.g.fillRect(x, y, fillW, 4 * S);

    if (hud.heatPulse > 0.01) {
      this.g.fillStyle(0xffffff, 0.35 * hud.heatPulse);
      this.g.fillRect(x, y, fillW, h);
    }

    // chunky segment gaps: reads as a row of blocks, not a smooth bar
    this.g.fillStyle(0x080a0f, 0.9);
    for (let i = 1; i < 16; i++) this.g.fillRect(x + (w / 16) * i - 1 * S, y, 3 * S, h);

    for (const th of HEAT.thresholds) {
      const tx = x + w * (th / HEAT.max);
      this.g.fillStyle(0xffffff, this.shownHeat >= th ? 0.85 : 0.28);
      this.g.fillRect(tx - 1 * S, y - 5 * S, 2 * S, h + 10 * S);
    }

    for (let i = 0; i < 3; i++) {
      const bx = x + w + 12 * S + i * 9 * S;
      const lit = hud.heatLevel > i;
      this.g.fillStyle(lit ? colour : 0x2b3246, 1);
      const bh = lit ? h + 6 * S : h * 0.55;
      this.g.fillRect(bx, y + (h - bh) / 2, 4 * S, bh);
    }
  }

  /** Health and armour, directly under the score so the eye finds them. */
  private drawVitals(hud: GameScene['hud']) {
    const x = this.region.left;
    const y = this.region.top + 118 * S;
    const w = Math.min(150 * S, this.scale.width * 0.22);
    const h = 9 * S;
    const health = hud.health <= 0.3 ? 0xff4d3d : hud.health <= 0.6 ? 0xffb347 : 0x7ee0a1;

    this.plate(x - 6 * S, y - 6 * S, w + 12 * S, h * 2 + 18 * S, health, 0.7);

    this.g.fillStyle(0x141822, 1);
    this.g.fillRect(x, y, w, h);
    this.g.fillStyle(health, hud.protected ? 0.6 : 1);
    this.g.fillRect(x, y, w * clamp(hud.health, 0, 1), h);
    this.g.fillStyle(0xffffff, 0.14);
    this.g.fillRect(x, y, w * clamp(hud.health, 0, 1), 2 * S);

    const ay = y + h + 4 * S;
    this.g.fillStyle(0x141822, 1);
    this.g.fillRect(x, ay, w, h * 0.66);
    if (hud.armor > 0.001) {
      this.g.fillStyle(0x9fb6ff, 1);
      this.g.fillRect(x, ay, w * clamp(hud.armor, 0, 1), h * 0.66);
    }

    if (hud.protected) {
      this.g.lineStyle(1.5 * S, 0x69d8ff, 0.8);
      this.g.strokeRect(x - 3 * S, y - 3 * S, w + 6 * S, h + 6 * S);
    }
  }

  /** A plate under the speed and weapon so they read against a bright street. */
  private drawDriverPlate(hud: GameScene['hud']) {
    const pad = 8 * S;
    const right = this.region.right + pad * 0.6;
    const top = (hud.weapon ? this.weapon.getBounds().y : this.speed.getBounds().y) - pad * 0.5;
    const bottom = this.speedUnit.getBounds().y + this.speedUnit.getBounds().height + pad * 0.4;
    const left = Math.min(this.speed.getBounds().x, hud.weapon ? this.weapon.getBounds().x : Infinity) - pad;
    this.plate(left, top, right - left, bottom - top, hud.driving ? 0x69d8ff : 0x39415a, 0.62);
  }

  /** The arrest meter: five blocks that fill while you are being held. */
  private drawCapture(hud: GameScene['hud']) {
    if (hud.capture <= 0.01 && !hud.captured) {
      this.captureText.setText('');
      return;
    }
    this.captureText.setText(hud.captured ? 'BUSTED' : 'BUSTED');

    const blocks = 5;
    const bw = 16 * S;
    const gap = 4 * S;
    const total = blocks * bw + (blocks - 1) * gap;
    const x = this.region.cx - total / 2;
    const y = this.captureText.y + 6 * S;
    const filled = Math.round(hud.capture * blocks);

    for (let i = 0; i < blocks; i++) {
      const lit = hud.captured || i < filled;
      this.g.fillStyle(lit ? 0xff4d3d : 0x2b3246, lit ? 1 : 0.8);
      this.g.fillRect(x + i * (bw + gap), y, bw, 7 * S);
    }
  }

  /** Off-screen objectives get a wedge pinned to the edge of the view. */
  private drawNav(hud: GameScene['hud']) {
    if (!hud.navActive) {
      this.nav.setVisible(false);
      return;
    }
    const cam = this.game_.cameras.main;
    const view = cam.worldView;
    if (view.contains(hud.navX, hud.navY)) {
      this.nav.setVisible(false);
      return;
    }

    const dx = hud.navX - cam.midPoint.x;
    const dy = hud.navY - cam.midPoint.y;
    const angle = Math.atan2(dy, dx);
    const marginX = this.scale.width * 0.42;
    const marginY = this.scale.height * 0.36;
    const scale = Math.min(marginX / Math.abs(Math.cos(angle) || 0.001), marginY / Math.abs(Math.sin(angle) || 0.001));

    this.nav
      .setVisible(true)
      .setPosition(this.region.cx + Math.cos(angle) * scale, this.scale.height / 2 + Math.sin(angle) * scale)
      .setRotation(angle)
      .setTint(0xffd257)
      .setAlpha(0.9);
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
