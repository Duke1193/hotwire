import { MultiplayerSystem } from './net/Multiplayer';
import { readSupabaseConfig } from './net/env';
import { inviteUrl, resolveRoom, RoomInfo } from './net/Room';
import { Analytics, track } from './systems/Analytics';
import { AudioBus } from './systems/Audio';
import { Identity, loadIdentity, sanitizeNickname, saveIdentity } from './systems/Identity';
import { clearSave, readBest, readSave, SaveState } from './systems/SaveGame';
import { getOverlay, initOverlay, Overlay } from './ui/Overlay';

export interface Session {
  identity: Identity;
  room: RoomInfo;
  audio: AudioBus;
  overlay: Overlay;
  net: MultiplayerSystem;
  /** A run to restore, when the player chose CONTINUE. */
  resume: SaveState | null;
  invite(): void;
}

let current: Session | null = null;
const waiting: ((s: Session) => void)[] = [];

export function getSession(): Session | null {
  return current;
}

/** Run `cb` as soon as the player has a name and a room. */
export function onSession(cb: (s: Session) => void) {
  if (current) cb(current);
  else waiting.push(cb);
}

/**
 * Resolves the room from the URL, asks first-time players for a nickname, and
 * opens the realtime channel. The game itself boots in parallel behind the
 * overlay so the city is already running when the player presses PLAY.
 */
export function bootSession() {
  const audio = new AudioBus();
  const overlay = initOverlay(audio.muted);
  const room = resolveRoom();
  const existing = loadIdentity();

  overlay.onSound = (muted) => audio.setMuted(muted);
  wirePrivacy(overlay);

  if (existing) {
    // Returning player: straight in. Audio still needs a gesture to start.
    const once = () => {
      audio.start();
      window.removeEventListener('pointerdown', once);
      window.removeEventListener('keydown', once);
    };
    window.addEventListener('pointerdown', once);
    window.addEventListener('keydown', once);
    if (room.invited) {
      overlay.toast(room.host ? `JOINING ${room.host.toUpperCase()}' CITY` : `JOINING ROOM ${room.code}`, 3200);
    }

    // A valid save means the player gets to choose rather than being dropped
    // into a run they did not ask to continue.
    const save = readSave(existing.id);
    if (save) {
      overlay.showResume({ nickname: existing.nickname, score: save.score, best: Math.max(save.best, readBest()) });
      overlay.onContinue = () => {
        audio.start();
        finish(existing, room, audio, overlay, true, save);
      };
      overlay.onNewRun = () => {
        audio.start();
        clearSave();
        finish(existing, room, audio, overlay, true, null);
      };
      return;
    }

    finish(existing, room, audio, overlay, true, null);
    return;
  }

  overlay.showBoot(room, '');
  overlay.onPlay = (raw) => {
    const check = sanitizeNickname(raw);
    if (!check.ok) {
      overlay.rejectNickname(check.error ?? 'TRY ANOTHER NAME');
      return;
    }
    const identity = saveIdentity(check.value, null);
    track('nickname_created');
    audio.start();
    overlay.hideBoot();
    finish(identity, room, audio, overlay, false, null);
  };
}

/** The player-facing analytics switch, plus whatever the browser already said. */
function wirePrivacy(overlay: Overlay) {
  const available = () => Analytics.configured && !Analytics.doNotTrack;
  const describe = () => {
    if (!Analytics.configured) return 'This build has no analytics configured — nothing is being sent.';
    if (Analytics.doNotTrack) return 'Your browser sends Do Not Track, so analytics stay off.';
    return 'Your choice is remembered on this device.';
  };
  const render = () => overlay.setAnalyticsState(Analytics.enabled && Analytics.configured, describe(), available());

  render();
  overlay.onAnalyticsChoice = (enabled) => {
    if (enabled) Analytics.optIn();
    else Analytics.optOut();
    render();
  };
}

/** Development-only summary of how this build is wired. Never prints keys. */
function reportDiagnostics(overlay: Overlay, net: MultiplayerSystem) {
  if (!import.meta.env.DEV) return;
  const { config, problem } = readSupabaseConfig();
  const supabase = config ? `configured (${config.source} key)` : `not configured${problem ? ` (${problem})` : ''}`;
  const posthog = Analytics.configured ? 'configured' : 'not configured';
  const transport =
    net.transportKind === 'loopback'
      ? 'loopback — LOCAL TABS ONLY, not real multiplayer'
      : (net.transportKind ?? 'offline');

  overlay.setDiagnostics(`DEV BUILD\nPOSTHOG   ${posthog}\nSUPABASE  ${supabase}\nTRANSPORT ${transport}`);
  console.info(
    `%c[getaway] dev diagnostics%c\n  PostHog:   ${posthog}\n  Supabase:  ${supabase}\n  Transport: ${transport}`,
    'color:#69d8ff',
    'color:inherit',
  );
}

function finish(
  identity: Identity,
  room: RoomInfo,
  audio: AudioBus,
  overlay: Overlay,
  returning: boolean,
  resume: SaveState | null,
) {
  const net = new MultiplayerSystem(identity, room.code);

  const session: Session = {
    identity,
    room,
    audio,
    overlay,
    net,
    resume,
    invite: () => shareInvite(room, identity, overlay, net.status === 'offline'),
  };

  overlay.onInvite = session.invite;
  overlay.setRoom(room.code, 1, 'offline');

  Analytics.identify(identity.id);
  Analytics.setContext({ room_id: room.code, nickname_set: true, multiplayer: false, online_player_count: 1 });
  track(room.invited ? 'room_joined' : 'room_created', { invited: room.invited });
  track('game_started', { returning, resumed: Boolean(resume) });

  // Never block the game on the network.
  void net.connect().then(() => {
    overlay.setRoom(room.code, net.onlineCount, net.status);
    reportDiagnostics(overlay, net);
  });

  current = session;
  for (const cb of waiting.splice(0)) cb(session);
}

/**
 * Clipboard always wins; the native share sheet is only used where it is
 * actually the nicer interaction (touch devices).
 */
function shareInvite(room: RoomInfo, identity: Identity, overlay: Overlay, offline: boolean) {
  track('invite_clicked', { offline });
  const url = inviteUrl(room.code, identity.nickname);

  const copied = () => {
    track('invite_copied');
    overlay.flashInvite('LINK COPIED');
    // Be honest when this build has no realtime credentials configured.
    overlay.toast(offline ? 'INVITE LINK COPIED · MULTIPLAYER OFFLINE' : 'INVITE LINK COPIED');
  };

  const fallback = () => {
    const area = document.createElement('textarea');
    area.value = url;
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    if (ok) copied();
    else overlay.toast(url, 8000);
  };

  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.share) {
    navigator
      .share({ title: 'GETAWAY', text: 'steal a car. lose the cops.', url })
      .then(() => track('invite_shared', { via: 'web_share' }))
      .catch(() => fallback());
    return;
  }

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(copied, fallback);
  } else {
    fallback();
  }
}

export { getOverlay };
