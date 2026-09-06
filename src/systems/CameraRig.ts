import Phaser from 'phaser';
import { CAM } from '../config';
import { clamp, lerp } from '../util/math';
import { RENDER_SCALE } from '../util/device';

/** Smooth follow with a bit of look-ahead and speed-based zoom-out. */
export class CameraRig {
  private lead = new Phaser.Math.Vector2();
  // The canvas is rendered at device pixels, so every zoom is scaled to match
  // and the world keeps the same on-screen size everywhere.
  private zoom = CAM.zoomFoot * RENDER_SCALE;

  constructor(private cam: Phaser.Cameras.Scene2D.Camera) {
    this.cam.setZoom(this.zoom);
    this.cam.setRoundPixels(false);
  }

  follow(target: Phaser.GameObjects.GameObject) {
    this.cam.startFollow(target as Phaser.GameObjects.Sprite, false, CAM.lerp, CAM.lerp);
  }

  update(dtScale: number, vx: number, vy: number, driving: boolean, speedRatio: number) {
    const amount = driving ? CAM.leadCar : CAM.leadFoot;
    const t = clamp(0.06 * dtScale, 0, 1);
    this.lead.x = lerp(this.lead.x, vx * amount, t);
    this.lead.y = lerp(this.lead.y, vy * amount, t);
    // followOffset is subtracted from the target, so negate to look ahead
    this.cam.setFollowOffset(-this.lead.x, -this.lead.y);

    const base = driving ? lerp(CAM.zoomCar, CAM.zoomFast, clamp(speedRatio, 0, 1)) : CAM.zoomFoot;
    const target = base * RENDER_SCALE;
    this.zoom = lerp(this.zoom, target, clamp(0.035 * dtScale, 0, 1));
    this.cam.setZoom(this.zoom);
  }
}
