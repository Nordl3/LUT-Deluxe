import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync, mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MUSICAL_BANKS,TARGETS,musicalWave,measurements,levelFrame,phaseAlign,
  morphSamples,octaveTops,limitHarmonics,makeBank,quantizeBank,estimatedBytes,
  bankManifest,makeBankBinary,makeBankHeader} from '../bank.js';

const twopi=2*Math.PI;
const sine=(n,shift=0)=>Float32Array.from({length:n},(_,i)=>Math.sin(twopi*i/n+shift));
const mean=v=>v.reduce((a,b)=>a+b,0)/v.length;
const near=(a,b,e=1e-4)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);

test('Eight families generate finite audio frames, correct length and zero average DC',()=>{
  assert.equal(Object.keys(MUSICAL_BANKS).length,8);
  for(const style of Object.keys(MUSICAL_BANKS))for(const t of [0,.125,.5,.875,1]){
    const w=musicalWave(style,t,512);
    assert.equal(w.length,512);
    assert.ok(w.every(Number.isFinite));
    assert.ok(Math.abs(measurements(w).dc)<1e-5,`${style} DC`);
    assert.ok(measurements(w).vpp>0.05,`${style} silence`);
  }
});
test('full swing always spans ±1, peak safe never clips, RMS is peak limited',()=>{
  const x=[-.1,.1,.45,.2];
  const full=levelFrame(x,'full'),peak=levelFrame(x,'peak'),rms=levelFrame(x,'rms');
  near(Math.min(...full),-1);near(Math.max(...full),1);
  near(measurements(peak).peak,1);
  assert.ok(measurements(rms).peak<=1+1e-6);
  assert.equal(levelFrame(x,'preserve')[0],Math.fround(-.1));
});
test('phase alignment restores same sine shifted in phase',()=>{
  const a=sine(512),b=sine(512,Math.PI*.73);
  const aligned=phaseAlign(a,b);
  const err=mean(a.map((v,i)=>Math.abs(v-aligned.wave[i])));
  assert.ok(err<.02,`phase error ${err}`);
});
test('spectral morph preserves opposite-phase sine without going silent',()=>{
  const a=sine(512),b=sine(512,Math.PI);
  const time=morphSamples(a,b,.5,'linear');
  const freq=morphSamples(a,b,.5,'spectral');
  assert.ok(measurements(time).rms<.0001);
  assert.ok(measurements(freq).rms>.6);
  near(measurements(morphSamples(a,b,0,'spectral')).rms,measurements(a).rms);
  near(measurements(morphSamples(a,b,1,'spectral')).rms,measurements(b).rms);
});
test('harmonic filtering removes harmonics above the pitch ceiling without raising levels',()=>{
  const x=Float32Array.from({length:512},(_,i)=>.3*Math.sin(twopi*i/512)+.5*Math.sin(twopi*10*i/512));
  const limited=limitHarmonics(x,5000,48000); // <=4 harmonics
  const expected=Float32Array.from({length:512},(_,i)=>.3*Math.sin(twopi*i/512));
  const err=mean(limited.map((v,i)=>Math.abs(v-expected[i])));
  assert.ok(err<1e-5,`band limit error ${err}`);
  assert.ok(measurements(limited).rms<measurements(x).rms);
  assert.equal(octaveTops(48000).at(-1),20000);
});
test('complete 48k bank dimensions and guaranteed 12-bit export bound',()=>{
  const bank=makeBank({style:'Analog Evolution',samples:512,frames:16,bands:true});
  assert.equal(bank.bandCount,11);
  assert.equal(bank.tables.length,11);
  assert.equal(bank.tables[0].length,16);
  assert.equal(bank.tables[10][15].length,512);
  assert.equal(estimatedBytes(bank),11*16*512*2);
  for(const target of Object.keys(TARGETS)){
    const {layers,profile}=quantizeBank(bank,target);
    for(const layer of layers)for(const frame of layer)for(const code of frame){
      assert.ok(code>=profile.min&&code<=profile.max,`out of range ${code}`);
    }
    const binary=makeBankBinary(bank,target);
    assert.equal(binary.length,estimatedBytes(bank));
    const view=new DataView(binary.buffer);
    assert.equal(view.getUint16(0,true),layers[0][0][0]);
    const meta=bankManifest(bank,target,'testBank');
    assert.equal(meta.bandUpperHz[0],null);
    assert.equal(meta.bitDepth,profile.bitDepth);
    assert.equal(meta.layout,'[band][frame][sample]');
    const hdr=makeBankHeader(bank,target,'testBank');
    assert.match(hdr,/testBank\[11\]\[16\]\[512\]/);
    assert.match(hdr,/not compatible with legacy/i);
  }
});
test('captured A/B custom spectral bank and unfiltered-only mode work',()=>{
  const bank=makeBank({source:'captured',a:sine(1024),b:sine(1024,2),frames:8,samples:256,morph:'spectral',align:true,bands:false});
  assert.equal(bank.bandCount,1);
  assert.equal(bank.frames,8);
  assert.equal(bank.tables[0][0].length,256);
  near(measurements(bank.tables[0][4]).peak,1,1e-4);
});
test('invalid frames and missing endpoints rejected',()=>{
  assert.throws(()=>makeBank({frames:1}),/frames/i);
  assert.throws(()=>makeBank({source:'captured'}),/Capture both/);
  assert.throws(()=>makeBank({samples:10}),/samples/);
});
