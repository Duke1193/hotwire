import './overlay.css';
import type { NetStatus } from '../net/Transport';
import type { RoomInfo } from '../net/Room';
import { hasTouch } from '../util/device';

export interface RosterEntry {
  name: string;
  score: number;
  self: boolean;
}

/**
 * Everything that is not the game itself: nickname, room, invite, roster.
 * Plain DOM on purpose — it costs the renderer nothing and it is the part
 * players need to be able to select, tap and read.
 */
export class Overlay {
  onPlay: ((nickname: string) => void) | null = null;
  onInvite: (() => void) | null = null;
  onSound: ((muted: boolean) => void) | null = null;
  onHeatRun: (() => void) | null = null;

  private root: HTMLDivElement;
  private boot: HTMLDivElement;
  private input: HTMLInputElement;
  private error: HTMLParagraphElement;
  private roomChip: HTMLDivElement;
  private roomLabel: HTMLSpanElement;
  private onlineLabel: HTMLElement;
  private inviteBtn: HTMLButtonElement;
  private soundBtn: HTMLButtonElement;
  private panel: HTMLDivElement;
  private rows: HTMLDivElement;
  private toasts: HTMLDivElement;
  private nudge: HTMLDivElement;
  private nudgeText: HTMLParagraphElement;
  private rotate!: HTMLDivElement;

