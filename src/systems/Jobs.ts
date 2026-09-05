import Phaser from 'phaser';
import { SCORE } from '../config';
import type { World } from '../world/World';
import { track } from './Analytics';
import type { ScoreSystem } from './Score';

type State = 'off' | 'offered' | 'carrying';

/**
 * One job loop: drive to a pickup, then drive to a drop-off. No cargo, no
 * economy — it exists to give the city a reason to drive somewhere.
 */
export class Jobs {
  state: State = 'off';
  /** Distance from the player to the current objective, in px. */
  distance = 0;
  label = '';
  enabled = false;

  onCompleted: ((points: number) => void) | null = null;

  private target = new Phaser.Math.Vector2();
  private from = new Phaser.Math.Vector2();
  private marker: Phaser.GameObjects.Image;
  private arrow: Phaser.GameObjects.Image;
  private cooldown = 3000;
  private pulse = 0;

  constructor(scene: Phaser.Scene, private world: World, private score: ScoreSystem) {
    this.marker = scene.add.image(0, 0, 'marker').setDepth(7).setVisible(false).setAlpha(0.9);
    this.arrow = scene.add.image(0, 0, 'chev').setDepth(30).setVisible(false).setScale(1.4);
  }

  update(dtMs: number, focus: Phaser.Math.Vector2, driving: boolean) {
    if (!this.enabled) return;

    if (this.state === 'off') {
      this.cooldown -= dtMs;
      if (this.cooldown <= 0 && driving) this.offer(focus);
      return;
    }

    this.distance = Phaser.Math.Distance.Between(focus.x, focus.y, this.target.x, this.target.y);

    this.pulse += dtMs / 460;
    const scale = 0.85 + Math.sin(this.pulse) * 0.12;
    this.marker.setScale(scale).setAlpha(0.55 + Math.sin(this.pulse) * 0.2);
    this.marker.setTint(this.state === 'offered' ? 0x69d8ff : 0xffd257);

    if (this.distance > 260) {
      const angle = Math.atan2(this.target.y - focus.y, this.target.x - focus.x);
      this.arrow
        .setVisible(true)
        .setPosition(focus.x + Math.cos(angle) * 96, focus.y + Math.sin(angle) * 96)
        .setRotation(angle)
        .setTint(this.state === 'offered' ? 0x69d8ff : 0xffd257);
    } else {
      this.arrow.setVisible(false);
    }

    if (this.distance < 74) {
      if (this.state === 'offered') this.pickUp(focus);
      else this.deliver();
    }
  }

  private offer(focus: Phaser.Math.Vector2) {
    const spot = this.world.pickRoadPoint(focus, 460, 1250);
    if (!spot) {
      this.cooldown = 2000;
      return;
    }
    this.target.set(spot.x, spot.y);
    this.state = 'offered';
    this.label = 'PICK UP';
    this.marker.setVisible(true).setPosition(spot.x, spot.y);
    track('mission_started');
  }

  private pickUp(focus: Phaser.Math.Vector2) {
    const spot = this.world.pickRoadPoint(focus, 700, 1700) ?? this.world.pickRoadPoint(focus, 300, 2200);
    if (!spot) return;
    this.from.copy(this.target);
    this.target.set(spot.x, spot.y);
    this.state = 'carrying';
    this.label = 'DELIVER';
    this.marker.setPosition(spot.x, spot.y);
  }

  private deliver() {
    const run = Phaser.Math.Distance.Between(this.from.x, this.from.y, this.target.x, this.target.y);
    const points = Math.round(SCORE.jobBase + run * SCORE.jobPerMetre * 0.1);
    this.score.add(points, 'JOB DONE');
    this.state = 'off';
    this.label = '';
    this.cooldown = 6000;
    this.marker.setVisible(false);
    this.arrow.setVisible(false);
    track('mission_completed', { points });
    this.onCompleted?.(points);
  }
}
