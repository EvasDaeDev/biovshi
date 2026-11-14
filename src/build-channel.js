// Compile-time channel: URL parameters cannot change live-game rules or saves.
export const TEST_BUILD=typeof __TEST_BUILD__==='boolean'&&__TEST_BUILD__;
export const BOSS_FLOOR_INTERVAL=TEST_BUILD?2:5;
export const storageKey=key=>TEST_BUILD?key.replace(/^biovshi\./,'biovshi.test.'):key;
export const SESSION_STORAGE=storageKey('biovshi.local-totalizator.v1');
