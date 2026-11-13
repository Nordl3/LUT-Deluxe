import { FAMILIES, FAMILY_DESCRIPTIONS, SCENES, SCENE_META, DEFAULT_PROJECT, createVoice,
  makeFrame, makeVoiceBank, interpolateBank, tableAnalysis, measurements, clamp,
  renderMix, wavAudio, wavTable, teensyPackage, zipFiles, normalize, morphCalibration } from './ultimate-engine.js';
import { phaseAlign, levelFrame } from './bank.js';

const $=id=>document.getElementById(id),TAU=2*Math.PI;
const PALETTE=['#63dcca','#77aaff','#f3bf78','#b29bfa'];
let project=DEFAULT_PROJECT(),banks=[[],[],[],[]],corrections=[[],[],[],[]],view='studio',scopeMode='wave',audio=null,worklet=null;
let regenTimer=null,renderQueued=false,toastTimer=null,selectedHarmonic=0,drawing=false,lastDrawIndex=-1,ready=false;
const names=['Studio','Wave Editor','Evolution Lab','Scene Library','Export Studio'];
const viewLabels={studio:['FOUR OUTPUTS · ONE INSTRUMENT','A world of tone.','Build four complementary timbres. Shape the harmonics. Evolve them together.'],
 editor:['TIME DOMAIN · FREQUENCY DOMAIN','Shape the impossible.','Draw directly, sculpt 32 harmonics, or generate something radically different.'],
 evolution:['KEYFRAME AUTOMATION · 4 WAVETABLE BANKS','Make the sound move.','Build an evolving timbre from end to end, with automatic gain at every frame.'],
 library:['READY-TO-PLAY ENSEMBLES','Four voices. One identity.','Orchestral character, organ drawbars, modulated bass, glass, phase and more.'],
 export:['HARDWARE · SOFTWARE · AUDIO · IMAGE','Take it anywhere.','Teensy-ready data, Serum/Vital frames, real audio, high-resolution graphics.']};
const safe=(s)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeFile=(s)=>String(s).replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,70)||'LUTDeluxe';
const pct=n=>`${Math.round(n*100)}%`;
function toast(message,bad=false){const el=$('toast');el.textContent=message;el.classList.toggle('bad',bad);el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4200);}
const selected=()=>project.voices[project.selected];
const copy=v=>JSON.parse(JSON.stringify(v));
function saveLocal(){try{const txt=JSON.stringify(project);if(txt.length<3800000)localStorage.setItem('lut_ultimate_workspace_v2',txt);}catch{}}
function restoreLocal(){try{const raw=JSON.parse(localStorage.getItem('lut_ultimate_workspace_v2'));if(raw?.voices?.length===4&&raw.version==='2.0')project=sanitize(raw);}catch{}}
function sanitize(raw){const next=DEFAULT_PROJECT();Object.assign(next,raw);next.voices=Array.from({length:4},(_,i)=>{const input=raw.voices[i]||{};return {...createVoice('VOICE '+String.fromCharCode(65+i),'Analog Bloom'),...input,label:String(input.label||'VOICE '+String.fromCharCode(65+i)).slice(0,22),ratio:clamp(input.ratio||1,.125,8),phase:clamp(input.phase||0,0,1)};});
 next.frames=[8,16,32,64,128].includes(Number(next.frames))?Number(next.frames):32;
 next.samples=[256,512,1024,2048].includes(Number(next.samples))?Number(next.samples):512;
 next.normalization=['full','peak','off'].includes(next.normalization)?next.normalization:'full';next.frequency=clamp(next.frequency,20,4000);
 next.master=clamp(next.master,0,.8);next.selected=clamp(Math.floor(next.selected),0,3);
 return next;}
function syncControls(){
 $('projectName').value=project.name;$('frequency').value=project.frequency;$('masterGain').value=project.master;
 $('masterOut').textContent=pct(project.master);$('globalMorph').value=project.globalMorph;$('morphLink').value=project.morphLink||'parallel';
 $('globalMorphOut').textContent=pct(project.globalMorph);$('animate').checked=!!project.animation;
 $('framesSelect').value=project.frames;$('samplesSelect').value=project.samples;$('normalizeSelect').value=project.normalization;
 $('headFrame').textContent=`${project.frames} frames / voice`;
 $('headLevel').textContent=project.normalization==='full'?'FULL Vpp · AUTO':project.normalization==='peak'?'DC-FREE · AUTO':'LEVEL OFF';
 $('scrub').max=project.frames-1;$('scrub').value=Math.min(Number($('scrub').value),project.frames-1);
 updateEstimate();
}
function updateEstimate(){
 const bytes=4*project.frames*project.samples*2,format=b=>b>=1024*1024?`${(b/(1024*1024)).toFixed(2)} MiB`:`${(b/1024).toFixed(1)} KiB`;
 $('memoryEstimate').textContent=`Four banks · ${project.frames} frames × ${project.samples} samples × 16-bit · ${format(bytes)} raw, before pitch layers or firmware overhead.`;
}
function bankFor(i){banks[i]=makeVoiceBank(project.voices[i],project.frames,project.samples,project.normalization);corrections[i]=morphCalibration(banks[i]);}
function regenAll(){const start=performance.now();for(let i=0;i<4;i++)bankFor(i);if(worklet)sendAudioBanks();saveLocal();refreshCanvases();updateEstimate();return performance.now()-start;}
function regenVoice(i,force=false){clearTimeout(regenTimer);regenTimer=setTimeout(()=>{
  try{bankFor(i);sendAudioBanks();refreshCanvases();saveLocal();}catch(e){toast(e.message,true)}
 },force?0:120);}
