// LUT Deluxe Ultimate: pure, dependency-free four-voice wavetable DSP.
import { fft, resamplePeriodic, zipFiles } from './engine.js';
import { limitHarmonics, phaseAlign, measurements } from './bank.js';
export { zipFiles, measurements };
const TAU=Math.PI*2;
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,Number(x)));
const mix=(a,b,t)=>a+(b-a)*t;
const fract=x=>x-Math.floor(x);
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
export const VOICE_LABELS=['VOICE_A','VOICE_B','VOICE_C','VOICE_D'];
export const FAMILY_DESCRIPTIONS={
 'Analog Bloom':'Phase-coherent sine → triangle → saturated saw harmonics',
 'Sub Foundation':'Weighty fundamental, sub-octave character and restrained upper partials',
 'Drawbar Organ':'Progressively add individual organ-style harmonic drawbars',
 'Omni Strings':'Rich odd/even ensembles with airy, moving high harmonics',
 'Key Electric':'Tine-like electric keys, moving upper partials and a rounded body',
 'Glass Bell':'Shimmering metallic harmonic clusters',
 'Formant Choir':'Resonant vowel filters travelling through harmonic space',
 'PWM Motion':'Moving pulse width with rich hollow stages',
 'Phase Distortion':'Variable phase warp with evolving brightness',
 'West Coast Fold':'Several stages of sine/triangle wave folding',
 'FM Spectrum':'Phase modulation sidebands, from soft to aggressive',
 'Sync Harmonics':'Variable hard-sync-like harmonics and resets',
 'Reese Bass':'Beating detune character baked into a repeating wave',
 'Spectral Spiral':'Rotating partial phases and travelling spectral energy',
 'Odd Cathedral':'Hollow odd harmonics and pipe-organ-like resonance',
 'Crystal Pluck':'A bright decaying-looking cycle with many upper harmonics',
 'Custom Harmonics':'32 user-editable partials and phases',
 'Hand Drawn':'User-drawn periodic wave with post-processing',
 'Imported Audio':'Resynthesised periodic frames from a sound file',
 'Harmonic Comb':'A selectable group of non-overlapping harmonics within a four-part harmonic set',
 'Spectral Partition':'Isolated harmonic ranges for four-way spectral recombination',
 'Even Spectrum':'An even-only spectrum complementing hollow odd harmonics'
};
export const FAMILIES=Object.keys(FAMILY_DESCRIPTIONS);
const defaults={gain:.8,pan:0,ratio:1,octave:0,semitones:0,detune:0,morph:.35,cutoff:16000,
  motion:.15,motionRate:.25,phase:0,muted:false,solo:false,
  brightness:.55,brightnessEnd:1,fold:0,foldEnd:.8,formant:.25,formantEnd:.78,
  fm:0,fmEnd:.8,pulse:.48,pulseEnd:.14,skew:.5,skewEnd:.76,drive:.12,driveEnd:.48,
  combGroup:0,combPeriod:4,bandStart:1,bandEnd:12,
  evolveCurve:'smooth',harmonics:Array.from({length:32},(_,i)=>i===0?1:0),
  phases:Array(32).fill(0),drawn:null,imported:null};
