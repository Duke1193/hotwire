import Phaser from 'phaser';
import { resetTouchState, touchState } from '../systems/Input';
import { safeAreaInsets } from '../util/device';
import { layout } from '../util/layout';
import { clamp } from '../util/math';

export type ControlMode = 'foot' | 'drive';

type ButtonId = 'action' | 'fire' | 'throttle' | 'brake' | 'handbrake' | 'exit';

interface Button {
  id: ButtonId;
  label: string;
  accent: number;
  x: number;
  y: number;
  w: number;
  h: number;
  pressed: boolean;
  g: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const DEADZONE = 0.16;

/**
 * Getaway's own touch layout: a thumb stick parked in the lower-left corner
 * and labelled pill buttons on the right. Deliberately not a D-pad or a ring
 * of circular icons — the shapes, wording and colours match the rest of this
 * game's HUD.
 *
 * The stick is drawn where it lives rather than appearing under a finger, so
 * a first-time player can see what to hold; a drag that starts elsewhere on
 * the left still picks it up, and the ring follows that finger until release.
 *
 * Pointers are read directly from Phaser's pointer list each frame, so several
 * fingers work at once (steer while accelerating while braking) without any
 * per-object hit areas or ownership bookkeeping for the buttons.
 */
export class TouchControls {
  private buttons: Button[] = [];
  private base: Phaser.GameObjects.Image;
  private knob: Phaser.GameObjects.Image;
  private hint: Phaser.GameObjects.Text;

  private stickId = -1;
  private originX = 0;
  private originY = 0;
  /** Where the ring rests when nobody is holding it. */
  private homeX = 0;
  private homeY = 0;
  private radius = 60;
  private mode: ControlMode = 'foot';
  private enabled = false;
  private armed = false;

  constructor(private scene: Phaser.Scene, private scale: number) {
    // up to four fingers: stick, accelerate, brake, handbrake
    scene.input.addPointer(3);

    this.base = scene.add.image(0, 0, 'stick-base').setDepth(60).setVisible(false).setAlpha(0.5);
    this.knob = scene.add.image(0, 0, 'stick-knob').setDepth(61).setVisible(false).setAlpha(0.8);

    this.hint = scene.add
      .text(0, 0, 'MOVE', { fontFamily: MONO, fontSize: `${Math.round(10 * scale)}px`, color: '#7d879b' })
      .setOrigin(0.5, 1)
      .setDepth(60)
      .setAlpha(0);
    this.hint.setLetterSpacing?.(3 * scale);

    for (const spec of [
      { id: 'action' as ButtonId, label: 'ENTER', accent: 0x69d8ff },
      { id: 'fire' as ButtonId, label: 'FIRE', accent: 0xff6b5e },
      { id: 'throttle' as ButtonId, label: 'GO', accent: 0x69d8ff },
      { id: 'brake' as ButtonId, label: 'BRAKE', accent: 0xff8f6b },
      { id: 'handbrake' as ButtonId, label: 'DRIFT', accent: 0xffd257 },
      { id: 'exit' as ButtonId, label: 'EXIT', accent: 0x8e97ab },
    ]) {
      this.buttons.push({
        ...spec,
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        pressed: false,
        g: scene.add.graphics().setDepth(60).setVisible(false),
        text: scene.add
          .text(0, 0, spec.label, {
            fontFamily: MONO,
            fontSize: `${Math.round(13 * scale)}px`,
            color: '#eef2fb',
          })
          .setOrigin(0.5)
          .setDepth(61)
          .setVisible(false),
      });
      this.buttons[this.buttons.length - 1].text.setLetterSpacing?.(2);
    }
  }

  /** Left edge of the button cluster, so readouts can sit beside it. */
  get occludedLeft(): number {
    if (!this.enabled) return Number.POSITIVE_INFINITY;
    let left = Number.POSITIVE_INFINITY;
    for (const b of this.buttons) {
      if (!this.visible(b.id)) continue;
      left = Math.min(left, b.x);
    }
    return left;
  }

  /** Top edge of the controls, so the HUD can stay clear of thumbs. */
  get occludedTop(): number {
    if (!this.enabled) return Number.POSITIVE_INFINITY;
    let top = this.stickTop;
    for (const b of this.buttons) {
      if (!this.visible(b.id)) continue;
      top = Math.min(top, b.y);
    }
    return top;
  }

  /** Top of the button cluster alone, which is what the DOM column runs into. */
  get buttonsTop(): number {
    if (!this.enabled) return Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    for (const b of this.buttons) {
      if (!this.visible(b.id)) continue;
      top = Math.min(top, b.y);
    }
    return top;
  }

