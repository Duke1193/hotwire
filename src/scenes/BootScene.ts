import Phaser from 'phaser';
import { buildTextures } from '../gfx/Textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create() {
    buildTextures(this);
    this.scene.start('game');
  }
}
