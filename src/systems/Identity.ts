const KEY = 'getaway.identity';

export interface Identity {
  id: string;
  /**
   * One canonical display name. If it starts with `@` it is an X-style handle
   * and keeps the `@`; otherwise it is an ordinary nickname. We never infer a
   * handle from a plain string — `timobuilds_` is just a name.
   */
  name: string;
}

/** Deliberately mild: this only stops the most obvious nonsense. */
const BLOCKED = ['fuck', 'shit', 'cunt', 'nigg', 'fagg', 'rape', 'nazi', 'hitler', 'bitch', 'whore', 'slut'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

export const NAME_MAX = 16;

function offensive(value: string): boolean {
  const flat = value
    .toLowerCase()
    .split('')
    .map((c) => LEET[c] ?? c)
    .join('')
    .replace(/[^a-z]/g, '');
  return BLOCKED.some((word) => flat.includes(word));
}

/**
 * One field, two shapes. A leading `@` switches to handle rules (the character
 * set X allows); anything else is a nickname.
 */
export function sanitizeName(raw: string): { ok: boolean; value: string; error?: string } {
  const trimmed = raw.trim();

  if (trimmed.startsWith('@')) {
    const handle = trimmed.slice(1).replace(/[^A-Za-z0-9_]/g, '').slice(0, 15);
    if (handle.length < 2) return { ok: false, value: trimmed, error: 'HANDLE NEEDS 2+ CHARACTERS' };
    if (offensive(handle)) return { ok: false, value: trimmed, error: 'PICK ANOTHER NAME' };
    return { ok: true, value: `@${handle}` };
  }

  const name = trimmed
    .replace(/\s+/g, ' ')
    .slice(0, NAME_MAX)
    .replace(/[^\p{L}\p{N} _-]/gu, '');
  if (name.length < 2) return { ok: false, value: name, error: 'AT LEAST 2 CHARACTERS' };
  if (offensive(name)) return { ok: false, value: name, error: 'PICK ANOTHER NAME' };
  return { ok: true, value: name };
}

export function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string; name?: string; nickname?: string; handle?: string };
    if (!parsed.id) return null;

    // Migrate the old two-field record: a handle wins, otherwise the nickname.
    const name = parsed.name ?? (parsed.handle ? `@${parsed.handle}` : parsed.nickname);
    if (!name) return null;

    const checked = sanitizeName(name);
    return { id: parsed.id, name: checked.ok ? checked.value : name.slice(0, NAME_MAX) };
  } catch {
    return null;
  }
}

export function saveIdentity(name: string, existing?: Identity | null): Identity {
  const identity: Identity = { id: existing?.id ?? newId(), name };
  try {
    localStorage.setItem(KEY, JSON.stringify(identity));
  } catch {
    /* private browsing: play as a guest for this session */
  }
  return identity;
}

function newId(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return `p-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Stable per-player accent colour, derived from the id alone. */
export function accentFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hues = [0x4fc3f7, 0xffb74d, 0x81c784, 0xf06292, 0xba68c8, 0xffd54f, 0x4dd0e1, 0xff8a65];
  return hues[hash % hues.length];
}
