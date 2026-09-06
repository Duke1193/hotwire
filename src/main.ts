import Phaser from 'phaser';
import { CAM, PEDS, TRAFFIC, WORLD } from './config';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { bootSession } from './session';
import { Analytics, track } from './systems/Analytics';
import { deviceType, hasTouch, isMobile, RENDER_SCALE } from './util/device';

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

// Some embedders report 0 for the viewport on first paint, so clamp.
function viewport(): { w: number; h: number } {
  const r = parent.getBoundingClientRect();
  const w = Math.round(r.width || window.innerWidth || document.documentElement.clientWidth || 1280);
  const h = Math.round(r.height || window.innerHeight || document.documentElement.clientHeight || 720);
  return { w: Math.max(w, 320), h: Math.max(h, 240) };
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
  const { w, h } = viewport();
  if (w === lastW && h === lastH) return;
  lastW = w;
  lastH = h;
  game.scale.resize(w * RENDER_SCALE, h * RENDER_SCALE);
}

window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => window.setTimeout(fit, 120));
window.visualViewport?.addEventListener('resize', fit);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(parent);
game.events.once('ready', fit);

// Mobile Safari does not always fire an event when the address bar collapses
// or the device rotates. `fit` is a no-op unless the size actually changed,
// so polling it is the cheapest way to never be left at the wrong size.
window.setInterval(fit, 500);

document.addEventListener('visibilitychange', () => {
  track(document.hidden ? 'game_paused' : 'game_resumed');
});

// Resolves the room, asks for a nickname if needed, opens the realtime channel.
bootSession();
