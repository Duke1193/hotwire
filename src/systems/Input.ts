import Phaser from 'phaser';
import { clamp } from '../util/math';

/**
 * The single control surface the game reads. Keyboard and touch both write
 * into this shape, so nothing downstream knows or cares which one is in use —
 * and no input is ever faked as synthetic key events.
 */
export interface InputState {
  /** Walking, analog, -1..1 each. */
  moveX: number;
  moveY: number;
  /** Driving. */
  steer: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  /** Held while the player wants to shoot. */
  firing: boolean;
}

export const NEUTRAL_INPUT: InputState = {
  moveX: 0,
  moveY: 0,
  steer: 0,
  throttle: 0,
  brake: 0,
  handbrake: false,
  firing: false,
};

/**
 * Written by the on-screen controls in the UI scene and read by the game
 * scene. A plain shared object keeps the two scenes decoupled without an
 * event bus or a per-frame allocation.
 */
export const touchState = {
  active: false,
  moveX: 0,
  moveY: 0,
  steer: 0,
  throttle: 0,
  brake: 0,
  handbrake: false,
  firing: false,
  /** Incremented on every ACTION press; the game compares against its own count. */
  actionPresses: 0,
};

export function resetTouchState() {
  touchState.moveX = 0;
  touchState.moveY = 0;
  touchState.steer = 0;
  touchState.throttle = 0;
  touchState.brake = 0;
  touchState.handbrake = false;
  touchState.firing = false;
}

/** Merges the keyboard and the on-screen pad into one state. */
export class InputHub {
  readonly state: InputState = { ...NEUTRAL_INPUT };

  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private seenActions = 0;
  private keyAction = 0;
  /** Desktop fires with the mouse; the pointer is also the aim. */
  private mouseDown = false;

  constructor(scene: Phaser.Scene) {
    this.keys = scene.input.keyboard!.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,E,SPACE') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    scene.input.keyboard!.on('keydown-E', () => this.keyAction++);

    // Only the mouse arms firing on desktop; touch has its own FIRE button and
    // must never shoot because a thumb landed on the driving controls.
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch) this.mouseDown = true;
    });
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch) this.mouseDown = false;
    });
    scene.input.on('gameout', () => {
      this.mouseDown = false;
    });
  }

  /** True once per press of E or the on-screen ACTION button. */
  consumeAction(): boolean {
    const total = this.keyAction + touchState.actionPresses;
    if (total === this.seenActions) return false;
    this.seenActions = total;
    return true;
  }

  update(live: boolean): InputState {
    const s = this.state;
    if (!live) {
      Object.assign(s, NEUTRAL_INPUT);
      return s;
    }

    const k = this.keys;
    const up = k.W.isDown || k.UP.isDown;
    const down = k.S.isDown || k.DOWN.isDown;
    const left = k.A.isDown || k.LEFT.isDown;
    const right = k.D.isDown || k.RIGHT.isDown;

    const keyX = (right ? 1 : 0) - (left ? 1 : 0);
    const keyY = (down ? 1 : 0) - (up ? 1 : 0);

    // Whichever surface is pushing harder wins, so a plugged-in keyboard and a
    // touchscreen can coexist on the same device.
    s.moveX = pick(keyX, touchState.moveX);
    s.moveY = pick(keyY, touchState.moveY);
    s.steer = clamp(pick(keyX, touchState.steer), -1, 1);
    s.throttle = clamp(Math.max(up ? 1 : 0, touchState.throttle), 0, 1);
    s.brake = clamp(Math.max(down ? 1 : 0, touchState.brake), 0, 1);
    s.handbrake = k.SPACE.isDown || touchState.handbrake;
    s.firing = this.mouseDown || touchState.firing;
    return s;
  }
}

function pick(keyValue: number, touchValue: number): number {
  return Math.abs(keyValue) >= Math.abs(touchValue) ? keyValue : touchValue;
}