function currentFrame(i=project.selected){const bank=banks[i];return interpolateBank(bank,project.voices[i].morph,corrections[i]);}
const sliderFormat={
 gain:v=>pct(v),morph:v=>pct(v),phase:v=>`${Math.round(v*360)}°`,pan:v=>v<-.01?`${Math.round(-v*100)} L`:v>.01?`${Math.round(v*100)} R`:'CENTER',
 cutoff:v=>Number(v)>=1000?`${(v/1000).toFixed(1)} kHz`:`${Math.round(v)} Hz`,octave:v=>`${v>0?'+':''}${v} oct`,
 semitones:v=>`${v>0?'+':''}${v} st`,detune:v=>`${v>0?'+':''}${v} ¢`,motion:v=>pct(v),motionRate:v=>`${Number(v).toFixed(2)} Hz`,
 brightness:v=>pct(v),brightnessEnd:v=>pct(v),fold:v=>pct(v),foldEnd:v=>pct(v),formant:v=>pct(v),formantEnd:v=>pct(v),
 fm:v=>pct(v),fmEnd:v=>pct(v),pulse:v=>pct(v),pulseEnd:v=>pct(v),skew:v=>pct(v),skewEnd:v=>pct(v),
 drive:v=>pct(v),driveEnd:v=>pct(v)};
const ctrlDef={
 gain:['Mix level',0,1,.01],morph:['Wavetable position',0,1,.01],pan:['Stereo position',-1,1,.01],phase:['Cycle phase offset',0,1,.01],
 octave:['Pitch octave',-3,3,1],semitones:['Pitch semitones',-12,12,1],detune:['Fine detune',-50,50,1],
 cutoff:['Digital tone / low-pass',150,18000,50],motion:['VCA motion depth',0,1,.01],motionRate:['Motion speed',.05,6,.05],
 brightness:['Brightness',0,1,.01],brightnessEnd:['Brightness',0,1,.01],fold:['Wavefold',0,1,.01],foldEnd:['Wavefold',0,1,.01],
 formant:['Formant',0,1,.01],formantEnd:['Formant',0,1,.01],fm:['FM / texture',0,1,.01],fmEnd:['FM / texture',0,1,.01],
 pulse:['Pulse width',.04,.96,.01],pulseEnd:['Pulse width',.04,.96,.01],skew:['Phase warp',.05,.95,.01],skewEnd:['Phase warp',.05,.95,.01],
 drive:['Drive',0,1,.01],driveEnd:['Drive',0,1,.01]};
function sliderHTML(key,group='voice',value=null){const [label,mi,ma,step]=ctrlDef[key],v=value??selected()[key];
 return `<div class="control"><div class="control-head"><label for="${group}_${key}">${label}</label><output data-output="${key}">${sliderFormat[key](v)}</output></div><input type="range" id="${group}_${key}" data-control="${key}" data-group="${group}" min="${mi}" max="${ma}" step="${step}" value="${v}"></div>`;
}
function selectVoice(i){project.selected=i;renderInspector();renderLanes();renderEditorControls();renderEvolutionControls();refreshCanvases();saveLocal();}
function renderTabs(){ $('voiceTabs').innerHTML=project.voices.map((v,i)=>`<button class="${i===project.selected?'active':''}" data-select="${i}" style="--voice-color:${PALETTE[i]}" title="Select ${v.label}">${i+1}</button>`).join('');}
function renderInspector(){
 const v=selected(),i=project.selected;renderTabs();$('inspectorTag').textContent=`DAC ${i+1} · OUTPUT ${i+1}`;
 $('inspectorVoice').textContent=v.label;$('voiceName').value=v.label;$('pitchRatio').value=String(v.ratio||1);$('inspectorDesc').textContent=FAMILY_DESCRIPTIONS[v.family]||'Custom waveform synthesis';
 $('voiceFamily').value=v.family;
 $('voiceControlList').innerHTML=['gain','morph','phase','octave','semitones','detune','pan','cutoff','motion','motionRate'].map(k=>sliderHTML(k)).join('');
}
function ratioText(v){const n=Number(v||1);const ratios=[[.25,'1:4'],[.5,'1:2'],[.75,'3:4'],[1,'1:1'],[1.25,'5:4'],[4/3,'4:3'],[1.5,'3:2'],[1.75,'7:4'],[2,'2:1'],[3,'3:1'],[4,'4:1']];return ratios.find(([a])=>Math.abs(a-n)<.001)?.[1]||n.toFixed(3)+'×';}
function laneHTML(v,i){const color=PALETTE[i];return `<article class="lane ${project.selected===i?'active':''}" data-lane="${i}" style="--voice-color:${color}">
  <div class="lane-head"><div class="lane-name-row"><span class="lane-index">0${i+1}</span><button class="lane-select lane-name" data-select="${i}">${safe(v.label)}</button></div><div class="lane-actions"><button data-toggle="muted" data-i="${i}" class="${v.muted?'on':''}" title="Mute">M</button><button data-toggle="solo" data-i="${i}" class="${v.solo?'solo':''}" title="Solo">S</button></div></div>
  <canvas class="lane-wave" id="laneCanvas${i}" width="390" height="120" aria-label="${v.label} waveform"></canvas>
  <select class="lane-family" data-family="${i}" aria-label="${v.label} waveform family">${FAMILIES.map(f=>`<option value="${safe(f)}" ${v.family===f?'selected':''}>${safe(f)}</option>`).join('')}</select>
  <div class="lane-level"><label for="morph_${i}">BANK POSITION</label><output id="morphValue${i}">${pct(v.morph)}</output></div><input type="range" id="morph_${i}" data-lane-key="morph" data-i="${i}" min="0" max="1" step=".01" value="${v.morph}">
  <div class="lane-level"><label for="gain_${i}">MIX LEVEL</label><output id="gainValue${i}">${pct(v.gain)}</output></div><input type="range" id="gain_${i}" data-lane-key="gain" data-i="${i}" min="0" max="1" step=".01" value="${v.gain}">
  <div class="lane-foot">${ratioText(v.ratio)} · ${Math.round((v.phase||0)*360)}° PHASE · ${v.octave>0?'+':''}${v.octave} OCT · ${safe(v.family)}</div></article>`;}
