import type { NetStatus, PresenceInfo, Transport, TransportEvents } from './Transport';

type Channel = {
  on: (type: string, filter: unknown, cb: (payload: unknown) => void) => Channel;
  subscribe: (cb: (status: string) => void) => Channel;
  send: (msg: { type: 'broadcast'; event: string; payload: unknown }) => Promise<unknown>;
  track: (state: unknown) => Promise<unknown>;
  presenceState: () => Record<string, unknown[]>;
  unsubscribe: () => Promise<unknown>;
};

type Client = {
  channel: (name: string, opts: unknown) => Channel;
  removeChannel: (c: Channel) => void;
};

/**
 * Supabase Realtime: Presence for who is in the room, Broadcast for movement.
 * Nothing is stored and nothing is authoritative — the server only relays.
 * The client library is imported lazily so a build without credentials never
 * pays for it.
 */
export class SupabaseTransport implements Transport {
  private channel: Channel | null = null;
  private client: Client | null = null;
  private events: TransportEvents | null = null;
  private self!: PresenceInfo;
  private room = '';
  private reopenTimer = 0;
  private retries = 0;
  private closed = false;

  constructor(private url: string, private key: string) {}

  async connect(room: string, self: PresenceInfo, events: TransportEvents) {
    this.self = self;
    this.events = events;
    this.room = room;
    events.onStatus('connecting');

    const { createClient } = await import('@supabase/supabase-js');
    this.client = createClient(this.url, this.key, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 20 } },
    }) as unknown as Client;

    this.open();

    // A phone that locks its screen, or a tab left in the background, will
    // have its socket dropped. Come back the moment the player does.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this.channel) this.reopen(0);
    });
  }

  private open() {
    if (!this.client) return;
    const channel = this.client.channel(`getaway:${this.room}`, {
      config: { presence: { key: this.self.playerId }, broadcast: { self: false } },
    });
    this.channel = channel;

    channel.on('presence', { event: 'sync' }, () => this.syncPresence());
    channel.on('broadcast', { event: 'state' }, (msg) => this.relay(msg));
    channel.on('broadcast', { event: 'event' }, (msg) => this.relay(msg));

    channel.subscribe((status: string) => {
      const map: Record<string, NetStatus> = {
        SUBSCRIBED: 'online',
        CHANNEL_ERROR: 'offline',
        TIMED_OUT: 'offline',
        CLOSED: 'offline',
      };
      const next = map[status] ?? 'connecting';
      this.events?.onStatus(next);

      if (status === 'SUBSCRIBED') {
        this.retries = 0;
        void channel.track(this.self);
        return;
      }
      if (next === 'offline' && !this.closed) {
        // Backoff, then build a fresh channel: identity and crew ride along in
        // `this.self`, so nothing is lost across a reconnect.
        this.channel = null;
        this.reopen(Math.min(1200 * 2 ** this.retries, 15000));
        this.retries++;
      }
    });
  }

  private reopen(delay: number) {
    if (this.reopenTimer || this.closed || !this.client) return;
    this.reopenTimer = window.setTimeout(() => {
      this.reopenTimer = 0;
      if (this.closed || !this.client || this.channel) return;
      this.events?.onStatus('connecting');
      this.open();
    }, delay);
  }

  private relay(msg: unknown) {
    const payload = (msg as { payload?: { t?: string; from?: string; data?: unknown } })?.payload;
    if (!payload?.t || !payload.from) return;
    if (payload.from === this.self.playerId) return;
    this.events?.onMessage(payload.t, payload.data, payload.from);
  }

  private syncPresence() {
    if (!this.channel) return;
    const state = this.channel.presenceState();
    const peers: PresenceInfo[] = [];
    for (const key of Object.keys(state)) {
      const entries = state[key];
      const info = entries?.[entries.length - 1] as Partial<PresenceInfo> | undefined;
      if (!info?.playerId) continue;
      peers.push({
        playerId: info.playerId,
        nickname: info.nickname ?? 'PLAYER',
        handle: info.handle,
        crewTag: info.crewTag,
        crewName: info.crewName,
        score: info.score ?? 0,
        kills: info.kills ?? 0,
        heat: info.heat ?? 0,
        updatedAt: info.updatedAt ?? Date.now(),
      });
    }
    this.events?.onPresence(peers);
  }

  send(type: string, payload: unknown) {
    const event = type === 'state' ? 'state' : 'event';
    void this.channel?.send({
      type: 'broadcast',
      event,
      payload: { t: type, from: this.self.playerId, data: payload },
    });
  }

  updatePresence(self: PresenceInfo) {
    this.self = self;
    void this.channel?.track(self);
  }

  disconnect() {
    this.closed = true;
    window.clearTimeout(this.reopenTimer);
    this.reopenTimer = 0;
    if (this.channel) {
      void this.channel.unsubscribe();
      this.client?.removeChannel(this.channel);
      this.channel = null;
    }
  }
}
