import { MultiplayerSystem } from './net/Multiplayer';
import { readSupabaseConfig } from './net/env';
import { inviteUrl, resolveRoom, RoomInfo } from './net/Room';
import { Analytics, track } from './systems/Analytics';
import { AudioBus } from './systems/Audio';
import { Crew, crewFromUrl, loadCrew, makeCrew, saveCrew } from './systems/Crew';
import { Identity, loadIdentity, sanitizeHandle, sanitizeNickname, saveIdentity } from './systems/Identity';
import { clearSave, readBest, readSave, SaveState } from './systems/SaveGame';
import { getOverlay, initOverlay, Overlay } from './ui/Overlay';

export interface Session {
  identity: Identity;
  crew: Crew | null;
  /** Fired when the nickname, handle or crew changes at runtime. */
  onProfileChange: (() => void) | null;
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
  overlay.onPlay = (rawNick, rawHandle) => {
    const check = sanitizeNickname(rawNick);
    if (!check.ok) {
      overlay.rejectNickname(check.error ?? 'TRY ANOTHER NAME');
      return;
    }
    const handle = sanitizeHandle(rawHandle);
    if (!handle.ok) {
      overlay.rejectNickname(handle.error ?? 'CHECK THE HANDLE');
      return;
    }
    const identity = saveIdentity(check.value, null, handle.value);
    track('nickname_created', { has_handle: Boolean(handle.value) });
    audio.start();
    overlay.hideBoot();
    finish(identity, room, audio, overlay, false, null);
  };
}

/** Nickname, handle and crew edits from the settings panel. */
function wireProfile(session: Session, overlay: Overlay) {
  overlay.onIdentityChange = (rawNick, rawHandle) => {
    const nick = sanitizeNickname(rawNick);
    const handle = sanitizeHandle(rawHandle);
    if (!nick.ok || !handle.ok) {
      overlay.toast(nick.error ?? handle.error ?? 'CHECK THOSE DETAILS');
      return;
    }
    session.identity = saveIdentity(nick.value, session.identity, handle.value);
    session.net.setIdentity(session.identity);
    overlay.setPlayerInfo(session.identity.nickname, session.identity.handle, session.crew);
    overlay.toast('PROFILE SAVED');
    session.onProfileChange?.();
  };

  overlay.onCrewChange = (rawName, rawTag) => {
    const name = rawName.trim();
    if (name.length < 2) {
      overlay.toast('CREW NAME TOO SHORT');
      return;
    }
    const existing = session.crew;
    const crew = makeCrew(name, rawTag);
    saveCrew(crew);
    session.crew = crew;
    session.net.meta.crewTag = crew.tag;
    session.net.meta.crewName = crew.name;
    overlay.setPlayerInfo(session.identity.nickname, session.identity.handle, crew);
    overlay.toast(`[${crew.tag}] ${crew.name}`);
    track(existing ? 'crew_joined' : 'crew_created', { via: 'settings' });
    session.onProfileChange?.();
  };

  overlay.onCrewLeave = () => {
    if (!session.crew) return;
    saveCrew(null);
    session.crew = null;
    session.net.meta.crewTag = undefined;
    session.net.meta.crewName = undefined;
    overlay.setPlayerInfo(session.identity.nickname, session.identity.handle, null);
    overlay.toast('LEFT CREW');
    track('crew_left');
    session.onProfileChange?.();
  };
}

/** The player-facing analytics switch, plus whatever the browser already said. */
function wirePrivacy(overlay: Overlay) {
  const available = () => Analytics.configured && !Analytics.doNotTrack;
  const describe = () => {
    if (!Analytics.configured) return 'No analytics are configured in this build — nothing is being sent.';
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

  // An invite link can carry a crew: joining it is the whole point of the link.
  const invitedCrew = crewFromUrl();
  const storedCrew = loadCrew();
  const crew = invitedCrew ?? storedCrew;
  if (invitedCrew && invitedCrew.tag !== storedCrew?.tag) {
    saveCrew(invitedCrew);
    track('crew_joined', { via: 'invite' });
  }

  const session: Session = {
    identity,
    crew,
    onProfileChange: null,
    room,
    audio,
    overlay,
    net,
    resume,
    invite: () => shareInvite(room, session, overlay, net.status === 'offline'),
  };

  net.meta.crewTag = crew?.tag;
  net.meta.crewName = crew?.name;
  wireProfile(session, overlay);
  if (invitedCrew) {
    overlay.toast(`JOINED [${invitedCrew.tag}]`, 3200, invitedCrew.name);
  }

  overlay.onInvite = session.invite;
  overlay.setRoom(room.code, 1, 'offline');
  overlay.setPlayerInfo(identity.nickname, identity.handle, crew);

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
function shareInvite(room: RoomInfo, session: Session, overlay: Overlay, offline: boolean) {
  const crew = session.crew;
  track(crew ? 'crew_invite_clicked' : 'invite_clicked', { offline });
  const url = inviteUrl(room.code, session.identity.nickname, crew);

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
      .share({
        title: 'GETAWAY',
        text: crew ? `join [${crew.tag}] ${crew.name}` : 'steal a car. lose the cops.',
        url,
      })
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
