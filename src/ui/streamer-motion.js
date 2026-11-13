const RAD=Math.PI/180;
export const MAX_ARM_ANGLE=25*RAD;
const clamp=value=>Math.max(0,Math.min(1,value));

// Cosmetic state follows recent activity without consuming simulation randomness.
export function createStreamerMotion(){
 let drive=0,intensity=0,phase=0;
 return {
  offer(event){
   const impulse=event.type==='hit'?(event.damage===2?.3:.18)
    :event.type==='segment-broken'?.35:event.type==='robot-immobilized'?.4
    :event.type==='combat-end'?.45:event.type==='combat-windup'?.06:0;
   drive=clamp(drive+impulse);
  },
  tick(dt,{celebrating=false}={}){
   const delta=Math.min(Math.max(dt,0),.1);
   const target=celebrating?1:drive;
   intensity+=(target-intensity)*(1-Math.exp(-7*delta));
   drive*=Math.exp(-delta/1.7);
   // About 0.35 Hz at rest, 1.9 Hz in a busy fight, 2.9 Hz during victory.
   const speed=2.2+(celebrating?15.8:10)*intensity;
   phase=(phase+delta*speed)%(Math.PI*2);
   // Idle: 12 degrees down. Busy fight: centred swings through up to +/-25 degrees.
   // Rest + amplitude never exceeds 25 degrees, including during transitions.
   const rest=12*(1-intensity)*RAD,amplitude=(3+22*intensity)*RAD;
   return {intensity,left:-rest+Math.sin(phase)*amplitude,
    right:rest+Math.sin(phase+.8)*amplitude};
  },
  reset(){drive=intensity=phase=0;}
 };
}
