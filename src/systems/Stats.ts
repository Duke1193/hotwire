/** Everything the scoreboard and the save file want to know about a player. */
export interface PlayerStats {
  best: number;
  kills: number;
  deaths: number;
  missions: number;
  escapes: number;
  heatRunWins: number;
  crewWarWins: number;
}

export function emptyStats(): PlayerStats {
  return { best: 0, kills: 0, deaths: 0, missions: 0, escapes: 0, heatRunWins: 0, crewWarWins: 0 };
}

export function mergeStats(base: PlayerStats, saved?: Partial<PlayerStats> | null): PlayerStats {
  if (!saved) return base;
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
  return {
    best: num(saved.best, base.best),
    kills: num(saved.kills, base.kills),
    deaths: num(saved.deaths, base.deaths),
    missions: num(saved.missions, base.missions),
    escapes: num(saved.escapes, base.escapes),
    heatRunWins: num(saved.heatRunWins, base.heatRunWins),
    crewWarWins: num(saved.crewWarWins, base.crewWarWins),
  };
}