function renderLanes(){ $('laneGrid').innerHTML=project.voices.map(laneHTML).join('');
 $('routeLanes').innerHTML=project.voices.map((v,i)=>`<span style="color:${PALETTE[i]}">${i+1} ${v.label}</span>`).join('');renderTabs();
}
function renderEditorControls(){const v=selected();$('editorFamily').value=v.family;
 $('drawHint').textContent=v.family==='Hand Drawn'?'Drag across the graph to paint. Drawing automatically joins into a repeating cycle.':'Choose Hand Drawn, then drag across the waveform canvas to paint a periodic wave.';
 $('editorControls').innerHTML=['brightness','fold','formant','fm','pulse','skew','drive'].map(k=>sliderHTML(k,'editor')).join('');
 $('phaseSlider').value=v.phases?.[selectedHarmonic]??0;updatePhaseLabel();}
function updatePhaseLabel(){const v=selected();$('harmonicSelectLabel').textContent=`Partial #${selectedHarmonic+1} · ${pct(v.harmonics[selectedHarmonic]||0)}`;
 $('phaseOut').textContent=`${Math.round((v.phases?.[selectedHarmonic]||0)*360)}°`;}
function renderEvolutionControls(){const v=selected();
 const pairs=[['brightness','brightnessEnd','Harmonic brightness'],['fold','foldEnd','Wavefold intensity'],['formant','formantEnd','Formant movement'],['fm','fmEnd','FM / texture'],['pulse','pulseEnd','Pulse width'],['skew','skewEnd','Phase warp'],['drive','driveEnd','Saturation']];
 $('evoControls').innerHTML=pairs.map(([start,end,label])=>`<div class="evo-pair"><div class="evo-pair-title">${label}</div><small class="tiny">START</small>${sliderHTML(start,'evo')}<small class="tiny">FINISH</small>${sliderHTML(end,'evo')}</div>`).join('');
 $('curveSelect').value=v.evolveCurve||'smooth';}
function renderScenes(){ $('sceneGrid').innerHTML=Object.entries(SCENES).map(([name,voices],i)=>{const meta=SCENE_META[name]||{};
 return `<button class="scene-card ${project.scene===name?'current':''}" data-scene="${safe(name)}"><span class="scene-index">${safe(meta.group||'ENSEMBLE')} / ${String(i+1).padStart(2,'0')}</span><b>${safe(name)}</b><small class="scene-explainer">${safe(meta.description||'Four complementary voices.')}</small><small class="scene-voices">${voices.map(v=>safe(v.label)).join(' · ')}</small></button>`;}).join('');
 const meta=SCENE_META[project.scene];$('sceneRelation').textContent=meta?`${meta.group} · ${meta.description}`:'CUSTOM PATCH · Four independently editable oscillator relationships';
 $('sceneTitle').textContent=project.scene in SCENES?project.scene:'Custom ensemble';}
function sceneLoad(name){if(!SCENES[name])return;project.voices=copy(SCENES[name]);project.scene=name;project.name=name;
 regenAll();fullRefresh();toast(`Loaded ${name}`);}
function fullRefresh(){syncControls();renderInspector();renderLanes();renderEditorControls();renderEvolutionControls();renderScenes();refreshCanvases();sendAudioParams();saveLocal();}
function switchView(target){view=target;document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id===`view-${target}`));
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===target));
 const [k,t,s]=viewLabels[target];$('viewKicker').textContent=k;$('viewTitle').textContent=t;$('viewSubtitle').textContent=s;
 refreshCanvases();window.scrollTo({top:0,behavior:'instant'});}
function canvasCtx(id){const el=typeof id==='string'?$(id):id;if(!el||el.clientWidth<1)return null;
 const dpr=Math.min(2,devicePixelRatio||1),w=el.clientWidth,h=el.clientHeight||220;
 if(el.width!==Math.round(w*dpr)||el.height!==Math.round(h*dpr)){el.width=Math.round(w*dpr);el.height=Math.round(h*dpr);}
 const ctx=el.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return {ctx,w,h,el};}
function grid(ctx,w,h,compact=false){ctx.clearRect(0,0,w,h);ctx.fillStyle='#091925';ctx.fillRect(0,0,w,h);
 ctx.lineWidth=1;ctx.strokeStyle='#20394b';ctx.beginPath();for(let x=0;x<=w;x+=w/(compact?6:12)){ctx.moveTo(x,0);ctx.lineTo(x,h)}
 for(let y=0;y<=h;y+=h/4){ctx.moveTo(0,y);ctx.lineTo(w,y)}ctx.stroke();ctx.beginPath();ctx.strokeStyle='#3a5966';ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();}
