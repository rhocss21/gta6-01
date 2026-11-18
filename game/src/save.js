// Solmar City — saving to localStorage: money, mission progress, health,
// position, wanted level and ammo. Autosaves on mission complete.
export const SAVE_KEY = 'solmar-city-save-v1';

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}

export function saveGame(G) {
  try {
    const data = {
      money: G.money,
      missionIndex: G.missions.index,
      completed: G.missions.completed,
      health: G.player.health,
      pos: [G.player.pos.x, G.player.pos.z],
      wanted: G.wanted,
      ammo: G.combat.mag,
      reserve: G.combat.reserve,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d.money !== 'number' || typeof d.missionIndex !== 'number') return null;
    return d;
  } catch (e) { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}

// Apply a loaded save to the live game state.
export function applySave(G, d) {
  G.money = d.money || 0;
  G.wanted = d.wanted || 0;
  G.player.health = d.health ?? 100;
  G.player.setPosition(d.pos ? d.pos[0] : 84, d.pos ? d.pos[1] : 20, Math.PI);
  G.combat.mag = d.ammo ?? 12;
  G.combat.reserve = d.reserve ?? 60;
  G.missions.completed = Array.isArray(d.completed) ? d.completed : [];
  G.missions.setMission(Math.min(d.missionIndex || 0, 4));
}
