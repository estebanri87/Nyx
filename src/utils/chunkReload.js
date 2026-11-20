const CHUNK_RELOAD_KEY = 'nyx_chunk_reload_at';
const CHUNK_RELOAD_RETRY_MS = 5 * 60 * 1000;

/**
 * Decides whether a failed chunk load may reload the page. A second failure right
 * after a reload is refused so it cannot loop, but a tab that stays open for weeks
 * must still be able to reload for each later release.
 * @param {Pick<Storage, 'getItem' | 'setItem'>} storage
 * @param {number} [now]
 * @returns {boolean}
 */
export function claimChunkReload(storage, now = Date.now()) {
  const last = storage.getItem(CHUNK_RELOAD_KEY);
  if (last !== null && now - Number(last) < CHUNK_RELOAD_RETRY_MS) return false;
  storage.setItem(CHUNK_RELOAD_KEY, String(now));
  return true;
}
