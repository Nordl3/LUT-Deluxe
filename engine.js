// LUT Deluxe DSP engine. No runtime dependencies; everything executes locally.
// Important: "lfo" intentionally preserves the original Jupyter formulas and
// per-table min/max normalization (apart from safe handling of constant waves).
export const TYPES = ["Sine", "Triangle", "Square", "Ramp Up", "Ramp Down", "Additive"];
export const DEFAULTS = Object.freeze({
  coreType:"Sine", coreFreq:1, corePhase:0, rampSteepness:1,
  modType:"Sine",modFreq:0.25,modPhase:0,modAmplitude:0,modFadeIn:1,modFadeOut:1,dutyCycle:0.5,
  pivotX:0.5,pivotY:0,phaseDist:0,syncRatio:1,waveFold:0,bend:0,drive:0,
  removeDc:true,bandLimit:false,harmonics:[1,0.4,0.22,0.1,0,0,0,0],
  previewHz:220,volume:0.22,morphPosition:0,bankFrames:8,
  lutSize:4096,minDac:0,maxDac:3090,bitDepth:12,wavRate:44100,baseName:"myLUT"
});
const TAU=Math.PI*2;
const fract=x=>x-Math.floor(x);
const clamp=(v,low,high)=>Math.min(high,Math.max(low,v));
const sign=v=>Math.sign(v);