export function createVoice(label='SYNTH',family='Analog Bloom'){
 return {...structuredClone(defaults),label,family};
}
function config(label,family,values={}){const spectral=['Harmonic Comb','Spectral Partition','Even Spectrum'].includes(family);return {...createVoice(label,family),...(spectral?{fold:0,foldEnd:0,drive:0,driveEnd:0}:{}),...values};}
// Scenes are relationships between four *assignable* oscillators, not four fixed instruments.
export const SCENE_META={
 'Harmonic Constellation':{group:'HARMONIC STACK',description:'Fundamental, just fifth, octave and upper spectral halo. Four lines locked to one musical root.'},
 'Omni • Four voices':{group:'VINTAGE ENSEMBLE',description:'A vintage layered patch: foundation, warm synth, electric keys and airy ensemble.'},
 'Drawbar Architecture':{group:'HARMONIC STACK',description:'Four classic organ-footage relationships: 16′, 8′, 5⅓′ and 4′, blended as playable drawbars.'},
 'Quadrature Orbit':{group:'PHASE RELATIONSHIPS',description:'Four phase-locked copies separated by 90°. Perfect for external spatialization, VCAs, phase processing or feedback.'},
 'Odd / Even Spectrum':{group:'SPECTRAL SPLIT',description:'Bass fundamental, hollow odd harmonics, bright even-rich energy and the upper spectral air.'},
 'Fifths & Sevenths':{group:'HARMONIC STACK',description:'Just-intonation 1:1, 5:4, 3:2 and 7:4 chord ingredients to blend through a mixer.'},
 'Reese Conspiracy':{group:'DETUNE / BEATING',description:'Three tightly detuned oscillators around a deep sub, for wide beating analogue textures.'},
 'Vowel Quartet':{group:'FORMANT ORCHESTRA',description:'Four different formant trajectories, each occupying its own vowel-like spectral position.'},
 'Crystal Lattice':{group:'BELL / INHARMONIC',description:'Contrasting spectral bells, clean root, glass overtones and shimmering phase modulation.'},
 'West Coast Laboratory':{group:'TIMBRE CROSS-MOD',description:'A rounded root, wavefolding, phase distortion and FM sidebands: patch outputs into external VCAs/filters.'},
 'Pulse Mathematics':{group:'RHYTHMIC RATIOS',description:'Related 1×, 2×, 3× and 4× oscillations with contrasting pulses and phase movements.'},
 'Strings in the Machine':{group:'EVOLVING ENSEMBLE',description:'Interleaved warm string harmonics, octave air, hollow drone and travelling spectral texture.'},
 'Slow-Motion Galaxy':{group:'MOVING DRONE',description:'Detuned long-form motion with contrasting partial structures and drifting mix envelopes.'},
 'Cathedral • Drawbars':{group:'ORGAN CHOIR',description:'Organ drawbars and resonant pipes orchestrated across the four outputs.'},
 'Voltage • Tone Monster':{group:'SPECTRAL CONTRAST',description:'Aggressive bass, wavefolded upper harmonics, FM grit and animated spectral motion.'},
 'Astral • Glass & air':{group:'AMBIENT SPACE',description:'Low foundation, moving vowels, glass harmonics and an airy upper register.'},
 'Hollow • Motion':{group:'SPECTRAL CONTRAST',description:'Hollow odd partials, moving PWM, phase-warped highs and resonant vowel textures.'},
 'Vintage • Ensemble':{group:'VINTAGE ENSEMBLE',description:'Classic blended analog tones with detuned strings and restrained harmonics.'},
 'Harmonic • Orbit':{group:'MOVING HARMONICS',description:'Organ root, rotating partials, bell upper register and shifting formants.'},
 'Interleaved Harmonics':{group:'TRUE SPECTRAL COMPLEMENTS',description:'Four outputs carry exclusive harmonic numbers (1/5/9…, 2/6/10…, 3/7/11…, 4/8/12…). Mix or VCA them to construct new timbres.'},
 'Four-Band Spectrum':{group:'FREQUENCY PARTITION',description:'Four non-overlapping harmonic bands: foundation (1–3), body (4–8), bite (9–20), air (21–48).'},
};
export const SCENES={
 'Harmonic Constellation':[
  config('ROOT','Analog Bloom',{gain:.65,brightness:.2,brightnessEnd:.74,morph:.35,ratio:1,cutoff:6100}),
  config('FIFTH','Odd Cathedral',{gain:.38,ratio:1.5,morph:.55,pan:-.24,cutoff:8800}),
  config('OCTAVE','Key Electric',{gain:.28,ratio:2,morph:.41,pan:.23,cutoff:10400}),
  config('HALO','Spectral Spiral',{gain:.28,ratio:3,morph:.82,motion:.65,motionRate:.17,pan:.38,cutoff:13000})
 ],
 'Omni • Four voices':[
  config('BASS','Sub Foundation',{gain:.74,octave:-1,brightness:.22,brightnessEnd:.54,morph:.32,cutoff:2400,motion:.06}),
  config('SYNTH','Analog Bloom',{gain:.57,octave:0,brightness:.42,brightnessEnd:1,morph:.58,cutoff:8500,motion:.24}),
  config('KEYS','Key Electric',{gain:.43,octave:1,morph:.25,cutoff:6600,motion:.14,pan:-.34}),
  config('STRINGS','Omni Strings',{gain:.63,octave:0,detune:5,morph:.58,cutoff:10500,motion:.4,motionRate:.16,pan:.28})
 ],
 'Drawbar Architecture':[
  config('16′ SUB','Sub Foundation',{gain:.66,ratio:.5,brightness:.1,morph:.12}),
  config('8′ ROOT','Drawbar Organ',{gain:.67,ratio:1,morph:.26}),
  config('5⅓′ FIFTH','Drawbar Organ',{gain:.39,ratio:1.5,morph:.62,pan:-.18}),
  config('4′ OCTAVE','Drawbar Organ',{gain:.42,ratio:2,morph:.8,pan:.18})
 ],
 'Quadrature Orbit':[
  config('PHASE 0°','Phase Distortion',{gain:.5,ratio:1,phase:0,morph:.45,cutoff:9200}),
  config('PHASE 90°','Phase Distortion',{gain:.5,ratio:1,phase:.25,morph:.45,pan:-.3,cutoff:9200}),
  config('PHASE 180°','Phase Distortion',{gain:.5,ratio:1,phase:.5,morph:.45,cutoff:9200}),
  config('PHASE 270°','Phase Distortion',{gain:.5,ratio:1,phase:.75,morph:.45,pan:.3,cutoff:9200})
 ],
 'Odd / Even Spectrum':[
  config('FOUNDATION','Sub Foundation',{gain:.55,ratio:.5,morph:.18,cutoff:1700}),
  config('ODD PIPES','Odd Cathedral',{gain:.56,ratio:1,morph:.72,cutoff:7600}),
  config('EVEN GLOW','Even Spectrum',{gain:.42,ratio:1,morph:.84,phase:.12,cutoff:8300}),
  config('SPECTRAL AIR','Crystal Pluck',{gain:.29,ratio:2,morph:.86,cutoff:15500})
 ],
 'Fifths & Sevenths':[
  config('ROOT 1:1','Sub Foundation',{gain:.6,ratio:1,morph:.25}),
  config('MAJOR 5:4','Key Electric',{gain:.37,ratio:1.25,morph:.5,pan:-.25}),
  config('FIFTH 3:2','Odd Cathedral',{gain:.42,ratio:1.5,morph:.7,pan:.22}),
  config('SEVENTH 7:4','Omni Strings',{gain:.28,ratio:1.75,morph:.6,motion:.4})
 ],
 'Reese Conspiracy':[
  config('SUB','Sub Foundation',{gain:.58,ratio:.5,morph:.2,cutoff:1900}),
  config('CENTER','Reese Bass',{gain:.55,ratio:1,morph:.62,pan:0}),
  config('MINUS 9¢','Reese Bass',{gain:.48,ratio:1,detune:-9,morph:.62,pan:-.35}),
  config('PLUS 9¢','Reese Bass',{gain:.48,ratio:1,detune:9,morph:.62,pan:.35})
 ],
 'Vowel Quartet':[
  config('A VOWEL','Formant Choir',{gain:.55,formant:.16,formantEnd:.3,morph:.4,pan:-.3}),
  config('E VOWEL','Formant Choir',{gain:.45,formant:.36,formantEnd:.52,morph:.57,pan:.3}),
  config('I VOWEL','Formant Choir',{gain:.42,formant:.65,formantEnd:.9,morph:.62,ratio:2}),
  config('O VOWEL','Formant Choir',{gain:.52,formant:.08,formantEnd:.62,morph:.29,octave:-1})
 ],
 'Crystal Lattice':[
  config('SINE ROOT','Analog Bloom',{gain:.48,brightness:.05,brightnessEnd:.25,morph:.05}),
  config('GLASS','Glass Bell',{gain:.5,ratio:2,morph:.8,pan:-.27}),
  config('PRISM','Crystal Pluck',{gain:.4,ratio:3,morph:.8,pan:.3}),
  config('SPARK','FM Spectrum',{gain:.3,ratio:1.5,morph:.78,pan:.1})
 ],
 'West Coast Laboratory':[
  config('FUNDAMENTAL','Analog Bloom',{gain:.5,brightness:.05,brightnessEnd:.3,morph:.15}),
  config('FOLDER','West Coast Fold',{gain:.56,morph:.85,ratio:1}),
  config('PHASE WARP','Phase Distortion',{gain:.42,morph:.7,ratio:2,pan:-.3}),
  config('FM SIDEBANDS','FM Spectrum',{gain:.39,morph:.75,ratio:1.5,pan:.3})
 ],
 'Pulse Mathematics':[
  config('CLOCK ×1','PWM Motion',{gain:.46,ratio:1,pulse:.5,pulseEnd:.22,morph:.45}),
  config('CLOCK ×2','PWM Motion',{gain:.45,ratio:2,pulse:.35,pulseEnd:.12,morph:.52}),
  config('CLOCK ×3','Phase Distortion',{gain:.39,ratio:3,morph:.55}),
  config('CLOCK ×4','Sync Harmonics',{gain:.31,ratio:4,morph:.65})
 ],
 'Strings in the Machine':[
  config('WARM BODY','Omni Strings',{gain:.55,morph:.32,cutoff:4200}),
  config('OCTAVE AIR','Omni Strings',{gain:.37,ratio:2,morph:.8,cutoff:9500,detune:6}),
  config('HOLLOW','Odd Cathedral',{gain:.44,ratio:.5,morph:.55,cutoff:3300}),
  config('MOVING GLOW','Spectral Spiral',{gain:.31,ratio:1.5,morph:.87,pan:.35,motion:.7})
 ],
 'Slow-Motion Galaxy':[
  config('DRONE','Sub Foundation',{gain:.55,ratio:.5,morph:.52,motion:.2,motionRate:.07}),
  config('ECHO','Spectral Spiral',{gain:.46,ratio:1,detune:-4,morph:.67,motion:.65,motionRate:.13,pan:-.35}),
  config('ORBIT','Formant Choir',{gain:.45,ratio:1.5,detune:4,morph:.67,motion:.8,motionRate:.09,pan:.3}),
  config('STARS','Crystal Pluck',{gain:.31,ratio:2,morph:.83,motion:.65,motionRate:.2})
 ],
 'Cathedral • Drawbars':[
  config('LOW PIPE','Sub Foundation',{gain:.65,octave:-1,morph:.13}),
  config('DRAWBARS','Drawbar Organ',{gain:.62,morph:.62,octave:0}),
  config('HOLLOW','Odd Cathedral',{gain:.45,morph:.48,octave:1,pan:-.3}),
  config('UPPER PIPE','Drawbar Organ',{gain:.42,morph:.92,octave:0,detune:3,pan:.3,motion:.35})
 ],
 'Voltage • Tone Monster':[
  config('RESONANT SUB','Reese Bass',{gain:.84,octave:-1,morph:.68,cutoff:3200}),
  config('FOLDED LEAD','West Coast Fold',{gain:.52,morph:.79,cutoff:11000}),
  config('METALLIC','FM Spectrum',{gain:.42,octave:1,morph:.46,pan:-.35}),
  config('MOTION','Spectral Spiral',{gain:.41,morph:.86,pan:.35,motion:.56})
 ],
 'Astral • Glass & air':[
  config('LOW TIDE','Sub Foundation',{gain:.42,octave:-1,morph:.2,cutoff:1400}),
  config('VOCAL','Formant Choir',{gain:.48,morph:.43}),
  config('CHIMES','Glass Bell',{gain:.66,octave:1,morph:.74,pan:-.4}),
  config('AIR','Omni Strings',{gain:.54,morph:.93,pan:.4,motion:.68})
 ],
 'Hollow • Motion':[
  config('PIPE','Odd Cathedral',{gain:.55,octave:-1,morph:.35}),
  config('PWM','PWM Motion',{gain:.55,morph:.8,motion:.5}),
  config('SHIVER','Phase Distortion',{gain:.42,octave:1,morph:.54,pan:-.35}),
  config('FORMANT','Formant Choir',{gain:.56,morph:.68,motion:.75,pan:.4})
 ],
 'Vintage • Ensemble':[
  config('FUNDAMENTAL','Sub Foundation',{gain:.68,octave:-1,morph:.2}),
  config('ANALOG','Analog Bloom',{gain:.56,morph:.53,cutoff:7600}),
  config('DRAWBAR','Drawbar Organ',{gain:.43,octave:1,morph:.48}),
  config('STRINGS','Omni Strings',{gain:.73,morph:.72,detune:7,motion:.43,pan:.3})
 ],
 'Interleaved Harmonics':[
  config('PARTIALS 1 / 5 / 9','Harmonic Comb',{gain:.6,combGroup:0,brightness:.55,brightnessEnd:.95,morph:.5}),
  config('PARTIALS 2 / 6 / 10','Harmonic Comb',{gain:.53,combGroup:1,brightness:.55,brightnessEnd:.95,morph:.5}),
  config('PARTIALS 3 / 7 / 11','Harmonic Comb',{gain:.48,combGroup:2,brightness:.55,brightnessEnd:.95,morph:.5}),
  config('PARTIALS 4 / 8 / 12','Harmonic Comb',{gain:.44,combGroup:3,brightness:.55,brightnessEnd:.95,morph:.5})
 ],
 'Four-Band Spectrum':[
  config('FOUNDATION 1–3','Spectral Partition',{gain:.65,bandStart:1,bandEnd:3,brightness:.4,brightnessEnd:.85,morph:.5}),
  config('BODY 4–8','Spectral Partition',{gain:.5,bandStart:4,bandEnd:8,brightness:.4,brightnessEnd:.85,morph:.5}),
  config('BITE 9–20','Spectral Partition',{gain:.42,bandStart:9,bandEnd:20,brightness:.4,brightnessEnd:.85,morph:.5}),
  config('AIR 21–48','Spectral Partition',{gain:.37,bandStart:21,bandEnd:48,brightness:.4,brightnessEnd:.85,morph:.5})
 ],
 'Harmonic • Orbit':[
  config('ORGAN','Drawbar Organ',{gain:.49,octave:-1,morph:.2}),
  config('ROTATOR','Spectral Spiral',{gain:.6,morph:.7}),
  config('BELL','Glass Bell',{gain:.46,octave:1,morph:.55,pan:-.38}),
  config('VOWEL','Formant Choir',{gain:.47,octave:0,morph:.4,pan:.34})
 ]
};
export const DEFAULT_PROJECT=()=>({version:'2.0',name:'Harmonic Constellation',scene:'Harmonic Constellation',
 voices:structuredClone(SCENES['Harmonic Constellation']),frames:32,samples:512,rate:48000,
 normalization:'full',master:.27,frequency:110,globalMorph:.4,animation:false,
 bankMode:'independent',selected:0,previewBand:false});
