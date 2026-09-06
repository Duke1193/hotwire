import './overlay.css';
import type { NetStatus } from '../net/Transport';
import type { RoomInfo } from '../net/Room';
import type { Crew } from '../systems/Crew';
import type { Objective } from '../systems/Objectives';
import { hasTouch } from '../util/device';

export interface RosterEntry {
  name: string;
  crewTag?: string;
  score: number;
  kills: number;
  self: boolean;
}

export interface CrewRow {
  tag: string;
  name: string;
  points: number;
  accent: number;
}

const DESKTOP_CONTROLS: [string, string][] = [
  ['W A S D', 'MOVE / DRIVE'],
  ['E', 'ENTER / EXIT VEHICLE'],
  ['SPACE', 'HANDBRAKE'],
  ['MOUSE', 'AIM'],
  ['CLICK', 'FIRE'],
  ['TAB', 'SCOREBOARD'],
  ['ESC', 'SETTINGS'],
];

const TOUCH_CONTROLS: [string, string][] = [
  ['LEFT STICK', 'MOVE / STEER'],
  ['GO', 'ACCELERATE'],
  ['BRAKE', 'BRAKE / REVERSE'],
  ['DRIFT', 'HANDBRAKE'],
  ['ENTER / EXIT', 'CONTEXT ACTION'],
  ['FIRE', 'SHOOT ON FOOT'],
];

/**
 * Everything that is not the game itself.
 *
 * The DOM owns the whole top-right column — room, invite, settings and the
 * persistent objective card — while the canvas owns the top-left meters and
 * the bottom-right speed. Splitting the screen by owner is what keeps the
 * speed readout and the objective from ever landing on top of each other.
 */
export class Overlay {
  onPlay: ((name: string) => void) | null = null;
  onContinue: (() => void) | null = null;
  onNewRun: (() => void) | null = null;
  onInvite: (() => void) | null = null;
  onSound: ((muted: boolean) => void) | null = null;
  onHeatRun: (() => void) | null = null;
  onCrewWar: (() => void) | null = null;
  onAnalyticsChoice: ((enabled: boolean) => void) | null = null;
  onIdentityChange: ((name: string) => void) | null = null;
  onCrewChange: ((name: string, tag: string) => void) | null = null;
  onCrewLeave: (() => void) | null = null;
  onScoreboardOpen: (() => void) | null = null;
  onSettingsOpen: (() => void) | null = null;

  private root: HTMLDivElement;
  private q<T extends HTMLElement>(id: string): T {
    return this.root.querySelector(`#${id}`) as T;
  }

  private boot!: HTMLDivElement;
  private bootNew!: HTMLDivElement;
  private bootResume!: HTMLDivElement;
  private nameInput!: HTMLInputElement;
  private error!: HTMLElement;
  private roomChip!: HTMLDivElement;
  private roomLabel!: HTMLElement;
  private onlineLabel!: HTMLElement;
  private inviteBtn!: HTMLButtonElement;
  private soundBtn!: HTMLButtonElement;
  private board!: HTMLDivElement;
  private playerRows!: HTMLDivElement;
  private crewRows!: HTMLDivElement;
  private objective!: HTMLDivElement;
  private feed!: HTMLDivElement;
  private toasts!: HTMLDivElement;
  private nudge!: HTMLDivElement;
  private nudgeText!: HTMLElement;
  private settings!: HTMLDivElement;
  private analyticsToggle!: HTMLButtonElement;
  private privacyNote!: HTMLElement;
  private diag!: HTMLDivElement;
  private crewState!: HTMLDivElement;
  private crewNameInput!: HTMLInputElement;
  private crewTagInput!: HTMLInputElement;
  private setNameInput!: HTMLInputElement;
  private settingsObjective!: HTMLElement;
  private settingsRoom!: HTMLElement;

  constructor(muted: boolean) {
    this.root = document.createElement('div');
    this.root.className = 'gw-root';
    this.root.innerHTML = this.markup();
    document.body.appendChild(this.root);
    this.bind();
    this.setMuted(muted);
    this.renderControls();
  }

  // ------------------------------------------------------------------ markup

