export const HOUR = 3600000;
export const LIFE_TIME = 12 * HOUR;
export const MAX_SCORE = 9e14;
export const CARDS = [
  { id:0, cost:120, rate:35, icon:'▣' },
  { id:1, cost:350, rate:90, icon:'ϟ' },
  { id:2, cost:800, rate:200, icon:'▥' },
  { id:3, cost:2000, rate:480, icon:'↯' },
  { id:4, cost:6000, rate:1500, icon:'✝' },
  { id:5, cost:15000, rate:3600, icon:'▤' },
  { id:6, cost:40000, rate:10000, icon:'▶' }
];
export const LEAGUES = [0,10000,100000,1000000,5000000,20000000,100000000];
export const dayKey = now => new Date(now).toISOString().slice(0,10);
export const monthKey = now => dayKey(now).slice(0,7);
export function weekKey(now) {
  const d=new Date(now);d.setUTCHours(0,0,0,0);
  d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
  return d.toISOString().slice(0,10);
}
export const leagueOf = s => Math.max(0,LEAGUES.findLastIndex(n=>(s.totalEarned||0)>=n));
export const energyLimit = s => 1000+(s.energyLevel||0)*500;
export const tapPower = s => [1,2,5,10,20,35,50,75,100][Math.min(8,s.multi||0)];
export const hourly = s => CARDS.reduce((sum,c)=>sum+c.rate*(s.cards?.[c.id]||0),0);
export const cardCost = (s,id) => Math.ceil(CARDS[id].cost*Math.pow(1.65,s.cards[id]));
export const boostCost = (s,key) => Math.ceil((key==='multi'?500:750)*Math.pow(2,key==='multi'?s.multi:s.energyLevel));
export const dailyReward = day => day===30?5000000:Math.round(500*Math.pow(10000,(day-1)/29)/50)*50;
export function nextDay(s,now) {
  if(s.dailyAt===dayKey(now))return s.streak;
  return s.dailyAt===dayKey(now-86400000)?Math.min(30,s.streak+1):1;
}
export function hash(value) {
  let n=2166136261;
  for(const ch of String(value)){n^=ch.charCodeAt(0);n=Math.imul(n,16777619);}
  return n>>>0;
}
export function comboCards(now) {
  return CARDS.map(c=>({id:c.id,n:hash(dayKey(now)+':'+c.id)})).sort((a,b)=>a.n-b.n).slice(0,3).map(v=>v.id);
}
export function cipherOf(now) {
  const n=hash(dayKey(now));
  return { sequence:[n%3,(n>>>5)%3,(n>>>11)%3,(n>>>17)%3], beats:[0,600,1500,2100] };
}
export function economyDefaults(now) {
  return {
    totalEarned:0,tapEarned:0,energy:1000,energyLevel:0,multi:0,cards:Array(7).fill(0),
    bank:0,economyAt:now,lifeAt:now,streak:0,dailyAt:'',poster30:false,
    comboDay:dayKey(now),comboUpgrades:[],comboClaimed:'',cipher:null,
    boostDay:dayKey(now),turboUses:0,turboUntil:0,refillUsed:false,
    monthKey:monthKey(now),weekKey:weekKey(now),monthEarned:0,weekEarned:0
  };
}
export function addScore(s,amount) {
  if(!Number.isFinite(amount))return;
  s.score=Math.max(0,Math.min(MAX_SCORE,s.score+amount));
  if(amount>0){
    s.totalEarned=Math.min(MAX_SCORE,(s.totalEarned||0)+amount);
    s.monthEarned=Math.min(MAX_SCORE,(s.monthEarned||0)+amount);
    s.weekEarned=Math.min(MAX_SCORE,(s.weekEarned||0)+amount);
  }
  s.peakScore=Math.max(s.peakScore||0,s.totalEarned||0,s.score);
}
export function advanceEconomy(s,now) {
  const dt=Math.max(0,Math.min(now-s.economyAt,3*HOUR));
  const rate=hourly(s);
  s.bank=Math.min(3*rate,Math.max(0,s.bank)+dt/HOUR*rate);
  s.energy=Math.min(energyLimit(s),s.energy+Math.max(0,now-s.economyAt)/1000);
  s.economyAt=Math.max(s.economyAt,now);
  if(s.lives<3){
    const count=Math.floor(Math.max(0,now-s.lifeAt)/LIFE_TIME);
    if(count>0){s.lives=Math.min(3,s.lives+count);s.lifeAt+=count*LIFE_TIME;}
  }else s.lifeAt=now;
  if(s.monthKey!==monthKey(now)){s.monthKey=monthKey(now);s.monthEarned=0;}
  if(s.weekKey!==weekKey(now)){s.weekKey=weekKey(now);s.weekEarned=0;}
  if(s.comboDay!==dayKey(now)){s.comboDay=dayKey(now);s.comboUpgrades=[];s.cipher=null;}
  if(s.boostDay!==dayKey(now)){s.boostDay=dayKey(now);s.turboUses=0;s.refillUsed=false;}
}
function emit(s,event,now){s.event=event;s.eventAt=now;}
function comboWin(s,now) {
  if(s.comboClaimed===dayKey(now))return;
  s.comboClaimed=dayKey(now);addScore(s,1000000);emit(s,'combo-won',now);
}
export function economyAction(s,a,now) {
  if(a.type==='claimIncome'){
    const points=Math.floor(s.bank);
    if(points){s.bank-=points;addScore(s,points);s.lastGain=points;emit(s,'income',now);}
    return true;
  }
  if(a.type==='buyCard'){
    if(!Number.isInteger(a.id)||!CARDS[a.id]||s.cards[a.id]>=50)return true;
    const price=cardCost(s,a.id);
    if(s.score<price){emit(s,'poor',now);return true;}
    s.score-=price;s.cards[a.id]++;
    if(!s.comboUpgrades.includes(a.id))s.comboUpgrades.push(a.id);
    emit(s,'bought',now);
    if(comboCards(now).every(id=>s.comboUpgrades.includes(id)))comboWin(s,now);
    return true;
  }
  if(a.type==='daily'){
    if(s.dailyAt===dayKey(now))return true;
    s.streak=nextDay(s,now);s.dailyAt=dayKey(now);
    const amount=dailyReward(s.streak);addScore(s,amount);s.lastGain=amount;
    if(s.streak===30)s.poster30=true;
    emit(s,'daily',now);return true;
  }
  if(a.type==='boost'){
    if(['multi','energy'].includes(a.kind)){
      const key=a.kind==='multi'?'multi':'energyLevel',max=a.kind==='multi'?8:10;
      if(s[key]>=max)return true;
      const cost=boostCost(s,a.kind);
      if(s.score<cost){emit(s,'poor',now);return true;}
      s.score-=cost;s[key]++;emit(s,'boost',now);
    }
    if(a.kind==='turbo'&&s.turboUses<3&&now>=s.turboUntil){s.turboUses++;s.turboUntil=now+20000;emit(s,'boost',now);}
    if(a.kind==='refill'&&!s.refillUsed){s.refillUsed=true;s.energy=energyLimit(s);emit(s,'boost',now);}
    return true;
  }
  if(a.type==='cipherStart'){
    if(s.comboClaimed!==dayKey(now))s.cipher={showUntil:now+3700,start:0,progress:0};
    return true;
  }
  if(a.type==='cipherTap'){
    const c=s.cipher,pattern=cipherOf(now);
    if(!c||now<c.showUntil||s.comboClaimed===dayKey(now))return true;
    const offset=c.progress?now-c.start:0;
    if(a.index!==pattern.sequence[c.progress]||Math.abs(offset-pattern.beats[c.progress])>430){s.cipher=null;emit(s,'cipher-miss',now);return true;}
    if(!c.progress)c.start=now;
    c.progress++;
    if(c.progress===4){comboWin(s,now);s.cipher=null;}
    return true;
  }
  return false;
}