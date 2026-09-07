import { hasTouch, RENDER_SCALE, UI_SCALE } from './device';

export type LayoutMode = 'desktop' | 'portrait' | 'landscape';

/**
 * The one place that knows how big the game actually is.
 *
 * "Actually" matters: on iOS Safari the window is not the visible area — the
 * address bar and toolbar eat a large slice of it, and that slice changes as
 * you scroll. Everything here is measured from `visualViewport` where it
 * exists, and every layout in the game reads these values rather than the
 * screen size.
 */
export const layout = {
  mode: 'desktop' as LayoutMode,
  /** Visible CSS pixels. */
  width: 1280,
  height: 720,
};

/**
 * How far down the DOM overlay's column has to start so it clears the meters
 * the canvas draws in the top-left, in CSS pixels.
 *
 * This is the only definition of that number. The HUD publishes it from its
 * own measured region once it has rendered, and `main.ts` seeds the same value
 * from the same formula while the game is still booting, so the layout is
 * never resting on a guessed offset.
 */
export function hudTopInset(mode: LayoutMode, safeTop: number): number {
  const portrait = mode === 'portrait';
  const marginUnits = portrait ? 12 : 18;
  const meterUnits = portrait ? 132 : 146;
  return Math.round(((marginUnits + meterUnits) * UI_SCALE) / RENDER_SCALE + safeTop);
}

/**
 * How wide the HEAT meter is drawn, in canvas units. Portrait shares the top
 * band with the utility stack, so the meter there takes only what it needs.
 */
export function heatBarWidth(mode: LayoutMode, canvasWidth: number): number {
  return mode === 'portrait'
    ? Math.min(124 * UI_SCALE, canvasWidth * 0.34)
    : Math.min(250 * UI_SCALE, canvasWidth * 0.34);
}

/**
 * Where the HEAT block ends across, in CSS pixels: the plate plus the three
 * level pips outside it. The DOM top-right stack starts from this, so the two
 * can share the top band without either one guessing at the other's size.
 */
export function heatRight(mode: LayoutMode, safeLeft: number, canvasWidth: number): number {
  const left = 12 * UI_SCALE + safeLeft * RENDER_SCALE;
  return Math.round((left + heatBarWidth(mode, canvasWidth) + 34 * UI_SCALE) / RENDER_SCALE);
}

export function modeFor(width: number, height: number): LayoutMode {
  if (!hasTouch) return 'desktop';
  return height >= width ? 'portrait' : 'landscape';
}

/** Returns true when the mode changed, so listeners can relayout. */
export function setLayout(width: number, height: number): boolean {
  const mode = modeFor(width, height);
  const changed = mode !== layout.mode;
  layout.mode = mode;
  layout.width = width;
  layout.height = height;
  return changed;
}
