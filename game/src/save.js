// Save / load: a single localStorage slot. Cash, finished jobs, best stats
// and the player's last position. Nothing leaves the browser.
const KEY = 'solmarina-save-v1';

export function saveGame(store) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      cash: store.cash,
      completedMissions: store.completedMissions,
      best: store.best,
      player: { x: store.player.x, z: store.player.z },
      savedAt: Date.now(),
    }));
    return true;
  } catch (e) { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || !Array.isArray(data.completedMissions)) return null;
    return data;
  } catch (e) { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
