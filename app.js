import {
  DEFAULTS, TYPES, renderWave, morphWave, normalizeHeadroom, makeArduinoText,
  makeSignedText, makePCM, makeWav, safePrefix, zipFiles, spectrum
} from "./engine.js";

const $=id=>document.getElementById(id);
const clone=v=>JSON.parse(JSON.stringify(v));
const initial=clone(DEFAULTS);
let p=clone(DEFAULTS),mode="lfo",wave=null,renderPending=false,playing=false;
let audioCtx=null,audioSource=null,audioGain=null,audioRefresh=null;
let capturedA=null,capturedB=null,dragging=false,history=[],lastHistoryTime=0,lastHistoryKey="";
const storage={
  get(key,fallback){try{const v=localStorage.getItem(key);return v===null?fallback:JSON.parse(v);}catch{return fallback;}},
  set(key,val){try{localStorage.setItem(key,JSON.stringify(val));}catch{}}
};
let exportNumber=storage.get("lutdeluxe_export_count",1);
if(!Number.isSafeInteger(exportNumber)||exportNumber<1)exportNumber=1;
let savedPresets=storage.get("lutdeluxe_presets",{});
if(!savedPresets||typeof savedPresets!=="object"||Array.isArray(savedPresets))savedPresets={};

const configs={
  coreFreq:{name:"Cycles per table",min:1,max:8,step:.25,unit:"×"},
  corePhase:{name:"Phase",min:0,max:1,step:.01,unit:""},
  rampSteepness:{name:"Ramp steepness",min:.1,max:10,step:.1,unit:""},
  modFreq:{name:"Mod frequency",min:.25,max:8,step:.25,unit:"×"},
  modPhase:{name:"Mod phase",min:0,max:1,step:.01,unit:""},
  modAmplitude:{name:"Mod depth",min:0,max:1,step:.01,unit:""},
  modFadeIn:{name:"Fade in curve",min:1,max:10,step:.5,unit:""},
  modFadeOut:{name:"Fade out curve",min:1,max:10,step:.5,unit:""},
  dutyCycle:{name:"Square duty",min:0,max:1,step:.01,unit:""},
  pivotX:{name:"Pivot X",min:.05,max:.95,step:.01,unit:""},
  pivotY:{name:"Pivot Y",min:-1,max:1,step:.01,unit:""},
  phaseDist:{name:"Phase distortion",min:0,max:1,step:.01,unit:""},
  syncRatio:{name:"Hard sync ratio",min:1,max:8,step:.25,unit:"×"},
  waveFold:{name:"Fold amount",min:0,max:4,step:.05,unit:""},
  bend:{name:"Bend / curve",min:-1,max:1,step:.01,unit:""},
  drive:{name:"Saturation drive",min:0,max:1,step:.01,unit:""},
  previewHz:{name:"Table repeat rate",min:20,max:2000,step:1,unit:"Hz"},
  volume:{name:"Audition volume",min:0,max:.6,step:.01,unit:""},
  morphPosition:{name:"Morph A → B",min:0,max:1,step:.01,unit:""},
  bankFrames:{name:"Bank frames",min:2,max:64,step:1,unit:""},
  lutSize:{name:"LUT samples",min:16,max:16384,step:1,unit:""},
  minDac:{name:"Min DAC value",min:0,max:65535,step:1,unit:""},
  maxDac:{name:"Max DAC value",min:0,max:65535,step:1,unit:""}
};
// Presets are organised as musical starting points; all remain editable.
const presetGroups={
  "LFO · Essentials":{
    "Default LFO":{mode:"lfo",params:{}},
    "Pure Sine LFO":{mode:"lfo",params:{coreType:"Sine",modAmplitude:0}},
    "Triangle LFO":{mode:"lfo",params:{coreType:"Triangle",modAmplitude:0}},
    "Square LFO":{mode:"lfo",params:{coreType:"Square",modAmplitude:0}},
    "Rising Ramp":{mode:"lfo",params:{coreType:"Ramp Up",modAmplitude:0,rampSteepness:1}},
    "Falling Ramp":{mode:"lfo",params:{coreType:"Ramp Down",modAmplitude:0,rampSteepness:1}},
    "Slow Pulse":{mode:"lfo",params:{coreType:"Square",dutyCycle:.18,modType:"Square",modAmplitude:.2,modFreq:.25}},
    "LFO Triangle Shimmer":{mode:"lfo",params:{coreType:"Triangle",modAmplitude:.5,modType:"Sine",modFreq:4}}
  },
  "LFO · Modulated":{
    "Breathing Sine":{mode:"lfo",params:{coreType:"Sine",modType:"Sine",modAmplitude:.26,modFreq:2,modFadeIn:2,modFadeOut:2}},
    "Ripple Ramp":{mode:"lfo",params:{coreType:"Ramp Up",modType:"Sine",modAmplitude:.24,modFreq:6}},
    "Square Chopper":{mode:"lfo",params:{coreType:"Sine",modType:"Square",modAmplitude:.55,modFreq:4,dutyCycle:.22}},
    "Triangular Drift":{mode:"lfo",params:{coreType:"Triangle",modType:"Triangle",modAmplitude:.38,modFreq:1.5}},
    "Curved Rise":{mode:"lfo",params:{coreType:"Ramp Up",rampSteepness:3.8,modAmplitude:0}},
    "Curved Fall":{mode:"lfo",params:{coreType:"Ramp Down",rampSteepness:4.7,modAmplitude:0}}
  },
  "Oscillator · Fundamentals":{
    "Clean Sine":{mode:"osc",params:{coreType:"Sine",modAmplitude:0}},
    "Pure Triangle":{mode:"osc",params:{coreType:"Triangle",modAmplitude:0}},
    "Bright Saw":{mode:"osc",params:{coreType:"Ramp Up",modAmplitude:0}},
    "Hollow Square":{mode:"osc",params:{coreType:"Square",modAmplitude:0}},
    "Warm Saturation":{mode:"osc",params:{coreType:"Sine",modAmplitude:0,drive:.38}},
    "Crooked Triangle":{mode:"osc",params:{coreType:"Triangle",modAmplitude:0,pivotX:.3,pivotY:.6,bend:-.5}}
  },
  "Oscillator · Wavefolding":{
    "Folded Glass":{mode:"osc",params:{coreType:"Sine",waveFold:1.9,drive:.28,modAmplitude:0,phaseDist:.12}},
    "Metal Ribbon":{mode:"osc",params:{coreType:"Triangle",waveFold:2.7,drive:.36,modAmplitude:0,pivotX:.34}},
    "Velvet Fold":{mode:"osc",params:{coreType:"Sine",waveFold:.72,drive:.14,modAmplitude:0}},
    "Folding Edge":{mode:"osc",params:{coreType:"Ramp Down",waveFold:1.5,drive:.45,modAmplitude:0}},
    "Glass Cathedral":{mode:"osc",params:{coreType:"Sine",waveFold:3.2,drive:.27,phaseDist:.2,modAmplitude:0}},
    "Broken Mirror":{mode:"osc",params:{coreType:"Triangle",waveFold:3.75,bend:-.55,modAmplitude:0}}
  },
  "Oscillator · Phase & Sync":{
    "Sync Screamer":{mode:"osc",params:{coreType:"Ramp Down",syncRatio:3,phaseDist:.55,drive:.55,modAmplitude:0}},
    "Double Cycle":{mode:"osc",params:{coreType:"Sine",syncRatio:2,modAmplitude:0}},
    "Skewed Sine":{mode:"osc",params:{coreType:"Sine",pivotX:.19,modAmplitude:0}},
    "Phase Runner":{mode:"osc",params:{coreType:"Sine",phaseDist:.85,modAmplitude:0}},
    "Warp Engine":{mode:"osc",params:{coreType:"Triangle",pivotX:.73,pivotY:-.35,bend:.68,phaseDist:.35,modAmplitude:0}},
    "Triple Sync":{mode:"osc",params:{coreType:"Ramp Up",syncRatio:3,drive:.2,modAmplitude:0}}
  },
  "Oscillator · Harmonic & Textural":{
    "Harmonic Garden":{mode:"osc",params:{coreType:"Additive",modAmplitude:.12,phaseDist:0,waveFold:.3}},
    "Odd Harmonics":{mode:"osc",params:{coreType:"Additive",harmonics:[1,0,.5,0,.28,0,.17,0],modAmplitude:0}},
    "Organ Stack":{mode:"osc",params:{coreType:"Additive",harmonics:[1,.7,.45,.2,.12,.1,.08,.04],modAmplitude:0}},
    "Airy Fifths":{mode:"osc",params:{coreType:"Additive",harmonics:[1,0,.05,.7,0,.2,0,.08],modAmplitude:0}},
    "Circuit Buzz":{mode:"osc",params:{coreType:"Additive",harmonics:[.7,.8,.6,.7,.55,.4,.45,.3],drive:.33,modAmplitude:0}},
    "Shimmering Coil":{mode:"osc",params:{coreType:"Additive",harmonics:[1,.12,.7,.08,.56,.05,.4,.03],waveFold:.4,modAmplitude:0}}
  }
};
const builtinPresets=Object.assign({},...Object.values(presetGroups));

