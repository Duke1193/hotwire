import Phaser from 'phaser';
import { crewAccent } from '../systems/Crew';
import { clamp } from '../util/math';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export interface LabelIdentity {
  /** Canonical name, already including any leading '@'. */
  name: string;
  crewTag?: string;
  accent?: number;
}

/**
 * The name that floats over a human being: one line, crew tag in front, in the
 * crew's colour. Labels counter-scale against the camera so they stay the same
 * size on screen on a laptop or a phone, and fade with distance so a crowded
 * room does not become a wall of text.
 */
export class PlayerLabel {
  private name: Phaser.GameObjects.Text;
  private shown = true;

  constructor(private scene: Phaser.Scene, identity: LabelIdentity) {
    this.name = scene.add
      .text(0, 0, '', { fontFamily: MONO, fontSize: '12px', color: '#eef2fb' })
      .setOrigin(0.5, 1)
      .setDepth(31);
    this.setIdentity(identity);
  }

  setIdentity(identity: LabelIdentity) {
    const tag = identity.crewTag ? `[${identity.crewTag}] ` : '';
    const next = `${tag}${identity.name}`;
    if (this.name.text !== next) this.name.setText(next);

    const accent = identity.crewTag ? crewAccent(identity.crewTag) : (identity.accent ?? 0xeef2fb);
    this.name.setColor(`#${accent.toString(16).padStart(6, '0')}`);
  }

  /** `alpha` lets the caller fade the whole label (used by the 20s local one). */
  update(x: number, y: number, above: number, alpha = 1) {
    if (alpha <= 0.01) {
      this.setVisible(false);
      return;
    }

    const cam = this.scene.cameras.main;
    // Counter the camera so the label keeps a constant on-screen size.
    const scale = 1 / cam.zoom;
    const dx = x - cam.midPoint.x;
    const dy = y - cam.midPoint.y;
    const distance = Math.hypot(dx, dy);
    const fade = clamp(1 - (distance - 760) / 620, 0, 1);
    if (fade <= 0.02) {
      this.setVisible(false);
      return;
    }

    this.setVisible(true);
    this.name.setPosition(x, y - above * scale).setScale(scale).setAlpha(alpha * fade);
  }

  setVisible(on: boolean) {
    if (this.shown === on) return;
    this.shown = on;
    this.name.setVisible(on);
  }

  destroy() {
    this.name.destroy();
  }
}
