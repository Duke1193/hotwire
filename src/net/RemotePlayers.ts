import Phaser from 'phaser';
import { NET } from '../config';
import { accentFor } from '../systems/Identity';
import type { MultiplayerSystem, Peer, Sample } from './Multiplayer';

interface Avatar {
  body: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  tag: Phaser.GameObjects.Text;
  key: string;
}

/**
 * Remote humans are drawn, not simulated.
 *
 * V1 COMPROMISE (deliberate): remote players are plain Images with no Matter
 * body, so you cannot crash into your friend and neither client has to agree
 * about the outcome. Networked vehicle collisions would need shared authority
 * over both cars' physics; that is out of scope for this milestone. The
 * experience we want is "I can see my friend driving around the same city".
 */
export class RemotePlayers {
  private avatars = new Map<string, Avatar>();

  constructor(private scene: Phaser.Scene, private net: MultiplayerSystem) {}

  update() {
    const renderTime = performance.now() - NET.interpDelay;

    for (const peer of this.net.peers.values()) {
      if (!peer.samples.length) continue;
      const avatar = this.ensure(peer);
      const pose = sampleAt(peer.samples, renderTime);

      const key = textureKey(pose.inVehicle, pose.vehicleType);
      if (key !== avatar.key && this.scene.textures.exists(key)) {
        avatar.body.setTexture(key);
        avatar.key = key;
      }

      avatar.body.setPosition(pose.x, pose.y).setRotation(pose.rotation);
      avatar.ring.setPosition(pose.x, pose.y);
      avatar.tag.setPosition(pose.x, pose.y - (pose.inVehicle ? 34 : 28));
    }

    for (const [id, avatar] of this.avatars) {
      if (this.net.peers.has(id)) continue;
      avatar.body.destroy();
      avatar.ring.destroy();
      avatar.tag.destroy();
      this.avatars.delete(id);
    }
  }

  private ensure(peer: Peer): Avatar {
    const found = this.avatars.get(peer.id);
    if (found) {
      if (found.tag.text !== peer.nickname.toUpperCase()) found.tag.setText(peer.nickname.toUpperCase());
      return found;
    }

    const accent = accentFor(peer.id);
    const key = 'ped-1';
    const avatar: Avatar = {
      ring: this.scene.add.image(0, 0, 'marker').setScale(0.42).setTint(accent).setAlpha(0.45).setDepth(7),
      body: this.scene.add.image(0, 0, key).setDepth(12),
      tag: this.scene.add
        .text(0, 0, peer.nickname.toUpperCase(), {
          fontFamily: 'ui-monospace, Menlo, monospace',
          fontSize: '11px',
          color: '#eef2fb',
          backgroundColor: '#0e1118cc',
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5, 1)
        .setDepth(31),
      key,
    };
    avatar.tag.setColor(`#${accent.toString(16).padStart(6, '0')}`);
    this.avatars.set(peer.id, avatar);
    return avatar;
  }

  destroy() {
    for (const avatar of this.avatars.values()) {
      avatar.body.destroy();
      avatar.ring.destroy();
      avatar.tag.destroy();
    }
    this.avatars.clear();
  }
}

function textureKey(inVehicle: boolean, vehicleType: string): string {
  return inVehicle ? vehicleType || 'car-sedan' : 'ped-1';
}

/**
 * Play the peer back slightly in the past so there is always a sample either
 * side to interpolate between; beyond the last sample, coast on its velocity
 * for a moment rather than freezing.
 */
function sampleAt(samples: Sample[], time: number): Sample {
  const last = samples[samples.length - 1];
  if (samples.length === 1 || time >= last.t) {
    const ahead = Math.min(260, time - last.t) / 16.6667;
    return {
      ...last,
      x: last.x + last.velocityX * ahead,
      y: last.y + last.velocityY * ahead,
    };
  }

  for (let i = samples.length - 1; i > 0; i--) {
    const b = samples[i];
    const a = samples[i - 1];
    if (time >= a.t && time <= b.t) {
      const span = b.t - a.t || 1;
      const t = (time - a.t) / span;
      return {
        ...b,
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        rotation: a.rotation + Phaser.Math.Angle.Wrap(b.rotation - a.rotation) * t,
      };
    }
  }
  return samples[0];
}