export function normalize(wave,mode='full'){
 const w=Float32Array.from(wave);
 if(mode==='off')return w;
 let lo=Infinity,hi=-Infinity,dc=0;
 for(const a of w){lo=Math.min(lo,a);hi=Math.max(hi,a);dc+=a;}
 if(hi-lo<1e-9)return w.fill(0);
 if(mode==='full'){
   const factor=2/(hi-lo);for(let i=0;i<w.length;i++)w[i]=(w[i]-lo)*factor-1;
 }else{
   dc/=w.length;let peak=0;for(let i=0;i<w.length;i++){w[i]-=dc;peak=Math.max(peak,Math.abs(w[i]));}
   if(peak>1e-9)for(let i=0;i<w.length;i++)w[i]/=peak;
 }
 return w;
}
function oscHarm(phase, n, shift=0){return Math.sin(TAU*(phase*n+shift));}
function param(v,key,keyEnd,t){return mix(Number(v[key]??0),Number(v[keyEnd]??v[key]??0),t);}
export function makeFrame(v,position=0,length=512,level='full'){
 const n=Math.round(length);if(n<32||n>8192)throw Error('Frame size must be 32–8192.');
 const t=v.evolveCurve==='exp'?position*position:v.evolveCurve==='linear'?position:smooth(position);
 if(v.family==='Imported Audio'&&v.imported?.length){
   const index=clamp(position,0,1)*(v.imported.length-1),a=Math.floor(index),f=index-a;
   const x=resamplePeriodic(v.imported[a],n),y=resamplePeriodic(v.imported[Math.min(a+1,v.imported.length-1)],n);
   const result=new Float32Array(n);for(let i=0;i<n;i++)result[i]=mix(x[i],y[i],f);
   return normalize(result,level);
 }
 const brightness=param(v,'brightness','brightnessEnd',t),fold=param(v,'fold','foldEnd',t),
   formant=param(v,'formant','formantEnd',t),fm=param(v,'fm','fmEnd',t),
   pulse=clamp(param(v,'pulse','pulseEnd',t),.04,.96),skew=clamp(param(v,'skew','skewEnd',t),.05,.95),
   drive=param(v,'drive','driveEnd',t);
 const wave=new Float32Array(n);
 const family=v.family||'Analog Bloom';
 for(let i=0;i<n;i++){
   const x=i/n,phase=(x+1)%1;
   let y=0;
   switch(family){
    case 'Sub Foundation':{
      const fundamental=Math.sin(TAU*phase);
      y=fundamental*.75+Math.sin(TAU*2*phase)*.14*brightness+Math.sin(TAU*3*phase)*.1*brightness;
      y=Math.tanh(y*(1+5*brightness));break;
    }
    case 'Analog Bloom':{
      for(let h=1;h<=48;h++){
        const saw=1/h,triangle=(h%2?Math.pow(-1,(h-1)/2)/(h*h):0),sine=h===1?1:0;
        const a=mix(sine,triangle,smooth(brightness*1.7)),b=mix(triangle,saw,smooth((brightness-.33)*1.5));
        y+=mix(a,b,smooth((brightness-.27)*1.25))*oscHarm(phase,h);
      }break;
    }
    case 'Omni Strings':{
      const drifting=Math.sin(t*TAU*.7);
      for(let h=1;h<=46;h++)y+=Math.sin(TAU*(h*phase+.012*drifting*h))*Math.pow(h,-mix(1.65,.75,brightness))*(h%2?1:.62);
      y+=.22*Math.sin(TAU*(phase+formant*.06));break;
    }
    case 'Drawbar Organ':{
      const bars=[1,.58,.39,.3,.22,.17,.11,.09];
      for(let h=1;h<=8;h++){const a=h===1?1:smooth((brightness-(h-2)*.085)*2.7);y+=bars[h-1]*a*oscHarm(phase,h);}
      break;
    }
    case 'Key Electric':{
      const list=[[1,1],[2,.24],[3,.12],[4,.09],[7,.13],[9,.08],[11,.065],[13,.05]];
      for(const [h,a] of list)y+=a*(h===1?1:smooth(brightness*2.3+(h-3)*-.04))*oscHarm(phase,h,h===1?0:formant*.14*h);
      y=Math.tanh(y*(1+drive*2));break;
    }
    case 'Glass Bell':{
      const harmonic=[1,2,3,5,7,11,13,17,23,29,37];
      harmonic.forEach((h,k)=>{y+=(k===0?.7:.43/(1+k*.23))*smooth(brightness*2.1+.35-k*.14)*oscHarm(phase,h,k*.13+formant*k*.07);});break;
    }
    case 'Formant Choir':{
      const center=mix(3,22,formant),center2=mix(12,28,t),width=mix(1.1,4.5,brightness);
      y=.35*oscHarm(phase,1);
      for(let h=2;h<=56;h++){
        const a=Math.exp(-.5*((h-center)/width)**2)+.6*Math.exp(-.5*((h-center2)/3.1)**2);
        y+=a*oscHarm(phase,h)/(Math.sqrt(h));
      }break;
    }
    case 'PWM Motion':{
      const steep=mix(2,25,brightness),a=Math.tanh(steep*Math.sin(TAU*phase));
      const b=Math.tanh(steep*Math.sin(TAU*(phase-pulse)));
      y=a-b;break;
    }
    case 'Phase Distortion':{
      const xp=phase<skew?(phase/skew)*.5:.5+((phase-skew)/(1-skew))*.5;
      y=Math.sin(TAU*xp+brightness*Math.sin(TAU*xp)*2.5);break;
    }
    case 'West Coast Fold':{
      const tri=2/Math.PI*Math.asin(Math.sin(TAU*phase));
      y=Math.sin(tri*(1+brightness*7)*Math.PI/2);break;
    }
    case 'FM Spectrum':{
      const amount=mix(.05,4.5,Math.max(fm,brightness*.7));
      y=Math.sin(TAU*phase+amount*Math.sin(TAU*phase*(2+Math.round(formant*9))));break;
    }
    case 'Sync Harmonics':{
      const ratio=1+Math.floor(brightness*7),sub=fract(phase*ratio);
      y=2*sub-1;y=.7*y+.3*Math.sin(TAU*phase);break;
    }
    case 'Reese Bass':{
      y=Math.sin(TAU*phase)+.65*Math.sin(TAU*phase*2+brightness*.9)+.34*Math.sin(TAU*phase*3-formant*.8);
      y=Math.tanh(y*(2+brightness*5));break;
    }
    case 'Spectral Spiral':{
      for(let h=1;h<=40;h++){
        const env=Math.exp(-h/mix(5,25,brightness)),phi=Math.sin(h*.72+t*TAU)*formant*.28;
        y+=(env/Math.sqrt(h))*oscHarm(phase,h,phi);
      }break;
    }
    case 'Odd Cathedral':{
      for(let h=1;h<=45;h+=2)y+=oscHarm(phase,h,formant*.02*h)/Math.pow(h,mix(2.3,.85,brightness));break;
    }
    case 'Crystal Pluck':{
      for(let h=1;h<=50;h++)y+=Math.exp(-h/mix(5,35,brightness))*Math.sin(TAU*h*phase+Math.sin(h*formant)*.4);
      break;
    }
    case 'Harmonic Comb':{
      const period=clamp(Math.round(v.combPeriod||4),2,12),group=clamp(Math.round(v.combGroup||0),0,period-1);
      for(let h=1;h<=64;h++)if((h-1)%period===group)y+=oscHarm(phase,h,formant*.012*h)/Math.pow(h,mix(1.8,.68,brightness));
      break;
    }
    case 'Spectral Partition':{
      const lo=clamp(Math.round(v.bandStart||1),1,64),hi=clamp(Math.round(v.bandEnd||16),lo,64);
      for(let h=lo;h<=hi;h++)y+=oscHarm(phase,h,formant*.015*h)/Math.pow(h,mix(1.65,.75,brightness));
      break;
    }
    case 'Even Spectrum':{
      for(let h=2;h<=48;h+=2)y+=oscHarm(phase,h,formant*.014*h)/Math.pow(h,mix(1.8,.7,brightness));
      break;
    }
    case 'Custom Harmonics':{
      (v.harmonics||[]).forEach((a,k)=>{if(a)y+=Number(a)*oscHarm(phase,k+1,Number(v.phases?.[k]||0));});
      break;
    }
    case 'Hand Drawn':{
      const source=v.drawn||Array.from({length:256},(_,j)=>Math.sin(TAU*j/256));
      const p=phase*source.length,k=Math.floor(p),f=p-k;
      y=mix(source[k%source.length],source[(k+1)%source.length],f);break;
    }
    default:y=Math.sin(TAU*phase);
   }
   if(family!=='West Coast Fold' && fold>0){const f=1+fold*5;y=Math.sin(y*f*1.57);}
   if(drive>0)y=Math.tanh(y*(1+drive*7));
   wave[i]=y;
 }
 return normalize(wave,level);
}
export function makeVoiceBank(v,frames=32,length=512,level='full'){
 if(!Number.isInteger(frames)||frames<2||frames>256)throw Error('Frames must be 2–256');
 return Array.from({length:frames},(_,i)=>makeFrame(v,i/(frames-1),length,level));
}
// Measure and compensate amplitude collapse between adjacent fully-normalized cycles.
// Each bank has a small per-transition correction table; playback interpolates its gain/offset.
// Calculated off the audio thread, not once per output sample.
export function morphCalibration(bank,steps=24){
 if(!Array.isArray(bank)||!bank.length)return [];
 const result=[];
 for(let j=0;j<bank.length-1;j++){
  const a=bank[j],b=bank[j+1],gain=new Float32Array(steps+1),offset=new Float32Array(steps+1);
  if(a.length!==b.length)throw Error('Bank frame length mismatch');
  for(let k=0;k<=steps;k++){
   const t=k/steps;let lo=Infinity,hi=-Infinity;
   for(let n=0;n<a.length;n++){const x=a[n]*(1-t)+b[n]*t;lo=Math.min(lo,x);hi=Math.max(hi,x);}
   const span=hi-lo;if(span<1e-8){gain[k]=0;offset[k]=0;}
   else{gain[k]=2/span;offset[k]=-(hi+lo)/span;}
  }
  result.push({gain,offset});
 }
 return result;
}
export function morphLevel(calibration,index,fraction){
 const row=calibration?.[index];if(!row)return [1,0];
 const u=clamp(fraction,0,1)*(row.gain.length-1),k=Math.floor(u),f=u-k,next=Math.min(k+1,row.gain.length-1);
 return [mix(row.gain[k],row.gain[next],f),mix(row.offset[k],row.offset[next],f)];
}
export function interpolateBank(bank,position,calibration=null){
 const u=clamp(position,0,1)*(bank.length-1),i=Math.floor(u),f=u-i;
 const a=bank[i],b=bank[Math.min(i+1,bank.length-1)],out=new Float32Array(a.length);
 for(let n=0;n<out.length;n++)out[n]=mix(a[n],b[n],f);
 if(calibration){const [gain,offset]=morphLevel(calibration,i,f);for(let n=0;n<out.length;n++)out[n]=out[n]*gain+offset;return out;}
 return normalize(out,'full');
}
export function tableAnalysis(wave,maxH=32){
 const n=2**Math.ceil(Math.log2(wave.length)),w=resamplePeriodic(wave,n),re=Float64Array.from(w),im=new Float64Array(n);
 fft(re,im);
 return Array.from({length:Math.min(maxH,n/2)},(_,k)=>({n:k+1,amp:2*Math.hypot(re[k+1],im[k+1])/n,phase:Math.atan2(im[k+1],re[k+1])}));
}
export function renderMix(project,banks,duration=5,rate=44100){
 const total=Math.ceil(duration*rate),left=new Float32Array(total),right=new Float32Array(total);
 const phase=[0,0,0,0],filtered=[0,0,0,0],corrections=banks.map(bank=>morphCalibration(bank));
 const solo=project.voices.some(v=>v.solo);
 for(let i=0;i<total;i++){
  const seconds=i/rate,base=project.frequency*(1+0*seconds);
  let l=0,r=0;
  for(let ch=0;ch<4;ch++){
   const v=project.voices[ch];if(v.muted||(solo&&!v.solo))continue;
   const morph=clamp(v.morph+(project.animation ? .22*Math.sin(TAU*seconds*.11+ch):0),0,1);
   const bank=banks[ch],position=morph*(bank.length-1),bankIndex=Math.floor(position),frameBlend=position-bankIndex;
   const waveA=bank[bankIndex],waveB=bank[Math.min(bankIndex+1,bank.length-1)];
   const f=base*(v.ratio||1)*Math.pow(2,(v.octave||0)+(v.semitones||0)/12+(v.detune||0)/1200);
   phase[ch]=fract(phase[ch]+f/rate);
   const pos=fract(phase[ch]+(v.phase||0))*waveA.length,k=Math.floor(pos),alpha=pos-k,k1=(k+1)%waveA.length;
   let sample=mix(mix(waveA[k],waveA[k1],alpha),mix(waveB[k],waveB[k1],alpha),frameBlend);
   const [morphGain,morphOffset]=morphLevel(corrections[ch],bankIndex,frameBlend);sample=sample*morphGain+morphOffset;
   const filterHz=clamp(v.cutoff||16000,50,rate*.46);
   const coeff=1-Math.exp(-TAU*filterHz/rate);
   filtered[ch]+=coeff*(sample-filtered[ch]);sample=filtered[ch];
   const motion=(1-v.motion*.5)+v.motion*.5*Math.sin(TAU*seconds*(v.motionRate||.2)+ch*1.3);
   sample*=v.gain*motion;
   const pan=clamp(v.pan,-1,1),angle=(pan+1)*Math.PI/4;
   l+=sample*Math.cos(angle);r+=sample*Math.sin(angle);
  }
  const env=Math.min(1,i/(rate*.012),(total-1-i)/(rate*.045));
  // gentle soft clipping avoids a harsh brickwall when the four full-scale voices mix.
  const gain=project.master*env*1.25;
  left[i]=Math.tanh(l*gain);right[i]=Math.tanh(r*gain);
 }
 return [left,right];
}
function riff(chunks){
 const size=12+chunks.reduce((s,[,data])=>s+8+data.length+(data.length%2),0);
 const bytes=new Uint8Array(size),dv=new DataView(bytes.buffer);
 const ascii=(pos,s)=>{for(let i=0;i<s.length;i++)bytes[pos+i]=s.charCodeAt(i)};
 ascii(0,'RIFF');dv.setUint32(4,size-8,true);ascii(8,'WAVE');let p=12;
 for(const [id,data] of chunks){ascii(p,id);dv.setUint32(p+4,data.length,true);p+=8;bytes.set(data,p);p+=data.length+(data.length%2)}
 return bytes;
}
function fmtChunk(rate,channels,bitDepth,float){const b=new Uint8Array(16),v=new DataView(b.buffer),width=bitDepth/8;
 v.setUint16(0,float?3:1,true);v.setUint16(2,channels,true);v.setUint32(4,rate,true);
 v.setUint32(8,rate*width*channels,true);v.setUint16(12,width*channels,true);v.setUint16(14,bitDepth,true);return b;}
