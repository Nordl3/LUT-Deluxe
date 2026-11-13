import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROJECT,SCENES,FAMILIES,makeFrame,makeVoiceBank,interpolateBank,normalize,tableAnalysis,
  renderMix,wavAudio,wavTable,teensyPackage,measurements } from '../ultimate-engine.js';
import {readFileSync} from 'node:fs';
test('seven scenes contain four independent playable voices',()=>{
 assert.ok(Object.keys(SCENES).length>=7);
 for(const scene of Object.values(SCENES)){
  assert.equal(scene.length,4);
  for(const voice of scene)assert.ok(FAMILIES.includes(voice.family));
 }
});
test('all synthesis families produce finite full peak-to-peak frames across evolution',()=>{
 const p=DEFAULT_PROJECT(),v=p.voices[1];
 for(const family of FAMILIES.filter(x=>x!=='Imported Audio')){
  v.family=family;
  for(const t of [0,.21,.53,.89,1]){
   const w=makeFrame(v,t,256,'full'),{vpp}=measurements(w);
   assert.equal(w.length,256);assert.ok([...w].every(Number.isFinite),family);
   assert.ok(vpp>1.98&&vpp<=2.0001,`${family} t=${t} Vpp=${vpp}`);
  }
 }
});
test('four independent banks and morph positions work',()=>{
 const p=DEFAULT_PROJECT(),banks=p.voices.map(v=>makeVoiceBank(v,8,256));
 for(let ch=0;ch<4;ch++){
  assert.equal(banks[ch].length,8);assert.equal(interpolateBank(banks[ch],.4).length,256);
 }
});
test('wavetable export writes Serum CLM, 2048 float32 frames and valid RIFF sizes',()=>{
 const p=DEFAULT_PROJECT(),frames=makeVoiceBank(p.voices[1],8,256);
 for(const format of ['serum','vital']){
 const w=wavTable(frames,{format}),dv=new DataView(w.buffer),text=new TextDecoder().decode(w);
 assert.equal(text.slice(0,4),'RIFF');assert.equal(dv.getUint32(4,true),w.length-8);
 assert.ok(text.includes('fmt '));assert.ok(text.includes('data'));assert.equal(text.includes('clm '),format==='serum');
 let cursor=12,dataSize=0;while(cursor<w.length){const tag=text.slice(cursor,cursor+4),size=dv.getUint32(cursor+4,true);if(tag==='data')dataSize=size;cursor+=8+size+(size%2);}
 assert.equal(dataSize,8*2048*4);assert.equal(cursor,w.length);
 }
});
test('Teensy export contains four binary voice arrays in correct 12bit bounds',()=>{
 const p=DEFAULT_PROJECT();const packageData=teensyPackage(p,[],{mipmaps:false,frameCount:8,samples:256});
 const binaries=packageData.files.filter(([name])=>name.endsWith('.bin'));
 assert.equal(binaries.length,4);
 assert.equal(packageData.manifest.voices.length,4);
 for(const [,arr] of binaries){assert.equal(arr.length,8*256*2);
 const dv=new DataView(arr.buffer);for(let n=0;n<arr.length;n+=2)assert.ok(dv.getUint16(n,true)<=3090);}
});
test('stereo audition render encodes valid WAV with no overs',()=>{
 const p=DEFAULT_PROJECT(),banks=p.voices.map(v=>makeVoiceBank(v,8,256));
 const audio=renderMix(p,banks,.11,22050),wav=wavAudio(audio,22050);
 assert.equal(wav.length,44+audio[0].length*4);
 assert.ok(audio.flatMap(a=>Array.from(a)).every(x=>Number.isFinite(x)&&Math.abs(x)<=1));
});

test('creative scene library includes phase, frequency-ratio and true spectral relationships',()=>{
 const all=Object.values(SCENES);assert.ok(all.length>=20);
 assert.ok(all.some(v=>v.some(x=>(x.ratio||1)!==1)));
 assert.deepEqual(SCENES['Quadrature Orbit'].map(v=>v.phase),[0,.25,.5,.75]);
 assert.deepEqual(SCENES['Drawbar Architecture'].map(v=>v.ratio),[.5,1,1.5,2]);
 assert.ok(SCENES['Interleaved Harmonics'].every(v=>v.family==='Harmonic Comb'));
});

test('harmonic-comb ensemble generates disjoint spectral partials without accidental saturation',()=>{
 for(let ch=0;ch<4;ch++){
  const v=SCENES['Interleaved Harmonics'][ch],frame=makeFrame(v,.42,2048),parts=tableAnalysis(frame,32);
  for(const partial of parts){
    if((partial.n-1)%4!==ch)assert.ok(partial.amp<0.001,`${v.label} leaked ${partial.n}: ${partial.amp}`);
  }
 }
});

test('four-way crossover isolates each designated harmonic range',()=>{
 for(const v of SCENES['Four-Band Spectrum']){
  const frame=makeFrame(v,.5,2048),parts=tableAnalysis(frame,48);
  for(const partial of parts){
   if(partial.n<v.bandStart||partial.n>v.bandEnd)assert.ok(partial.amp<0.001,`${v.label} leaked ${partial.n}: ${partial.amp}`);
  }
 }
});

test('continuous morph compensation maintains full Vpp between all intermediate bank frames',async()=>{
 const {morphCalibration}=await import('../ultimate-engine.js');
 for(const name of ['Harmonic Constellation','Vowel Quartet','Interleaved Harmonics','Reese Conspiracy']){
  for(const voice of SCENES[name]){
   const frames=makeVoiceBank(voice,8,256),calibration=morphCalibration(frames);
   for(const morph of [0,.013,.09,.125,.23,.4,.518,.73,.842,.947,1]){
    const {vpp}=measurements(interpolateBank(frames,morph,calibration));
    assert.ok(vpp>1.965&&vpp<=2.025,`${name}: ${voice.label}, morph=${morph} Vpp=${vpp}`);
   }
  }
 }
});

test('Teensy export records user-assigned roles and phase/ratio metadata',()=>{
 const project=DEFAULT_PROJECT();project.name='Fresh Ensemble';
 project.voices[0].label='CHOIR ALPHA';project.voices[0].ratio=1.5;project.voices[0].phase=.25;
 project.voices[1].label='CHOIR ALPHA';
 const pkg=teensyPackage(project,[],{frameCount:8,samples:256,mipmaps:false});
 assert.equal(pkg.manifest.voices[0].ratio,1.5);assert.equal(pkg.manifest.voices[0].phase,.25);
 const names=pkg.files.map(([name])=>name);
 assert.equal(names.filter(name=>name.endsWith('.bin')).length,4);
 assert.equal(new Set(names).size,names.length,'duplicate names must not overwrite bank files');
 assert.ok(names.some(name=>name.includes('CHOIR_ALPHA')));
});
