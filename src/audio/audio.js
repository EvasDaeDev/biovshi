import { ASSETS, assetUrl } from '../assets/manifest.js';
import { onGameEvent } from '../game/event-bus.js';

export function createAudio({ volume = 0.5, muted = false, maxVoices = 8 } = {}) {
  let unlocked = false;
  const voices = new Set();
  const onGesture = () => { unlocked = true; };
  globalThis.addEventListener('pointerdown', onGesture);
  globalThis.addEventListener('keydown', onGesture);
  const stopAll = () => { for (const voice of voices) voice.pause(); voices.clear(); };
  const unsubscribe = onGameEvent(({ type }) => {
    const src = assetUrl(ASSETS.sounds[type]);
    if (!src || !unlocked || muted || voices.size >= maxVoices) return;
    const voice = new Audio(src);
    voice.volume = Math.max(0, Math.min(1, volume));
    voices.add(voice);
    const release = () => voices.delete(voice);
    voice.addEventListener('ended', release, { once: true });
    voice.addEventListener('error', release, { once: true });
    voice.play().catch(release);
  });
  return {
    setVolume(value) { volume = value; for (const voice of voices) voice.volume = Math.max(0, Math.min(1, value)); },
    setMuted(value) { muted = value; if (muted) stopAll(); },
    stopAll,
    dispose() { unsubscribe(); stopAll(); globalThis.removeEventListener('pointerdown', onGesture); globalThis.removeEventListener('keydown', onGesture); },
  };
}