  private markup(): string {
    return `
      <div class="gw-column">
        <div class="gw-hud">
          <div class="gw-chip" id="gw-room" data-status="offline" title="Scoreboard">
            <span class="gw-dot"></span><span id="gw-roomcode">ROOM ····</span><b id="gw-online">OFFLINE</b>
          </div>
          <button class="gw-btn" id="gw-invite">INVITE</button>
          <button class="gw-icon" id="gw-sound" title="Sound"></button>
          <button class="gw-icon" id="gw-settings-btn" title="Settings and help">☰</button>
        </div>
        <div class="gw-objective gw-hidden" id="gw-objective">
          <h4 id="gw-obj-title">FREE ROAM</h4>
          <p id="gw-obj-line">Find a job</p>
          <div class="gw-obj-meta"><span id="gw-obj-distance"></span><span id="gw-obj-timer"></span></div>
          <div class="gw-obj-extra gw-hidden" id="gw-obj-extra"></div>
        </div>
        <div class="gw-feed" id="gw-feed"></div>
      <div class="gw-panel gw-hidden" id="gw-board">
        <h3>PLAYERS</h3>
        <div id="gw-player-rows"></div>
        <h3 class="gw-crews-head">CREWS</h3>
        <div id="gw-crew-rows"></div>
        <div class="gw-panel-actions">
          <button class="gw-run" id="gw-heatrun">START HEAT RUN</button>
          <button class="gw-run gw-war" id="gw-crewwar">START CREW WAR</button>
        </div>
      </div>
      </div>

      <div class="gw-toasts" id="gw-toasts"></div>

      <div class="gw-nudge gw-hidden" id="gw-nudge">
        <p id="gw-nudge-text">THAT WAS CLOSE.</p>
        <button id="gw-nudge-invite">INVITE A FRIEND</button>
        <button class="gw-x" id="gw-nudge-close">✕</button>
      </div>

      <div class="gw-boot gw-hidden" id="gw-boot">
        <div class="gw-boot-inner" id="gw-boot-new">
          <h1>GETAWAY</h1>
          <p class="gw-sub">enter the city.</p>
          <p class="gw-join gw-hidden" id="gw-joining"></p>
          <label for="gw-name">NICKNAME OR @X HANDLE</label>
          <input id="gw-name" maxlength="17" autocomplete="off" autocapitalize="off" spellcheck="false"
                 placeholder="Timo or @timobuilds_" />
          <p class="gw-err" id="gw-err"></p>
          <button class="gw-play" id="gw-play">PLAY</button>
          <p class="gw-fine">no account · anonymous analytics · <button class="gw-link" data-privacy>PRIVACY</button></p>
        </div>
        <div class="gw-boot-inner gw-hidden" id="gw-boot-resume">
          <h1>GETAWAY</h1>
          <p class="gw-sub" id="gw-welcome">welcome back.</p>
          <div class="gw-stats">
            <div><span id="gw-resume-score">0</span><small>SCORE</small></div>
            <div><span id="gw-resume-best">0</span><small>BEST</small></div>
          </div>
          <button class="gw-play" id="gw-continue">CONTINUE</button>
          <button class="gw-secondary" id="gw-newrun">NEW RUN</button>
          <p class="gw-fine">no account · anonymous analytics · <button class="gw-link" data-privacy>PRIVACY</button></p>
        </div>
      </div>

      <div class="gw-modal gw-hidden" id="gw-settings">
        <div class="gw-modal-inner">
          <div class="gw-modal-head"><h2>SETTINGS &amp; HELP</h2><button class="gw-x" id="gw-settings-close">✕</button></div>

          <section><h3>CONTROLS</h3><div class="gw-keys" id="gw-controls"></div></section>

          <section><h3>PLAYER</h3>
            <div class="gw-field"><label for="gw-set-name">NAME</label><input id="gw-set-name" maxlength="17" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Timo or @timobuilds_" /></div>
            <button class="gw-secondary" id="gw-save-player">SAVE NAME</button>
          </section>

          <section><h3>CREW</h3>
            <p class="gw-state" id="gw-crew-state">NO CREW</p>
            <div class="gw-field"><label for="gw-crew-name">CREW NAME</label><input id="gw-crew-name" maxlength="16" autocomplete="off" spellcheck="false" placeholder="REDLINE" /></div>
            <div class="gw-field"><label for="gw-crew-tag">TAG</label><input id="gw-crew-tag" maxlength="3" autocomplete="off" spellcheck="false" placeholder="RDL" /></div>
            <div class="gw-row-actions">
              <button class="gw-secondary" id="gw-crew-save">CREATE / JOIN</button>
              <button class="gw-secondary" id="gw-crew-leave">LEAVE</button>
            </div>
          </section>

          <section><h3>ROOM</h3>
            <p class="gw-state" id="gw-settings-room">—</p>
            <button class="gw-secondary" id="gw-settings-invite">INVITE A FRIEND</button>
          </section>

          <section><h3>CURRENT OBJECTIVE</h3><p class="gw-state" id="gw-settings-objective">—</p></section>

          <section id="gw-display-section"><h3>DISPLAY</h3>
            <p class="gw-state" id="gw-display-state">—</p>
            <button class="gw-secondary" id="gw-fullscreen">PLAY FULLSCREEN</button>
            <p class="gw-fine" id="gw-display-hint"></p>
          </section>

          <section><h3>AUDIO</h3>
            <div class="gw-toggle-row"><span>SOUND</span><button id="gw-audio-toggle" class="gw-toggle" aria-pressed="true">ON</button></div>
          </section>

          <section id="gw-privacy-section"><h3>PRIVACY</h3>
            <ul>
              <li>No account, no email, no password. Ever.</li>
              <li>A random ID is kept in this browser so your run, score and crew persist. It never leaves your device except as an anonymous analytics id.</li>
              <li>Your nickname, X handle and crew are shown to players in your room. They are never sent to analytics.</li>
              <li>Optional product analytics count anonymous gameplay events. No session recording, no tracking across other sites.</li>
              <li>Multiplayer works exactly the same whether analytics are on or off.</li>
            </ul>
            <div class="gw-toggle-row"><span>PRODUCT ANALYTICS</span><button id="gw-analytics-toggle" class="gw-toggle" aria-pressed="true">ON</button></div>
            <p class="gw-fine" id="gw-privacy-note"></p>
          </section>
        </div>
      </div>

      <div class="gw-diag gw-hidden" id="gw-diag"></div>`;
  }

