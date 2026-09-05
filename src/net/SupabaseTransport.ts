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
      if (status === 'SUBSCRIBED') void channel.track(this.self);
    });
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
        score: info.score ?? 0,
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
    if (this.channel) {
      void this.channel.unsubscribe();
      this.client?.removeChannel(this.channel);
      this.channel = null;
    }
  }
}