  /** Top of the resting ring, including its caption. */
  get stickTop(): number {
    if (!this.enabled) return Number.POSITIVE_INFINITY;
    return this.homeY - this.radius - this.hint.height - 6 * this.scale;
  }

  setEnabled(on: boolean) {
    if (this.enabled === on) return;
    this.enabled = on;
    if (!on) {
      this.stickId = -1;
      resetTouchState();
      this.publishButtons();
      this.base.setVisible(false);
      this.knob.setVisible(false);
      this.hint.setAlpha(0);
      for (const b of this.buttons) {
        b.g.setVisible(false);
        b.text.setVisible(false);
      }
    } else {
      this.layout();
      this.rest();
    }
    touchState.active = on;
  }

  setMode(mode: ControlMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    // The stick steers in a car and walks on foot; say which.
    this.hint.setText(mode === 'drive' ? 'STEER' : 'MOVE');
    this.release();
    this.layout();
  }

  /** Recomputed on resize and orientation change. */
  layout() {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const s = this.scale;
    const portrait = layout.mode === 'portrait';
    // Portrait has width to spare and little height; landscape is the reverse.
    const unit = portrait ? Math.min(w * 0.9, h * 0.42) : Math.min(w, h);

    this.radius = clamp(unit * 0.15, 54 * s, 128 * s);
    this.base.setDisplaySize(this.radius * 2, this.radius * 2);
    this.knob.setDisplaySize(this.radius * 0.78, this.radius * 0.78);

    // Keep every control clear of the notch and the home indicator.
    const inset = safeAreaInsets();
    const base = clamp(unit * 0.045, 14 * s, 40 * s);
    const marginR = base + inset.right * s;
    const marginB = base + inset.bottom * s;
    const marginL = base + inset.left * s;

    // The stick has a home in the lower-left safe area and returns to it, so
    // it is a control the player can see rather than a gesture they must know.
    this.homeX = marginL + this.radius;
    this.homeY = h - marginB - this.radius;
    this.hint.setPosition(this.homeX, this.homeY - this.radius - 6 * s);
    if (this.stickId < 0) this.rest();
    const gap = 10 * s;
    const b = clamp(unit * (portrait ? 0.2 : 0.17), 62 * s, 128 * s);
    const bigW = b * 1.45;
    const bigH = b * 1.02;
    const sideW = b * 1.02;

    const go = this.find('throttle');
    go.w = bigW;
    go.h = bigH;
    go.x = w - marginR - bigW;
    go.y = h - marginB - bigH;

    const brake = this.find('brake');
    brake.w = sideW;
    brake.h = bigH * 0.62;
    brake.x = go.x - gap - sideW;
    brake.y = go.y + bigH - brake.h;

    const drift = this.find('handbrake');
    drift.w = sideW;
    drift.h = bigH * 0.62;
    drift.x = brake.x;
    drift.y = brake.y - gap - drift.h;

    const exit = this.find('exit');
    exit.w = bigW * 0.62;
    exit.h = b * 0.5;
    exit.x = w - marginR - exit.w;
    exit.y = go.y - gap - exit.h;

    const action = this.find('action');
    action.w = bigW;
    action.h = bigH;
    action.x = w - marginR - bigW;
    action.y = h - marginB - bigH;

    // FIRE sits where BRAKE does when driving, so the thumb never has to move.
    const fire = this.find('fire');
    fire.w = sideW;
    fire.h = bigH * 0.62;
    fire.x = action.x - gap - sideW;
    fire.y = action.y + bigH - fire.h;

    for (const button of this.buttons) {
      this.draw(button);
      button.text.setPosition(button.x + button.w / 2, button.y + button.h / 2);
    }
    this.applyMode();
  }

  /** Ring and nub back in the corner, nub centred. */
  private rest() {
    this.originX = this.homeX;
    this.originY = this.homeY;
    const on = this.enabled;
    this.base.setVisible(on).setPosition(this.homeX, this.homeY).setAlpha(0.42);
    this.knob.setVisible(on).setPosition(this.homeX, this.homeY).setAlpha(0.72);
    this.hint.setAlpha(on ? 0.75 : 0);
  }

  private applyMode() {
    if (!this.enabled) return;
    for (const button of this.buttons) {
      const shown = this.visible(button.id);
      button.g.setVisible(shown);
      button.text.setVisible(shown);
    }
  }

  private find(id: ButtonId): Button {
    return this.buttons.find((b) => b.id === id)!;
  }

  /** ENTER and FIRE on foot; the driving cluster in a car. */
  private visible(id: ButtonId): boolean {
    const onFoot = id === 'action' || id === 'fire';
    if (this.mode === 'foot') return onFoot && (id !== 'fire' || this.armed);
    return !onFoot;
  }

