// SOLMAR CITY — localStorage save: cash, mission progress, health. Versioned,
// tolerant of missing or corrupt data (a bad save just starts fresh).
export const SAVE_KEY = 'solmar-city-save-v1';

export function saveGame(G) {
  try {
    const data = {
      v: 1,
      cash: G.cash,
      missionIndex: G.missions.index,
      missionStep: G.missions.step,
      health: G.health,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    // Storage full or blocked (private mode): the game still plays.
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}

export function hasSave() {
  return loadGame() !== null;
}
