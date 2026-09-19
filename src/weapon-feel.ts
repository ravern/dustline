import type { WeaponId } from '../shared/types';

export const WEAPON_FEEL:Record<WeaponId,{rise:number;push:number;side:number;rate:number;limit:number;inertia:number;drawRate:number}>={
  intervention:{rise:.105,push:.069,side:.004,rate:16,limit:.16,inertia:.022,drawRate:10},
  deagle:{rise:.14,push:.065,side:.007,rate:19,limit:.21,inertia:.017,drawRate:13},
  scar:{rise:.053,push:.036,side:.0038,rate:22,limit:.13,inertia:.016,drawRate:13},
  ak47:{rise:.043,push:.03,side:.0045,rate:27,limit:.11,inertia:.012,drawRate:16},
  m9:{rise:.063,push:.033,side:.003,rate:32,limit:.11,inertia:.009,drawRate:20},
  glock:{rise:.033,push:.024,side:.0037,rate:38,limit:.092,inertia:.008,drawRate:23},
  knife:{rise:.04,push:.04,side:0,rate:24,limit:.08,inertia:.012,drawRate:18},
};
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));

/** Exact underdamped spring integration is stable across refresh rates and long frames. */
export class ViewSpring {
  value=0;velocity=0;
  reset(value=0){this.value=value;this.velocity=0;}
  step(target:number,rate:number,damping:number,dt:number){
    if(dt<=0)return this.value;
    const position=this.value-target,decay=damping*rate,frequency=rate*Math.sqrt(1-damping*damping);
    const phase=frequency*dt,exp=Math.exp(-decay*dt),cos=Math.cos(phase),sin=Math.sin(phase);
    const wave=(this.velocity+decay*position)/frequency;
    this.value=target+exp*(position*cos+wave*sin);
    this.velocity=exp*(this.velocity*cos-(decay*wave+frequency*position)*sin);
    return this.value;
  }
}

export class WeaponFeel {
  readonly pitch=new ViewSpring();readonly yaw=new ViewSpring();readonly roll=new ViewSpring();readonly push=new ViewSpring();
  readonly lagYaw=new ViewSpring();readonly lagPitch=new ViewSpring();readonly lateral=new ViewSpring();readonly vertical=new ViewSpring();
  readonly aim=new ViewSpring();
  private id:WeaponId='intervention';private shots=0;private forward=0;private right=0;private moving=false;
  get profile(){return WEAPON_FEEL[this.id];}
  reset(id:WeaponId){this.id=id;this.shots=0;this.forward=0;this.right=0;this.moving=false;for(const spring of this.springs())spring.reset();}
  private springs(){return[this.pitch,this.yaw,this.roll,this.push,this.lagYaw,this.lagPitch,this.lateral,this.vertical,this.aim];}
  fire(){
    const p=this.profile,pattern=[.45,-.3,.65,-.5,.18][this.shots++%5];
    this.pitch.value=clamp(this.pitch.value+p.rise*.14,0,p.limit);
    this.pitch.velocity=clamp(this.pitch.velocity+p.rise*p.rate*1.9,-p.limit*p.rate,p.limit*p.rate*1.8);
    this.push.value=clamp(this.push.value+p.push*.18,0,.095);
    this.push.velocity=clamp(this.push.velocity+p.push*p.rate*2,-2.5,2.5);
    this.yaw.velocity=clamp(this.yaw.velocity+pattern*p.side*p.rate*2,-.7,.7);
    this.roll.velocity=clamp(this.roll.velocity-pattern*p.side*p.rate*2.5,-.8,.8);
  }
  land(speed:number){
    const weight=this.profile.inertia/.016,amount=clamp(speed*.0025,.007,.027)*weight;
    this.vertical.velocity-=amount*18;this.lagPitch.velocity+=amount*15;
  }
  update(dt:number,motion:{yawRate:number;pitchRate:number;forward:number;right:number;ads:number}){
    const p=this.profile;
    this.pitch.step(0,p.rate,.78,dt);this.pitch.value=clamp(this.pitch.value,-.008,p.limit);
    this.yaw.step(0,p.rate*1.18,.82,dt);this.roll.step(0,p.rate,.8,dt);this.push.step(0,p.rate*1.3,.87,dt);this.push.value=clamp(this.push.value,-.004,.095);
    const acceleration=this.moving?(motion.forward-this.forward)/Math.max(.001,dt):0;
    const sideAcceleration=this.moving?(motion.right-this.right)/Math.max(.001,dt):0;
    this.forward=motion.forward;this.right=motion.right;this.moving=true;
    const hip=1-motion.ads*.93;
    this.lagYaw.step(clamp(-motion.yawRate*p.inertia,-.05,.05)*hip,18,.88,dt);
    this.lagPitch.step(clamp(-motion.pitchRate*p.inertia*.6+acceleration*.00035,-.035,.035)*hip,17,.84,dt);
    this.lateral.step(clamp(-motion.right*.002-sideAcceleration*.00012-motion.yawRate*.003,-.023,.023)*hip,16,.88,dt);
    this.vertical.step(clamp(-Math.abs(acceleration)*.00012,-.013,0)*hip,18,.79,dt);
    this.aim.step(motion.ads,p.drawRate*3,.94,dt);this.aim.value=clamp(this.aim.value,0,1);
  }
}

/** Magazine removal, seating and final latch have distinct pauses for matching foley. */
export function reloadAmount(progress:number){
  if(progress<=0||progress>=1)return 0;
  const keys=[[0,0],[.18,.82],[.34,1],[.5,.77],[.72,.56],[.82,.28],[1,0]];
  for(let i=1;i<keys.length;i++)if(progress<=keys[i][0]){
    const [a,x]=keys[i-1],[b,y]=keys[i],t=(progress-a)/(b-a),smooth=t*t*(3-2*t);return x+(y-x)*smooth;
  }
  return 0;
}