function wavePlot(s,wave,color='#5de4cf',compact=false){if(!s||!wave)return;const {ctx,w,h}=s;grid(ctx,w,h,compact);
 const pad=compact?6:13,center=h/2,scale=h*(compact?.36:.39);ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=compact?1.8:2.25;
 const samples=Math.min(wave.length,Math.floor(w*1.6));for(let i=0;i<=samples;i++){
 const ix=Math.min(wave.length-1,Math.floor(i*(wave.length-1)/samples));const x=pad+(w-2*pad)*i/samples,y=center-wave[ix]*scale;
 if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
 }ctx.stroke();if(!compact){ctx.globalAlpha=.08;ctx.lineTo(w-pad,center);ctx.lineTo(pad,center);ctx.fillStyle=color;ctx.fill();ctx.globalAlpha=1;}}
function spectrumPlot(s,wave,color){if(!s)return;const {ctx,w,h}=s;grid(ctx,w,h);const partials=tableAnalysis(wave,64),max=Math.max(...partials.map(v=>v.amp),.001);
 const band=(w-32)/partials.length;partials.forEach((harm,i)=>{const height=Math.min(h-30,harm.amp/max*(h-40));ctx.fillStyle=color;
 ctx.globalAlpha=Math.max(.18,1-i/90);ctx.fillRect(16+i*band,h-20-height,Math.max(2,band-2),height);});ctx.globalAlpha=1;
 ctx.fillStyle='#7297ab';ctx.font='10px monospace';ctx.fillText('FUNDAMENTAL',15,15);ctx.fillText('HARMONICS →',w-105,15);}
function waterfallPlot(s,bank,color){if(!s||!bank?.length)return;const {ctx,w,h}=s;grid(ctx,w,h);const count=Math.min(bank.length,65);
 for(let j=count-1;j>=0;j--){const frame=bank[Math.round(j*(bank.length-1)/(count-1))],z=j/(count-1),center=h*.75-z*h*.48;
 const xoff=z*w*.18,span=w*.76,scale=h*.25;ctx.globalAlpha=.22+.7*z;ctx.beginPath();ctx.strokeStyle=color;
 ctx.lineWidth=z>.9?1.8:1.15;const stride=Math.max(1,Math.floor(frame.length/430));let first=true;
 for(let ix=0;ix<frame.length;ix+=stride){const x=15+xoff+span*ix/(frame.length-1),y=center-frame[ix]*scale;
 if(first){ctx.moveTo(x,y);first=false;}else ctx.lineTo(x,y);}ctx.stroke();}
 ctx.globalAlpha=1;ctx.fillStyle='#9db7c9';ctx.font='11px monospace';ctx.fillText(`${bank.length} EVOLUTION FRAMES`,17,20);}
function drawHarmonics(){const s=canvasCtx('harmonicCanvas');if(!s)return;const {ctx,w,h}=s;grid(ctx,w,h);
 const v=selected(),cols=32,gap=3,bw=(w-26)/cols,scale=h-45;
 for(let i=0;i<cols;i++){const x=13+i*bw,val=clamp(v.harmonics?.[i]||0,0,1),height=Math.max(2,val*scale);
 ctx.fillStyle=i===selectedHarmonic?'#eec581':PALETTE[project.selected];ctx.globalAlpha=i===selectedHarmonic?1:.8;
 ctx.fillRect(x,h-28-height,bw-gap,height);ctx.globalAlpha=1;
 ctx.fillStyle='#89a4b6';ctx.font='9px monospace';if((i+1)%4===0||i===0)ctx.fillText(i+1,x,h-10);
 }}
function diagnostics(){if(!banks[project.selected]?.length)return;const frame=currentFrame(),st=measurements(frame),stat=[
 ['P–P LEVEL',st.vpp.toFixed(3)],['RMS',st.rms.toFixed(3)],['DC',st.dc.toFixed(3)],['SEAM',st.seam.toFixed(3)]];
 $('waveDiagnostics').innerHTML=stat.map(([label,v])=>`<div><b>${v}</b><small>${label}</small></div>`).join('');
 $('scopeStats').textContent=`${project.normalization==='full'?'AUTO FULL Vpp':project.normalization==='peak'?'PEAK NORMALIZED':'UNPROCESSED'} • ${project.samples} SAMPLES • ${project.frames} FRAMES`;
 $('scopeVoice').textContent=`0${project.selected+1} · ${selected().label} · ${selected().family.toUpperCase()}`;
 $('editStatus').textContent=`Vpp ${st.vpp.toFixed(3)} • RMS ${st.rms.toFixed(3)}`;
}
function refreshCanvases(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{
 renderQueued=false;if(!ready||!banks[0].length)return;
 const wave=currentFrame(),color=PALETTE[project.selected];
 if(scopeMode==='wave')wavePlot(canvasCtx('mainCanvas'),wave,color);
 else if(scopeMode==='spectrum')spectrumPlot(canvasCtx('mainCanvas'),wave,color);
 else waterfallPlot(canvasCtx('mainCanvas'),banks[project.selected],color);
 diagnostics();if(view==='studio')for(let i=0;i<4;i++)wavePlot(canvasCtx('laneCanvas'+i),currentFrame(i),PALETTE[i],true);
 if(view==='editor'){wavePlot(canvasCtx('editCanvas'),wave,color);drawHarmonics();}
 if(view==='evolution')waterfallPlot(canvasCtx('waterfallCanvas'),banks[project.selected],color);
 $('scrubLabel').textContent=`FRAME ${String(Number($('scrub').value)+1).padStart(2,'0')} / ${project.frames}`;
 });}
