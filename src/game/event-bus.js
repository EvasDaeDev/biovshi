const listeners = new Set();
export function onGameEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function emitGameEvent(type, data) {
  for (const listener of listeners) {
    try { listener({ type, ...data }); } catch (error) { console.error('Game event handler:', error); }
  }
}
