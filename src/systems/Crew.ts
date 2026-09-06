/**
 * Crews are deliberately tiny: a name, a tag and a colour, chosen locally and
 * announced through the multiplayer presence we already send. There is no crew
 * server, no membership approval and no roles — if two people say they are in
 * REDLINE, they are in REDLINE, and the room agrees because everyone can see
 * everyone's presence.
 */
const KEY = 'getaway.crew';

export interface Crew {
  /** Three-letter shorthand shown next to names. */
  tag: string;
  name: string;
  accent: number;
}

const ACCENTS = [0xff6b5e, 0x4fc3f7, 0xffd257, 0x7ee0a1, 0xba68c8, 0xff9d4d, 0x5ad1c4, 0xf06292];

/** Deterministic colour so the same crew looks the same on every client. */
export function crewAccent(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}

export function sanitizeCrewName(raw: string): { ok: boolean; value: string; error?: string } {
  const value = raw
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16)
    .replace(/[^\p{L}\p{N} _-]/gu, '');
  if (value.length < 2) return { ok: false, value, error: 'AT LEAST 2 CHARACTERS' };
  return { ok: true, value };
}

export function sanitizeTag(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3);
}

/** A tag derived from the name, used when the player does not pick one. */
export function tagFor(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (letters.slice(0, 3) || 'CRW').padEnd(3, 'X');
}

export function makeCrew(name: string, tag?: string): Crew {
  const finalTag = sanitizeTag(tag || '') || tagFor(name);
  return { name: name.toUpperCase(), tag: finalTag, accent: crewAccent(finalTag) };
}

export function loadCrew(): Crew | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Crew>;
    if (!parsed.tag || !parsed.name) return null;
    return { tag: parsed.tag, name: parsed.name, accent: crewAccent(parsed.tag) };
  } catch {
    return null;
  }
}

export function saveCrew(crew: Crew | null) {
  try {
    if (crew) localStorage.setItem(KEY, JSON.stringify(crew));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: crew lasts for this session only */
  }
}

/** `?crew=RDL&crewname=REDLINE` on an invite link. */
export function crewFromUrl(): Crew | null {
  const params = new URLSearchParams(window.location.search);
  const tag = sanitizeTag(params.get('crew') ?? '');
  if (!tag) return null;
  const name = (params.get('crewname') ?? tag).slice(0, 16).toUpperCase();
  return { tag, name, accent: crewAccent(tag) };
}