function sendAudioParams(){if(worklet)worklet.port.postMessage({type:'params',params:{voices:project.voices.map(v=>({gain:v.gain,pan:v.pan,ratio:v.ratio,phase:v.phase,octave:v.octave,semitones:v.semitones,detune:v.detune,morph:v.morph,cutoff:v.cutoff,motion:v.motion,motionRate:v.motionRate,muted:v.muted,solo:v.solo})),
 master:project.master,frequency:project.frequency,animation:project.animation}});}
function sendAudioBanks(){if(worklet)worklet.port.postMessage({type:'banks',banks,corrections});sendAudioParams();}
async function toggleAudio(){if(audio){await stopAudio();return;}
 try{const ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:48000});await ctx.audioWorklet.addModule(new URL('./voice-processor.js',import.meta.url));
 const node=new AudioWorkletNode(ctx,'lut-quad-voice',{outputChannelCount:[2]});node.connect(ctx.destination);
 audio=ctx;worklet=node;sendAudioBanks();await audio.resume();$('headerPlay').textContent='◉ Playing';toast('Four voices playing — adjust bank positions and mix.');}
 catch(e){if(audio)await audio.close();audio=null;worklet=null;toast(`Audio engine: ${e.message}`,true);}}
async function stopAudio(){if(!audio)return;const ctx=audio;audio=null;worklet=null;try{await ctx.close();}catch{}$('headerPlay').textContent='▶ Listen';}
function applyKey(key,value,{regenerate=false}={}){selected()[key]=value;if(regenerate)regenVoice(project.selected);else{refreshCanvases();sendAudioParams();saveLocal();}}
function bindControlParent(parent){parent.addEventListener('input',e=>{const input=e.target.closest('[data-control]');if(!input)return;
  const key=input.dataset.control,value=Number(input.value);selected()[key]=value;
  const head=input.closest('.control')?.querySelector('output');if(head)head.textContent=sliderFormat[key](value);
  const regen=!['gain','morph','pan','octave','semitones','detune','cutoff','motion','motionRate'].includes(key);
  if(regen)regenVoice(project.selected);else{sendAudioParams();refreshCanvases();saveLocal();}
 });}
