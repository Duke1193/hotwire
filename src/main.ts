import Phaser from 'phaser';
import { CAM, PEDS, TRAFFIC, WORLD } from './config';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { bootSession } from './session';
import { peekOverlay as getOverlay } from './ui/Overlay';
import { Analytics, track } from './systems/Analytics';
import { deviceType, hasTouch, isMobile, RENDER_SCALE, safeAreaInsets } from './util/device';
import { heatRight, hudTopInset, layout as gameLayout, setLayout } from './util/layout';

const parent = document.getElementById('game')!;

Analytics.init();
Analytics.setContext({ device_type: deviceType, mobile: isMobile, touch: hasTouch });
track('game_loaded');

/**
 * Phones get a smaller crowd and less traffic. The city still has to feel
 * inhabited, so the counts come down rather than the systems being switched
 * off, and the active radius shrinks with them so what you can see stays busy.
 */
if (isMobile) {
  // A phone screen is small but the player still needs to see a junction
  // coming, so the camera pulls back to roughly the desktop field of view.
  CAM.zoomFoot = 1.24;
  CAM.zoomCar = 1.12;
  CAM.zoomFast = 0.9;

  WORLD.propStep = 150;
  PEDS.count = 44;
  PEDS.despawn = 1000;
  PEDS.spawnMin = 520;
  PEDS.spawnMax = 950;
  TRAFFIC.count = 14;
  TRAFFIC.despawn = 1750;
  TRAFFIC.spawnMax = 1300;
}

/**
 * The visible area, not the window. `visualViewport` is the only thing that
 * knows how much of the screen Safari's chrome is currently taking.
 */
function viewport(): { w: number; h: number } {
  const vv = window.visualViewport;
  const rect = parent.getBoundingClientRect();
  const w = Math.round(vv?.width || rect.width || window.innerWidth || document.documentElement.clientWidth || 1280);
  const h = Math.round(vv?.height || rect.height || window.innerHeight || document.documentElement.clientHeight || 720);
  return { w: Math.max(w, 320), h: Math.max(h, 240) };
}

/** The on-screen keyboard shrinks the visual viewport; that is not a resize. */
function typing(): boolean {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

const initial = viewport();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent,
  backgroundColor: '#0b0d12',
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
    // The canvas is sized in device pixels and scaled back down by `zoom`, so
    // a retina phone renders sharp without us hand-managing canvas styles.
    width: initial.w * RENDER_SCALE,
    height: initial.h * RENDER_SCALE,
    zoom: 1 / RENDER_SCALE,
  },
  render: {
    antialias: true,
    powerPreference: 'high-performance',
  },
  input: {
    activePointers: 4,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0 },
      enableSleeping: false,
      debug: false,
    },
  },
  scene: [BootScene, GameScene, UIScene],
});

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__game = game;

// Scale.NONE keeps the canvas exactly where we put it; we drive the size.
let lastW = 0;
let lastH = 0;
function fit() {
  if (typing()) return;
  const { w, h } = viewport();
  if (w === lastW && h === lastH) return;
  lastW = w;
  lastH = h;

  // Publish the real size to CSS so the DOM overlay and the canvas agree to
  // the pixel — otherwise controls can end up under Safari's toolbar.
  const root = document.documentElement.style;
  root.setProperty('--gw-vw', `${w}px`);
  root.setProperty('--gw-vh', `${h}px`);

  setLayout(w, h);
  // Seed the column offset from the same formula the HUD publishes, so the
  // overlay is positioned correctly on the very first paint too.
  const safe = safeAreaInsets();
  root.setProperty('--gw-hud-top', `${hudTopInset(gameLayout.mode, safe.top)}px`);
  root.setProperty('--gw-heat-right', `${heatRight(gameLayout.mode, safe.left, w * RENDER_SCALE)}px`);
  document.documentElement.dataset.layout = gameLayout.mode;
  getOverlay()?.setLayout(gameLayout.mode);
  game.scale.resize(w * RENDER_SCALE, h * RENDER_SCALE);
}

window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => {
  // iOS reports the old size for a beat after the rotation animation starts.
  window.setTimeout(fit, 80);
  window.setTimeout(fit, 400);
});
window.visualViewport?.addEventListener('resize', fit);
// Safari moves the visual viewport as its toolbars collapse; that is a resize
// for our purposes even though no resize event fires.
window.visualViewport?.addEventListener('scroll', fit);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(parent);
game.events.once('ready', fit);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) window.setTimeout(fit, 60);
});

// Belt and braces: Safari does not reliably fire anything when the chrome
// changes. `fit` is a no-op unless the size actually changed.
window.setInterval(fit, 400);

document.addEventListener('visibilitychange', () => {
  track(document.hidden ? 'game_paused' : 'game_resumed');
});

// Resolves the room, asks for a nickname if needed, opens the realtime channel.
bootSession();
