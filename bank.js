// LUT Deluxe v1.3: waveform-bank generation and Teensy target data exports.
// Browser + Node compatible. No third-party dependencies.
import {fft, resamplePeriodic, safePrefix} from './engine.js';

const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};

export const MUSICAL_BANKS=Object.freeze({
  'Analog Evolution':'Sine → triangle → saw → pulse. Coherent harmonic transitions.',
  'Warm Bass':'Rounded fundamentals, soft saturation and progressively richer bass harmonics.',
  'Pulse Laboratory':'Continuous pulse-width sweep from half-duty to narrow pulses.',
  'Hollow & Odd':'Odd harmonic textures from triangle to hollow square and reed.',
  'Vowel / Formant':'Moving harmonic formants: resonant, vowel-like spectral motion.',
  'Folded Spectrum':'Progressive sine wavefolding for sharp, animated spectra.',
  'Drawbar Organ':'Musically tuned harmonic drawbars with upper partials.',
  'Glass & Metal':'Increasingly prominent high partials and sharply shaped digital timbres.'
});
export const TARGETS=Object.freeze({
  'teensy3090':{label:'Teensy 4.0 / MCP4822 · original 0–3090',bitDepth:12,min:0,max:3090},
  'teensy4095':{label:'Teensy 4.0 / MCP4822 · full 0–4095',bitDepth:12,min:0,max:4095},
  'future16':{label:'Future 16-bit DAC · 0–65535',bitDepth:16,min:0,max:65535}
});

// Single-cycle (periodic) waveform. All families are harmonic/coherently phased.
// Deliberately do not depend on the original LFO formulas: those remain unchanged.
export function musicalWave(style,position,length=512){
  if(!(style in MUSICAL_BANKS))throw Error('Choose a valid musical bank family.');
  if(!Number.isInteger(length)||length<32||length>16384)throw Error('Bank length must be 32–16,384 samples.');
  const t=clamp(Number(position),0,1),wave=new Float32Array(length);
  for(let i=0;i<length;i++){
    const x=i/length,theta=TAU*x,si=Math.sin(theta);
    let y=0;
    switch(style){
      case 'Analog Evolution':{
        // Continuous blend among phase-coherent harmonic spectra.
        const keys=[0,1/3,2/3,1],idx=Math.min(2,Math.floor(t*3));
        const f=smooth((t-keys[idx])*3);
        for(let n=1;n<=64;n++){
          const a=idx===0?(n===1?1:0):idx===1?(n%2?(-1)**((n-1)/2)/(n*n):0):(-1)**(n+1)/n;
          const b=idx===0?(n%2?(-1)**((n-1)/2)/(n*n):0):idx===1?(-1)**(n+1)/n:(n%2?1/n:0);
          y+=lerp(a,b,f)*Math.sin(n*theta);
        }
        break;
      }
      case 'Warm Bass':{
        const clipped=Math.tanh(si*(1+7*t))/Math.tanh(1+7*t);
        const tri=(2/Math.PI)*Math.asin(si);
        const rich=si+.22*Math.sin(2*theta)+.18*Math.sin(3*theta)+.13*Math.sin(4*theta);
        y=lerp(lerp(si,tri,smooth(t*2)),lerp(clipped,rich,smooth((t-.5)*2)),smooth((t-.28)*1.5));
        break;
      }
      case 'Pulse Laboratory':{
        const duty=.5-.43*smooth(t);
        y=x<duty?1:-1;
        // Width-adjusted DC removed by the level stage below.
        break;
      }
      case 'Hollow & Odd':{
        const brightness=lerp(2.35,.82,smooth(t));
        for(let n=1;n<=63;n+=2)y+=Math.pow(-1,(n-1)/2)*(1/Math.pow(n,brightness))*Math.sin(n*theta);
        break;
      }
      case 'Vowel / Formant':{
        const center=lerp(3,17,t),width=lerp(2.2,4.1,t);
        y=.44*si;
        for(let n=2;n<=52;n++){
          const env=Math.exp(-.5*((n-center)/width)**2);
          y+=1.05*env/Math.sqrt(n)*Math.sin(n*theta);
        }
        break;
      }
      case 'Folded Spectrum':{
        const drive=1+5*t;
        y=Math.sin(si*drive*Math.PI/2);
        break;
      }
      case 'Drawbar Organ':{
        const drawbars=[1,.54,.34,.12,.2,.13,.085,.045];
        for(let n=1;n<=8;n++){
          const appear=smooth((t-((n-1)/10))/.35);
          y+=drawbars[n-1]*(n===1?1:appear)*Math.sin(n*theta);
        }
        break;
      }
      case 'Glass & Metal':{
        const partials=[1,2,3,5,7,11,13,17,23,29,37];
        for(let k=0;k<partials.length;k++){
          const appear=k===0?1:smooth((t-(k-1)*.09)/.3);
          const scale=k===0?.48:.35/(1+k*.19);
          y+=appear*scale*Math.sin(partials[k]*theta+(k%2?.17:0));
        }
        break;
      }
    }
    wave[i]=y;
  }
  return removeDC(wave);
}

