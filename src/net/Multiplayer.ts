import { NET } from '../config';
import { Analytics, trackOnce } from '../systems/Analytics';
import type { Identity } from '../systems/Identity';
import { readSupabaseConfig } from './env';
import { LoopbackTransport, NetStatus, PresenceInfo, Transport } from './Transport';
import { SupabaseTransport } from './SupabaseTransport';

/** The only thing that crosses the network, per the milestone spec. */
export interface PlayerState {
  playerId: string;
  nickname: string;
  x: number;
  y: number;
  rotation: number;
  velocityX: number;
  velocityY: number;
  vehicleType: string;
  inVehicle: boolean;
  heat: number;
  score: number;
  updatedAt: number;
}

export interface Sample {
  t: number;
  x: number;
  y: number;
  rotation: number;
  velocityX: number;
  velocityY: number;
  inVehicle: boolean;
  vehicleType: string;
}

export interface Peer {
  id: string;
  nickname: string;
  score: number;
  heat: number;
  samples: Sample[];
  lastSeen: number;
}

/**
 * Human players only. Each client keeps simulating its own city, its own
 * traffic and its own physics; all we exchange is where the people are.
 */
export type TransportKind = 'supabase' | 'loopback' | null;

export class MultiplayerSystem {
  status: NetStatus = 'offline';
  /** Which transport is actually carrying this session. */
  transportKind: TransportKind = null;
  readonly peers = new Map<string, Peer>();

  onEvent: ((type: string, payload: unknown, from: string) => void) | null = null;
  onPeerJoin: ((peer: Peer) => void) | null = null;
  onRosterChange: (() => void) | null = null;

  private transport: Transport | null = null;
  private lastSend = 0;
  private lastPresence = 0;
  private presence: PresenceInfo;
  private everSawPeer = false;

  constructor(private identity: Identity, readonly room: string) {
    this.presence = {
      playerId: identity.id,
      nickname: identity.nickname,
      score: 0,
      heat: 0,
      updatedAt: Date.now(),
    };
  }

  /** Local player plus everyone we can currently see. */
  get onlineCount() {
    return this.peers.size + 1;
  }

  get enabled() {
    return this.transport !== null;
  }

  async connect() {
    // Read straight from import.meta.env here: the bundler replaces these with
    // literals, so a build with no Supabase variables drops the client library
    // from the bundle entirely instead of shipping an unused chunk.
    const envUrl = import.meta.env.VITE_SUPABASE_URL;
    const envKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

    // The loopback transport is a development tool. It only reaches other tabs
    // on this machine, so it must never stand in for real multiplayer: it is
    // compiled out of production builds entirely and `?loopback=1` does
    // nothing there.
    const forceLoopback = import.meta.env.DEV && new URLSearchParams(location.search).get('loopback') === '1';

    if (envUrl && envKey && !forceLoopback) {
      // Validates the URL and refuses anything that looks like a secret key.
      const { config } = readSupabaseConfig();
      if (config) {
        this.transport = new SupabaseTransport(config.url, config.key);
        this.transportKind = 'supabase';
      }
    }

    if (!this.transport) {
      if (import.meta.env.DEV) {
        this.transport = new LoopbackTransport();
        this.transportKind = 'loopback';
      } else {
        this.status = 'offline';
        this.transportKind = null;
        return;
      }
    }

    try {
      await this.transport.connect(this.room, this.presence, {
        onMessage: (type, payload, from) => this.receive(type, payload, from),
        onPresence: (peers) => this.syncPresence(peers),
        onStatus: (status) => {
          this.status = status;
          if (status === 'online') trackOnce('multiplayer_session_started');
        },
      });
    } catch (err) {
      console.warn('[net] falling back to single player', err);
      this.transport = null;
      this.transportKind = null;
      this.status = 'offline';
    }
  }

  /** Rate-limited transform broadcast: fast while moving, a trickle when idle. */
  publish(state: Omit<PlayerState, 'playerId' | 'nickname' | 'updatedAt'>, moving: boolean) {
    if (!this.transport) return;
    const now = performance.now();
    const gap = 1000 / (moving ? NET.sendHz : NET.idleHz);
    if (now - this.lastSend < gap) return;
    this.lastSend = now;

    const full: PlayerState = {
      ...state,
      playerId: this.identity.id,
      nickname: this.identity.nickname,
      updatedAt: Date.now(),
    };
    this.transport.send('state', full);

    if (now - this.lastPresence > 2000) {
      this.lastPresence = now;
      this.presence = {
        playerId: this.identity.id,
        nickname: this.identity.nickname,
        score: state.score,
        heat: state.heat,
        updatedAt: Date.now(),
      };
      this.transport.updatePresence(this.presence);
    }
  }

  sendEvent(type: string, payload: unknown) {
    this.transport?.send(type, payload);
  }

  /** Drop players we have not heard from, so ghosts never linger. */
  prune() {
    const cutoff = Date.now() - NET.staleAfter;
    let changed = false;
    for (const [id, peer] of this.peers) {
      if (peer.lastSeen < cutoff) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.onRosterChange?.();
  }

  disconnect() {
    this.transport?.disconnect();
    this.transport = null;
    this.transportKind = null;
    this.peers.clear();
    this.status = 'offline';
  }

  private receive(type: string, payload: unknown, from: string) {
    if (type !== 'state') {
      this.onEvent?.(type, payload, from);
      return;
    }
    const s = payload as PlayerState;
    if (!s || typeof s.x !== 'number' || from === this.identity.id) return;

    const peer = this.ensure(from, s.nickname);
    peer.nickname = s.nickname || peer.nickname;
    peer.heat = s.heat;
    peer.score = s.score;
    peer.lastSeen = Date.now();
    peer.samples.push({
      t: performance.now(),
      x: s.x,
      y: s.y,
      rotation: s.rotation,
      velocityX: s.velocityX,
      velocityY: s.velocityY,
      inVehicle: s.inVehicle,
      vehicleType: s.vehicleType,
    });
    if (peer.samples.length > 8) peer.samples.shift();
  }

  private ensure(id: string, nickname: string): Peer {
    let peer = this.peers.get(id);
    if (!peer) {
      peer = { id, nickname: nickname || 'PLAYER', score: 0, heat: 0, samples: [], lastSeen: Date.now() };
      this.peers.set(id, peer);
      this.onPeerJoin?.(peer);
      this.onRosterChange?.();
      if (!this.everSawPeer) {
        this.everSawPeer = true;
        Analytics.setContext({ multiplayer: true });
        trackOnce('second_player_joined');
      }
    }
    return peer;
  }

  private syncPresence(list: PresenceInfo[]) {
    const seen = new Set<string>();
    for (const info of list) {
      if (info.playerId === this.identity.id) continue;
      seen.add(info.playerId);
      const peer = this.ensure(info.playerId, info.nickname);
      peer.nickname = info.nickname || peer.nickname;
      peer.score = info.score;
      peer.heat = info.heat;
      peer.lastSeen = Date.now();
    }
    // presence is the source of truth for membership
    for (const id of [...this.peers.keys()]) {
      if (!seen.has(id)) this.peers.delete(id);
    }
    this.onRosterChange?.();
  }
}
