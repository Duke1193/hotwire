import { MultiplayerSystem } from './net/Multiplayer';
import { inviteUrl, resolveRoom, RoomInfo } from './net/Room';
import { track } from './systems/Analytics';
import { AudioBus } from './systems/Audio';
import { Identity, loadIdentity, sanitizeNickname, saveIdentity } from './systems/Identity';
import { getOverlay, initOverlay, Overlay } from './ui/Overlay';

export interface Session {
  identity: Identity;
  room: RoomInfo;
  audio: AudioBus;
  overlay: Overlay;
  net: MultiplayerSystem;
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
    finish(existing, room, audio, overlay, true);
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
    finish(identity, room, audio, overlay, false);
  };
}

function finish(identity: Identity, room: RoomInfo, audio: AudioBus, overlay: Overlay, returning: boolean) {
  const net = new MultiplayerSystem(identity, room.code);

  const session: Session = {
    identity,
    room,
    audio,
    overlay,
    net,
    invite: () => shareInvite(room, identity, overlay, net.status === 'offline'),
  };

  overlay.onInvite = session.invite;
  overlay.setRoom(room.code, 1, 'offline');
  track('game_started', { room: room.code, returning });

  // Never block the game on the network.
  void net.connect().then(() => overlay.setRoom(room.code, net.onlineCount, net.status));

  current = session;
  for (const cb of waiting.splice(0)) cb(session);
}

/**
 * Clipboard always wins; the native share sheet is only used where it is
 * actually the nicer interaction (touch devices).
 */
function shareInvite(room: RoomInfo, identity: Identity, overlay: Overlay, offline: boolean) {
  track('invite_clicked', { room: room.code });
  const url = inviteUrl(room.code, identity.nickname);

  const copied = () => {
    track('invite_copied', { room: room.code });
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
      .then(() => track('invite_copied', { room: room.code, via: 'share' }))
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