export function measurements(wave){
  if(!wave?.length)throw Error('Cannot analyse an empty waveform.');
  let sum=0,sum2=0,min=Infinity,max=-Infinity;
  for(const v of wave){if(!Number.isFinite(v))throw Error('Non-finite waveform sample.');sum+=v;sum2+=v*v;min=Math.min(min,v);max=Math.max(max,v);}
  return {dc:sum/wave.length,rms:Math.sqrt(sum2/wave.length),vpp:max-min,peak:Math.max(Math.abs(min),Math.abs(max)),seam:Math.abs(wave[wave.length-1]-wave[0])};
}
function removeDC(wave){
  const mean=measurements(wave).dc;
  for(let i=0;i<wave.length;i++)wave[i]-=mean;
  return wave;
}

// Applied to the *base* frames only. For band-limited copies we do not
// renormalize after filtering: doing so would boost high-octave partials.
export function levelFrame(input,mode='peak'){
  if(!['peak','full','rms','preserve'].includes(mode))throw Error('Unknown bank level mode.');
  const out=Float32Array.from(input);
  if(mode==='preserve')return out;
  let {peak,vpp,rms,dc}=measurements(out);
  if(mode==='full'){
    let min=Infinity,max=-Infinity;for(const v of out){min=Math.min(min,v);max=Math.max(max,v);}
    if(vpp<1e-12){out.fill(0);return out;}
    for(let i=0;i<out.length;i++)out[i]=(out[i]-min)*2/vpp-1;
    return out;
  }
  if(mode==='rms'){
    // Audio-oriented level: RMS target ~0.5, peak capped to avoid clipping.
    for(let i=0;i<out.length;i++)out[i]-=dc;
    ({peak,rms}=measurements(out));
    const factor=Math.min(rms>1e-12?.5/rms:0,peak>1e-12?1/peak:0);
    for(let i=0;i<out.length;i++)out[i]*=factor;
    return out;
  }
  if(peak<1e-12){out.fill(0);return out;}
  for(let i=0;i<out.length;i++)out[i]/=peak;
  return out;
}

// Align B to A by fundamental phase, then refine locally with correlation.
// A fixed circular shift does not alter B's spectrum or period.
export function phaseAlign(a,b){
  if(!a||!b||a.length!==b.length)throw Error('Captured waveforms must match in size.');
  const n=a.length;
  let ar=0,ai=0,br=0,bi=0;
  for(let i=0;i<n;i++){
    const c=Math.cos(TAU*i/n),s=Math.sin(TAU*i/n);
    ar+=a[i]*c;ai-=a[i]*s;br+=b[i]*c;bi-=b[i]*s;
  }
  let guess=0;
  if(Math.hypot(ar,ai)>1e-5&&Math.hypot(br,bi)>1e-5){
    guess=Math.round((Math.atan2(ai,ar)-Math.atan2(bi,br))*n/TAU);
  }
  const radius=Math.max(2,Math.round(n/32)),step=Math.max(1,Math.floor(n/512));
  let best=-Infinity,shift=0;
  for(let delta=-radius;delta<=radius;delta++){
    const sh=((guess+delta)%n+n)%n;
    let dot=0;
    for(let i=0;i<n;i+=step)dot+=a[i]*b[(i+sh)%n];
    if(dot>best){best=dot;shift=sh;}
  }
  const out=new Float32Array(n);
  for(let i=0;i<n;i++)out[i]=b[(i+shift)%n];
  return {wave:out,shift};
}

