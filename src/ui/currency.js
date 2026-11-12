import {uiIcon} from './icons.js';
export const COIN_ICON=uiIcon('coin',{className:'chip-icon',label:'монеты'});
export const formatChips = value => Number(value).toLocaleString('ru-RU') + ' '+COIN_ICON;
export const formatChipsText = value => Number(value).toLocaleString('ru-RU') + ' фишек';