  constructor(muted: boolean) {
    this.root = document.createElement('div');
    this.root.className = 'gw-root';
    this.root.innerHTML = `
      <div class="gw-hud">
        <div class="gw-chip" id="gw-room" data-status="offline" title="Players in this city">
          <span class="gw-dot"></span><span id="gw-roomcode">ROOM ····</span><b id="gw-online">1 ONLINE</b>
        </div>
        <button class="gw-btn" id="gw-invite">INVITE</button>
        <button class="gw-icon" id="gw-sound" title="Sound"></button>
      </div>
      <div class="gw-panel gw-hidden" id="gw-panel">
        <h3>IN THIS CITY</h3>
        <div id="gw-rows"></div>
        <button class="gw-run" id="gw-run">START HEAT RUN</button>
      </div>
      <div class="gw-toasts" id="gw-toasts"></div>
      <div class="gw-nudge gw-hidden" id="gw-nudge">
        <p id="gw-nudge-text">THAT WAS CLOSE.</p>
        <button id="gw-nudge-invite">INVITE A FRIEND</button>
        <button class="gw-x" id="gw-nudge-close">✕</button>
      </div>
      <div class="gw-rotate gw-hidden" id="gw-rotate">
        <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <rect x="20" y="6" width="24" height="42" rx="4" stroke="#69d8ff" stroke-width="2.5" />
          <rect x="27" y="10" width="10" height="2" rx="1" fill="#69d8ff" opacity="0.7" />
          <circle cx="32" cy="43" r="1.8" fill="#69d8ff" opacity="0.7" />
          <path d="M14 54a22 22 0 0 0 36 0" stroke="#39415a" stroke-width="2" stroke-linecap="round" />
          <path d="M50 54l-5-4M50 54l-5 4" stroke="#39415a" stroke-width="2" stroke-linecap="round" />
        </svg>
        <p>ROTATE TO PLAY</p>
        <small>GETAWAY RUNS IN LANDSCAPE</small>
      </div>
      <div class="gw-boot gw-hidden" id="gw-boot">
        <div class="gw-boot-inner">
          <h1>GETAWAY</h1>
          <p class="gw-sub">enter the city.</p>
          <p class="gw-join gw-hidden" id="gw-joining"></p>
          <label for="gw-nick">NICKNAME</label>
          <input id="gw-nick" maxlength="14" autocomplete="off" spellcheck="false" placeholder="" />
          <p class="gw-err" id="gw-err"></p>
          <button class="gw-play" id="gw-play">PLAY</button>
        </div>
      </div>`;
    document.body.appendChild(this.root);

    const q = <T extends HTMLElement>(id: string) => this.root.querySelector(`#${id}`) as T;
    this.boot = q('gw-boot');
    this.input = q('gw-nick');
    this.error = q('gw-err');
    this.roomChip = q('gw-room');
    this.roomLabel = q('gw-roomcode');
    this.onlineLabel = q('gw-online');
    this.inviteBtn = q('gw-invite');
    this.soundBtn = q('gw-sound');
    this.panel = q('gw-panel');
    this.rows = q('gw-rows');
    this.toasts = q('gw-toasts');
    this.nudge = q('gw-nudge');
    this.nudgeText = q('gw-nudge-text');
    this.rotate = q('gw-rotate');
    this.watchOrientation();

    q('gw-play').addEventListener('click', () => this.submit());
    this.input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') this.submit();
      e.stopPropagation();
    });
    this.inviteBtn.addEventListener('click', () => this.onInvite?.());
    q('gw-nudge-invite').addEventListener('click', () => {
      this.onInvite?.();
      this.hideNudge();
    });
    q('gw-nudge-close').addEventListener('click', () => this.hideNudge());
    this.roomChip.addEventListener('click', () => this.panel.classList.toggle('gw-hidden'));
    q('gw-run').addEventListener('click', () => this.onHeatRun?.());
    this.soundBtn.addEventListener('click', () => {
      const next = this.soundBtn.dataset.muted !== '1';
      this.setMuted(next);
      this.onSound?.(next);
    });
    this.setMuted(muted);
  }

  /**
   * Landscape is the intended way to play on a phone. We cannot force it —
   * the Screen Orientation lock API is not available to Safari here — so we
   * ask, and get out of the way the moment the phone is turned.
   */
  private watchOrientation() {
    if (!hasTouch) return;
    const query = matchMedia('(orientation: portrait)');
    const apply = () => this.rotate.classList.toggle('gw-hidden', !query.matches);
    apply();
    if (query.addEventListener) query.addEventListener('change', apply);
    else query.addListener(apply);
    window.addEventListener('orientationchange', () => window.setTimeout(apply, 150));
    // Same belt-and-braces as the canvas sizing: Safari can miss the event.
    window.setInterval(apply, 600);
  }

  // ------------------------------------------------------------ nickname

  showBoot(room: RoomInfo, suggested: string) {
    this.boot.classList.remove('gw-hidden');
    this.input.value = suggested;
    if (room.invited) {
      const join = this.root.querySelector('#gw-joining') as HTMLElement;
      join.textContent = room.host
        ? `JOINING ${room.host.toUpperCase()}' CITY`
        : `JOINING ROOM ${room.code}`;
      join.classList.remove('gw-hidden');
    }
    window.setTimeout(() => this.input.focus(), 60);
  }

  private submit() {
    const value = this.input.value;
    this.error.textContent = '';
    this.onPlay?.(value);
  }

  rejectNickname(message: string) {
    this.error.textContent = message;
    this.input.focus();
  }

  hideBoot() {
    this.boot.classList.add('gw-hidden');
  }

  // ---------------------------------------------------------------- room

  setRoom(code: string, online: number, status: NetStatus) {
    this.roomLabel.textContent = `ROOM ${code}`;
    this.onlineLabel.textContent = status === 'offline' ? 'OFFLINE' : `${online} ONLINE`;
    this.roomChip.dataset.status = status;
  }

  setRoster(entries: RosterEntry[]) {
    this.rows.textContent = '';
    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = `gw-row${entry.self ? ' gw-me' : ''}`;
      const name = document.createElement('span');
      name.textContent = entry.name.toUpperCase();
      const score = document.createElement('span');
      score.textContent = entry.score.toLocaleString('en-US');
      row.append(name, score);
      this.rows.appendChild(row);
    }
  }

  // -------------------------------------------------------------- notices

  toast(text: string, ms = 2600) {
    const el = document.createElement('div');
    el.className = 'gw-toast';
    el.textContent = text;
    this.toasts.appendChild(el);
    window.setTimeout(() => el.classList.add('gw-out'), ms - 400);
    window.setTimeout(() => el.remove(), ms);
  }

  flashInvite(text: string) {
    this.inviteBtn.textContent = text;
    this.inviteBtn.classList.add('gw-copied');
    window.setTimeout(() => {
      this.inviteBtn.textContent = 'INVITE';
      this.inviteBtn.classList.remove('gw-copied');
    }, 2200);
  }

  showNudge(text: string) {
    this.nudgeText.textContent = text;
    this.nudge.classList.remove('gw-hidden');
    window.setTimeout(() => this.hideNudge(), 12000);
  }

  hideNudge() {
    this.nudge.classList.add('gw-hidden');
  }

  private setMuted(muted: boolean) {
    this.soundBtn.dataset.muted = muted ? '1' : '0';
    this.soundBtn.textContent = muted ? '🔇' : '🔊';
  }
}

let overlay: Overlay | null = null;

export function initOverlay(muted: boolean): Overlay {
  overlay ??= new Overlay(muted);
  return overlay;
}

export function getOverlay(): Overlay {
  if (!overlay) throw new Error('overlay not initialised');
  return overlay;
}