export function morphSamples(a,b,t,method='linear'){
  if(!a||!b||a.length!==b.length)throw Error('Morph endpoints need equal sample counts.');
  const pos=clamp(Number(t),0,1),n=a.length;
  if(pos===0)return Float32Array.from(a);
  if(pos===1)return Float32Array.from(b);
  if(method==='linear'){
    const out=new Float32Array(n);
    for(let i=0;i<n;i++)out[i]=lerp(a[i],b[i],pos);
    return out;
  }
  if(method!=='spectral')throw Error('Unknown morph method.');
  const size=2**Math.ceil(Math.log2(n)),aa=resamplePeriodic(a,size),bb=resamplePeriodic(b,size);
  const ar=Float64Array.from(aa),ai=new Float64Array(size),br=Float64Array.from(bb),bi=new Float64Array(size);
  fft(ar,ai);fft(br,bi);
  const rr=new Float64Array(size),ri=new Float64Array(size);
  // Hermitian symmetry is reconstructed explicitly for a real-valued IFFT.
  for(let k=0;k<=size/2;k++){
    if(k===0||k===size/2){rr[k]=lerp(ar[k],br[k],pos);continue;}
    const magA=Math.hypot(ar[k],ai[k]),magB=Math.hypot(br[k],bi[k]);
    const magnitude=lerp(magA,magB,pos);
    const phaseA=Math.atan2(ai[k],ar[k]),phaseB=Math.atan2(bi[k],br[k]);
    let delta=phaseB-phaseA;
    delta=Math.atan2(Math.sin(delta),Math.cos(delta));
    const phase=phaseA+pos*delta;
    rr[k]=magnitude*Math.cos(phase);ri[k]=magnitude*Math.sin(phase);
    rr[size-k]=rr[k];ri[size-k]=-ri[k];
  }
  fft(rr,ri,true);
  return resamplePeriodic(rr,n);
}

// conservative pitch ceiling: 47% of Fs, leaving margin below Nyquist.
export function octaveTops(sampleRate=48000){
  if(![44100,48000,96000].includes(Number(sampleRate)))throw Error('Select 44.1, 48 or 96 kHz.');
  return [40,80,160,320,640,1280,2560,5120,10240,20000]
    .filter(v=>v<sampleRate*.47);
}
export function harmonicLimitFor(maxPitch,sampleRate){
  return Math.max(1,Math.floor(.47*sampleRate/maxPitch));
}
export function limitHarmonics(input,highestFrequency,sampleRate=48000){
  if(!(highestFrequency>0)||!(sampleRate>0))throw Error('Frequency and sample rate must be positive.');
  const n=2**Math.ceil(Math.log2(input.length));
  const src=resamplePeriodic(input,n),re=Float64Array.from(src),im=new Float64Array(n);
  fft(re,im);
  const maxH=Math.min(Math.floor(n/2)-1,harmonicLimitFor(highestFrequency,sampleRate));
  for(let k=maxH+1;k<n-maxH;k++){re[k]=0;im[k]=0;}
  fft(re,im,true);
  return resamplePeriodic(re,input.length);
}

export function makeBank({source='musical',style='Analog Evolution',a=null,b=null,frames=16,samples=512,morph='spectral',align=true,level='peak',bands=true,sampleRate=48000}={}){
  frames=Number(frames);samples=Number(samples);sampleRate=Number(sampleRate);
  if(!Number.isInteger(frames)||frames<2||frames>64)throw Error('Bank frames must be between 2 and 64.');
  if(!Number.isInteger(samples)||samples<32||samples>16384)throw Error('Bank samples must be 32–16,384.');
  if(!['musical','captured'].includes(source))throw Error('Invalid bank source.');
  if(!['linear','spectral'].includes(morph))throw Error('Invalid morph mode.');
  if(!(sampleRate>0))throw Error('Invalid sample rate.');
  if(source==='captured'&&(!a||!b))throw Error('Capture both A and B before building a custom bank.');
  let start,stop,alignment=0;
  if(source==='captured'){
    start=resamplePeriodic(a,samples);stop=resamplePeriodic(b,samples);
    if(align){const aligned=phaseAlign(start,stop);stop=aligned.wave;alignment=aligned.shift;}
  }
  const base=[];
  for(let i=0;i<frames;i++){
    const t=i/(frames-1);
    const raw=source==='musical'?musicalWave(style,t,samples):morphSamples(start,stop,t,morph);
    base.push(levelFrame(raw,level));
  }
  const upperHz=bands?octaveTops(sampleRate):[];
  // Store full resolution first and band-limited levels afterwards.
  const bankTables=[base,...upperHz.map(hz=>base.map(frame=>limitHarmonics(frame,hz,sampleRate)))];
  return {source,style:source==='musical'?style:'Captured A/B',frames,samples,level,morph,alignment,
    sampleRate,upperHz,bandCount:bankTables.length,tables:bankTables};
}

