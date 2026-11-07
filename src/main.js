import { initializeGame } from './game/initialize.js';
import { ctx } from './game/state.js';
import { createAudio } from './audio/audio.js';
import { applyTextures } from './render/textures.js';

initializeGame();
applyTextures();
const audio = createAudio();
const dispose = ctx.root.__disposeTag;
ctx.root.__disposeTag = () => { audio.dispose(); dispose(); };
if (import.meta.hot) import.meta.hot.dispose(() => ctx.root.__disposeTag());
