import { addScore } from './economy.js';

export const NIGHT_DURATION=90000;
const speeds=[6500,7600,5700,4200];
function random(n,max){n.seed=(Math.imul(n.seed,1664525)+1013904223)>>>0;return n.seed%max;}
export function neighbors(room) {
  const row=Math.floor(room/3),col=room%3,out=[];
  if(col>0)out.push(room-1);
  if(col<2)out.push(room+1);
  if(col!==1){if(row>0)out.push(room-3);if(row<2)out.push(room+3);}
  return out;
}
export function startNight(s,now) {
  const n={
    phase:'playing',startedAt:now,elapsed:0,lastAt:now,simAt:0,pausedAt:0,
    room:7,hidden:false,hideAt:0,hideCooldown:0,moveAt:0,lightAt:0,
    lights:Array(9).fill(0),reels:[0,2,3,5,6,8],films:0,points:0,hits:0,
    invulnerable:0,seed:s.rng||5231,spokenAt:0,reward:0,multiplier:2,
    enemies:[{room:0,at:0},{room:2,at:0},{room:3,at:0},{room:5,at:0}],
    wave:s.nightWins||0
  };
  s.night=n;s.event='night-start';s.eventAt=now;
}
export function advanceNight(s,now,damage) {
  const n=s.night;
  if(!n||n.phase!=='playing'||n.pausedAt)return;
  const delta=Math.max(0,now-n.lastAt);
  n.lastAt=now;n.elapsed=Math.min(NIGHT_DURATION,n.elapsed+delta);
  while(n.simAt+100<=n.elapsed&&n.phase==='playing'){
    n.simAt+=100;
    const at=n.simAt;
    if(n.hidden&&at-n.hideAt>=6000){n.hidden=false;n.hideCooldown=at+1800;}
    for(let i=0;i<4;i++){
      const e=n.enemies[i],period=Math.max(2200,speeds[i]-Math.min(n.wave,8)*190);
      if(at>=6500+i*1700&&at-e.at>=period){
        const opts=neighbors(e.room);
        e.room=opts[random(n,opts.length)];e.at=at;
      }
      if(e.room!==n.room||at<7000+i*1700)continue;
      if(n.hidden){
        if(i===0&&at-n.spokenAt>9000){n.spokenAt=at;s.event='night-knock';s.eventAt=now;}
        continue;
      }
      if(n.lights[n.room]>at&&i!==3){
        if(at-e.at>900){const opts=neighbors(e.room);e.room=opts[random(n,opts.length)];e.at=at;}
        continue;
      }
      const grace=i===3?1100:1500;
      if(at-e.at>grace&&at>n.invulnerable){
        n.hits++;n.invulnerable=at+3500;n.room=7;n.hidden=false;
        damage(s,now,'night-hit');
        if(s.lives<1){n.phase='lost';s.event='night-lost';s.eventAt=now;break;}
      }
    }
  }
  if(n.phase==='playing'&&n.elapsed>=NIGHT_DURATION){
    n.phase='won';n.multiplier=n.hits===0&&n.films>=3?5:2;
    n.reward=(2500+n.points+Math.min(n.wave,100)*500)*n.multiplier;
    addScore(s,n.reward);s.bonusWon=true;s.nightWins=(s.nightWins||0)+1;
    s.event='night-won';s.eventAt=now;
  }
}
export function nightAction(s,a,now,damage) {
  const n=s.night;
  if(!n||n.phase!=='playing')return false;
  if(a.type==='pause'&&!n.pausedAt){advanceNight(s,now,damage);n.pausedAt=now;return true;}
  if(a.type==='resume'&&n.pausedAt){n.pausedAt=0;n.lastAt=now;return true;}
  if(n.pausedAt)return true;
  advanceNight(s,now,damage);
  if(n.phase!=='playing')return true;
  const at=n.elapsed;
  if(a.type==='nightMove'&&!n.hidden&&at-n.moveAt>=240){
    let target=a.room;
    if(a.direction){const d={left:-1,right:1,up:-3,down:3}[a.direction];target=n.room+d;}
    if(neighbors(n.room).includes(target)){n.room=target;n.moveAt=at;s.event='night-move';s.eventAt=now;}
  }
  if(a.type==='nightHide'){
    if(n.hidden){n.hidden=false;n.hideCooldown=at+1500;}
    else if(at>=n.hideCooldown){n.hidden=true;n.hideAt=at;}
  }
  if(a.type==='nightLight'&&!n.hidden&&at-n.lightAt>=500&&s.energy>=20){
    s.energy-=20;n.lightAt=at;n.lights[n.room]=at+12000;
    if(n.reels.includes(n.room)){n.reels=n.reels.filter(r=>r!==n.room);n.films++;n.points+=750;s.event='night-film';s.eventAt=now;}
    else if(at-(n.lastLightReward||0)>5000){n.points+=35;n.lastLightReward=at;}
  }
  return true;
}