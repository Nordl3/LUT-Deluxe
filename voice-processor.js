// Four-channel digital audition. The existing Teensy analogue outputs remain four separate DACs.
class QuadWavetableProcessor extends AudioWorkletProcessor {
 constructor(){super();this.phase=[0,0,0,0];this.low=[0,0,0,0];this.dcIn=[0,0,0,0];this.dcOut=[0,0,0,0];this.clock=0;this.banks=null;this.state=null;
  this.port.onmessage=e=>{if(e.data.type==='banks'){this.banks=e.data.banks;this.corrections=e.data.corrections||null;}
    if(e.data.type==='params')this.state=e.data.params;};}
 process(inputs,outputs){const out=outputs[0];if(!out?.length)return true;
   const left=out[0],right=out[1]||out[0],state=this.state,banks=this.banks;
   if(!state||!banks){left.fill(0);if(right!==left)right.fill(0);return true;}
   const solo=state.voices.some(v=>v.solo);
   for(let i=0;i<left.length;i++){
    let l=0,r=0;
    for(let ch=0;ch<4;ch++){
      const v=state.voices[ch],bank=banks[ch];if(!bank?.length||v.muted||(solo&&!v.solo))continue;
      const freq=Math.min(sampleRate*.45,state.frequency*(v.ratio||1)*Math.pow(2,v.octave+v.semitones/12+v.detune/1200));
      this.phase[ch]+=freq/sampleRate;this.phase[ch]-=Math.floor(this.phase[ch]);
      const morph=Math.max(0,Math.min(1,v.morph+(state.animation?.22*Math.sin(this.clock*6.28318*.11+ch):0)));
      const framePos=morph*(bank.length-1),fa=Math.floor(framePos),fb=Math.min(fa+1,bank.length-1),bf=framePos-fa;
      const a=bank[fa],b=bank[fb],shifted=this.phase[ch]+(v.phase||0),pt=(shifted-Math.floor(shifted))*a.length,ix=Math.floor(pt),nx=(ix+1)%a.length,frac=pt-ix;
      let x=(a[ix]+(a[nx]-a[ix])*frac)*(1-bf)+(b[ix]+(b[nx]-b[ix])*frac)*bf;
      const correction=this.corrections?.[ch]?.[fa];if(correction){const u=bf*(correction.gain.length-1),j=Math.floor(u),z=u-j,n=Math.min(j+1,correction.gain.length-1);x=x*(correction.gain[j]*(1-z)+correction.gain[n]*z)+(correction.offset[j]*(1-z)+correction.offset[n]*z);}
      // DC blocker accommodates full peak-to-peak waves with asymmetric offsets.
      const hp=x-this.dcIn[ch]+.995*this.dcOut[ch];this.dcIn[ch]=x;this.dcOut[ch]=hp;x=hp;
      const cutoff=Math.max(50,Math.min(sampleRate*.45,v.cutoff)),coef=1-Math.exp(-6.28318*cutoff/sampleRate);
      this.low[ch]+=coef*(x-this.low[ch]);
      const motion=1-v.motion*.5+v.motion*.5*Math.sin(6.28318*this.clock*v.motionRate+ch*1.3);
      const sample=this.low[ch]*v.gain*motion,angle=(v.pan+1)*Math.PI/4;
      l+=sample*Math.cos(angle);r+=sample*Math.sin(angle);
    }
    const master=state.master*1.25;
    left[i]=Math.tanh(l*master);right[i]=Math.tanh(r*master);
    this.clock+=1/sampleRate;
   }
   return true;
 }
}
registerProcessor('lut-quad-voice',QuadWavetableProcessor);
