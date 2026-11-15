// Generated during texture preparation; also readable directly by Node experiments.
import {BOSS_TEXTURES} from './texture-list.js';
export {BOSS_TEXTURES};
export const bossTextureKey=index=>'robotBoss'+index;
export const bossAssets=()=>Object.fromEntries(BOSS_TEXTURES.map((file,index)=>[bossTextureKey(index),file]));
