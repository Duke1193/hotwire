/**
 * No analytics vendor is wired up. This is the seam: every interesting moment
 * is emitted here, buffered on `window.getawayEvents`, and forwarded to a
 * provider if one happens to exist. Point it at something real later.
 */
export type GameEvent =
  | 'nickname_created'
  | 'game_started'
  | 'onboarding_completed'
  | 'vehicle_entered'
  | 'heat_started'
  | 'pursuit_escaped'
  | 'mission_started'
  | 'mission_completed'
  | 'invite_clicked'
  | 'invite_copied'
  | 'room_joined'
  | 'second_player_joined'
  | 'heat_run_started'
  | 'heat_run_completed';

type Props = Record<string, string | number | boolean | undefined>;

interface Sink {
  gtag?: (command: string, name: string, props?: Props) => void;
  plausible?: (name: string, options?: { props: Props }) => void;
  getawayEvents?: { name: GameEvent; props: Props; at: number }[];
}

const seen = new Set<GameEvent>();

export function track(name: GameEvent, props: Props = {}) {
  const sink = window as unknown as Sink;
  const entry = { name, props, at: Date.now() };
  (sink.getawayEvents ??= []).push(entry);
  if (sink.getawayEvents.length > 400) sink.getawayEvents.shift();

  try {
    sink.gtag?.('event', name, props);
    sink.plausible?.(name, { props });
  } catch {
    /* never let telemetry break the game */
  }

  if (import.meta.env.DEV) console.info('[event]', name, props);
}

/** For funnel steps that should only ever fire once per session. */
export function trackOnce(name: GameEvent, props: Props = {}) {
  if (seen.has(name)) return;
  seen.add(name);
  track(name, props);
}
