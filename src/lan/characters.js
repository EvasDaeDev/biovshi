import {BOSS_CONFIG, BOSS_VARIANTS} from '../boss/config.js';
import {BASE_STATS, normalizeProsthetics, statMultiplier} from '../garage/model.js';
import {normalizeTowerGraftProsthetics} from '../tower/anatomy.js';
import {TOWER_MUTATION_LIMIT, towerMutationSnapshot, validTowerInventory, validTowerMutations} from '../tower/mutations.js';
import {TOWER_ENEMY_PROFILES, towerEnemyProfile, towerProfileEffect, validTowerProfile} from '../tower/profiles.js';
import {validTowerSegmentInventory} from '../tower/segments.js';
import {TOWER_SURGERY_MAX, TOWER_SURGERY_MIN_LEVEL, validTowerSurgeries} from '../tower/surgery.js';

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
  if (id === 'tower') return {name: 'Пациент из Башни', detail: 'Временная копия'};
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
  return copyLanTowerLoadout({
    ...run, skin: run.patient,
    mutations: run.mutations ?? [],
    prosthetics: [...(run.prosthetics ?? []), ...(run.graftProsthetics ?? [])],
    surgeries: run.surgeries ?? [],
    equippedSegments: run.equippedSegments ?? [],
    segmentInventory: (run.segmentInventory ?? []).filter(item => run.equippedSegments?.includes(item.id)),
    mutationInventory: run.mutationInventory?.filter(item => run.equippedMutations?.includes(item.id)),
  });
}

// Accept only combat fields. Inventory slots are verified independently of save progression.
export function copyLanTowerLoadout(loadout) {
  if (!loadout || !Number.isInteger(loadout.skin) || loadout.skin < 0 || loadout.skin > 3 ||
      !Array.isArray(loadout.stats) || loadout.stats.length !== 3 ||
      !loadout.stats.every(points => Number.isSafeInteger(points) && points >= 2) ||
      !validTowerMutations(loadout.mutations) ||
      !Array.isArray(loadout.surgeries) || loadout.surgeries.length > TOWER_SURGERY_MAX ||
      !loadout.surgeries.every(op => op && typeof op.procedure === 'string' &&
        typeof op.site === 'string' && (op.donorId === undefined ||
          typeof op.donorId === 'string' && op.donorId.length <= 48))) return null;
  const surgeries = loadout.surgeries.map(({procedure, site, donorId, donorProfile}) =>
    donorId === undefined && donorProfile === undefined ? {procedure, site} : {procedure, site, donorId, donorProfile});
  const surgeryLevel = TOWER_SURGERY_MIN_LEVEL + 5 * (TOWER_SURGERY_MAX - 1);
  if (!validTowerSurgeries(surgeries, surgeryLevel)) return null;
  const parts = loadout.prosthetics;
  if (!Array.isArray(parts) || parts.length > 32) return null;
  const prosthetics = [...normalizeProsthetics(parts), ...normalizeTowerGraftProsthetics(parts, {surgeries})];
  if (prosthetics.length !== parts.length) return null;

  const {skin, stats, mutations, equippedSegments, segmentInventory, equippedMutations, mutationInventory} = loadout;
  if (!Array.isArray(segmentInventory) || !Array.isArray(equippedSegments) ||
      segmentInventory.length !== equippedSegments.length || segmentInventory.length > 32 ||
      !segmentInventory.every(item => item && typeof item.id === 'string' && typeof item.site === 'string' &&
        item.site.length <= 32 && typeof item.type === 'string') ||
      !validTowerSegmentInventory({nextSegmentId: Number.MAX_SAFE_INTEGER, segmentInventory, equippedSegments})) return null;
  const copy = {skin, stats: [...stats], mutations: [...mutations], prosthetics, surgeries,
    equippedSegments: [...equippedSegments],
    segmentInventory: segmentInventory.map(({id, type, rarity, site}) => ({id, type, rarity, site}))};
  if (equippedMutations === undefined && mutationInventory === undefined) return copy;
  if (!Array.isArray(mutationInventory) || !Array.isArray(equippedMutations) ||
      mutationInventory.length !== equippedMutations.length || mutationInventory.length > TOWER_MUTATION_LIMIT ||
      !mutationInventory.every(item => item && typeof item.id === 'string' && typeof item.type === 'string') ||
      !validTowerInventory({nextMutationId: Number.MAX_SAFE_INTEGER, modInstallations: 0,
        mutationInventory, equippedMutations, mutations})) return null;
  return {...copy, equippedMutations: [...equippedMutations],
    mutationInventory: mutationInventory.map(({id, type, rarity, obtainedAt}) => ({id, type, rarity, obtainedAt}))};
}

export function describeLanTower(copy) {
  const snapshot = towerMutationSnapshot(copy);
  const [speed, critical, maneuver] = snapshot.effects.map(value => Math.round(value * 100));
  return snapshot.base.join('/') + ' очков · ' + speed + '% скорость · ' + critical + '% крит · ' +
    maneuver + '% поворот · ' + copy.prosthetics.length + ' протезов · ' +
    (copy.surgeries?.length ?? 0) + ' операций';
}

export function createLanRoster(room, localMemberId) {
  function fighter(name, profileId, memberId = null, tower) {
    const control = memberId === null ? 'ai' : memberId === localMemberId ? 'local' : 'remote';
    const boss = bosses.get(profileId);
    if (boss) return {name, control, memberId, profileId, boss: boss.id, stats: [...BASE_STATS]};
    if (profileId === 'tower') {
      if (!tower) throw Error('Пациент из Башни недоступен.');
      return {name, control, memberId, profileId, ...structuredClone(tower)};
    }
    const {stats, skinKey, voice} = towerEnemyProfile(profileId);
    return {name, control, memberId, profileId, stats: [...stats], skinKey, voice};
  }
  return [
    ...room.members.filter(member => member.role === 'player').map(member =>
      fighter(member.name, member.profile, member.id, member.tower)),
    ...room.ai.map((id, index) => fighter(lanAiName(id, index), id)),
  ];
}