export function wavAudio(stereo,rate=44100){
 const n=stereo[0].length,data=new Uint8Array(n*4),dv=new DataView(data.buffer);
 for(let i=0;i<n;i++){dv.setInt16(i*4,Math.round(clamp(stereo[0][i],-1,1)*32767),true);
 dv.setInt16(i*4+2,Math.round(clamp(stereo[1][i],-1,1)*32767),true);}
 return riff([['fmt ',fmtChunk(rate,2,16,false)],['data',data]]);
}
export function wavTable(frames,{format='serum',rate=44100,samples=2048}={}){
 if(!Array.isArray(frames)||!frames.length||frames.length>256)throw Error('Wavetable needs 1–256 frames.');
 const payload=new Uint8Array(frames.length*samples*4),dv=new DataView(payload.buffer);
 let p=0;for(const frame of frames){const w=resamplePeriodic(frame,samples);
 for(const value of w){dv.setFloat32(p,clamp(value,-1,1),true);p+=4;}}
 const chunks=[['fmt ',fmtChunk(rate,1,32,true)]];
 if(format==='serum')chunks.push(['clm ',new TextEncoder().encode('<!>2048 01000000 wavetable (www.xferrecords.com)')]);
 chunks.push(['data',payload]);return riff(chunks);
}
export function teensyPackage(project,banks,{target='teensy3090',mipmaps=true,frameCount=32,samples=512}={}){
 const maxCode=target==='future16'?65535:target==='teensy4095'?4095:3090;
 const safe=s=>String(s).replace(/[^a-zA-Z0-9_]+/g,'_').replace(/^\d/,'_$&');
 const prefix=safe(project.name)||'LUTDeluxe';
 const tops=mipmaps?[40,80,160,320,640,1280,2560,5120,10240]:[];
 const head=['#pragma once','#include <stdint.h>',`// LUT Deluxe Ultimate - generated for NEW DDS firmware, not original V1.04`,`constexpr int LUT_FRAMES = ${frameCount};`,`constexpr int LUT_SAMPLES = ${samples};`,`constexpr int LUT_BANDS = ${tops.length+1};`,`constexpr int LUT_DAC_MAX = ${maxCode};`,`static const uint32_t LUT_BAND_MAX_HZ[LUT_BANDS] = {${[0,...tops].join(', ')}};`];
 const files=[],manifest={name:project.name,version:2,voices:[],frames:frameCount,samples,layout:'[band][frame][sample]',
  bandUpperHz:[null,...tops],target,maxCode,notes:'For new DDS engine only; not directly compatible with Teensy V1.04. Flash/RAM budget must be checked.'};
 for(let ch=0;ch<4;ch++){
  const v=project.voices[ch],frames=makeVoiceBank(v,frameCount,samples,project.normalization);
  const layers=[frames,...tops.map(hz=>frames.map(w=>limitHarmonics(w,hz,project.rate)))];
  const bin=new Uint8Array(layers.length*frameCount*samples*2),dv=new DataView(bin.buffer);let offset=0;
  const identifier=safe(prefix+'_'+(ch+1)+'_'+v.label);
  const lines=[`// ${v.label}: ${v.family}`,`static const uint16_t ${identifier}[LUT_BANDS][LUT_FRAMES][LUT_SAMPLES] = {`];
  for(const layer of layers){lines.push(' {');
   for(const w of layer){const codes=Array.from(w,x=>Math.round((clamp(x,-1,1)+1)*.5*maxCode));
    for(const value of codes){dv.setUint16(offset,value,true);offset+=2;}
    lines.push('  {');for(let i=0;i<codes.length;i+=20)lines.push('   '+codes.slice(i,i+20).join(', ')+(i+20<codes.length?',':''));
    lines.push('  },');}
   lines.push(' },');}lines.push('};');
  files.push([`${identifier}.bin`,bin]);head.push(lines.join('\n'));
  // Morph amplitude correction is part of the export contract: adjacent full-swing
  // frames can cancel during naive linear interpolation. This off-audio-thread
  // calibration lets the future DDS player compensate without recalculating a cycle.
  const calSteps=16,cal=morphCalibration(frames,calSteps);
  const calData=new Uint8Array((frameCount-1)*(calSteps+1)*2*4),calView=new DataView(calData.buffer);
  let calPos=0;for(const segment of cal)for(let j=0;j<=calSteps;j++){
   calView.setFloat32(calPos,segment.gain[j],true);calPos+=4;
   calView.setFloat32(calPos,segment.offset[j],true);calPos+=4;
  }
  files.push([`${identifier}.morph.f32`,calData]);
  head.push(`static const uint8_t ${identifier}_MORPH_STEPS = ${calSteps};`);
  for(const key of ['gain','offset']){
   head.push(`static const float ${identifier}_morph_${key}[LUT_FRAMES-1][${calSteps+1}] = {`+
    cal.map(segment=>' {'+Array.from(segment[key],x=>Number(x.toFixed(7))).join(', ')+'},').join('\n')+'\n};');
  }
  manifest.voices.push({name:v.label,family:v.family,bin:`${identifier}.bin`,bytes:bin.byteLength,
     morphCorrectionBin:`${identifier}.morph.f32`,morphSteps:calSteps,
     gain:v.gain,ratio:v.ratio||1,phase:v.phase||0,octave:v.octave,semitones:v.semitones,detune:v.detune,pan:v.pan});
 }
 files.push([`${prefix}.h`,head.join('\n\n')]);files.push([`${prefix}.json`,JSON.stringify(manifest,null,2)]);
 files.push(['README.txt','NEW DDS FIRMWARE BANK DATA. Each .bin contains unsigned 16-bit little endian values in [pitch band][morph frame][sample] order. Each .morph.f32 stores float32LE [transition][step][gain,offset] for full-Vpp morph correction of the base bank. Apply as output = interpolatedValue * gain + offset before DAC scaling. Original Teensy LFO V1.04 cannot load this format directly.']);
 return {files,manifest};
}