  /** FIRE only appears once the player is actually carrying something. */
  setArmed(armed: boolean) {
    if (this.armed === armed) return;
    this.armed = armed;
    this.applyMode();
  }

  private draw(button: Button) {
    const g = button.g;
    const r = Math.min(button.h * 0.34, 22 * this.scale);
    g.clear();
    g.fillStyle(0x0b0e14, button.pressed ? 0.78 : 0.42);
    g.fillRoundedRect(button.x, button.y, button.w, button.h, r);
    g.lineStyle(2 * this.scale, button.accent, button.pressed ? 1 : 0.55);
    g.strokeRoundedRect(button.x, button.y, button.w, button.h, r);
    if (button.pressed) {
      g.fillStyle(button.accent, 0.18);
      g.fillRoundedRect(button.x, button.y, button.w, button.h, r);
    }
    button.text.setColor(button.pressed ? '#ffffff' : '#c7d0e0');
  }

  /** Reads every active pointer and writes the shared touch state. */
  update(): void {
    if (!this.enabled) return;

    const pointers = this.scene.input.manager.pointers;
    const portrait = layout.mode === 'portrait';
    // In portrait the HUD sits across the top, so the stick only claims the
    // lower half; in landscape it can have the whole left side.
    const stickZone = this.scene.scale.width * (portrait ? 0.62 : 0.48);
    const topGuard = this.scene.scale.height * (portrait ? 0.42 : 0.16);

    // 1. buttons: any finger inside a visible button counts as holding it
    for (const button of this.buttons) {
      const shown = this.visible(button.id);
      let down = false;
      if (shown) {
        for (const p of pointers) {
          if (!p.isDown) continue;
          if (p.x >= button.x && p.x <= button.x + button.w && p.y >= button.y && p.y <= button.y + button.h) {
            down = true;
            break;
          }
        }
      }
      if (down !== button.pressed) {
        button.pressed = down;
        this.draw(button);
        if (down && (button.id === 'action' || button.id === 'exit')) touchState.actionPresses++;
      }
    }

    // 2. thumb stick: the first free finger on the left half places it
    let stick: Phaser.Input.Pointer | null = null;
    for (const p of pointers) {
      if (p.isDown && p.id === this.stickId) {
        stick = p;
        break;
      }
    }

    if (!stick) {
      this.stickId = -1;
      for (const p of pointers) {
        if (!p.isDown || p.x > stickZone || p.y < topGuard) continue;
        if (this.overButton(p)) continue;
        this.stickId = p.id;
        // A thumb that lands on the ring uses the ring where it is; one that
        // lands anywhere else on the left brings the ring with it.
        const onRing = Math.hypot(p.x - this.homeX, p.y - this.homeY) <= this.radius * 1.3;
        this.originX = onRing ? this.homeX : p.x;
        this.originY = onRing ? this.homeY : p.y;
        stick = p;
        break;
      }
    }

    if (!stick) {
      this.release();
      return;
    }

    this.base.setVisible(true).setPosition(this.originX, this.originY).setAlpha(0.62);
    this.knob.setVisible(true).setAlpha(0.95);
    this.hint.setAlpha(0);

    const dx = stick.x - this.originX;
    const dy = stick.y - this.originY;
    const dist = Math.hypot(dx, dy);
    const capped = Math.min(dist, this.radius);
    const nx = dist > 0.001 ? (dx / dist) * (capped / this.radius) : 0;
    const ny = dist > 0.001 ? (dy / dist) * (capped / this.radius) : 0;

    this.knob.setPosition(this.originX + nx * this.radius, this.originY + ny * this.radius);

    const mag = Math.hypot(nx, ny);
    if (mag < DEADZONE) {
      touchState.moveX = 0;
      touchState.moveY = 0;
      touchState.steer = 0;
    } else {
      // rescale past the deadzone so small movements are still gentle
      const scaled = (mag - DEADZONE) / (1 - DEADZONE);
      touchState.moveX = (nx / mag) * scaled;
      touchState.moveY = (ny / mag) * scaled;
      touchState.steer = clamp(nx * 1.35, -1, 1);
    }

    this.publishButtons();
  }

  private publishButtons() {
    touchState.throttle = this.find('throttle').pressed ? 1 : 0;
    touchState.brake = this.find('brake').pressed ? 1 : 0;
    touchState.handbrake = this.find('handbrake').pressed;
    touchState.firing = this.find('fire').pressed;
  }

  private overButton(p: Phaser.Input.Pointer): boolean {
    for (const b of this.buttons) {
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return true;
    }
    return false;
  }

  private release() {
    this.stickId = -1;
    this.rest();
    resetTouchState();
    this.publishButtons();
  }
}
