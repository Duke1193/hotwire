/**
 * One analytics seam for the whole game.
 *
 * PostHog is loaded lazily and only when both env vars are present, the player
 * has not opted out, and the browser is not asking us not to track. Everything
 * still works with no keys configured: events are buffered on
 * `window.getawayEvents` so they can be inspected (and forwarded to any other
 * sink) regardless.
 *
 * We deliberately never send the nickname — only a boolean saying one exists —
 * and identify against the local anonymous UUID, never an email or login.
 */

export type GameEvent =
  | 'game_loaded'
  | 'nickname_created'
  | 'game_started'
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'vehicle_entered'
  | 'vehicle_exited'
  | 'first_vehicle_entered'
  | 'first_drive'
  | 'mission_started'
  | 'mission_completed'
  | 'mission_failed'
  | 'first_mission_completed'
  | 'heat_started'
  | 'heat_level_changed'
  | 'pursuit_escaped'
  | 'first_pursuit_escaped'
  | 'invite_clicked'
  | 'invite_shared'
  | 'invite_copied'
  | 'room_created'
  | 'room_joined'
  | 'second_player_joined'
  | 'multiplayer_session_started'
  | 'heat_run_started'
  | 'heat_run_completed'
  | 'game_paused'
  | 'game_resumed';

export type Props = Record<string, string | number | boolean | undefined>;

export interface AnalyticsContext {
  player_id?: string;
  room_id?: string;
  /** Whether a nickname exists — never the nickname itself. */
  nickname_set?: boolean;
  device_type?: 'desktop' | 'mobile' | 'tablet';
  mobile?: boolean;
  touch?: boolean;
  multiplayer?: boolean;
  online_player_count?: number;
  current_heat?: number;
  score?: number;
}

interface PostHogLike {
  init: (key: string, options: Record<string, unknown>) => void;
  capture: (name: string, props?: Props) => void;
  identify: (id: string, props?: Props) => void;
  opt_out_capturing: () => void;
  opt_in_capturing: () => void;
  register: (props: Props) => void;
}

interface Sink {
  getawayEvents?: { name: GameEvent; props: Props; at: number }[];
  getawayAnalytics?: { optOut: () => void; optIn: () => void; enabled: () => boolean };
}

const OPT_OUT_KEY = 'getaway.analytics.optout';

class AnalyticsBus {
  private context: AnalyticsContext = {};
  private posthog: PostHogLike | null = null;
  private pending: { name: GameEvent; props: Props }[] = [];
  private fired = new Set<GameEvent>();
  private startedAt = Date.now();
  private optedOut = false;
  private dnt = false;
  private loading = false;
  private identified: string | null = null;

  /** True when a key and host were compiled in, regardless of consent. */
  get configured(): boolean {
    return Boolean(import.meta.env.VITE_POSTHOG_KEY && import.meta.env.VITE_POSTHOG_HOST);
  }

  /** False when the player (or Do Not Track) has declined. */
  get enabled(): boolean {
    return !this.optedOut;
  }

  /** True when the browser asked not to be tracked, so the UI can say so. */
  get doNotTrack(): boolean {
    return this.dnt;
  }

  /** Loads PostHog if it is configured and allowed. Safe to call again later. */
  init() {
    const sink = window as unknown as Sink;
    sink.getawayAnalytics = {
      optOut: () => this.optOut(),
      optIn: () => this.optIn(),
      enabled: () => !this.optedOut,
    };

    this.dnt = readDoNotTrack();
    this.optedOut = this.readOptOut();

    const key = import.meta.env.VITE_POSTHOG_KEY;
    const host = import.meta.env.VITE_POSTHOG_HOST;
    if (!key || !host || this.optedOut || this.loading || this.posthog) return;
    this.loading = true;

    void import('posthog-js')
      .then(({ default: posthog }) => {
        const ph = posthog as unknown as PostHogLike;
        ph.init(key, {
          api_host: host,
          capture_pageview: false,
          capture_pageleave: true,
          autocapture: false,
          disable_session_recording: true,
          // We have no login: profiles only exist for the anonymous game id.
          person_profiles: 'identified_only',
          persistence: 'localStorage',
        });
        this.posthog = ph;
        if (this.identified) ph.identify(this.identified);
        for (const item of this.pending.splice(0)) this.send(item.name, item.props);
      })
      .catch((err) => {
        // Analytics must never take the game down with it.
        this.loading = false;
        if (import.meta.env.DEV) console.warn('[analytics] posthog unavailable', err);
      });
  }

  /** The anonymous, locally generated player id — never anything personal. */
  identify(playerId: string) {
    this.identified = playerId;
    this.context.player_id = playerId;
    this.posthog?.identify(playerId);
  }

  setContext(patch: AnalyticsContext) {
    Object.assign(this.context, patch);
  }

  track(name: GameEvent, props: Props = {}) {
    const enriched: Props = {
      ...this.context,
      ...props,
      session_duration: Math.round((Date.now() - this.startedAt) / 1000),
    };

    const sink = window as unknown as Sink;
    (sink.getawayEvents ??= []).push({ name, props: enriched, at: Date.now() });
    if (sink.getawayEvents.length > 400) sink.getawayEvents.shift();
    if (import.meta.env.DEV) console.info('[event]', name, enriched);

    if (this.optedOut) return;
    if (this.posthog) this.send(name, enriched);
    else if (this.pending.length < 200) this.pending.push({ name, props: enriched });
  }

  /** Funnel milestones that should only ever fire once per session. */
  trackOnce(name: GameEvent, props: Props = {}) {
    if (this.fired.has(name)) return;
    this.fired.add(name);
    this.track(name, props);
  }

  optOut() {
    this.optedOut = true;
    this.pending.length = 0;
    try {
      localStorage.setItem(OPT_OUT_KEY, '1');
    } catch {
      /* ignore */
    }
    this.posthog?.opt_out_capturing();
  }

  optIn() {
    // Do Not Track is the browser speaking for the player; never override it.
    if (this.dnt) return;
    this.optedOut = false;
    try {
      localStorage.removeItem(OPT_OUT_KEY);
    } catch {
      /* ignore */
    }
    if (this.posthog) this.posthog.opt_in_capturing();
    else this.init(); // consent given after boot: load the client now
  }

  private send(name: GameEvent, props: Props) {
    try {
      this.posthog?.capture(name, props);
    } catch {
      /* never let telemetry break the game */
    }
  }

  private readOptOut(): boolean {
    try {
      if (localStorage.getItem(OPT_OUT_KEY) === '1') return true;
    } catch {
      /* private mode: fall through */
    }
    return this.dnt;
  }
}

function readDoNotTrack(): boolean {
  return (
    navigator.doNotTrack === '1' || (window as unknown as { doNotTrack?: string }).doNotTrack === '1'
  );
}

export const Analytics = new AnalyticsBus();

export function track(name: GameEvent, props: Props = {}) {
  Analytics.track(name, props);
}

export function trackOnce(name: GameEvent, props: Props = {}) {
  Analytics.trackOnce(name, props);
}
