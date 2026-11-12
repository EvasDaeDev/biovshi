import {ASSETS,assetUrl} from '../assets/manifest.js';
const keys={bone:'uiBone',coin:'uiCoin',mobility:'uiMobility',screen:'uiScreen',settings:'uiSettings',speed:'uiSpeed',strength:'uiStrength'};
export function uiIcon(name,{className='',label=''}={}){
 return `<img class="ui-icon${className?' '+className:''}" src="${assetUrl(ASSETS.textures[keys[name]])}" alt="${label}"${label?'':' aria-hidden="true"'} width="24" height="24">`;
}
