// A CSS-drawn coin works without emoji fonts, downloads, or external assets.
export const COIN_ICON='<span class="chip-icon" role="img" aria-label="фишки"></span>';
export const formatChips = value => Number(value).toLocaleString('ru-RU') + ' '+COIN_ICON;
export const formatChipsText = value => Number(value).toLocaleString('ru-RU') + ' фишек';