function initEvents(){
 document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
 $('exportShortcut').onclick=()=>switchView('export');$('headerPlay').onclick=toggleAudio;$('headerStop').onclick=stopAudio;
 $('voiceTabs').addEventListener('click',e=>{const b=e.target.closest('[data-select]');if(b)selectVoice(Number(b.dataset.select));});
 $('laneGrid').addEventListener('click',e=>{const s=e.target.closest('[data-select]');if(s){selectVoice(Number(s.dataset.select));return;}
  const b=e.target.closest('[data-toggle]');if(!b)return;const v=project.voices[Number(b.dataset.i)];v[b.dataset.toggle]=!v[b.dataset.toggle];renderLanes();sendAudioParams();saveLocal();});
 $('laneGrid').addEventListener('input',e=>{const t=e.target;if(!t.dataset.laneKey)return;const i=Number(t.dataset.i),key=t.dataset.laneKey;
 project.voices[i][key]=Number(t.value);$(key+'Value'+i).textContent=pct(project.voices[i][key]);
 sendAudioParams();refreshCanvases();saveLocal();});
 $('laneGrid').addEventListener('change',e=>{const i=e.target.dataset.family;if(i===undefined)return;
 project.voices[Number(i)].family=e.target.value;project.scene='Custom';regenVoice(Number(i),true);
 if(Number(i)===project.selected){renderInspector();renderEditorControls();}renderScenes();});
 bindControlParent($('voiceControlList'));bindControlParent($('editorControls'));bindControlParent($('evoControls'));
 $('voiceName').onchange=e=>{selected().label=(e.target.value.trim()||'VOICE '+String.fromCharCode(65+project.selected)).slice(0,22);project.scene='Custom';fullRefresh();};
 $('pitchRatio').onchange=e=>{selected().ratio=clamp(Number(e.target.value),.125,8);project.scene='Custom';fullRefresh();};
 $('voiceFamily').onchange=e=>changeFamily(e.target.value);$('editorFamily').onchange=e=>changeFamily(e.target.value);
 $('frequency').oninput=e=>{project.frequency=clamp(e.target.value,20,4000);sendAudioParams();saveLocal();};
 $('projectName').onchange=e=>{project.name=e.target.value||'Untitled Quad Voice';project.scene='Custom';saveLocal();renderScenes();};
 $('masterGain').oninput=e=>{project.master=Number(e.target.value);$('masterOut').textContent=pct(project.master);sendAudioParams();saveLocal();};
 function setLinkedMorph(pos){project.globalMorph=pos;project.voices.forEach((v,i)=>{const mode=project.morphLink||'parallel';
  v.morph=mode==='mirror'?(i%2?1-pos:pos):mode==='ladder'?clamp(pos*1.6-i*.2,0,1):mode==='orbit'?(pos+i*.25)%1:pos;});}
 $('morphLink').onchange=e=>{project.morphLink=e.target.value;setLinkedMorph(project.globalMorph);$('globalMorphOut').textContent=pct(project.globalMorph);renderLanes();renderInspector();sendAudioParams();refreshCanvases();saveLocal();};
 $('globalMorph').oninput=e=>{const pos=Number(e.target.value);setLinkedMorph(pos);
 $('globalMorphOut').textContent=pct(pos);renderLanes();renderInspector();sendAudioParams();refreshCanvases();saveLocal();};
 $('animate').onchange=e=>{project.animation=e.target.checked;sendAudioParams();saveLocal();};
 document.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>{scopeMode=b.dataset.scope;
 document.querySelectorAll('[data-scope]').forEach(el=>el.classList.toggle('active',el===b));refreshCanvases();});
 $('sceneGrid').addEventListener('click',e=>{const b=e.target.closest('[data-scene]');if(b)sceneLoad(b.dataset.scene);});
 $('resetScenes').onclick=()=>sceneLoad(project.scene in SCENES?project.scene:'Harmonic Constellation');
 $('randomScene').onclick=()=>{const candidates=Object.keys(SCENES).filter(k=>k!==project.scene);const key=candidates[Math.floor(Math.random()*candidates.length)];sceneLoad(key);toast(`New complementary ensemble: ${key}`);};
 $('resetVoice').onclick=()=>{const i=project.selected,base=(SCENES[project.scene]||SCENES['Harmonic Constellation'])[i];project.voices[i]=copy(base);bankFor(i);fullRefresh();};
 $('useDrawn').onclick=()=>{const v=selected();v.drawn=Array.from(interpolateBank(banks[project.selected],v.morph));changeFamily('Hand Drawn');};
 $('useHarmonics').onclick=()=>changeFamily('Custom Harmonics');
 $('randomHarmonics').onclick=()=>{const v=selected();const root=1+Math.random()*1.4;
 v.harmonics=Array.from({length:32},(_,i)=>i===0?1:((i%2===0?1:.65)*Math.pow(i+1,-root)*(Math.random()*.7+.5)));
 v.phases=Array.from({length:32},(_,i)=>i===0?0:(Math.random()-.5)*.3);changeFamily('Custom Harmonics');};
 $('clearPartials').onclick=()=>{const v=selected();v.harmonics=Array.from({length:32},(_,i)=>i===0?1:0);changeFamily('Custom Harmonics');};
 $('phaseSlider').oninput=e=>{selected().phases[selectedHarmonic]=Number(e.target.value);updatePhaseLabel();regenVoice(project.selected);};
 setupHarmonicCanvas();setupDrawCanvas();
 $('framesSelect').onchange=e=>{project.frames=Number(e.target.value);refreshBankStructure();};
 $('samplesSelect').onchange=e=>{project.samples=Number(e.target.value);refreshBankStructure();};
 $('normalizeSelect').onchange=e=>{project.normalization=e.target.value;refreshBankStructure();};
 $('curveSelect').onchange=e=>{selected().evolveCurve=e.target.value;regenVoice(project.selected);};
 $('generateBanks').onclick=()=>{const ms=regenAll();fullRefresh();toast(`Four wavetable banks generated in ${Math.round(ms)} ms.`);};
 $('scrub').oninput=e=>{selected().morph=Number(e.target.value)/(project.frames-1);renderLanes();renderInspector();refreshCanvases();sendAudioParams();};
 $('projectInput').onchange=importProject;$('audioInput').onchange=importAudio;
 $('saveProject').onclick=saveProject;$('exportProject').onclick=saveProject;
 $('exportTeensy').onclick=exportTeensy;$('exportWavetables').onclick=exportSynth;$('exportAudio').onclick=exportAudio;
 $('exportPNG').onclick=exportPng;$('exportSVG').onclick=exportSvg;
 for(const el of $('keyboard').querySelectorAll('button'))el.addEventListener('click',()=>{
   project.frequency=Number(el.dataset.hz);$('frequency').value=project.frequency;sendAudioParams();
   $('keyboard').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===el));saveLocal();});
 window.addEventListener('resize',refreshCanvases);
 window.addEventListener('keydown',e=>{if(e.code==='Space'&&!/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)){e.preventDefault();toggleAudio();}});
}
function changeFamily(family){if(!FAMILIES.includes(family))return;selected().family=family;project.scene='Custom';
 regenVoice(project.selected,true);renderLanes();renderInspector();renderEditorControls();renderScenes();}
function refreshBankStructure(){regenAll();fullRefresh();toast('Bank structure updated.');}
function harmonicEdit(e){const s=$('harmonicCanvas'),rect=s.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width,y=(e.clientY-rect.top)/rect.height;
 selectedHarmonic=Math.min(31,Math.max(0,Math.floor((x-.012)*32/.976)));
 const mag=clamp((.90-y)/.73,0,1);selected().harmonics[selectedHarmonic]=Math.round(mag*100)/100;
 selected().family='Custom Harmonics';$('phaseSlider').value=selected().phases[selectedHarmonic]||0;updatePhaseLabel();regenVoice(project.selected);
 renderInspector();renderLanes();renderEditorControls();drawHarmonics();}
function setupHarmonicCanvas(){const c=$('harmonicCanvas');let active=false;
 c.addEventListener('pointerdown',e=>{active=true;c.setPointerCapture(e.pointerId);harmonicEdit(e)});
 c.addEventListener('pointermove',e=>{if(active)harmonicEdit(e)});
 c.addEventListener('pointerup',()=>{active=false});c.addEventListener('pointercancel',()=>{active=false});}
