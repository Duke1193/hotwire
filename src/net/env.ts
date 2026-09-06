/**
 * Reads the realtime configuration out of the build environment.
 *
 * Everything in a VITE_ variable is shipped to every player, so this module
 * also refuses anything that looks like a secret or service-role key rather
 * than quietly publishing it.
 */

export interface SupabaseConfig {
  url: string;
  key: string;
  /** Which variable supplied the key, for diagnostics only. */
  source: 'publishable' | 'anon';
}

export type ConfigProblem = 'missing' | 'secret-key' | 'bad-url';

export interface ConfigResult {
  config: SupabaseConfig | null;
  problem?: ConfigProblem;
}

/** Secret keys must never reach a browser bundle. */
function looksSecret(key: string): boolean {
  if (/^sb_secret_/i.test(key)) return true;
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      const role = (JSON.parse(json) as { role?: unknown }).role;
      if (typeof role === 'string' && role !== 'anon') return true;
    } catch {
      // not a JWT we can read; fall through to the other checks
    }
  }
  return /service_role/i.test(key);
}

export function readSupabaseConfig(): ConfigResult {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  // Modern publishable key first, legacy anon key as a fallback.
  const publishable = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  const key = publishable || anon;

  if (!url || !key) return { config: null, problem: 'missing' };
  if (!/^https?:\/\//i.test(url)) {
    console.error('[net] VITE_SUPABASE_URL must be a full https:// URL. Multiplayer disabled.');
    return { config: null, problem: 'bad-url' };
  }
  if (looksSecret(key)) {
    console.error(
      '[net] The configured Supabase key looks like a secret/service_role key. ' +
        'Refusing to use it in the browser — set VITE_SUPABASE_PUBLISHABLE_KEY instead. Multiplayer disabled.',
    );
    return { config: null, problem: 'secret-key' };
  }

  return { config: { url, key, source: publishable ? 'publishable' : 'anon' } };
}
