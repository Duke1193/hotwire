/** Unambiguous in a spoken or hand-typed invite: no O/0, no I/1. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function makeRoomCode(length = 4): string {
  let code = '';
  for (let i = 0; i < length; i++) code += ALPHABET[(Math.random() * ALPHABET.length) | 0];
  return code;
}

export function normalizeRoomCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return code.length >= 3 ? code : null;
}

export interface RoomInfo {
  code: string;
  /** True when the player arrived through someone else's link. */
  invited: boolean;
  /** Nickname of the inviter, when the link carried one. */
  host: string | null;
}

/** Read the room from the URL, or mint one and put it there. */
export function resolveRoom(): RoomInfo {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('room');
  const host = params.get('host');
  const existing = raw ? normalizeRoomCode(raw) : null;

  if (existing) return { code: existing, invited: true, host: host ? host.slice(0, 14) : null };

  const code = makeRoomCode();
  params.set('room', code);
  const url = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  window.history.replaceState({}, '', url);
  return { code, invited: false, host: null };
}

/** The link to hand to a friend. */
export function inviteUrl(code: string, nickname: string): string {
  const params = new URLSearchParams();
  params.set('room', code);
  if (nickname) params.set('host', nickname.slice(0, 14));
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}