function drawEditSample(e){const c=$('editCanvas'),rect=c.getBoundingClientRect();const x=clamp((e.clientX-rect.left)/rect.width,0,1),y=clamp(1-2*(e.clientY-rect.top)/rect.height,-1,1);
 const v=selected();if(!v.drawn){v.drawn=Array.from(interpolateBank(banks[project.selected],v.morph));}
 const i=Math.min(v.drawn.length-1,Math.floor(x*v.drawn.length));
 if(lastDrawIndex>=0){const a=Math.min(i,lastDrawIndex),b=Math.max(i,lastDrawIndex);const initial=v.drawn[lastDrawIndex];
 for(let n=a;n<=b;n++)v.drawn[n]=initial+(y-initial)*(n-lastDrawIndex)/(i-lastDrawIndex||1);
 }else v.drawn[i]=y;
 lastDrawIndex=i;v.family='Hand Drawn';
 const temp=normalize(v.drawn,project.normalization);wavePlot(canvasCtx('editCanvas'),temp,PALETTE[project.selected]);}
function setupDrawCanvas(){const c=$('editCanvas');c.addEventListener('pointerdown',e=>{if(selected().family!=='Hand Drawn')changeFamily('Hand Drawn');
 drawing=true;lastDrawIndex=-1;c.setPointerCapture(e.pointerId);drawEditSample(e);});
 c.addEventListener('pointermove',e=>{if(drawing)drawEditSample(e)});
 const finish=()=>{if(!drawing)return;drawing=false;lastDrawIndex=-1;regenVoice(project.selected,true);renderInspector();renderLanes();};
 c.addEventListener('pointerup',finish);c.addEventListener('pointercancel',finish);}
function makeKeyboard(){const notes=[['C3',130.81],['C#3',138.59],['D3',146.83],['D#3',155.56],['E3',164.81],['F3',174.61],['F#3',185],['G3',196],['G#3',207.65],['A3',220],['A#3',233.08],['B3',246.94]];
 $('keyboard').innerHTML=notes.map(([label,hz])=>`<button data-hz="${hz}" title="${label}: ${hz} Hz" class="${label.includes('#')?'black':''}">${label.replace('3','')}</button>`).join('');}
function makeFamilySelects(){for(const id of ['voiceFamily','editorFamily']){$(id).innerHTML=FAMILIES.map(x=>`<option value="${safe(x)}">${safe(x)}</option>`).join('');}}
function download(blob,name){const bytes=blob instanceof Blob?blob:new Blob([blob]);
 if(window.pywebview?.api?.save_file){return bytes.arrayBuffer().then(a=>{
 const u=new Uint8Array(a);let data='';for(let i=0;i<u.length;i+=32768)data+=String.fromCharCode(...u.subarray(i,i+32768));
 return window.pywebview.api.save_file(name,btoa(data));});}
 const url=URL.createObjectURL(bytes),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return Promise.resolve('saved');}
async function runExport(button,producer){const title=button.textContent;button.disabled=true;button.textContent='⏳ Rendering…';await new Promise(r=>setTimeout(r,25));
 try{const result=await producer();$('exportSummary').textContent=`Export complete: ${result}.`;
 toast(`${result} prepared for download.`);}catch(e){toast(`Export: ${e.message}`,true);console.error(e);}finally{button.disabled=false;button.textContent=title;}}
function projectJSON(){return JSON.stringify({app:'LUT Deluxe Ultimate',formatVersion:2,generatedAt:new Date().toISOString(),project},null,2);}
function saveProject(){runExport($('saveProject'),async()=>{await download(new Blob([projectJSON()],{type:'application/json'}),`${safeFile(project.name)}_project.json`);return 'Project JSON';});}
async function exportTeensy(){await runExport($('exportTeensy'),async()=>{
 const expected=4*project.frames*project.samples*2*($('mipmaps').checked?10:1);
 if(expected>16*1024*1024)throw Error('This export would exceed 16 MiB. Reduce frames or samples, or disable pitch layers.');
 const pkg=teensyPackage(project,banks,{target:$('teensyTarget').value,mipmaps:$('mipmaps').checked,frameCount:project.frames,samples:project.samples});
 await download(zipFiles(pkg.files),`${safeFile(project.name)}_Teensy_Quad_Banks.zip`);
 const size=pkg.manifest.voices.reduce((a,v)=>a+v.bytes,0);
 if(size>1500000)toast('Large bank (>1.5 MB raw): check Teensy 4.0 flash budget before use.',true);
 return `Four-channel Teensy package · ${(size/1024).toFixed(0)} KiB raw`;});}
async function exportSynth(){await runExport($('exportWavetables'),async()=>{const target=$('wavetableTarget').value,entries=[];
 for(let i=0;i<4;i++){
  const frames=makeVoiceBank(project.voices[i],project.frames,2048,project.normalization);
  const bytes=wavTable(frames,{format:target,rate:44100,samples:2048});
  entries.push([`${String(i+1).padStart(2,'0')}_${safeFile(project.voices[i].label)}_${safeFile(project.voices[i].family)}.wav`,bytes]);
 }
 entries.push(['README.txt',`LUT Deluxe Ultimate: four independent wavetable banks.\nTarget: ${target}.\nFrames: ${project.frames}, samples per frame: 2048, IEEE float32, 44.1kHz header.\nSerum version includes clm metadata; Vital format omits it.\nImport each WAV as wavetable, NOT as a one-shot audio recording.\n`]);
 await download(zipFiles(entries),`${safeFile(project.name)}_${target}_4banks.zip`);return `Four ${target==='serum'?'Serum':'Vital'} wavetables`;});}