export function coreSample(t,type,slope=1,harmonics=DEFAULTS.harmonics){
  switch(type){
    case "Sine":return Math.sin(TAU*t);
    case "Ramp Down":return Math.pow(1-t,slope);
    case "Ramp Up":return Math.pow(t,slope);
    case "Triangle":return 2*Math.abs(t-0.5)-1; // historical formula
    case "Square":return Math.sign(Math.sin(TAU*t)); // historical formula
    case "Additive":return harmonics.reduce((sum,amp,k)=>sum+amp*Math.sin(TAU*(k+1)*t),0);
    default:return Math.sin(TAU*t);
  }
}
export function modSample(t,type,duty=0.5){
  switch(type){
    case "Sine":return Math.sin(TAU*t);
    case "Ramp Down":return 1-t;
    case "Ramp Up":return t;
    case "Triangle":return 2*Math.abs(t-0.5)-1;
    case "Square":return t<duty?1:-1;
    default:return 0;
  }
}
function normalizedBipolar(values){
  let min=Infinity,max=-Infinity;
  for(let i=0;i<values.length;i++){min=Math.min(min,values[i]);max=Math.max(max,values[i]);}
  const result=new Float32Array(values.length),range=max-min;
  if(!Number.isFinite(range)||range<1e-14)return result;
  for(let i=0;i<result.length;i++)result[i]=(values[i]-min)*2/range-1;
  return result;
}
function remapPhase(phase,p){
  const pivot=clamp(Number(p.pivotX),0.05,0.95);
  let x=phase<pivot?0.5*(phase/pivot):0.5+0.5*(phase-pivot)/(1-pivot);
  x=fract(x+Number(p.phaseDist)*Math.sin(TAU*x)/TAU);
  return fract(x*Number(p.syncRatio));
}
function shapeSample(y,p){
  // Bend, bias, saturation and fold are applied in this order.
  const exponent=Math.pow(2,Number(p.bend)*-2);
  y=sign(y)*Math.pow(Math.abs(y),exponent);
  y+=Number(p.pivotY)*(1-y*y)*0.7;
  const drive=1+Number(p.drive)*7;
  y=Math.tanh(y*drive)/Math.tanh(drive);
  const fold=1+Number(p.waveFold)*2;
  return (2/Math.PI)*Math.asin(clamp(Math.sin(y*fold*Math.PI/2),-1,1));
}
function subtractDC(wave){
  let mean=0;for(const v of wave)mean+=v;mean/=wave.length;
  let peak=0;for(let i=0;i<wave.length;i++){wave[i]-=mean;peak=Math.max(peak,Math.abs(wave[i]));}
  if(peak>0){for(let i=0;i<wave.length;i++)wave[i]/=peak;}
  return wave;
}
export function renderWave(p,mode="osc"){
  const n=Math.floor(Number(p.lutSize));
  if(!Number.isFinite(n)||n<16||n>16384)throw Error("LUT size must be between 16 and 16,384 samples.");
  const raw=new Float64Array(n);
  for(let i=0;i<n;i++){
    let t=fract(i/n*p.coreFreq+p.corePhase);
    if(mode!=="lfo")t=remapPhase(t,p);
    const core=coreSample(t,p.coreType,p.rampSteepness,p.harmonics);
    const mt=fract(i/n*p.modFreq+p.modPhase);
    const fadeI=Math.pow(i/(n-1),p.modFadeIn);
    const fadeO=Math.pow(1-i/(n-1),p.modFadeOut);
    const fade=Math.min(fadeI,fadeO);
    raw[i]=core+p.modAmplitude*fade*modSample(mt,p.modType,p.dutyCycle);
  }
  let wave=normalizedBipolar(raw);
  if(mode==="lfo")return wave;
  for(let i=0;i<n;i++)wave[i]=shapeSample(wave[i],p);
  if(p.removeDc)wave=subtractDC(wave);
  if(p.bandLimit)wave=bandLimitWave(wave,p.previewHz,p.wavRate);
  return wave;
}
export function morphWave(a,b,position){
  if(!a||!b||a.length!==b.length)throw Error("Capture A and B at the same LUT size before morphing.");
  const output=new Float32Array(a.length),t=clamp(position,0,1);
  for(let i=0;i<a.length;i++)output[i]=a[i]*(1-t)+b[i]*t;
  return output;
}
export function resamplePeriodic(wave,newSize){
  if(wave.length===newSize)return Float32Array.from(wave);
  const out=new Float32Array(newSize),oldN=wave.length;
  for(let i=0;i<newSize;i++){const t=i*oldN/newSize,a=Math.floor(t),f=t-a;out[i]=wave[a%oldN]*(1-f)+wave[(a+1)%oldN]*f;}
  return out;
}
function fft(re,im,inverse=false){
  const n=re.length;
  for(let i=1,j=0;i<n;i++){
    let bit=n>>1;
    for(;j&bit;bit>>=1)j^=bit;
    j^=bit;
    if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}
  }
  for(let len=2;len<=n;len<<=1){
    const theta=(inverse?2:-2)*Math.PI/len,wr0=Math.cos(theta),wi0=Math.sin(theta);
    for(let i=0;i<n;i+=len){
      let wr=1,wi=0;
      for(let j=0;j<len/2;j++){
        const u=i+j,v=u+len/2,vr=re[v]*wr-im[v]*wi,vi=re[v]*wi+im[v]*wr;
        re[v]=re[u]-vr;im[v]=im[u]-vi;re[u]+=vr;im[u]+=vi;
        const nextR=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=nextR;
      }
    }
  }
  if(inverse){for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}}
}
export function bandLimitWave(wave,frequency,sampleRate=44100){
  const n=2**Math.ceil(Math.log2(wave.length));
  const samples=resamplePeriodic(wave,n);
  const re=Float64Array.from(samples),im=new Float64Array(n);
  fft(re,im);
  const fundamental=Math.max(1,frequency);
  const limit=Math.min(n/2-1,Math.floor((sampleRate/2)/fundamental));
  for(let i=0;i<n;i++){
    const harmonic=Math.min(i,n-i);
    if(harmonic>limit){re[i]=0;im[i]=0;}
  }
  fft(re,im,true);
  return resamplePeriodic(re,wave.length);
}
export function spectrum(wave,count=48){
  const n=2048,samples=resamplePeriodic(wave,n),re=Float64Array.from(samples),im=new Float64Array(n);
  fft(re,im);
  const magnitudes=[];
  for(let k=1;k<=count;k++)magnitudes.push(Math.hypot(re[k],im[k]));
  const peak=Math.max(...magnitudes,1e-12);
  return magnitudes.map(v=>clamp(20*Math.log10(Math.max(v,1e-12)/peak),-72,0));
}
export function validateUnsigned(p){
  const depth=Number(p.bitDepth),limit=2**depth-1,min=Number(p.minDac),max=Number(p.maxDac);
  if(![8,10,12,16].includes(depth))throw Error("Select an unsigned DAC resolution of 8, 10, 12 or 16 bits.");
  if(!Number.isInteger(min)||!Number.isInteger(max)||min<0||max>limit||min>=max)
    throw Error(`Set an integer DAC range of 0 to ${limit}, with minimum less than maximum (current: ${min} to ${max}).`);
}
export function unsignedLUT(wave,p){
  validateUnsigned(p);
  const out=new Uint16Array(wave.length),min=Number(p.minDac),max=Number(p.maxDac);
  for(let i=0;i<wave.length;i++)out[i]=Math.trunc(clamp((wave[i]+1)*0.5,0,1)*(max-min)+min);
  return out;
}
export function signedLUT(wave,bits=16){
  const max=2**(bits-1)-1,min=-(2**(bits-1));
  const out=new Int16Array(wave.length);
  for(let i=0;i<wave.length;i++)out[i]=Math.trunc(clamp(wave[i],-1,1)*(wave[i]<0?-min:max));
  return out;
}
export function safePrefix(raw){
  const value=String(raw??"myLUT").trim().replace(/[^A-Za-z0-9_]/g,"_").replace(/^([^A-Za-z_])/,"_$1").slice(0,36);
  return value||"myLUT";
}
export function makeArduinoText(wave,p,identifier){
  const samples=unsignedLUT(wave,p);
  const rows=[];
  for(let i=0;i<samples.length;i+=10)rows.push("  "+Array.from(samples.slice(i,i+10)).join(", "));
  return `const uint16_t ${identifier}[LUT_SIZE] = {\n${rows.join(",\n")}\n};\n`;
}
export function makeSignedText(wave,identifier){
  const samples=signedLUT(wave,16),rows=[];
  for(let i=0;i<samples.length;i+=10)rows.push("  "+Array.from(samples.slice(i,i+10)).join(", "));
  return `const int16_t ${identifier}_pcm[LUT_SIZE] = {\n${rows.join(",\n")}\n};\n`;
}
export function makePCM(wave){
  const pcm=signedLUT(wave,16),result=new Uint8Array(pcm.length*2),v=new DataView(result.buffer);
  for(let i=0;i<pcm.length;i++)v.setInt16(i*2,pcm[i],true);
  return result;
}
export function makeWav(wave,frequency=220,sampleRate=44100,duration=2){
  const count=Math.round(duration*sampleRate),bytes=new Uint8Array(44+count*2);
  const view=new DataView(bytes.buffer);
  const writeString=(off,str)=>{for(let i=0;i<str.length;i++)view.setUint8(off+i,str.charCodeAt(i));};
  writeString(0,"RIFF");view.setUint32(4,36+count*2,true);writeString(8,"WAVE");
  writeString(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);
  view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);
  view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
  writeString(36,"data");view.setUint32(40,count*2,true);
  for(let i=0;i<count;i++){
    const t=fract(i*frequency/sampleRate)*wave.length,a=Math.floor(t),f=t-a;
    const x=wave[a%wave.length]*(1-f)+wave[(a+1)%wave.length]*f;
    const fade=Math.min(1,i/(sampleRate*0.008),(count-1-i)/(sampleRate*0.015));
    const sample=Math.round(clamp(x*0.7*fade,-1,1)*32767);
    view.setInt16(44+i*2,sample,true);
  }
  return bytes;
}
// Minimal standards-compliant ZIP writer (stored entries, no compression dependency).
const crcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;})();
function crc32(bytes){let crc=0xFFFFFFFF;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return(crc^0xFFFFFFFF)>>>0;}
const enc=new TextEncoder();
export function zipFiles(entries){
  const pieces=[],central=[];let offset=0;const date=new Date(),year=Math.max(1980,date.getFullYear());
  const time=(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1);
  const day=((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
  for(const [name,data] of entries){
    const nameBytes=enc.encode(name),body=typeof data==="string"?enc.encode(data):new Uint8Array(data),crc=crc32(body);
    const loc=new Uint8Array(30+nameBytes.length),lv=new DataView(loc.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint16(8,0,true);
    lv.setUint16(10,time,true);lv.setUint16(12,day,true);lv.setUint32(14,crc,true);
    lv.setUint32(18,body.length,true);lv.setUint32(22,body.length,true);lv.setUint16(26,nameBytes.length,true);
    loc.set(nameBytes,30);pieces.push(loc,body);
    const cd=new Uint8Array(46+nameBytes.length),cv=new DataView(cd.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);
    cv.setUint16(10,0,true);cv.setUint16(12,time,true);cv.setUint16(14,day,true);
    cv.setUint32(16,crc,true);cv.setUint32(20,body.length,true);cv.setUint32(24,body.length,true);
    cv.setUint16(28,nameBytes.length,true);cv.setUint32(42,offset,true);cd.set(nameBytes,46);
    central.push(cd);offset+=loc.length+body.length;
  }
  const centralSize=central.reduce((a,b)=>a+b.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);
  ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
  return new Blob([...pieces,...central,end],{type:"application/zip"});
}
