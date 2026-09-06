export interface PresenceInfo {
  playerId: string;
  nickname: string;
  /** Optional X handle, without the @. */
  handle?: string;
  crewTag?: string;
  crewName?: string;
  score: number;
  kills: number;
  heat: number;
  updatedAt: number;
}

export type NetStatus = 'offline' | 'connecting' | 'online';

export interface TransportEvents {
  onMessage: (type: string, payload: unknown, from: string) => void;
  onPresence: (peers: PresenceInfo[]) => void;
  onStatus: (status: NetStatus) => void;
}

export interface Transport {
  connect(room: string, self: PresenceInfo, events: TransportEvents): Promise<void>;
  send(type: string, payload: unknown): void;
  updatePresence(self: PresenceInfo): void;
  disconnect(): void;
}

/**
 * Same-browser transport over BroadcastChannel. It exists so the whole
 * multiplayer stack — presence, interpolation, scoreboard, Heat Run — can be
 * exercised in two tabs without Supabase credentials. Enabled only in dev, or
 * explicitly with ?loopback=1. Never a substitute for the real thing: it
 * cannot reach another machine.
 */
export class LoopbackTransport implements Transport {
  private channel: BroadcastChannel | null = null;
  private events: TransportEvents | null = null;
  private self!: PresenceInfo;
  private peers = new Map<string, PresenceInfo>();
  private beat = 0;

  async connect(room: string, self: PresenceInfo, events: TransportEvents) {
    this.self = self;
    this.events = events;
    this.channel = new BroadcastChannel(`getaway:${room}`);
    this.channel.onmessage = (e: MessageEvent) => this.receive(e.data);
    events.onStatus('online');

    this.announce();
    this.beat = window.setInterval(() => {
      this.announce();
      this.prune();
    }, 1500);
    window.addEventListener('pagehide', this.bye);
  }

  private announce = () => {
    this.self.updatedAt = Date.now();
    this.channel?.postMessage({ type: '__hello', from: this.self.playerId, payload: this.self });
  };

  private bye = () => {
    this.channel?.postMessage({ type: '__bye', from: this.self.playerId, payload: null });
  };

  private receive(msg: { type: string; from: string; payload: unknown }) {
    if (!msg || msg.from === this.self.playerId) return;
    if (msg.type === '__hello') {
      const info = msg.payload as PresenceInfo;
      const known = this.peers.has(info.playerId);
      this.peers.set(info.playerId, { ...info, updatedAt: Date.now() });
      if (!known) this.announce(); // let the newcomer learn about us immediately
      this.emitPresence();
      return;
    }
    if (msg.type === '__bye') {
      this.peers.delete(msg.from);
      this.emitPresence();
      return;
    }
    this.events?.onMessage(msg.type, msg.payload, msg.from);
  }

  private prune() {
    const cutoff = Date.now() - 5000;
    let changed = false;
    for (const [id, info] of this.peers) {
      if (info.updatedAt < cutoff) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emitPresence();
  }

  private emitPresence() {
    this.events?.onPresence([this.self, ...this.peers.values()]);
  }

  send(type: string, payload: unknown) {
    this.channel?.postMessage({ type, from: this.self.playerId, payload });
  }

  updatePresence(self: PresenceInfo) {
    this.self = self;
    this.announce();
  }

  disconnect() {
    this.bye();
    window.clearInterval(this.beat);
    window.removeEventListener('pagehide', this.bye);
    this.channel?.close();
    this.channel = null;
  }
}
