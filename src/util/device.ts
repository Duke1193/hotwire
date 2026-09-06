/**
 * One place that decides what kind of machine we are on. Everything that
 * changes behaviour for phones reads from here, so there is a single answer
 * and a single place to tune it.
 */

const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const touchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;

export const hasTouch = coarse || touchPoints;

const shortEdge = Math.min(window.screen?.width ?? 1920, window.screen?.height ?? 1080);

export const deviceType: 'desktop' | 'mobile' | 'tablet' = !hasTouch
  ? 'desktop'
  : shortEdge < 560
    ? 'mobile'
    : 'tablet';

export const isMobile = deviceType !== 'desktop';

/**
 * Phones are high-DPI, so a 1:1 canvas looks soft. We render at up to 2x and
 * let CSS scale it back down; 3x costs more than it is worth. Desktop is left
 * exactly as it was.
 */
export const RENDER_SCALE = isMobile ? Math.min(window.devicePixelRatio || 1, 2) : 1;

/**
 * HUD sizing. A phone screen is physically small, so the same CSS-pixel HUD
 * eats far more of it than on a desktop; trim it a little there.
 */
export const UI_SCALE = RENDER_SCALE * (isMobile ? 0.82 : 1);

/** iOS Safari has no Vibration API, so this is a no-op there by design. */
export function haptic(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Reads the CSS environment safe areas through a probe element, because
 * canvas layout has no other way to see a notch or a home indicator.
 */
export function safeAreaInsets(): Insets {
  if (!isMobile) return { top: 0, right: 0, bottom: 0, left: 0 };
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
    'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const insets = {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
  probe.remove();
  return insets;
}
