// Tower-only bias for the existing patient tactical decision tree.
// These are preferences, not new abilities: regular AI, line of sight,
// physical clearance, strike geometry and anti-stuck safeguards remain intact.
const BIASES=Object.freeze({
  fast:Object.freeze({
    flankMax:108,flankQuietSec:2.5,closeRange:45,
    approachStallSec:3.5,guardTriggerCm:110
  }),
  strong:Object.freeze({
    flankMax:105,flankQuietSec:2.3,closeRange:53,
    approachStallSec:4.5,guardTriggerCm:100
  }),
  agile:Object.freeze({
    flankMin:52,flankMax:195,flankAngle:1.04,
    flankQuietSec:6.2,closeRange:32,approachStallSec:4.0
  }),
  elite:Object.freeze({
    flankMin:55,flankMax:175,flankAngle:.88,
    flankQuietSec:4.7,closeRange:44,approachStallSec:3.6,
    guardTriggerCm:150
  })
});
export const TOWER_TACTICAL_BIASES=BIASES;
export function towerTacticalProfile(base,profileId){
  return Object.hasOwn(BIASES,profileId)?{...base,...BIASES[profileId]}:base;
}