export function estimatedBytes(bank){return bank.frames*bank.samples*bank.bandCount*2;}
export function quantizeBank(bank,target='teensy3090'){
  const profile=TARGETS[target];if(!profile)throw Error('Invalid hardware profile.');
  const layers=bank.tables.map(frames=>frames.map(wave=>{
    const out=new Uint16Array(wave.length),span=profile.max-profile.min;
    for(let i=0;i<out.length;i++)out[i]=Math.round(clamp((wave[i]+1)*.5,0,1)*span+profile.min);
    return out;
  }));
  return {profile,layers};
}
export function bankManifest(bank,target='teensy3090',name='morphBank'){
  const profile=TARGETS[target];if(!profile)throw Error('Invalid hardware profile.');
  return {format:'LUT Deluxe Teensy Bank',version:1,name:safePrefix(name),
    source:bank.source,style:bank.style,samplesPerFrame:bank.samples,frames:bank.frames,
    layout:'[band][frame][sample]',bandCount:bank.bandCount,
    bandUpperHz:[null,...bank.upperHz], // band 0 is the unfiltered/full spectrum
    bandSelection:'Use first band whose upper Hz >= pitch; band 0 is unfiltered, for LFO/test only.',
    playbackSampleRate:bank.sampleRate,morphMethod:bank.morph,levelMode:bank.level,
    phaseShiftSamples:bank.alignment,bitDepth:profile.bitDepth,minCode:profile.min,maxCode:profile.max,
    encoding:'unsigned PCM little-endian, 16-bit storage; C++ header also included',
    dataBytes:estimatedBytes(bank),
    notes:'Bank data for an upcoming DDS firmware. Not drop-in compatible with Teensy_Morphing_LFO_V1_04.ino.'};
}
export function makeBankBinary(bank,target='teensy3090'){
  const {layers}=quantizeBank(bank,target);
  // Raw little-endian samples, [band][frame][sample]. Dimensions in matching manifest.
  const bytes=new Uint8Array(estimatedBytes(bank));let offset=0;
  for(const layer of layers)for(const frame of layer)for(const value of frame){bytes[offset++]=value&255;bytes[offset++]=value>>>8;}
  return bytes;
}
export function makeBankHeader(bank,target='teensy3090',rawName='morphBank'){
  const name=safePrefix(rawName),{profile,layers}=quantizeBank(bank,target);
  const rows=[`// LUT Deluxe v1.3 Teensy bank: ${bank.style}`,
    '// Intended for new DDS bank firmware, NOT compatible with legacy V1.04 unchanged.',
    '// Layout: [frequency band][morph frame][sample]. Band 0 is unfiltered.',
    `// Playback sampling: ${bank.sampleRate} Hz; code range ${profile.min}..${profile.max}.`,
    `#pragma once`, `#include <stdint.h>`,
    `constexpr uint16_t ${name}_SAMPLES = ${bank.samples};`,
    `constexpr uint16_t ${name}_FRAMES = ${bank.frames};`,
    `constexpr uint16_t ${name}_BANDS = ${bank.bandCount};`,
    `constexpr uint32_t ${name}_SAMPLE_RATE = ${bank.sampleRate}u;`,
    `constexpr uint32_t ${name}_BYTES = ${estimatedBytes(bank)}u;`,
    `static const uint32_t ${name}_bandUpperHz[${bank.bandCount}] = {${[0,...bank.upperHz].join(', ')}};`,
    `static const uint16_t ${name}[${bank.bandCount}][${bank.frames}][${bank.samples}] = {`];
  for(let band=0;band<layers.length;band++){
    rows.push(`  { // ${band===0?'full-resolution / no band-limit':`valid up to ${bank.upperHz[band-1]} Hz`}`);
    for(let frame=0;frame<bank.frames;frame++){
      const values=layers[band][frame];rows.push(`    { // frame ${frame+1}/${bank.frames}`);
      for(let i=0;i<values.length;i+=16)rows.push(`      ${Array.from(values.subarray(i,i+16)).join(', ')}${i+16<values.length?',':''}`);
      rows.push(`    }${frame===bank.frames-1?'':','}`);
    }
    rows.push(`  }${band===layers.length-1?'':','}`);
  }
  rows.push('};','');return rows.join('\n');
}
