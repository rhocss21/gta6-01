// SOLMAR CITY — saving: cash, job progress, health, armor, position,
// wanted level and ammo live in localStorage. The game autosaves whenever a
// job pays out; CONTINUE on the menu picks the save back up.
export const SAVE_KEY = 'solmar-city-save-v11';

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch (e) {
    return false;
  }
}

export function saveGame(W) {
  try {
    const data = {
      money: W.money,
      jobIndex: W.story.index,
      finishedJobs: W.story.finished,
      health: W.jax.health,
      armor: W.jax.armor,
      pos: [W.jax.pos.x, W.jax.pos.z],
      wanted: W.wanted,
      mag: W.guns.mag,
      reserve: W.guns.reserve,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d.money !== 'number' || typeof d.jobIndex !== 'number') return null;
    return d;
  } catch (e) {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    /* ignore */
  }
}

// Put a loaded save's values onto the live game state.
export function applySave(W, d) {
  W.money = d.money || 0;
  W.wanted = d.wanted || 0;
  W.jax.health = d.health ?? 100;
  W.jax.armor = d.armor ?? 0;
  W.jax.place(d.pos ? d.pos[0] : 84, d.pos ? d.pos[1] : 20, Math.PI);
  W.guns.mag = d.mag ?? 12;
  W.guns.reserve = d.reserve ?? 60;
  W.story.finished = Array.isArray(d.finishedJobs) ? d.finishedJobs : [];
  W.story.startJob(Math.min(d.jobIndex || 0, 4));
}
