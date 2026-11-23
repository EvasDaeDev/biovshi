import {BOSS_CONFIG, BOSS_VARIANTS} from '../boss/config.js';
import {BASE_STATS, statMultiplier} from '../garage/model.js';
import {towerMutationSnapshot} from '../tower/mutations.js';
import {TOWER_ENEMY_PROFILES, towerEnemyProfile, towerProfileEffect, validTowerProfile} from '../tower/profiles.js';

const bosses = new Map(BOSS_VARIANTS.map(variant => ['boss-' + variant.id, variant]));
export const lanProfiles = [
  ...Object.entries(TOWER_ENEMY_PROFILES).map(([id, profile]) => [id, profile.name]),
  ...[...bosses].map(([id, variant]) => [id, 'Босс · ' + variant.name]),
];
export const validLanProfile = id => validTowerProfile(id) || bosses.has(id);

export function lanBossStats() {
  const [speed, , maneuver] = BASE_STATS;
  return {
    effective: BASE_STATS,
    effects: [BOSS_CONFIG.speedFactor * statMultiplier(speed), BOSS_CONFIG.criticalChance,
      BOSS_CONFIG.turnFactor * statMultiplier(maneuver)],
  };
}

export function describeLanProfile(id) {
  if (id === 'tower') return {name: 'Пациент из Башни', detail: 'Временная копия пациента хозяина'};
  const boss = bosses.get(id);
  if (boss) {
    const [speed, critical, maneuver] = lanBossStats().effects.map(value => Math.round(value * 100));
    return {
      name: 'Босс · ' + boss.name,
      detail: BASE_STATS.join('/') + ' очков · ' +
        speed + '% скорость · ' + critical + '% крит · ' + maneuver + '% поворот · ' +
        boss.spineSegments + ' звеньев · рывок, серия и широкий удар',
    };
  }
  const profile = towerEnemyProfile(id);
  const {speed, critical, maneuver} = towerProfileEffect(id);
  return {name: profile.name, detail: profile.stats.join('/') + ' очков · ' +
    speed + '% скорость · ' + critical + '% крит · ' + maneuver + '% поворот'};
}

export const lanAiName = (profileId, index) => 'ИИ ' + (index + 1) + ' · ' + describeLanProfile(profileId).name;

export function lanTowerCopy(run) {
  if (!run) return null;
  const copy = structuredClone(run);
  return {
    skin: copy.patient, stats: copy.stats, mutations: copy.mutations,
    prosthetics: [...(copy.prosthetics ?? []), ...(copy.graftProsthetics ?? [])],
    surgeries: copy.surgeries, equippedSegments: copy.equippedSegments,
    segmentInventory: copy.segmentInventory, equippedMutations: copy.equippedMutations,
    mutationInventory: copy.mutationInventory,
  };
}

export function describeLanTower(run) {
  const copy = lanTowerCopy(run);
  if (!copy) return null;
  const snapshot = towerMutationSnapshot(copy);
  const [speed, critical, maneuver] = snapshot.effects.map(value => Math.round(value * 100));
  return snapshot.base.join('/') + ' очков · ' + speed + '% скорость · ' + critical + '% крит · ' +
    maneuver + '% поворот · ' + copy.prosthetics.length + ' протезов · ' +
    (copy.surgeries?.length ?? 0) + ' операций';
}

export function createLanRoster(room, localMemberId, tower) {
  function fighter(name, profileId, memberId = null) {
    const control = memberId === null ? 'ai' : memberId === localMemberId ? 'local' : 'remote';
    const boss = bosses.get(profileId);
    if (boss) return {name, control, memberId, profileId, boss: boss.id, stats: [...BASE_STATS]};
    if (profileId === 'tower') {
      const copy = lanTowerCopy(control === 'local' ? tower : null);
      if (!copy) throw Error('Локальный пациент из Башни недоступен.');
      return {name, control, memberId, profileId, ...copy};
    }
    const {stats, skinKey, voice} = towerEnemyProfile(profileId);
    return {name, control, memberId, profileId, stats: [...stats], skinKey, voice};
  }
  return [
    ...room.members.filter(member => member.role === 'player').map(member =>
      fighter(member.name, member.profile, member.id)),
    ...room.ai.map((id, index) => fighter(lanAiName(id, index), id)),
  ];
}
