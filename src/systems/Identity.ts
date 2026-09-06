const KEY = 'getaway.identity';

export interface Identity {
  id: string;
  nickname: string;
  /** Optional X/Twitter handle, stored without the leading @. */
  handle?: string;
}

/** Deliberately mild: this only stops the most obvious nonsense. */
const BLOCKED = ['fuck', 'shit', 'cunt', 'nigg', 'fagg', 'rape', 'nazi', 'hitler', 'bitch', 'whore', 'slut'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

export function sanitizeNickname(raw: string): { ok: boolean; value: string; error?: string } {
  const value = raw
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 14)
    .replace(/[^\p{L}\p{N} _-]/gu, '');

  if (value.length < 2) return { ok: false, value, error: 'AT LEAST 2 CHARACTERS' };

  const flat = value
    .toLowerCase()
    .split('')
    .map((c) => LEET[c] ?? c)
    .join('')
    .replace(/[^a-z]/g, '');
  if (BLOCKED.some((word) => flat.includes(word))) return { ok: false, value, error: 'PICK ANOTHER NAME' };

  return { ok: true, value };
}

/**
 * X/Twitter handles are optional. We accept a pasted @name, a bare name or a
 * full profile URL, and keep only the handle itself.
 */
export function sanitizeHandle(raw: string): { ok: boolean; value?: string; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: undefined };

  const fromUrl = trimmed.match(/(?:twitter|x)\.com\/([^/?#]+)/i);
  const candidate = (fromUrl ? fromUrl[1] : trimmed).replace(/^@+/, '');
  const value = candidate.replace(/[^A-Za-z0-9_]/g, '').slice(0, 15);

  if (!value) return { ok: false, error: 'LETTERS, NUMBERS AND _ ONLY' };
  return { ok: true, value };
}

export function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Identity>;
    if (!parsed.id || !parsed.nickname) return null;
    return {
      id: parsed.id,
      nickname: parsed.nickname,
      handle: typeof parsed.handle === 'string' && parsed.handle ? parsed.handle : undefined,
    };
  } catch {
    return null;
  }
}

export function saveIdentity(nickname: string, existing?: Identity | null, handle?: string): Identity {
  const identity: Identity = { id: existing?.id ?? newId(), nickname, handle: handle || undefined };
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
