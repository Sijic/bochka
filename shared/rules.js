import { economyDefaults, advanceEconomy, economyAction, addScore, tapPower, dayKey } from './economy.js';
import { startNight, nightAction } from './night.js';

export const LEVELS=[
  {count:3,goal:15,seconds:45,mode:'tap'},
  {count:6,goal:24,seconds:45,mode:'tap'},
  {count:6,goal:4,seconds:32,mode:'rhythm'},
  {count:10,goal:32,seconds:45,mode:'tap'},
  {count:15,goal:40,seconds:50,mode:'tap'},
  {count:8,goal:5,seconds:35,mode:'rhythm'},
  {count:20,goal:45,seconds:50,mode:'tap'},
  {count:25,goal:50,seconds:55,mode:'tap'},
  {count:12,goal:6,seconds:38,mode:'rhythm'},
  {count:25,goal:60,seconds:60,mode:'tap'}
];
export const levelOf=s=>s.level>10?{count:25,goal:Math.min(120,60+(s.level-10)*3),seconds:65,mode:s.level%5===0?'rhythm':'tap',...(
  s.level%5===0?{count:12,goal:6,seconds:38}:{}
)}:LEVELS[Math.max(0,s.level-1)];
export const demoLength=s=>(s.beats.at(-1)||0)+1200;
export const isActive=s=>['playing','show'].includes(s.phase);
export function freshState(now=Date.now()){
  return {
    version:2,level:1,cleared:0,score:0,peakScore:0,lives:3,
    taps:0,playMs:0,referrals_count:0,phase:'ready',progress:0,target:0,
    sequence:[],beats:[],showUntil:0,inputStart:0,deadline:0,pausedAt:0,
    lastTap:0,lockUntil:0,roundGained:0,replayed:false,screenBonuses:0,
    screenDay:dayKey(now),screenAt:0,event:'',eventAt:0,lastGain:0,
    lastClock:now,shareDay:'',shareCount:0,shareAt:0,bonusWon:false,
    night:null,nightWins:0,lastEventAt:0,rng:(now>>>0)||12345,deadAt:0,
    ...economyDefaults(now)
  };
}
export function migrateState(input,now=Date.now()){
  const base=freshState(now),s={...base,...input,version:2};
  if(input?.version!==2){
    s.totalEarned=Math.max(s.score,s.peakScore);
    s.lives=Math.min(3,s.lives);s.bonus=null;
    if(s.phase==='complete')s.phase='won';
  }
  s.cards=Array.from({length:7},(_,i)=>Math.max(0,Math.min(50,Number(s.cards?.[i])||0)));
  return s;
}
function random(s,n){s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng%n;}
function event(s,name,now){s.event=name;s.eventAt=now;}
function startRound(s,now){
  const l=levelOf(s);
  s.phase=l.mode==='rhythm'?'show':'playing';
  s.progress=0;s.roundGained=0;s.inputStart=0;s.lastTap=0;
  s.replayed=false;s.pausedAt=0;s.lockUntil=0;s.target=random(s,l.count);
  s.sequence=Array.from({length:l.goal},()=>random(s,l.count));
  s.beats=[];let beat=0;
  for(let i=0;i<l.goal;i++){s.beats.push(beat);beat+=[600,900,1200][random(s,3)];}
  s.showUntil=l.mode==='rhythm'?now+demoLength(s):0;
  s.deadline=(s.showUntil||now)+l.seconds*1000;event(s,'begin',now);
}
function damage(s,now,reason){
  if(s.lives>=3)s.lifeAt=now;
  s.lives=Math.max(0,s.lives-1);
  const lost=Math.min(s.roundGained,Math.max(10,Math.floor(s.roundGained*.25)));
  s.score=Math.max(0,s.score-lost);s.roundGained-=lost;s.lockUntil=now+950;
  if(s.lives<1){s.phase='dead';s.deadAt=now;s.pausedAt=0;}
  else if(reason!=='night-hit'){
    s.deadline=Math.max(s.deadline,now+18000);
    if(levelOf(s).mode==='rhythm'){
      s.progress=0;s.inputStart=0;s.phase='show';
      s.showUntil=now+1000+demoLength(s);s.deadline=s.showUntil+levelOf(s).seconds*1000;
    }
  }
  event(s,reason,now);
}
export function restore(s,lives,points,now){
  advanceEconomy(s,now);
  s.lives=Math.min(3,s.lives+lives);addScore(s,points);
  if(s.lives>=1&&s.phase==='dead'){s.phase='recover';s.deadline=0;s.pausedAt=0;}
  event(s,'restored',now);
}
export function shareReward(s,now){
  const day=dayKey(now);
  if(s.shareDay!==day){s.shareDay=day;s.shareCount=0;}
  if(s.shareCount>=3||now-s.shareAt<15000)return false;
  s.shareCount++;s.shareAt=now;restore(s,.5,25,now);return true;
}
export function applyAction(input,action,now=Date.now()){
  const s=migrateState(structuredClone(input),now),l=levelOf(s);
  const elapsed=Math.max(0,now-s.lastClock);
  if((isActive(s)&&!s.pausedAt)||(s.night?.phase==='playing'&&!s.night.pausedAt))s.playMs+=Math.min(elapsed,5000);
  if(s.phase==='dead'&&s.roundGained>0){
    const loss=Math.min(s.roundGained,Math.floor(elapsed/1000)*Math.max(1,Math.ceil(s.roundGained/120)));
    s.score=Math.max(0,s.score-loss);s.roundGained-=loss;
  }
  s.lastClock=now;
  advanceEconomy(s,now);
  if(s.phase==='dead'&&s.lives>=1){s.phase='recover';event(s,'restored',now);}
  if(economyAction(s,action,now))return s;
  if(nightAction(s,action,now,damage))return s;
  if(action.type==='nightStart'&&s.cleared>=5&&s.lives>=1&&(!isActive(s)||s.pausedAt)){
    startNight(s,now);return s;
  }
  if(action.type==='pause'&&isActive(s)&&!s.pausedAt)s.pausedAt=now;
  if(action.type==='resume'&&s.pausedAt){
    const delta=now-s.pausedAt;s.deadline+=delta;
    if(s.phase==='show')s.showUntil+=delta;
    if(s.inputStart)s.inputStart+=delta;
    s.pausedAt=0;
  }
  if(s.pausedAt)return s;
  if(action.type==='begin'&&['ready','won','recover','complete'].includes(s.phase)&&s.lives>=1){
    if(s.phase==='won'||s.phase==='complete'){s.level++;startRound(s,now);}
    else if(s.phase==='recover'&&l.mode==='tap'){
      s.phase='playing';s.deadline=now+l.seconds*1000;s.lockUntil=0;event(s,'begin',now);
    }else startRound(s,now);
    return s;
  }
  if(s.phase==='show'&&now>=s.showUntil)s.phase='playing';
  if(isActive(s)&&now>s.deadline){damage(s,now,'timeout');return s;}
  if(action.type==='replay'&&isActive(s)&&l.mode==='rhythm'&&!s.replayed){
    s.replayed=true;s.progress=0;s.inputStart=0;s.phase='show';
    s.showUntil=now+demoLength(s);s.deadline=s.showUntil+l.seconds*1000;return s;
  }
  if(s.screenDay!==dayKey(now)){s.screenDay=dayKey(now);s.screenBonuses=0;}
  if(action.type==='screen'&&s.screenBonuses<30&&now-s.screenAt>=800){
    s.screenBonuses++;s.screenAt=now;addScore(s,5);s.lastGain=5;event(s,'screen',now);return s;
  }
  if(action.type!=='tap'||s.phase!=='playing'||now<s.lockUntil||now-s.lastTap<75)return s;
  if(!Number.isInteger(action.index)||action.index<0||action.index>=l.count)return s;
  const cost=tapPower(s);
  if(s.energy<cost){event(s,'no-energy',now);return s;}
  s.lastTap=now;s.taps++;s.energy-=cost;
  if(l.mode==='rhythm'){
    const offset=s.progress?now-s.inputStart:0;
    const goodTime=s.progress===0||Math.abs(offset-s.beats[s.progress])<=430;
    if(action.index!==s.sequence[s.progress]||!goodTime){damage(s,now,goodTime?'trap':'rhythm-miss');return s;}
    if(!s.progress)s.inputStart=now;
  }else if(action.index!==s.target){damage(s,now,'trap');return s;}
  s.progress++;
  const gain=cost*(l.mode==='rhythm'?5:1)*(now<s.turboUntil?5:1);
  addScore(s,gain);s.tapEarned+=gain;s.roundGained+=gain;s.lastGain=gain;event(s,'hit',now);
  if(s.progress>=l.goal){
    s.cleared=Math.max(s.cleared,s.level);s.phase='won';
    addScore(s,100+s.level*30);event(s,'won',now);
  }else if(l.mode==='tap'&&s.progress%(s.level<4?6:4)===0)s.target=(s.target+1+random(s,l.count-1))%l.count;
  return s;
}