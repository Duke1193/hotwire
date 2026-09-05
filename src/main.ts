import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';

const parent = document.getElementById('game')!;

/** Some embedders report 0 for the viewport on first paint, so clamp. */
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
    width: initial.w,
    height: initial.h,
  },
  render: {
    antialias: true,
    powerPreference: 'high-performance',
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

// Scale.NONE keeps the canvas exactly where we put it; we drive the size.
let lastW = 0;
let lastH = 0;
function fit() {
  const { w, h } = viewport();
  if (w === lastW && h === lastH) return;
  lastW = w;
  lastH = h;
  game.scale.resize(w, h);
}

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__game = game;

window.addEventListener('resize', fit);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(parent);
game.events.once('ready', fit);
