import Phaser from 'phaser';
import { resetTouchState, touchState } from '../systems/Input';
import { safeAreaInsets } from '../util/device';
import { clamp } from '../util/math';

export type ControlMode = 'foot' | 'drive';

type ButtonId = 'action' | 'throttle' | 'brake' | 'handbrake' | 'exit';

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
 * Getaway's own touch layout: a floating thumb stick on the left and labelled
 * pill buttons on the right. Deliberately not a D-pad or a ring of circular
 * icons — the shapes, wording and colours match the rest of this game's HUD.
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
  private radius = 60;
  private mode: ControlMode = 'foot';
  private enabled = false;

  constructor(private scene: Phaser.Scene, private scale: number) {
    // up to four fingers: stick, accelerate, brake, handbrake
    scene.input.addPointer(3);

    this.base = scene.add.image(0, 0, 'stick-base').setDepth(60).setVisible(false).setAlpha(0.5);
    this.knob = scene.add.image(0, 0, 'stick-knob').setDepth(61).setVisible(false).setAlpha(0.8);

    this.hint = scene.add
      .text(0, 0, 'DRAG TO MOVE', { fontFamily: MONO, fontSize: `${Math.round(11 * scale)}px`, color: '#5c6577' })
      .setOrigin(0.5, 1)
      .setDepth(60)
      .setAlpha(0);

    for (const spec of [
      { id: 'action' as ButtonId, label: 'ENTER', accent: 0x69d8ff },
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

  setEnabled(on: boolean) {
    if (this.enabled === on) return;
    this.enabled = on;
    if (!on) {
      this.release();
      this.base.setVisible(false);
      this.knob.setVisible(false);
      this.hint.setAlpha(0);
      for (const b of this.buttons) {
        b.g.setVisible(false);
        b.text.setVisible(false);
      }
    } else {
      this.layout();
    }
    touchState.active = on;
  }

  setMode(mode: ControlMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.release();
    this.layout();
  }

  /** Recomputed on resize and orientation change. */
  layout() {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const s = this.scale;
    const unit = Math.min(w, h);

    this.radius = clamp(unit * 0.15, 54 * s, 128 * s);
    this.base.setDisplaySize(this.radius * 2, this.radius * 2);
    this.knob.setDisplaySize(this.radius * 0.78, this.radius * 0.78);
    this.hint.setPosition(this.radius + 24 * s, h - 14 * s);

    // Keep every control clear of the notch and the home indicator.
    const inset = safeAreaInsets();
    const base = clamp(unit * 0.045, 14 * s, 40 * s);
    const marginR = base + inset.right * s;
    const marginB = base + inset.bottom * s;
    const gap = 10 * s;
    const b = clamp(unit * 0.17, 62 * s, 128 * s);
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

    for (const button of this.buttons) {
      this.draw(button);
      button.text.setPosition(button.x + button.w / 2, button.y + button.h / 2);
    }
    this.applyMode();
  }

  private applyMode() {
    if (!this.enabled) return;
    for (const button of this.buttons) {
      const shown = this.mode === 'foot' ? button.id === 'action' : button.id !== 'action';
      button.g.setVisible(shown);
      button.text.setVisible(shown);
    }
  }

  private find(id: ButtonId): Button {
    return this.buttons.find((b) => b.id === id)!;
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
    const stickZone = this.scene.scale.width * 0.48;
    const topGuard = this.scene.scale.height * 0.16;

    // 1. buttons: any finger inside a visible button counts as holding it
    for (const button of this.buttons) {
      const shown = this.mode === 'foot' ? button.id === 'action' : button.id !== 'action';
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
        this.originX = p.x;
        this.originY = p.y;
        stick = p;
        break;
      }
    }

    if (!stick) {
      this.release();
      return;
    }

    this.base.setVisible(true).setPosition(this.originX, this.originY);
    this.knob.setVisible(true);
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

    touchState.throttle = this.find('throttle').pressed ? 1 : 0;
    touchState.brake = this.find('brake').pressed ? 1 : 0;
    touchState.handbrake = this.find('handbrake').pressed;
  }

  private overButton(p: Phaser.Input.Pointer): boolean {
    for (const b of this.buttons) {
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return true;
    }
    return false;
  }

  private release() {
    this.stickId = -1;
    this.base.setVisible(false);
    this.knob.setVisible(false);
    resetTouchState();
    touchState.throttle = this.find('throttle').pressed ? 1 : 0;
    touchState.brake = this.find('brake').pressed ? 1 : 0;
    touchState.handbrake = this.find('handbrake').pressed;
  }
}