let toastTimer;
function msg(text,error=false){
  const toast=$("status");
  toast.textContent=text;toast.classList.toggle("error",error);
  toast.classList.add("visible");clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove("visible"),error?6000:2500);
}
function showError(error){console.error(error);msg(error instanceof Error?error.message:String(error),true);}
function clampNumber(n,min,max){return Math.min(max,Math.max(min,n));}
function createControls(){
  for(const [key,cfg] of Object.entries(configs)){
    const target=document.querySelector(`[data-control="${key}"]`);
    if(!target)continue;
    const isInt=cfg.step===1;
    const div=document.createElement("div");div.className="knob-row";
    div.innerHTML=`<div class="knob-top"><label class="knob-label" for="num_${key}">${cfg.name}</label>
      <div class="knob-value"><input class="number-entry" type="number" id="num_${key}" min="${cfg.min}" max="${cfg.max}" step="${cfg.step}" aria-label="${cfg.name} precise value"><span class="knob-unit">${cfg.unit}</span></div></div>
      <input class="range-entry" type="range" id="range_${key}" min="${cfg.min}" max="${cfg.max}" step="${cfg.step}" aria-label="${cfg.name} slider">`;
    target.appendChild(div);
    const num=$("num_"+key),range=$("range_"+key);
    const changed=(value,origin)=>{
      if(value===""||!Number.isFinite(Number(value)))return;
      let n=clampNumber(Number(value),cfg.min,cfg.max);
      if(isInt)n=Math.round(n);
      setValue(key,n);
      if(origin==="num")range.value=String(n);
      else num.value=String(n);
    };
    // Keep the numeric box editable while a multi-digit value is being typed.
    // Apply in-range values live, without rewriting the user's active text.
    num.addEventListener("input",()=>{
      if(num.value==="")return;
      const n=Number(num.value);
      if(!Number.isFinite(n)||n<cfg.min||n>cfg.max)return;
      const adjusted=isInt?Math.round(n):n;
      if(p[key]!==adjusted){
        historySave(key);p[key]=adjusted;
        if(key==="lutSize")$("morphEnabled").checked=false;
        range.value=String(adjusted);requestRender();
      }
    });
    num.addEventListener("change",()=>changed(num.value,"num"));
    num.addEventListener("blur",()=>{num.value=String(p[key]);});
    range.addEventListener("input",()=>changed(range.value,"range"));
  }
  const panel=$("harmonicsControls");
  for(let i=0;i<8;i++){
    const d=document.createElement("div");d.className="knob-row";
    d.innerHTML=`<div class="knob-top"><label class="knob-label" for="harm_${i}">H${i+1}</label><input class="number-entry" type="number" id="harm_${i}" min="0" max="1" step=".01" aria-label="Harmonic ${i+1}"></div><input type="range" class="range-entry" id="harm_range_${i}" min="0" max="1" step=".01" aria-label="Harmonic ${i+1} slider">`;
    panel.appendChild(d);
    const num=$("harm_"+i),range=$("harm_range_"+i);
    num.addEventListener("input",()=>{
      if(num.value==="")return;
      const n=Number(num.value);
      if(!Number.isFinite(n)||n<0||n>1)return;
      historySave("harmonics");p.harmonics[i]=n;range.value=String(n);requestRender();
    });
    num.addEventListener("change",()=>{
      p.harmonics[i]=clampNumber(Number(num.value)||0,0,1);
      num.value=String(p.harmonics[i]);range.value=num.value;requestRender();
    });
    range.addEventListener("input",()=>{
      historySave("harmonics");p.harmonics[i]=Number(range.value);
      num.value=range.value;requestRender();
    });
    num.addEventListener("blur",()=>{num.value=String(p.harmonics[i]);});
  }
  // Tiny playable keyboard: clicking a key changes the audition frequency.
  const keybed=document.createElement("div");keybed.className="mini-keyboard";keybed.id="miniKeyboard";
  for(const [note,hz,black] of [
    ["C3",130.81,0],["C#3",138.59,1],["D3",146.83,0],["D#3",155.56,1],["E3",164.81,0],
    ["F3",174.61,0],["F#3",185,1],["G3",196,0],["G#3",207.65,1],["A3",220,0],
    ["A#3",233.08,1],["B3",246.94,0],["C4",261.63,0]
  ]){
    const btn=document.createElement("button");btn.type="button";btn.className=black?"piano-key black":"piano-key";
    btn.title=`Play ${note} (${hz} Hz)`;btn.textContent=note;btn.addEventListener("click",async()=>{
      setValue("previewHz",Math.round(hz));if(!playing)await startAudio();
    });keybed.appendChild(btn);
  }
  document.querySelector(".audition-panel").appendChild(keybed);
}
function updateInputs(){
  for(const key of Object.keys(configs)){
    const num=$("num_"+key),range=$("range_"+key);
    if(num)num.value=String(p[key]);
    if(range)range.value=String(p[key]);
  }
  for(let i=0;i<8;i++){$("harm_"+i).value=String(p.harmonics[i]);$("harm_range_"+i).value=String(p.harmonics[i]);}
  $("coreType").value=p.coreType;$("modType").value=p.modType;
  $("removeDc").checked=!!p.removeDc;$("bandLimit").checked=!!p.bandLimit;
  $("bitDepth").value=String(p.bitDepth);$("wavRate").value=String(p.wavRate);
  $("baseName").value=p.baseName;
  $("headroomMode").value=p.headroomMode||"auto";
}
function historySave(key){
  const now=performance.now();
  if(now-lastHistoryTime>360||key!==lastHistoryKey){history.push({mode,params:clone(p)});if(history.length>70)history.shift();}
  lastHistoryTime=now;lastHistoryKey=key;
}
function setValue(key,value){
  if(p[key]===value)return;
  historySave(key);p[key]=value;
  if(key==="lutSize"&&(capturedA||capturedB)){$("morphEnabled").checked=false;}
  updateInputs();requestRender();
}
function setMode(next){
  if(!["lfo","osc"].includes(next))return;
  mode=next;document.body.classList.toggle("lfo-mode",mode==="lfo");
  $("modeOsc").classList.toggle("active",mode==="osc");$("modeLfo").classList.toggle("active",mode==="lfo");
  $("modeOsc").setAttribute("aria-pressed",String(mode==="osc"));$("modeLfo").setAttribute("aria-pressed",String(mode==="lfo"));
  $("workspaceTitle").textContent=mode==="lfo"?"Classic LFO Workshop":"Oscillator Laboratory";
  $("workspaceDesc").textContent=mode==="lfo"?"Your original LUT generator — straightforward, familiar, ready for Teensy.":"Sculpt a single cycle, explore its harmonics, and export it for your synth.";
  requestRender();
}
function requestRender(){
  if(renderPending)return;renderPending=true;
  requestAnimationFrame(()=>{renderPending=false;try{
    wave=renderWave(p,mode);
    if(mode==="osc"&&$("morphEnabled").checked&&capturedA&&capturedB&&capturedA.length===wave.length&&capturedB.length===wave.length)
      wave=applyMorphHeadroom(morphWave(capturedA,capturedB,p.morphPosition));
    drawScope($("waveCanvas"),wave,false);drawSpectrum();
    const waveMin=Math.min(...wave.length<=16384?wave:[0]),waveMax=Math.max(...wave.length<=16384?wave:[0]);
    const vpp=Math.round(Math.max(0,waveMax-waveMin)*50);
    $("waveStats").textContent=`${wave.length.toLocaleString()} SAMPLES · ${vpp}% SWING`;
    $("waveDescription").textContent=`${p.coreType.toUpperCase()} • ${mode==="lfo"?"CLASSIC LFO":"AUDIO OSCILLATOR"}`;
    $("audioHz").innerHTML=`${p.previewHz} <small>Hz</small>`;
    $("audioNote").textContent=noteFromHz(p.previewHz);
    if(playing){clearTimeout(audioRefresh);audioRefresh=setTimeout(refreshAudio,120);}
  }catch(e){showError(e);}});
}
function applyMorphHeadroom(values){
  if(p.headroomMode==="full")return normalizeHeadroom(values,"full");
  if(p.headroomMode==="audio")return normalizeHeadroom(values,"peak");
  // Auto and Bank Preserve deliberately keep the relative frame levels.
  return values;
}
function noteFromHz(hz){
  const midi=Math.round(69+12*Math.log2(hz/440));
  return ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"][((midi%12)+12)%12]+(Math.floor(midi/12)-1);
}
function drawScope(canvas,wave,forExport=false,title="LUT Deluxe • Waveform Laboratory"){
  const ctx=canvas.getContext("2d"),w=canvas.width,h=canvas.height;
  ctx.fillStyle="#0c1825";ctx.fillRect(0,0,w,h);
  const padX=forExport?56:0,padTop=forExport?110:0,padBot=forExport?74:0;
  const left=padX,right=w-padX,top=padTop,bottom=h-padBot,middle=(top+bottom)/2,amplitude=(bottom-top)*.42;
  ctx.save();ctx.lineWidth=1;
  for(let i=0;i<=12;i++){const x=left+(right-left)*i/12;ctx.strokeStyle=i%3===0?"#243a48":"#192c39";ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();}
  for(let i=0;i<=8;i++){const y=top+(bottom-top)*i/8;ctx.strokeStyle=i===4?"#3c6670":i%2===0?"#253b49":"#192c39";ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();}
  ctx.beginPath();ctx.moveTo(left,middle);ctx.lineTo(right,middle);ctx.setLineDash([8,8]);ctx.strokeStyle="#42616f";ctx.stroke();ctx.setLineDash([]);
  const stride=Math.max(1,Math.ceil(wave.length/(w*1.25)));
  function makePath(){ctx.beginPath();for(let i=0;i<wave.length;i+=stride){const x=left+(right-left)*i/(wave.length-1),y=middle-amplitude*wave[i];i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}if((wave.length-1)%stride!==0)ctx.lineTo(right,middle-amplitude*wave[wave.length-1]);}
  ctx.save();ctx.shadowColor="#25d7e3";ctx.shadowBlur=17;ctx.strokeStyle="#1dd6df";ctx.lineWidth=5;makePath();ctx.stroke();ctx.restore();
  ctx.strokeStyle="#a7fcf3";ctx.lineWidth=forExport?2.8:2;makePath();ctx.stroke();
  if(!forExport&&mode==="osc"){
    const x=p.pivotX*w,y=h*(.5-p.pivotY*.32);
    ctx.strokeStyle="#c8a36976";ctx.setLineDash([5,7]);ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();ctx.arc(x,y,11,0,TAU);ctx.fillStyle="#ffbd70aa";ctx.fill();
    ctx.beginPath();ctx.arc(x,y,5.5,0,TAU);ctx.fillStyle="#ffe9af";ctx.fill();
    ctx.strokeStyle="#533b1b";ctx.lineWidth=1;ctx.stroke();
  }
  if(forExport){
    ctx.fillStyle="#e5faff";ctx.font="bold 36px system-ui";ctx.fillText(title,56,54);
    ctx.font="20px system-ui";ctx.fillStyle="#90aabd";ctx.fillText(`${p.coreType} • ${mode==="lfo"?"LFO":"OSC"} • ${wave.length} samples • ${p.previewHz} Hz audition`,56,86);
    ctx.font="17px monospace";ctx.fillStyle="#7f99a9";ctx.fillText("SAMPLE INDEX →",left,bottom+36);
    ctx.fillStyle="#40d8dd";ctx.fillText("LUT DELUXE • GENERATED LOCALLY",w-372,bottom+36);
  }
  ctx.restore();
}
const TAU=2*Math.PI;
function drawSpectrum(){
  const canvas=$("spectrumCanvas"),ctx=canvas.getContext("2d"),w=canvas.width,h=canvas.height;
  ctx.fillStyle="#0d1927";ctx.fillRect(0,0,w,h);
  for(let y=0;y<=4;y++){const yy=16+y*(h-35)/4;ctx.strokeStyle="#21374a";ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(w,yy);ctx.stroke();}
  const db=spectrum(wave,48),spacing=(w-24)/48,bar=Math.max(2,spacing-3);
  for(let i=0;i<db.length;i++){
    const height=Math.max(2,((db[i]+72)/72)*(h-36));
    const gradient=ctx.createLinearGradient(0,h-16,0,h-height);
    gradient.addColorStop(0,i%2?"#188aa3":"#1cbcb9");gradient.addColorStop(1,i%2?"#a483ff":"#58f0da");
    ctx.fillStyle=gradient;ctx.fillRect(12+i*spacing,h-16-height,bar,height);
  }
}
function pointerWarp(evt){
  const rect=$("waveCanvas").getBoundingClientRect(),x=clampNumber((evt.clientX-rect.left)/rect.width,.05,.95);
  const y=clampNumber((.5-(evt.clientY-rect.top)/rect.height)/.32,-1,1);
  historySave("warp-handle");p.pivotX=Math.round(x*100)/100;p.pivotY=Math.round(y*100)/100;
  updateInputs();requestRender();
}
function canvasBlob(canvas,type="image/png"){
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("Could not render PNG image.")),type));
}
async function imageBlob(displayWave,title){
  const c=document.createElement("canvas");c.width=1440;c.height=610;
  drawScope(c,displayWave,true,title);
  return canvasBlob(c);
}
async function blobBytes(blob){return new Uint8Array(await blob.arrayBuffer());}
async function downloadBlob(blob,filename){
  if(window.pywebview?.api?.save_file){
    // Native Save As dialog for the optional Windows wrapper.
    const bytes=await blobBytes(blob);let text="";
    for(let i=0;i<bytes.length;i+=32768){text+=String.fromCharCode(...bytes.slice(i,i+32768));}
    const result=await window.pywebview.api.save_file(filename,btoa(text));
    if(result==="cancelled")return false;
    if(result!=="saved")throw Error("The Windows Save As dialog could not save the file.");
    return true;
  }
  const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);return true;
}
function exportIdentifier(){
  const id=`${safePrefix(p.baseName)}_${exportNumber}`;
  return id;
}
function afterExport(label,success=true){
  if(!success){msg("Download cancelled.");return;}
  exportNumber+=1;storage.set("lutdeluxe_export_count",exportNumber);
  msg(`✓ ${label} • Next export: ${safePrefix(p.baseName)}_${exportNumber}`);
}
async function withExport(action){
  try{
    if(!wave)throw Error("The waveform isn't ready yet.");
    const ident=exportIdentifier();
    const result=await action(ident);
    afterExport(ident+" exported",result!==false);
  }catch(e){showError(e);}
}
async function allExport(ident){
  const entries=[
    [`${ident}.txt`,makeArduinoText(wave,p,ident)],
    [`${ident}.png`,await blobBytes(await imageBlob(wave,`LUT Deluxe • ${ident}`))],
    [`${ident}.wav`,makeWav(wave,p.previewHz,p.wavRate)],
    [`${ident}.pcm`,makePCM(wave)],
    [`${ident}_pcm.txt`,makeSignedText(wave,ident)],
    [`${ident}_settings.json`,JSON.stringify({app:"LUT Deluxe",version:1,mode,settings:p},null,2)]
  ];
  if(capturedA&&capturedB&&capturedA.length===capturedB.length&&capturedA.length===p.lutSize){
    for(let j=0;j<p.bankFrames;j++){
      const frame=applyMorphHeadroom(morphWave(capturedA,capturedB,j/(p.bankFrames-1)));
      const name=`${ident}_frame_${String(j+1).padStart(2,"0")}`;
      entries.push([`bank/${name}.txt`,makeArduinoText(frame,p,name)]);
    }
  }
  return downloadBlob(zipFiles(entries),`${ident}_all.zip`);
}
async function pairedExport(ident){
  const txt=makeArduinoText(wave,p,ident);
  const png=await blobBytes(await imageBlob(wave,`LUT Deluxe • ${ident}`));
  const zip=zipFiles([[`${ident}.txt`,txt],[`${ident}.png`,png]]);
  return downloadBlob(zip,`${ident}.zip`);
}
async function singleText(ident){return downloadBlob(new Blob([makeArduinoText(wave,p,ident)],{type:"text/plain"}),`${ident}.txt`);}
async function singlePng(ident){return downloadBlob(await imageBlob(wave,`LUT Deluxe • ${ident}`),`${ident}.png`);}
async function singleWav(ident){
  return downloadBlob(new Blob([makeWav(wave,p.previewHz,p.wavRate)],{type:"audio/wav"}),`${ident}.wav`);
}
async function singlePcm(ident){return downloadBlob(new Blob([makePCM(wave)],{type:"application/octet-stream"}),`${ident}.pcm`);}
async function singlePcmTxt(ident){
  return downloadBlob(new Blob([makeSignedText(wave,ident)],{type:"text/plain"}),`${ident}_pcm.txt`);
}
async function exportBank(){
  try{
    if(!capturedA||!capturedB)throw Error("Capture Wave A and Wave B first.");
    if(capturedA.length!==capturedB.length||capturedA.length!==p.lutSize)throw Error("Wave A and B must match the current LUT size. Capture them again.");
    const ident=exportIdentifier(),entries=[],num=p.bankFrames;
    for(let j=0;j<num;j++){
      const frame=applyMorphHeadroom(morphWave(capturedA,capturedB,j/(num-1)));
      const frameName=`${ident}_frame_${String(j+1).padStart(2,"0")}`;
      entries.push([`${frameName}.txt`,makeArduinoText(frame,p,frameName)]);
    }
    const sheet=document.createElement("canvas");sheet.width=1200;sheet.height=120+num*55;
    const ctx=sheet.getContext("2d");ctx.fillStyle="#0e1926";ctx.fillRect(0,0,sheet.width,sheet.height);
    ctx.fillStyle="#e0faff";ctx.font="bold 28px system-ui";ctx.fillText(`LUT Deluxe — ${ident} Morph Bank`,30,42);
    for(let j=0;j<num;j++){
      const frame=applyMorphHeadroom(morphWave(capturedA,capturedB,j/(num-1)));
      const y=72+j*50;if(y+40>sheet.height)break;
      ctx.fillStyle="#7da4b9";ctx.font="14px monospace";ctx.fillText(String(j+1).padStart(2,"0"),20,y+15);
      ctx.strokeStyle="#24c8d0";ctx.lineWidth=1.6;ctx.beginPath();
      for(let i=0;i<frame.length;i+=Math.max(1,Math.ceil(frame.length/900))){
        const x=70+i/(frame.length-1)*1100,yy=y+17-frame[i]*16;
        i===0?ctx.moveTo(x,yy):ctx.lineTo(x,yy);
      }ctx.stroke();
    }
    entries.push([`${ident}_overview.png`,await blobBytes(await canvasBlob(sheet))]);
    entries.push([`${ident}_bank.json`,JSON.stringify({
      format:"LUT Deluxe wavetable bank",version:1,lutSize:p.lutSize,frames:num,
      interpolation:"linear between captured A and B; phase aligned by sample index",
      dacRange:[p.minDac,p.maxDac],bitDepth:p.bitDepth
    },null,2)]);
    const result=await downloadBlob(zipFiles(entries),`${ident}_bank.zip`);
    afterExport(`${ident}_bank.zip exported`,result);
  }catch(e){showError(e);}
}
function capture(which){
  try{
    const standalone=renderWave(p,mode);
    if(which==="A")capturedA=Float32Array.from(standalone);
    else capturedB=Float32Array.from(standalone);
    $("captureStatus").textContent=`A: ${capturedA?`${capturedA.length} samples`:"—"}   B: ${capturedB?`${capturedB.length} samples`:"—"}`;
    msg(`Wave ${which} captured. ${capturedA&&capturedB?"Enable morph preview to sweep between them.":"Change the controls and capture the other wave."}`);
    requestRender();
  }catch(e){showError(e);}
}
async function startAudio(){
  try{
    if(!wave)throw Error("Wave not ready.");
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context)throw Error("This browser does not support Web Audio.");
    if(!audioCtx)audioCtx=new Context();
    await audioCtx.resume();playing=true;
    refreshAudio();
    $("playBtn").textContent="■";$("playBtn").setAttribute("aria-label","Stop oscillator");
    $("audioIndicator").textContent="● PLAYING";$("audioIndicator").classList.add("playing");
  }catch(e){playing=false;showError(e);}
}
function refreshAudio(){
  if(!playing||!audioCtx||!wave)return;
  const now=audioCtx.currentTime;
  const buffer=audioCtx.createBuffer(1,wave.length,audioCtx.sampleRate);
  buffer.getChannelData(0).set(wave);
  const src=audioCtx.createBufferSource();src.buffer=buffer;src.loop=true;
  // One table cycle lasts (N/sampleRate) seconds at rate=1.
  // To play p.previewHz cycles/s, playbackRate = Hz*N/sampleRate.
  src.playbackRate.value=p.previewHz*wave.length/audioCtx.sampleRate;
  const gain=audioCtx.createGain();gain.gain.setValueAtTime(0,now);
  gain.gain.linearRampToValueAtTime(p.volume*.6,now+.02);
  src.connect(gain);gain.connect(audioCtx.destination);src.start(now);
  if(audioGain){audioGain.gain.cancelScheduledValues(now);audioGain.gain.setTargetAtTime(0,now,.008);}
  if(audioSource){try{audioSource.stop(now+.075);}catch{}}
  audioSource=src;audioGain=gain;
}
function stopAudio(){
  playing=false;clearTimeout(audioRefresh);
  if(audioCtx&&audioGain){const t=audioCtx.currentTime;audioGain.gain.setTargetAtTime(0,t,.009);}
  if(audioCtx&&audioSource){try{audioSource.stop(audioCtx.currentTime+.08);}catch{}}
  audioSource=null;audioGain=null;
  $("playBtn").textContent="▶";$("playBtn").setAttribute("aria-label","Play oscillator");
  $("audioIndicator").textContent="● STOPPED";$("audioIndicator").classList.remove("playing");
}
function loadPreset(obj){
  if(!obj||typeof obj!=="object")throw Error("Invalid preset.");
  const settings=obj.params||obj.settings||obj;
  const next=clone(DEFAULTS);
  for(const key of Object.keys(next)){
    if(!(key in settings))continue;
    if(key==="harmonics"&&Array.isArray(settings.harmonics)&&settings.harmonics.length===8){
      next.harmonics=settings.harmonics.map(v=>clampNumber(Number(v)||0,0,1));continue;
    }
    if(typeof next[key]==="number"){
      const n=Number(settings[key]);if(!Number.isFinite(n))continue;
      next[key]=configs[key]?clampNumber(n,configs[key].min,configs[key].max):n;
      if(configs[key]?.step===1)next[key]=Math.round(next[key]);
    }else if(typeof next[key]==="boolean")next[key]=!!settings[key];
    else if(typeof next[key]==="string")next[key]=String(settings[key]).slice(0,50);
  }
  if(!TYPES.includes(next.coreType))next.coreType="Sine";
  if(!TYPES.slice(0,5).includes(next.modType))next.modType="Sine";
  if(![8,10,12,16].includes(Number(next.bitDepth)))next.bitDepth=12;
  next.minDac=Math.max(0,Math.min(next.minDac,2**next.bitDepth-2));
  next.maxDac=clampNumber(next.maxDac,next.minDac+1,2**next.bitDepth-1);
  if(!["auto","full","audio","bank"].includes(next.headroomMode))next.headroomMode="auto";
  next.baseName=safePrefix(next.baseName);
  historySave("preset");p=next;capturedA=null;capturedB=null;
  $("morphEnabled").checked=false;$("captureStatus").textContent="A: —   B: —";
  updateInputs();setMode(obj.mode==="lfo"?"lfo":"osc");
}
function refreshPresets(){
  const category=$("presetCategory"),previous=category.value;
  category.innerHTML="";
  for(const value of ["All categories",...Object.keys(presetGroups),"My presets"]){
    const option=document.createElement("option");option.value=value;option.textContent=value;
    category.appendChild(option);
  }
  category.value=Array.from(category.options).some(o=>o.value===previous)?previous:"All categories";
  const el=$("presetSelect"),selected=el.value;el.innerHTML="";
  for(const [name,presets] of Object.entries(presetGroups)){
    if(category.value!=="All categories"&&category.value!==name)continue;
    const group=document.createElement("optgroup");group.label=name;
    for(const preset of Object.keys(presets)){
      const option=document.createElement("option");option.value=`builtin:${preset}`;option.textContent=preset;group.appendChild(option);
    }
    el.appendChild(group);
  }
  if(category.value==="All categories"||category.value==="My presets"){
    const group=document.createElement("optgroup");group.label="My presets";
    for(const name of Object.keys(savedPresets).sort()){
      const option=document.createElement("option");option.value=`user:${name}`;option.textContent=name;group.appendChild(option);
    }
    el.appendChild(group);
  }
  if(Array.from(el.options).some(o=>o.value===selected))el.value=selected;
}
function bindActions(){
  $("coreType").addEventListener("change",e=>setValue("coreType",e.target.value));
  $("modType").addEventListener("change",e=>setValue("modType",e.target.value));
  for(const key of ["removeDc","bandLimit"]){
    $(key).addEventListener("change",e=>setValue(key,e.target.checked));
  }
  $("bitDepth").addEventListener("change",e=>{
    historySave("bitDepth");p.bitDepth=Number(e.target.value);
    const limit=2**p.bitDepth-1;
    p.minDac=Math.min(p.minDac,limit-1);p.maxDac=Math.min(p.maxDac,limit);
    if(p.maxDac<=p.minDac)p.maxDac=p.minDac+1;
    updateInputs();requestRender();
  });
  $("wavRate").addEventListener("change",e=>setValue("wavRate",Number(e.target.value)));
  $("headroomMode").addEventListener("change",e=>setValue("headroomMode",e.target.value));
  $("presetCategory").addEventListener("change",refreshPresets);
  $("baseName").addEventListener("input",e=>{p.baseName=e.target.value;});
  $("baseName").addEventListener("blur",()=>{p.baseName=safePrefix(p.baseName);updateInputs();});
  $("modeOsc").addEventListener("click",()=>setMode("osc"));
  $("modeLfo").addEventListener("click",()=>setMode("lfo"));
  $("playBtn").addEventListener("click",()=>playing?stopAudio():startAudio());
  $("undoBtn").addEventListener("click",()=>{
    if(!history.length){msg("Nothing to undo yet.");return;}
    const item=history.pop();p=item.params;updateInputs();setMode(item.mode);msg("↶ Last change undone.");
  });
  $("resetBtn").addEventListener("click",()=>{
    historySave("reset");p=clone(DEFAULTS);capturedA=capturedB=null;
    $("morphEnabled").checked=false;$("captureStatus").textContent="A: —   B: —";
    updateInputs();setMode("lfo");msg("Controls reset to defaults.");
  });
  $("randomBtn").addEventListener("click",()=>{
    historySave("random");
    const rand=(min,max)=>min+Math.random()*(max-min);
    p.coreType=TYPES[Math.floor(Math.random()*TYPES.length)];
    p.pivotX=+rand(.15,.85).toFixed(2);p.pivotY=+rand(-.7,.7).toFixed(2);
    p.phaseDist=+rand(0,.85).toFixed(2);p.waveFold=+rand(0,2.5).toFixed(2);
    p.bend=+rand(-.8,.8).toFixed(2);p.drive=+rand(0,.65).toFixed(2);
    p.syncRatio=+(Math.round(rand(1,4)*4)/4).toFixed(2);
    updateInputs();requestRender();msg("⚄ New waveform experiment generated.");
  });
  $("captureABtn").addEventListener("click",()=>capture("A"));
  $("captureBBtn").addEventListener("click",()=>capture("B"));
  $("morphEnabled").addEventListener("change",requestRender);
  $("bankDownloadBtn").addEventListener("click",exportBank);
  $("quickDownloadAllBtn").addEventListener("click",()=>withExport(allExport));
  $("exportAllBtn").addEventListener("click",()=>withExport(allExport));
  $("exportZipBtn").addEventListener("click",()=>withExport(pairedExport));
  $("exportTxtBtn").addEventListener("click",()=>withExport(singleText));
  $("exportPngBtn").addEventListener("click",()=>withExport(singlePng));
  $("exportWavBtn").addEventListener("click",()=>withExport(singleWav));
  $("exportPcmBtn").addEventListener("click",()=>withExport(singlePcm));
  $("exportPcmTxtBtn").addEventListener("click",()=>withExport(singlePcmTxt));
  $("savePresetBtn").addEventListener("click",()=>{
    const name=prompt("Name this LUT Deluxe preset:","");
    if(!name?.trim())return;
    savedPresets[name.trim().slice(0,50)]={mode,params:clone(p)};
    storage.set("lutdeluxe_presets",savedPresets);refreshPresets();
    $("presetSelect").value=`user:${name.trim().slice(0,50)}`;msg(`Preset '${name.trim()}' saved in this browser.`);
  });
  $("loadPresetBtn").addEventListener("click",()=>{
    try{const [kind,...parts]=$("presetSelect").value.split(":"),name=parts.join(":");
      if(kind==="builtin")loadPreset({...builtinPresets[name],params:{...clone(DEFAULTS),...builtinPresets[name].params}});
      else loadPreset(savedPresets[name]);
      msg(`Loaded '${name}'.`);
    }catch(e){showError(e);}
  });
  $("exportPresetBtn").addEventListener("click",async()=>{
    try{
      const json=JSON.stringify({app:"LUT Deluxe",version:1,mode,settings:p},null,2);
      await downloadBlob(new Blob([json],{type:"application/json"}),`${safePrefix(p.baseName)}_preset.json`);
      msg("Preset JSON downloaded. You can import it on another computer.");
    }catch(e){showError(e);}
  });
  $("importPresetInput").addEventListener("change",async e=>{
    try{const file=e.target.files?.[0];if(!file)return;loadPreset(JSON.parse(await file.text()));msg(`Loaded preset from ${file.name}.`);}
    catch(err){showError(err);}finally{e.target.value="";}
  });
  const canvas=$("waveCanvas");
  canvas.addEventListener("pointerdown",e=>{
    if(mode!=="osc")return;dragging=true;canvas.setPointerCapture(e.pointerId);pointerWarp(e);
  });
  canvas.addEventListener("pointermove",e=>{if(dragging&&mode==="osc")pointerWarp(e);});
  const end=()=>{dragging=false;};canvas.addEventListener("pointerup",end);canvas.addEventListener("pointercancel",end);
  window.addEventListener("pagehide",stopAudio);
}
createControls();bindActions();refreshPresets();updateInputs();setMode("lfo");
if("serviceWorker" in navigator && location.protocol!=="file:"){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}