async function exportAudio(){await runExport($('exportAudio'),async()=>{const seconds=Number($('duration').value);
 const stereo=renderMix(project,banks,seconds,44100);await download(wavAudio(stereo,44100),`${safeFile(project.name)}_4voice_${seconds}s.wav`);
 return `${seconds}-second stereo audio WAV`;});}
function exportSvgString(wave,name){const w=1600,h=700,pad=80;
 const pts=Array.from(wave, (y,i)=>`${(pad+i/(wave.length-1)*(w-2*pad)).toFixed(2)},${(h/2-y*(h*.38)).toFixed(2)}`).join(' ');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#081925"/><g stroke="#234057" stroke-width="1">${Array.from({length:9},(_,i)=>`<line x1="80" y1="${80+i*67.5}" x2="1520" y2="${80+i*67.5}"/>`).join('')}</g><polyline fill="none" stroke="${PALETTE[project.selected]}" stroke-width="4" stroke-linejoin="round" points="${pts}"/><text x="80" y="50" font-family="Arial" font-size="28" fill="#d5f3f5">${safe(name)}</text></svg>`;}
async function exportSvg(){await runExport($('exportSVG'),async()=>{await download(new Blob([exportSvgString(currentFrame(),project.name+' / '+selected().label)],{type:'image/svg+xml'}),`${safeFile(project.name)}_${safeFile(selected().label)}.svg`);return 'High-resolution waveform SVG';});}
async function exportPng(){await runExport($('exportPNG'),async()=>{const svg=exportSvgString(currentFrame(),project.name+' / '+selected().label);
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});
 const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=700;canvas.getContext('2d').drawImage(image,0,0);URL.revokeObjectURL(url);
 const png=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG creation failed')),'image/png'));
 await download(png,`${safeFile(project.name)}_${safeFile(selected().label)}.png`);return '1600×700 waveform PNG';});}
async function importProject(e){const file=e.target.files?.[0];if(!file)return;
 try{const raw=JSON.parse(await file.text()),contents=raw.project||raw;
 if(contents.voices?.length!==4)throw Error('This is not a four-voice LUT Deluxe project.');
 project=sanitize(contents);regenAll();fullRefresh();toast('Project loaded.');}catch(err){toast(`Import: ${err.message}`,true)}e.target.value='';}
async function importAudio(e){const file=e.target.files?.[0];if(!file)return;const hz=Number($('importHz').value);
 try{if(!Number.isFinite(hz)||hz<20||hz>5000)throw Error('Set the sample fundamental (20–5000 Hz).');
 const ctx=new (window.AudioContext||window.webkitAudioContext)();const buffer=await ctx.decodeAudioData(await file.arrayBuffer());await ctx.close();
 const sample=buffer.getChannelData(0),period=buffer.sampleRate/hz,length=Math.min(512,Math.floor(sample.length/2)),frameCount=Math.min(64,project.frames);
 if(sample.length<period*2)throw Error('Audio is too short for two periods at the specified pitch.');
 const frames=[],wlen=512;
 for(let f=0;f<frameCount;f++){
  const center=Math.floor((sample.length-period*1.4)*f/(frameCount-1))+Math.floor(period*.15);
  let crossing=center,delta=Infinity;const radius=Math.max(1,Math.floor(period*.32));
  for(let k=Math.max(1,center-radius);k<Math.min(sample.length-period-2,center+radius);k++){
    if(sample[k-1]<=0&&sample[k]>0&&Math.abs(k-center)<delta){crossing=k;delta=Math.abs(k-center);}
  }
  const wave=new Float32Array(wlen);for(let i=0;i<wlen;i++){
   const p=crossing+i*period/wlen,k=Math.floor(p),a=p-k;
   wave[i]=sample[Math.min(k,sample.length-2)]*(1-a)+sample[Math.min(k+1,sample.length-1)]*a;
  }
  let lev=normalize(wave,'peak');if(frames.length){lev=phaseAlign(frames[frames.length-1],lev).wave;}
  frames.push(Array.from(lev));
 }
 const v=selected();v.imported=frames;v.family='Imported Audio';project.scene='Custom';regenVoice(project.selected,true);
 renderLanes();renderInspector();renderEditorControls();$('importStatus').textContent=`Loaded ${file.name} · ${buffer.duration.toFixed(2)} sec · ${frameCount} resynthesised cycles → ${v.label}`;
 toast('Imported audio transformed into a morphable bank.');
 }catch(err){toast(`Audio import: ${err.message}`,true);$('importStatus').textContent=`Import failed: ${err.message}`;}e.target.value='';}
function init(){restoreLocal();makeFamilySelects();makeKeyboard();initEvents();fullRefresh();ready=true;
 const ms=regenAll();renderLanes();refreshCanvases();$('importStatus').textContent='Ready to import audio into the selected voice.';
 console.info(`LUT Deluxe Ultimate · four-voice bank generation: ${ms.toFixed(0)} ms`);
}
init();

// Keep the main studio and Classic Lab available offline after first successful loading.
if('serviceWorker' in navigator && location.protocol!=='file:'){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
