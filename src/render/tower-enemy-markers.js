import {ctx} from '../game/state.js';
import {clamp} from '../utils/math.js';

function insideCamera(robot, bounds) {
  const {left, right, top, bottom} = bounds;
  return (robot.x >= left && robot.x <= right && robot.y >= top && robot.y <= bottom)
    || robot.capsules.some(({minX, maxX, minY, maxY, r}) =>
      maxX + r >= left && minX - r <= right && maxY + r >= top && minY - r <= bottom);
}

export function installTowerEnemyMarkers() {
  const doc = ctx.stage.ownerDocument;
  const layer = doc.createElement('div');
  layer.id = 'tower-enemy-markers';
  layer.hidden = true;
  layer.setAttribute('aria-hidden', 'true');
  ctx.stage.append(layer);
  const markers = [];

  function paint(projection) {
    const player = ctx.robots[0];
    const {fieldWidth: width, fieldHeight: height} = ctx;
    const {scale, x, y} = projection;
    layer.hidden = ctx.mode !== 'tower' || ctx.startup.phase !== 'running'
      || ctx.combat.finished || !player?.visible || !player.mobile;
    if (layer.hidden) return;

    const bounds = {left: -x / scale, right: (width - x) / scale,
      top: -y / scale, bottom: (height - y) / scale};
    // Match the projected diameter of the controlled patient's head.
    const shortSide = Math.min(width, height);
    const diameter = Math.min(shortSide / 4, 20 * player.scale * (player.body.headSizeFactor ?? 1) * scale);
    layer.style.setProperty('--tower-enemy-marker-size', diameter + 'px');
    const inset = Math.min(shortSide / 4, diameter / Math.SQRT2 + 5);
    const playerX = player.x * scale + x;
    const playerY = player.y * scale + y;
    // The camera can lag behind the player. Keep the ray's origin inside
    // the inset rectangle so every ray can reach one of its edges.
    const originX = clamp(playerX, inset, width - inset);
    const originY = clamp(playerY, inset, height - inset);
    let count = 0;

    for (const enemy of ctx.robots) {
      if (enemy === player || !enemy.visible || !enemy.mobile || insideCamera(enemy, bounds)) continue;
      const dx = (enemy.x - player.x) * scale;
      const dy = (enemy.y - player.y) * scale;
      const tx = dx === 0 ? Infinity : ((dx > 0 ? width - inset : inset) - originX) / dx;
      const ty = dy === 0 ? Infinity : ((dy > 0 ? height - inset : inset) - originY) / dy;
      const t = Math.min(tx, ty);
      if (!Number.isFinite(t)) continue;
      const markerX = originX + t * dx;
      const markerY = originY + t * dy;
      let marker = markers[count++];
      if (!marker) {
        marker = doc.createElement('div');
        marker.className = 'tower-enemy-marker';
        layer.append(marker);
        markers.push(marker);
      }
      marker.classList.toggle('is-boss', enemy.isBoss);
      marker.style.transform = `translate(${markerX}px,${markerY}px) translate(-50%,-50%) rotate(${Math.atan2(dy, dx)}rad)`;
      marker.hidden = false;
    }
    for (let i = count; i < markers.length; i++) markers[i].hidden = true;
  }

  return {paint, remove: () => layer.remove()};
}
