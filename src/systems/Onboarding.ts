import { track } from './Analytics';

const KEY = 'getaway.onboarded';

export type Step = 'move' | 'ride' | 'enter' | 'drive' | 'trouble' | 'escape' | 'done' | 'finished';

export interface Progress {
  walked: number;
  nearVehicle: boolean;
  driving: boolean;
  driven: number;
  heat: number;
  police: number;
}

const COPY: Record<Step, string> = {
  move: 'MOVE  ·  W A S D',
  ride: 'FIND A RIDE',
  enter: 'PRESS  E  TO GET IN',
  drive: 'DRIVE',
  trouble: 'CAUSE SOME TROUBLE',
  escape: 'LOSE THE PURSUIT',
  done: 'NICE. FIND A JOB.',
  finished: '',
};

/**
 * Teaches the game in the game. Each step watches for the thing it asked for
 * and gets out of the way; the whole sequence is skipped for anyone who has
 * seen it before.
 */
export class Onboarding {
  step: Step;
  private doneMs = 0;
  private sawHeat = false;

  constructor() {
    this.step = localStorage.getItem(KEY) === '1' ? 'finished' : 'move';
  }

  get active() {
    return this.step !== 'finished';
  }

  get text() {
    return COPY[this.step];
  }

  /** True once the player is expected to look for work. */
  get jobsUnlocked() {
    return this.step === 'finished' || this.step === 'done';
  }

  update(dtMs: number, p: Progress) {
    // Never leave anyone stranded on an earlier prompt than they have earned:
    // getting into a car satisfies everything up to that point.
    if (p.driving && (this.step === 'move' || this.step === 'ride' || this.step === 'enter')) {
      this.step = 'drive';
    }

    switch (this.step) {
      case 'move':
        if (p.walked > 90 || p.nearVehicle) this.step = 'ride';
        break;
      case 'ride':
        if (p.nearVehicle) this.step = 'enter';
        else if (p.driving) this.step = 'drive';
        break;
      case 'enter':
        if (p.driving) this.step = 'drive';
        else if (!p.nearVehicle) this.step = 'ride';
        break;
      case 'drive':
        // Either they got somewhere, or they already found the scenery.
        if (p.driven > 420 || p.heat > 8) this.step = 'trouble';
        break;
      case 'trouble':
        if (p.heat > 12) {
          this.sawHeat = true;
          this.step = 'escape';
        }
        break;
      case 'escape':
        if (this.sawHeat && p.heat <= 0 && p.police === 0) {
          this.step = 'done';
          this.doneMs = 4200;
        }
        break;
      case 'done':
        this.doneMs -= dtMs;
        if (this.doneMs <= 0) this.finish();
        break;
      default:
        break;
    }
  }

  finish() {
    if (this.step === 'finished') return;
    this.step = 'finished';
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
    track('onboarding_completed');
  }
}
