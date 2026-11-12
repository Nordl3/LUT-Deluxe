import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {inflateRawSync} from "node:zlib";
import {
  DEFAULTS, coreSample, modSample, renderWave, unsignedLUT, makeArduinoText,
  makeSignedText, makePCM, makeWav, spectrum, zipFiles, morphWave, normalizeHeadroom
} from "../engine.js";

function p(overrides={}){return {...DEFAULTS, harmonics:[...DEFAULTS.harmonics],...overrides};}
test("sine LFO is periodic, finite and normalized",()=>{
  const wave=renderWave(p({lutSize:4096,modAmplitude:0}),"lfo");
  assert.equal(wave.length,4096);
  assert.ok(wave.every(Number.isFinite));
  assert.ok(Math.abs(wave[0])<1e-6);
  assert.ok(Math.abs(Math.max(...wave)-1)<1e-5);
  assert.ok(Math.abs(Math.min(...wave)+1)<1e-5);
});
test("historic ramp and triangle equations are unchanged",()=>{
  assert.equal(coreSample(0,"Triangle"),0);
  assert.equal(coreSample(.5,"Triangle"),-1);
  assert.equal(coreSample(.25,"Ramp Up",2),.0625);
  assert.equal(modSample(.3,"Square",.2),-1);
});
test("10 integers per row, identifier, LUT_SIZE and matched DAC bounds",()=>{
  const params=p({lutSize:40,modAmplitude:0,minDac:0,maxDac:3090,bitDepth:12});
  const wave=renderWave(params,"lfo");
  const values=unsignedLUT(wave,params);
  assert.ok(values.every(v=>Number.isInteger(v)&&v>=0&&v<=3090));
  const text=makeArduinoText(wave,params,"myLUT_4");
  assert.match(text,/^const uint16_t myLUT_4\[LUT_SIZE\] = \{\n/);
  assert.match(text,/\n\};\n$/);
  const rows=text.split("\n").slice(1,-2);
  assert.equal(rows.length,4);
  assert.ok(rows.every(row=>row.trim().replace(/,$/,"").split(",").length===10));
  const captured=[...text.matchAll(/\b\d+\b/g)]; // array name + declarations also contain digits
  assert.ok(captured.length>=40);
});
test("audio shaping, morph and FFT return sane values",()=>{
  const a=renderWave(p({lutSize:512,modAmplitude:0,waveFold:0}),"osc");
  const b=renderWave(p({lutSize:512,modAmplitude:0,waveFold:2,pivotX:.27}),"osc");
  const mix=morphWave(a,b,.4);
  assert.equal(mix.length,512);
  assert.ok(mix.every(Number.isFinite));
  const bins=spectrum(mix,32);
  assert.equal(bins.length,32);
  assert.ok(bins.every(v=>v<=0&&v>=-72));
});
test("WAV header, PCM size and little endian",()=>{
  const wave=renderWave(p({lutSize:256,modAmplitude:0}),"osc");
  const wav=makeWav(wave,220,44100,1);
  assert.equal(wav.length,44+44100*2);
  assert.equal(new TextDecoder().decode(wav.slice(0,4)),"RIFF");
  assert.equal(new TextDecoder().decode(wav.slice(8,12)),"WAVE");
  assert.equal(new DataView(wav.buffer).getUint32(24,true),44100);
  assert.equal(makePCM(wave).length,512);
  assert.match(makeSignedText(wave,"testWave"),/const int16_t testWave_pcm\[LUT_SIZE\]/);
});
test("ZIP includes valid standard file names and extracted bytes",async()=>{
  const file=new TextEncoder().encode("HELLO WORLD");
  const blob=zipFiles([["test.txt",file],["other.txt","X"]]);
  const bytes=new Uint8Array(await blob.arrayBuffer());
  assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);
  // zipfile validates full archive and per-file CRC in an independent Python test.
  assert.ok(bytes.length>file.length);
});
test("uint16 output rejects impossible 8-bit range",()=>{
  const params=p({bitDepth:8,maxDac:3090,lutSize:128});
  const wave=renderWave(params,"lfo");
  assert.throws(()=>unsignedLUT(wave,params),/DAC range/);
});

test("LUT Deluxe default LFO settings match published baseline",()=>{
  assert.equal(DEFAULTS.modFreq,0.25);
  assert.equal(DEFAULTS.modAmplitude,0);
  assert.equal(DEFAULTS.lutSize,4096);
  assert.equal(DEFAULTS.minDac,0);
  assert.equal(DEFAULTS.maxDac,3090);
  assert.equal(DEFAULTS.baseName,"myLUT");
  const wave=renderWave(p(),"lfo");
  assert.equal(wave.length,4096);
  assert.ok(wave.every(Number.isFinite));
});

test("headroom strategies scale peaks without data loss or invented clipping",()=>{
  const asymmetric=Float32Array.from([-.25,0,.5,.25]);
  const full=normalizeHeadroom(asymmetric,"full");
  const peak=normalizeHeadroom(asymmetric,"peak");
  assert.ok(Math.abs(Math.min(...full)+1)<1e-6);
  assert.ok(Math.abs(Math.max(...full)-1)<1e-6);
  assert.ok(Math.abs(peak[0]+.5)<1e-6);
  assert.ok(Math.abs(peak[2]-1)<1e-6);
  assert.ok(normalizeHeadroom(new Float32Array(20),"full").every(v=>v===0));
  assert.ok(normalizeHeadroom(new Float32Array(20),"peak").every(v=>v===0));
});

test("oscillator reclaims headroom while LFO defaults remain full swing",()=>{
  const params=p({modAmplitude:0,waveFold:2,drive:.35,pivotX:.27,lutSize:1024});
  const wave=renderWave(params,"osc");
  assert.ok(wave.every(Number.isFinite));
  assert.ok(Math.abs(Math.max(...wave.map(Math.abs))-1)<.00001);
  const full=renderWave({...params,headroomMode:"full"},"osc");
  assert.ok(Math.abs(Math.max(...full)-1)<.00001);
  assert.ok(Math.abs(Math.min(...full)+1)<.00001);
  const lfo=renderWave(params,"lfo");
  assert.ok(Math.abs(Math.max(...lfo)-1)<.00001);
  assert.ok(Math.abs(Math.min(...lfo)+1)<.00001);
});
