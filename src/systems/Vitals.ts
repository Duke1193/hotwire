import { VITALS } from '../config';
import { clamp } from '../util/math';

export interface DamageResult {
  applied: number;
  killed: boolean;
}

/**
 * Health with an armour buffer in front of it. Deliberately forgiving: a phone
 * player holding a fire button should not lose a fight to reaction time alone.
 */
export class Vitals {
  health = VITALS.maxHealth;
  armor = 0;
  down = false;
  /** Seconds left of post-respawn immunity. */
  protection = 0;
  /** Seconds until health starts creeping back. */
  private sinceHit = VITALS.regenDelay;

  get healthRatio() {
    return this.health / VITALS.maxHealth;
  }
  get armorRatio() {
    return this.armor / VITALS.maxArmor;
  }
  get invulnerable() {
    return this.down || this.protection > 0;
  }

  damage(amount: number): DamageResult {
    if (this.invulnerable || amount <= 0) return { applied: 0, killed: false };
    this.sinceHit = 0;

    // Armour soaks most of a hit before health is touched.
    const toArmor = Math.min(this.armor, amount * 0.7);
    this.armor -= toArmor;
    const toHealth = amount - toArmor;
    this.health = clamp(this.health - toHealth, 0, VITALS.maxHealth);

    const killed = this.health <= 0;
    if (killed) this.down = true;
    return { applied: amount, killed };
  }

  heal(amount: number) {
    this.health = clamp(this.health + amount, 0, VITALS.maxHealth);
  }

  addArmor(amount: number) {
    this.armor = clamp(this.armor + amount, 0, VITALS.maxArmor);
  }

  respawn() {
    this.health = VITALS.maxHealth;
    this.armor = 0;
    this.down = false;
    this.protection = VITALS.spawnProtection;
    this.sinceHit = VITALS.regenDelay;
  }

  update(dtMs: number) {
    const dt = dtMs / 1000;
    this.protection = Math.max(0, this.protection - dt);
    if (this.down) return;

    this.sinceHit += dt;
    if (this.sinceHit >= VITALS.regenDelay && this.health < VITALS.maxHealth) {
      this.health = clamp(this.health + VITALS.regenRate * dt, 0, VITALS.maxHealth);
    }
  }
}
