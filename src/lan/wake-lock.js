export function createLanWakeLock(doc, onStatus) {
  let enabled = false, pending = false, generation = 0, lock = null;

  const release = sentinel => { void sentinel.release().catch(() => {}); };

  async function update() {
    if (!enabled || doc.hidden) {
      generation++;
      pending = false;
      if (lock) {
        const previous = lock;
        lock = null;
        release(previous);
      }
      onStatus(enabled ? 'hidden' : null);
      return;
    }

    const api = doc.defaultView.navigator.wakeLock;
    if (!api?.request) {
      onStatus('unavailable');
      return;
    }
    if (lock || pending) return;

    const request = ++generation;
    pending = true;
    onStatus('requesting');
    try {
      const sentinel = await api.request('screen');
      if (request !== generation) {
        release(sentinel);
        return;
      }
      if (sentinel.released) {
        onStatus('released');
        return;
      }
      lock = sentinel;
      sentinel.addEventListener('release', () => {
        if (lock !== sentinel) return;
        lock = null;
        onStatus(doc.hidden ? 'hidden' : 'released');
      }, {once: true});
      onStatus('active');
    } catch {
      if (request === generation) onStatus('denied');
    } finally {
      if (request === generation) pending = false;
    }
  }

  return {
    setEnabled(value) {
      if (enabled === value) return;
      enabled = value;
      if (enabled) doc.addEventListener('visibilitychange', update);
      else doc.removeEventListener('visibilitychange', update);
      void update();
    },
  };
}