  // ------------------------------------------------------------------- bind

  private bind() {
    this.boot = this.q('gw-boot');
    this.bootNew = this.q('gw-boot-new');
    this.bootResume = this.q('gw-boot-resume');
    this.nameInput = this.q('gw-name');
    this.error = this.q('gw-err');
    this.roomChip = this.q('gw-room');
    this.roomLabel = this.q('gw-roomcode');
    this.onlineLabel = this.q('gw-online');
    this.inviteBtn = this.q('gw-invite');
    this.soundBtn = this.q('gw-sound');
    this.board = this.q('gw-board');
    this.playerRows = this.q('gw-player-rows');
    this.crewRows = this.q('gw-crew-rows');
    this.objective = this.q('gw-objective');
    this.feed = this.q('gw-feed');
    this.toasts = this.q('gw-toasts');
    this.nudge = this.q('gw-nudge');
    this.nudgeText = this.q('gw-nudge-text');
    this.settings = this.q('gw-settings');
    this.analyticsToggle = this.q('gw-analytics-toggle');
    this.privacyNote = this.q('gw-privacy-note');
    this.diag = this.q('gw-diag');
    this.crewState = this.q('gw-crew-state');
    this.crewNameInput = this.q('gw-crew-name');
    this.crewTagInput = this.q('gw-crew-tag');
    this.setNameInput = this.q('gw-set-name');
    this.settingsObjective = this.q('gw-settings-objective');
    this.settingsRoom = this.q('gw-settings-room');

    const submit = () => this.onPlay?.(this.nameInput.value);
    this.q('gw-play').addEventListener('click', submit);
    this.nameInput.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') submit();
      e.stopPropagation();
    });
    for (const input of [this.setNameInput, this.crewNameInput, this.crewTagInput]) {
      input.addEventListener('keydown', (e) => e.stopPropagation());
    }

    this.q('gw-continue').addEventListener('click', () => {
      this.hideBoot();
      this.onContinue?.();
    });
    this.q('gw-newrun').addEventListener('click', () => {
      this.hideBoot();
      this.onNewRun?.();
    });

    this.inviteBtn.addEventListener('click', () => this.onInvite?.());
    this.q('gw-settings-invite').addEventListener('click', () => this.onInvite?.());
    this.q('gw-nudge-invite').addEventListener('click', () => {
      this.onInvite?.();
      this.hideNudge();
    });
    this.q('gw-nudge-close').addEventListener('click', () => this.hideNudge());

    this.roomChip.addEventListener('click', () => this.toggleScoreboard());
    this.q('gw-heatrun').addEventListener('click', () => this.onHeatRun?.());
    this.q('gw-crewwar').addEventListener('click', () => this.onCrewWar?.());

    this.soundBtn.addEventListener('click', () => this.toggleSound());
    this.q('gw-audio-toggle').addEventListener('click', () => this.toggleSound());

    this.q('gw-settings-btn').addEventListener('click', () => this.openSettings());
    this.settings.addEventListener('click', (e) => {
      // clicking the backdrop closes; clicking the card does not
      if (e.target === this.settings) this.closeSettings();
    });
    this.settings.addEventListener('keydown', (e) => e.stopPropagation());
    this.q('gw-settings-close').addEventListener('click', () => this.closeSettings());
    this.q('gw-save-player').addEventListener('click', () => this.onIdentityChange?.(this.setNameInput.value));
    this.q('gw-crew-save').addEventListener('click', () =>
      this.onCrewChange?.(this.crewNameInput.value, this.crewTagInput.value),
    );
    this.q('gw-crew-leave').addEventListener('click', () => this.onCrewLeave?.());
    this.q('gw-fullscreen').addEventListener('click', () => this.goFullscreen());
    this.refreshDisplay();

    (this.root.querySelectorAll('[data-privacy]') as NodeListOf<HTMLElement>).forEach((link) =>
      link.addEventListener('click', () => this.openSettings('gw-privacy-section')),
    );
    this.analyticsToggle.addEventListener('click', () => {
      const next = this.analyticsToggle.getAttribute('aria-pressed') !== 'true';
      this.onAnalyticsChoice?.(next);
    });

  }

  // ------------------------------------------------------------- boot screen

  showBoot(room: RoomInfo, suggested: string) {
    this.bootNew.classList.remove('gw-hidden');
    this.bootResume.classList.add('gw-hidden');
    this.boot.classList.remove('gw-hidden');
    this.nameInput.value = suggested;
    if (room.invited) {
      const join = this.q('gw-joining');
      join.textContent = room.host ? `JOINING ${room.host.toUpperCase()}' CITY` : `JOINING ROOM ${room.code}`;
      join.classList.remove('gw-hidden');
    }
    window.setTimeout(() => this.nameInput.focus(), 60);
  }

  showResume(info: { name: string; score: number; best: number }) {
    this.bootNew.classList.add('gw-hidden');
    this.bootResume.classList.remove('gw-hidden');
    this.boot.classList.remove('gw-hidden');
    this.q('gw-welcome').textContent = `welcome back, ${info.name}.`;
    this.q('gw-resume-score').textContent = info.score.toLocaleString('en-US');
    this.q('gw-resume-best').textContent = info.best.toLocaleString('en-US');
  }

  rejectName(message: string) {
    this.error.textContent = message;
    this.nameInput.focus();
  }

  hideBoot() {
    this.boot.classList.add('gw-hidden');
    this.error.textContent = '';
  }

  // ------------------------------------------------------------------- hud

  setRoom(code: string, online: number, status: NetStatus) {
    this.roomLabel.textContent = `ROOM ${code}`;
    this.onlineLabel.textContent = status === 'offline' ? 'OFFLINE' : `${online} ONLINE`;
    this.roomChip.dataset.status = status;
    this.settingsRoom.textContent = status === 'offline' ? `${code} · SINGLE PLAYER` : `${code} · ${online} ONLINE`;
  }

  setInviteLabel(label: string) {
    if (this.inviteBtn.classList.contains('gw-copied')) return;
    this.inviteBtn.textContent = label;
  }

  /** The persistent objective card, directly under the room cluster. */
  setObjective(objective: Objective | null) {
    if (!objective) {
      this.objective.classList.add('gw-hidden');
      this.settingsObjective.textContent = '—';
      return;
    }
    this.objective.classList.remove('gw-hidden');
    this.objective.dataset.kind = objective.kind;
    this.q('gw-obj-title').textContent = objective.title;
    this.q('gw-obj-line').textContent = objective.line;
    this.q('gw-obj-distance').textContent =
      objective.distance !== undefined ? `${Math.round(objective.distance)} M` : '';
    this.q('gw-obj-timer').textContent =
      objective.seconds !== undefined && objective.seconds >= 0 ? formatClock(objective.seconds) : '';
    const extra = this.q('gw-obj-extra');
    extra.textContent = objective.extra ?? '';
    extra.classList.toggle('gw-hidden', !objective.extra);
    this.settingsObjective.textContent = `${objective.title} — ${objective.line}`;
  }

  setRoster(players: RosterEntry[], crews: CrewRow[]) {
    this.playerRows.textContent = '';
    for (const entry of players) {
      const row = document.createElement('div');
      row.className = `gw-prow${entry.self ? ' gw-me' : ''}`;

      const who = document.createElement('div');
      who.className = 'gw-who';
      const name = document.createElement('span');
      name.className = 'gw-name';
      name.textContent = `${entry.crewTag ? `[${entry.crewTag}] ` : ''}${entry.name}`;
      who.appendChild(name);

      const score = document.createElement('span');
      score.className = 'gw-score';
      score.textContent = entry.score.toLocaleString('en-US');
      const kills = document.createElement('span');
      kills.className = 'gw-kills';
      kills.textContent = `${entry.kills} K`;

      row.append(who, score, kills);
      this.playerRows.appendChild(row);
    }

    this.crewRows.textContent = '';
    if (!crews.length) {
      const empty = document.createElement('p');
      empty.className = 'gw-state';
      empty.textContent = 'NO CREWS YET';
      this.crewRows.appendChild(empty);
    }
    for (const crew of crews) {
      const row = document.createElement('div');
      row.className = 'gw-crow';
      const name = document.createElement('span');
      name.textContent = `[${crew.tag}] ${crew.name}`;
      name.style.color = `#${crew.accent.toString(16).padStart(6, '0')}`;
      const points = document.createElement('span');
      points.textContent = crew.points.toLocaleString('en-US');
      row.append(name, points);
      this.crewRows.appendChild(row);
    }
  }

  /** Short, non-graphic elimination line. */
  killFeed(text: string) {
    const line = document.createElement('div');
    line.className = 'gw-feed-line';
    line.textContent = text;
    this.feed.appendChild(line);
    while (this.feed.childElementCount > 4) this.feed.removeChild(this.feed.firstChild!);
    window.setTimeout(() => line.classList.add('gw-out'), 4200);
    window.setTimeout(() => line.remove(), 4800);
  }

  toast(text: string, ms = 2600, sub = '') {
    const el = document.createElement('div');
    el.className = 'gw-toast';
    el.textContent = text;
    if (sub) {
      const small = document.createElement('small');
      small.textContent = sub;
      el.appendChild(small);
    }
    this.toasts.appendChild(el);
    window.setTimeout(() => el.classList.add('gw-out'), ms - 400);
    window.setTimeout(() => el.remove(), ms);
  }

  flashInvite(text: string) {
    this.inviteBtn.textContent = text;
    this.inviteBtn.classList.add('gw-copied');
    window.setTimeout(() => {
      this.inviteBtn.classList.remove('gw-copied');
      this.inviteBtn.textContent = 'INVITE';
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

  // --------------------------------------------------------------- panels

  toggleScoreboard(force?: boolean) {
    const open = force ?? this.board.classList.contains('gw-hidden');
    this.board.classList.toggle('gw-hidden', !open);
    if (open) this.onScoreboardOpen?.();
  }

  openSettings(scrollTo?: string) {
    this.refreshDisplay();
    this.settings.classList.remove('gw-hidden');
    this.onSettingsOpen?.();
    if (scrollTo) this.q(scrollTo).scrollIntoView({ block: 'start' });
  }

  closeSettings() {
    this.settings.classList.add('gw-hidden');
  }

  get settingsOpen() {
    return !this.settings.classList.contains('gw-hidden');
  }

  /** Keeps the settings fields in step with the live identity and crew. */
  setPlayerInfo(name: string, crew: Crew | null) {
    if (document.activeElement !== this.setNameInput) this.setNameInput.value = name;
    this.crewState.textContent = crew ? `[${crew.tag}] ${crew.name}` : 'NO CREW';
    this.crewState.style.color = crew ? `#${crew.accent.toString(16).padStart(6, '0')}` : '';
    if (crew && document.activeElement !== this.crewNameInput) {
      this.crewNameInput.value = crew.name;
      this.crewTagInput.value = crew.tag;
    }
    this.setInviteLabel(crew ? `JOIN [${crew.tag}]` : 'INVITE');
  }

  /** Layout mode drives the CSS; the canvas drives the top inset. */
  setLayout(mode: 'desktop' | 'portrait' | 'landscape') {
    this.root.dataset.layout = mode;
  }

  setTopInset(px: number) {
    this.root.style.setProperty('--gw-hud-top', `${px}px`);
  }

  /**
   * iOS cannot be asked to install anything, so we say what to do instead of
   * pretending. Everything below is optional: the game plays fine in Safari.
   */
  private refreshDisplay() {
    const standalone =
      matchMedia('(display-mode: standalone)').matches ||
      matchMedia('(display-mode: fullscreen)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    const canFullscreen = typeof document.documentElement.requestFullscreen === 'function';
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent);

    const state = this.q('gw-display-state');
    const hint = this.q('gw-display-hint');
    const button = this.q<HTMLButtonElement>('gw-fullscreen');

    if (standalone) {
      state.textContent = 'FULLSCREEN ACTIVE';
      hint.textContent = 'Running as a home screen app.';
      button.classList.add('gw-hidden');
      return;
    }

    button.classList.remove('gw-hidden');
    state.textContent = 'IN BROWSER';
    if (canFullscreen && !ios) {
      button.textContent = 'PLAY FULLSCREEN';
      hint.textContent = '';
    } else {
      button.textContent = 'HOW TO GO FULLSCREEN';
      hint.textContent =
        'Add Getaway to your Home Screen to play without Safari bars: Share → Add to Home Screen → open it from there.';
    }
  }

  private goFullscreen() {
    const el = document.documentElement;
    if (typeof el.requestFullscreen === 'function' && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => this.toast('FULLSCREEN NOT AVAILABLE'));
    }
    this.refreshDisplay();
  }

  setAnalyticsState(enabled: boolean, note = '', available = true) {
    this.analyticsToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    this.analyticsToggle.textContent = enabled ? 'ON' : 'OFF';
    this.analyticsToggle.disabled = !available;
    this.privacyNote.textContent = note;
  }

  setDiagnostics(text: string) {
    this.diag.textContent = text;
    this.diag.classList.toggle('gw-hidden', !text);
  }

  private renderControls() {
    const rows = hasTouch ? TOUCH_CONTROLS : DESKTOP_CONTROLS;
    const host = this.q('gw-controls');
    host.textContent = '';
    for (const [key, what] of rows) {
      const row = document.createElement('div');
      const k = document.createElement('kbd');
      k.textContent = key;
      const v = document.createElement('span');
      v.textContent = what;
      row.append(k, v);
      host.appendChild(row);
    }
  }

  private toggleSound() {
    const next = this.soundBtn.dataset.muted !== '1';
    this.setMuted(next);
    this.onSound?.(next);
  }

  private setMuted(muted: boolean) {
    this.soundBtn.dataset.muted = muted ? '1' : '0';
    this.soundBtn.textContent = muted ? '🔇' : '🔊';
    const toggle = this.q<HTMLButtonElement>('gw-audio-toggle');
    toggle.setAttribute('aria-pressed', muted ? 'false' : 'true');
    toggle.textContent = muted ? 'OFF' : 'ON';
  }

}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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

/** The overlay if it exists yet — the viewport code runs before it is built. */
export function peekOverlay(): Overlay | null {
  return overlay;
}
