import { WORLD } from '../config';

/**
 * A small, versioned snapshot of the things a player would be annoyed to lose:
 * where they are, what they were driving, the job they were on, and the score.
 *
 * Deliberately NOT saved: traffic, pedestrians, police, ambient incidents and
 * remote players. Those are simulation, not progress — every client rebuilds
 * them on load, and freezing them would only produce a stale, wrong city.
 */
const KEY = 'getaway_save_v1';
const BEST_KEY = 'getaway.best';
export const SAVE_VERSION = 1;
const VERSION = SAVE_VERSION;
/** Saves older than this are treated as a new run. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface SavedJob {
  state: 'offered' | 'carrying';
  tx: number;
  ty: number;
  fx: number;
  fy: number;
}

export interface SaveState {
  version: number;
  timestamp: number;
  /** Bound to the local identity so one browser cannot resume another's run. */
  playerId: string;
  nickname: string;
  onboarded: boolean;
  muted: boolean;
  score: number;
  best: number;
  inVehicle: boolean;
  x: number;
  y: number;
  rotation: number;
  /** Index into the deterministic parked-car list, or null when on foot. */
  vehicleIndex: number | null;
  job: SavedJob | null;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const onMap = (x: number, y: number) => x >= 0 && x <= WORLD.width && y >= 0 && y <= WORLD.height;

/**
 * Returns a usable save, or null for anything missing, corrupt, from another
 * player, from an older format, or simply too old. Never throws.
 */
export function readSave(playerId: string): SaveState | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const data = JSON.parse(raw) as Partial<SaveState>;
    if (data.version !== VERSION) return null;
    if (data.playerId !== playerId) return null;
    if (!finite(data.timestamp) || Date.now() - data.timestamp > MAX_AGE_MS) return null;
    if (!finite(data.x) || !finite(data.y) || !onMap(data.x, data.y)) return null;
    if (!finite(data.rotation) || !finite(data.score)) return null;

    let job: SavedJob | null = null;
    const raw_job = data.job;
    if (
      raw_job &&
      (raw_job.state === 'offered' || raw_job.state === 'carrying') &&
      finite(raw_job.tx) &&
      finite(raw_job.ty) &&
      onMap(raw_job.tx, raw_job.ty)
    ) {
      job = {
        state: raw_job.state,
        tx: raw_job.tx,
        ty: raw_job.ty,
        fx: finite(raw_job.fx) ? raw_job.fx : raw_job.tx,
        fy: finite(raw_job.fy) ? raw_job.fy : raw_job.ty,
      };
    }

    return {
      version: VERSION,
      timestamp: data.timestamp,
      playerId,
      nickname: typeof data.nickname === 'string' ? data.nickname : '',
      onboarded: data.onboarded === true,
      muted: data.muted === true,
      score: Math.max(0, Math.round(data.score)),
      best: finite(data.best) ? Math.max(0, Math.round(data.best)) : 0,
      inVehicle: data.inVehicle === true,
      x: data.x,
      y: data.y,
      rotation: data.rotation,
      vehicleIndex: finite(data.vehicleIndex) && data.vehicleIndex >= 0 ? Math.round(data.vehicleIndex) : null,
      job,
    };
  } catch {
    // Corrupt entry: drop it rather than letting it fail again next launch.
    clearSave();
    return null;
  }
}

export function writeSave(state: SaveState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(BEST_KEY, String(state.best));
  } catch {
    /* private mode or quota: the run simply will not persist */
  }
}

/** Clears the run but keeps the best score, which belongs to the player. */
export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function readBest(): number {
  try {
    const raw = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
  } catch {
    return 0;
  }
}

/**
 * Writes at most once every `minGapMs`, and at least every `periodMs` while
 * anything has changed, so a long session costs a handful of writes rather
 * than one per frame.
 */
export class SaveScheduler {
  private dirty = false;
  private sinceWrite = 0;
  private sinceMark = 0;

  constructor(
    private collect: () => SaveState | null,
    private minGapMs = 4000,
    private periodMs = 20000,
  ) {}

  /** Something worth keeping happened. */
  mark() {
    this.dirty = true;
  }

  update(dtMs: number) {
    this.sinceWrite += dtMs;
    this.sinceMark += dtMs;
    if (this.sinceMark >= this.periodMs) {
      this.sinceMark = 0;
      this.dirty = true;
    }
    if (this.dirty && this.sinceWrite >= this.minGapMs) this.flush();
  }

  flush() {
    const state = this.collect();
    if (!state) return;
    writeSave(state);
    this.dirty = false;
    this.sinceWrite = 0;
    this.sinceMark = 0;
  }
}
