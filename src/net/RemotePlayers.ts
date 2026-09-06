import Phaser from 'phaser';
import { NET } from '../config';
import type { HitTarget } from '../systems/Combat';
import { accentFor } from '../systems/Identity';
import { PlayerLabel } from '../ui/PlayerLabel';
import type { MultiplayerSystem, Peer, Sample } from './Multiplayer';

interface Avatar {
  body: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  label: PlayerLabel;
  key: string;
  x: number;
  y: number;
  onFoot: boolean;
  down: boolean;
}

/**
 * Remote humans are drawn, not simulated.
 *
 * V1 COMPROMISE (deliberate): remote players are plain Images with no Matter
 * body, so you cannot crash into your friend and neither client has to agree
 * about the outcome. Networked vehicle collisions would need shared authority
 * over both cars' physics; that is out of scope.
 *
 * The same compromise decides who can be shot: only players **on foot** are
 * targets. A car is treated as cover, which keeps gunfights readable and means
 * nobody is shot out of a vehicle they cannot fight back from.
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

      avatar.x = pose.x;
      avatar.y = pose.y;
      avatar.onFoot = !pose.inVehicle;
      avatar.down = peer.down || pose.down;

      avatar.body.setPosition(pose.x, pose.y).setRotation(pose.rotation).setAlpha(avatar.down ? 0.3 : 1);
      avatar.ring.setPosition(pose.x, pose.y).setAlpha(avatar.down ? 0.15 : 0.45);
      avatar.label.setIdentity({ name: peer.nickname, crewTag: peer.crewTag, accent: accentFor(peer.id) });
      // Remote labels stay up whether they are walking or driving: recognising
      // who is who is the whole point of playing together.
      avatar.label.update(pose.x, pose.y, pose.inVehicle ? 34 : 28, avatar.down ? 0.35 : 1);
    }

    for (const [id, avatar] of this.avatars) {
      if (this.net.peers.has(id)) continue;
      avatar.body.destroy();
      avatar.ring.destroy();
      avatar.label.destroy();
      this.avatars.delete(id);
    }
  }

  /** Fills `out` with the remote players our bullets can hit. */
  hitTargets(out: HitTarget[]): HitTarget[] {
    out.length = 0;
    for (const [id, avatar] of this.avatars) {
      if (!avatar.onFoot || avatar.down) continue;
      out.push({ id, x: avatar.x, y: avatar.y });
    }
    return out;
  }

  positionOf(id: string): { x: number; y: number } | null {
    const avatar = this.avatars.get(id);
    return avatar ? { x: avatar.x, y: avatar.y } : null;
  }

  private ensure(peer: Peer): Avatar {
    const found = this.avatars.get(peer.id);
    if (found) return found;

    const accent = accentFor(peer.id);
    const key = 'ped-1';
    const avatar: Avatar = {
      ring: this.scene.add.image(0, 0, 'marker').setScale(0.42).setTint(accent).setAlpha(0.45).setDepth(7),
      body: this.scene.add.image(0, 0, key).setDepth(12),
      label: new PlayerLabel(this.scene, { name: peer.nickname, crewTag: peer.crewTag, accent }),
      key,
      x: 0,
      y: 0,
      onFoot: true,
      down: false,
    };
    this.avatars.set(peer.id, avatar);
    return avatar;
  }

  destroy() {
    for (const avatar of this.avatars.values()) {
      avatar.body.destroy();
      avatar.ring.destroy();
      avatar.label.destroy();
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
    return { ...last, x: last.x + last.velocityX * ahead, y: last.y + last.velocityY * ahead };
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
