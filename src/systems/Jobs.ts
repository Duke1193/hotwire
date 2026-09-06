import Phaser from 'phaser';
import { SCORE } from '../config';
import type { SavedJob } from './SaveGame';
import type { World } from '../world/World';
import { track } from './Analytics';
import type { ScoreSystem } from './Score';

type State = 'off' | 'offered' | 'carrying';

/** How long a job waits before it lapses. */
const EXPIRY_MS = 210000;

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
  onOffered: (() => void) | null = null;
  onPickedUp: (() => void) | null = null;
  onFailed: (() => void) | null = null;

  /** Where the objective is, for the navigation arrow. */
  readonly target = new Phaser.Math.Vector2();
  private from = new Phaser.Math.Vector2();
  private marker: Phaser.GameObjects.Image;
  private cooldown = 3000;
  private pulse = 0;
  /** Jobs lapse if they are abandoned, so the marker never sits there forever. */
  private expiry = 0;

  constructor(scene: Phaser.Scene, private world: World, private score: ScoreSystem) {
    this.marker = scene.add.image(0, 0, 'marker').setDepth(7).setVisible(false).setAlpha(0.9);
  }

  /** What is worth restoring after a reload: the objective, not the timer. */
  snapshot(): SavedJob | null {
    if (this.state === 'off') return null;
    return { state: this.state, tx: this.target.x, ty: this.target.y, fx: this.from.x, fy: this.from.y };
  }

  restore(job: SavedJob) {
    this.state = job.state;
    this.target.set(job.tx, job.ty);
    this.from.set(job.fx, job.fy);
    this.label = job.state === 'offered' ? 'PICK UP' : 'DELIVER';
    this.marker.setVisible(true).setPosition(job.tx, job.ty);
    this.expiry = EXPIRY_MS;
  }

  update(dtMs: number, focus: Phaser.Math.Vector2, driving: boolean) {
    if (!this.enabled) return;

    if (this.state === 'off') {
      this.cooldown -= dtMs;
      if (this.cooldown <= 0 && driving) this.offer(focus);
      return;
    }

    this.expiry -= dtMs;
    if (this.expiry <= 0) {
      this.fail();
      return;
    }

    this.distance = Phaser.Math.Distance.Between(focus.x, focus.y, this.target.x, this.target.y);

    this.pulse += dtMs / 460;
    const scale = 0.85 + Math.sin(this.pulse) * 0.12;
    this.marker.setScale(scale).setAlpha(0.55 + Math.sin(this.pulse) * 0.2);
    this.marker.setTint(this.state === 'offered' ? 0x69d8ff : 0xffd257);

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
    this.expiry = EXPIRY_MS;
    track('mission_started', { kind: 'delivery' });
    this.onOffered?.();
  }

  private pickUp(focus: Phaser.Math.Vector2) {
    const spot = this.world.pickRoadPoint(focus, 700, 1700) ?? this.world.pickRoadPoint(focus, 300, 2200);
    if (!spot) return;
    this.from.copy(this.target);
    this.target.set(spot.x, spot.y);
    this.state = 'carrying';
    this.label = 'DELIVER';
    this.marker.setPosition(spot.x, spot.y);
    this.expiry = EXPIRY_MS;
    this.onPickedUp?.();
  }

  private deliver() {
    const run = Phaser.Math.Distance.Between(this.from.x, this.from.y, this.target.x, this.target.y);
    const points = Math.round(SCORE.jobBase + run * SCORE.jobPerMetre * 0.1);
    this.score.add(points, 'JOB DONE');
    this.state = 'off';
    this.label = '';
    this.cooldown = 6000;
    this.marker.setVisible(false);
    track('mission_completed', { points, kind: 'delivery' });
    this.onCompleted?.(points);
  }

  /** Dropped because the player was arrested or went down. */
  abandon() {
    if (this.state === 'off') return;
    this.fail();
  }

  /** Abandoned for long enough: quietly drop it and offer another later. */
  private fail() {
    const stage = this.state;
    this.state = 'off';
    this.label = '';
    this.cooldown = 8000;
    this.marker.setVisible(false);
    track('mission_failed', { kind: 'delivery', stage });
    this.onFailed?.();
  }
}
