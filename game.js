// TONEFALL game — wrapped as a module. Call initGame() after login + after the
// game DOM is visible. Exposes window.__tonefall hooks for the Audiotool bridge.
export function initGame() {
  // ---------- config ----------
  const COLS = 16, ROWS = 16;
  const COLORS = {
    I:"#18e0e6", O:"#ffc23a", T:"#b65cff", S:"#36e07a", Z:"#ff4d6d", J:"#3a7bff", L:"#ff8a2a"
  };
  const SHAPES = {
    I:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O:[[1,1],[1,1]],
    T:[[0,1,0],[1,1,1],[0,0,0]],
    S:[[0,1,1],[1,1,0],[0,0,0]],
    Z:[[1,1,0],[0,1,1],[0,0,0]],
    J:[[1,0,0],[1,1,1],[0,0,0]],
    L:[[0,0,1],[1,1,1],[0,0,0]],
  };
  const KEYS = Object.keys(SHAPES);

  // ---------- canvas / sizing ----------
  const board = document.getElementById("board");
  const ctx = board.getContext("2d");
  const nextCv = document.getElementById("next");
  const nctx = nextCv.getContext("2d");
  const bloom = document.getElementById("bloom");
  const bctx = bloom.getContext("2d");
  bloom.width = 240; bloom.height = 240;
  let CELL = 38, DPR = 1;

  function fit(){
    const wide = window.innerWidth > 820;
    const sideReserve = wide ? 580 : 40;
    const maxByH = Math.min(window.innerHeight - 130, 620);
    const maxByW = Math.min(window.innerWidth - sideReserve, 620);
    const size = Math.max(220, Math.min(maxByH, maxByW));
    CELL = Math.floor(size / COLS);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const px = CELL * COLS;
    board.style.width = px + "px"; board.style.height = px + "px";
    board.width = px * DPR; board.height = px * DPR;
    ctx.setTransform(DPR,0,0,DPR,0,0);
    nctx.setTransform(1,0,0,1,0,0);
  }
  window.addEventListener("resize", fit);
  fit();

  // ---------- audio ----------
  let AC=null, master=null, delay=null, delayL=null, delayR=null, sweepLP=null, reverb=null, reverbIn=null, rvGain=null, fbGain=null, soundOn=true;
  let delayTimeBase=0.27, dubTimer=null, xpose=0;
  let recording=false;

  const SCALES = [
    { name:"Minor",           mood:"dark · dub",        accent:"#4a6cff", iv:[0,3,7],     fx:[0.35,0.60] },
    { name:"Fifths",          mood:"drone · hypnotic",  accent:"#6ad0ff", iv:[0,7],       thick:true, fx:[0.50,0.78] },
    { name:"Fourths",         mood:"ambient · open",    accent:"#8a9cff", iv:[0,5,10],    thick:true, fx:[0.42,0.72] },
    { name:"Major Pentatonic",mood:"bright · dreamy",   accent:"#22e6e6", iv:[0,2,4,7,9] },
    { name:"Hirajoshi",       mood:"japanese · zen",    accent:"#86e0c4", iv:[0,2,3,7,8] },
    { name:"Major add9",      mood:"uplifting · warm",  accent:"#ffce7a", iv:[0,2,4,7],   fx:[0.40,0.74] },
    { name:"Minor 7",         mood:"wistful · deep",    accent:"#b79cff", iv:[0,3,7,10],  fx:[0.42,0.76] },
    { name:"Sus2",            mood:"floating · airy",   accent:"#7fd0ff", iv:[0,2,7],     fx:[0.40,0.72] },
  ];
  let rootMidi = 50;
  const ROOT_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  let rootIdx = 2;
  let scaleIdx = 0, FREQS = [], accentRGB = [34,230,230];
  let ownMode = false;
  let ownNotes = [2,5,9];
  let OCT_SPREAD = 1;
  let pentaTest = false;
  const SPREAD_MODES = [
    {sp:1, penta:false, label:"SPREAD: TIGHT · ~2 OCT · repeats"},
    {sp:2, penta:false, label:"SPREAD: WIDE · ~3 OCT · some repeats"},
    {sp:3, penta:true,  label:"SPREAD: PENTA · ~3 OCT · every row unique"},
  ];
  let spreadMode = 0;
  let octShift = 0;
  const REGISTERS = [
    {off:-24, name:"DEEP",   desc:"very low"},
    {off:-12, name:"LOW",    desc:"low register"},
    {off:0,   name:"MID",    desc:"middle register"},
    {off:12,  name:"HIGH",   desc:"high register"},
    {off:24,  name:"BRIGHT", desc:"very high"},
  ];
  let regIdx = 2;
  let voiceId = "sine";
  const VOICES = [
    {id:"bell",  name:"BELL",   desc:"warm · default"},
    {id:"sine",  name:"SINE",   desc:"pure · original"},
    {id:"square",name:"SQUARE", desc:"filtered pluck"},
    {id:"pluck", name:"PLUCK",  desc:"short · percussive"},
    {id:"chip",  name:"CHIP",   desc:"8-bit · arcade"},
  ];
  let voiceIdx = 1;
  let stepBase = 250;
  const SPEEDS = [
    {ms:340, name:"DUB",   desc:"very slow"},
    {ms:250, name:"CHILL", desc:"relaxed · default"},
    {ms:190, name:"WALK",  desc:"medium"},
    {ms:140, name:"DRIVE", desc:"brisk"},
    {ms:110, name:"RUSH",  desc:"fast"},
  ];
  let speedIdx = 1;
  function setSpeed(i){
    speedIdx = Math.max(0, Math.min(SPEEDS.length-1, i));
    const s = SPEEDS[speedIdx]; stepBase = s.ms; stepMs = s.ms;
    const nm=document.getElementById('speedName'); if(nm) nm.textContent=s.name;
    const ds=document.getElementById('speedDesc'); if(ds) ds.textContent=s.desc;
  }
  function setVoice(i){
    voiceIdx = (i + VOICES.length) % VOICES.length;
    const v = VOICES[voiceIdx]; voiceId = v.id;
    const nm=document.getElementById('voiceName'); if(nm) nm.textContent=v.name;
    const ds=document.getElementById('voiceDesc'); if(ds) ds.textContent=v.desc;
    if(AC && soundOn){ note(FREQS[7], 0.4); }
  }
  function setOctave(i){
    regIdx = Math.max(0, Math.min(REGISTERS.length-1, i));
    const r = REGISTERS[regIdx]; octShift = r.off;
    const nm=document.getElementById('octName'); if(nm) nm.textContent=r.name;
    const ds=document.getElementById('octDesc'); if(ds) ds.textContent=r.desc;
    buildScale();
    if(AC && soundOn){ note(FREQS[7], 0.4); }
  }
  function cycleSpread(){
    spreadMode = (spreadMode+1) % SPREAD_MODES.length;
    const m = SPREAD_MODES[spreadMode];
    OCT_SPREAD = m.sp; pentaTest = m.penta;
    buildScale(); jamFlash(m.label);
  }
  function ownSorted(){ return ownNotes.length ? ownNotes.slice().sort((a,b)=>a-b) : [0]; }
  function activeIv(){ return ownMode ? ownSorted() : SCALES[scaleIdx].iv; }
  function activeBase(){ return ownMode ? 48 : rootMidi; }
  function buildScale(){
    let iv=activeIv(), base=activeBase(), hi=88, lo=40, cap=OCT_SPREAD;
    if(pentaTest){ iv=[0,2,4,7,9]; base=Math.min(base,48); hi=96; lo=36; cap=3; }
    base+=octShift; lo+=octShift; hi+=octShift;
    const n=iv.length, a=[];
    for(let i=0;i<ROWS;i++){ const oct=Math.min(Math.floor(i/n), cap);
      let midi=base+12*oct+iv[i%n]+xpose;
      while(midi>hi) midi-=12; while(midi<lo) midi+=12;
      a.push(440*Math.pow(2,(midi-69)/12)); } FREQS=a; }
  function ownNoteNames(){ return ownSorted().map(pc=>ROOT_NAMES[pc%12]).join(' '); }
  function setRoot(i, preview){ rootIdx=((i%12)+12)%12; rootMidi=48+rootIdx; buildScale();
    document.getElementById('keyName').textContent=ROOT_NAMES[rootIdx];
    if(preview) previewScale(); }
  function transpose(semi){ setRoot(rootIdx+semi, false); }
  const pick=a=>a[Math.random()*a.length|0];
  function hexToRgb(h){ h=h.replace('#',''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
  function previewScale(){ if(!AC||!soundOn) return;
    [3,5,7,9,11].forEach((idx,k)=> note(FREQS[Math.min(FREQS.length-1,idx)], 0.4, AC.currentTime+k*0.085)); }
  function setScale(i, preview){
    scaleIdx=((i%SCALES.length)+SCALES.length)%SCALES.length;
    buildScale();
    const s=SCALES[scaleIdx];
    document.documentElement.style.setProperty('--accent', s.accent);
    accentRGB=hexToRgb(s.accent);
    document.getElementById('moodName').textContent=s.name;
    document.getElementById('moodDesc').textContent=s.mood;
    if(s.fx){ fxX=s.fx[0]; fxY=s.fx[1]; setDot(); applyFX(); }
    if(preview) previewScale();
  }
  buildScale();

  function makeImpulse(sec, decay, ac){
    ac = ac || AC;
    const rate=ac.sampleRate, len=Math.floor(rate*sec);
    const buf=ac.createBuffer(2,len,rate);
    for(let ch=0;ch<2;ch++){ const d=buf.getChannelData(ch);
      for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len, decay); }
    return buf;
  }
  function initAudio(){
    if(AC) return;
    AC = new (window.AudioContext||window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.62;
    sweepLP = AC.createBiquadFilter(); sweepLP.type="lowpass"; sweepLP.frequency.value=18000; sweepLP.Q.value=3;
    const hp = AC.createBiquadFilter(); hp.type="highpass"; hp.frequency.value=115;
    const lp = AC.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=7200;
    const comp = AC.createDynamicsCompressor();
    comp.threshold.value=-16; comp.ratio.value=4; comp.attack.value=0.003; comp.release.value=0.25;
    master.connect(sweepLP); sweepLP.connect(hp); hp.connect(lp); lp.connect(comp); comp.connect(AC.destination);
    reverb = AC.createConvolver(); reverb.buffer = makeImpulse(3.2, 2.3);
    reverbIn = AC.createBiquadFilter(); reverbIn.type="highpass"; reverbIn.frequency.value=240;
    reverbIn.connect(reverb);
    rvGain = AC.createGain(); rvGain.gain.value = 0.85; reverb.connect(rvGain); rvGain.connect(master);
    delay = AC.createGain();
    delayL = AC.createDelay(1.6); delayR = AC.createDelay(1.6);
    delayL.delayTime.value = delayTimeBase; delayR.delayTime.value = delayTimeBase;
    const dlp = AC.createBiquadFilter(); dlp.type="lowpass"; dlp.frequency.value=2400;
    fbGain = AC.createGain(); fbGain.gain.value = 0.27;
    const pL = AC.createStereoPanner(); pL.pan.value=-0.85;
    const pR = AC.createStereoPanner(); pR.pan.value= 0.85;
    const dwet = AC.createGain(); dwet.gain.value = 0.5;
    delay.connect(delayL); delayL.connect(delayR);
    delayR.connect(dlp); dlp.connect(fbGain); fbGain.connect(delayL);
    delayL.connect(pL); delayR.connect(pR);
    pL.connect(dwet); pR.connect(dwet); dwet.connect(master); dwet.connect(reverbIn);
    applyFX();
  }
  function setSmooth(param, v){ if(AC) param.setTargetAtTime(v, AC.currentTime, 0.03); }
  function applyFX(){
    if(!AC) return;
    setSmooth(fbGain.gain, fxX*0.82);
    setSmooth(rvGain.gain, fxY*1.5);
  }
  function setDelayTime(v){ if(!AC) return; setSmooth(delayL.delayTime, v); setSmooth(delayR.delayTime, v); }

  function gestureDub(){ ensureAudio(); if(!AC) return;
    setSmooth(delayL.delayTime, 0.40); setSmooth(delayR.delayTime, 0.55);
    setSmooth(fbGain.gain, 0.80);
    clearTimeout(dubTimer); dubTimer=setTimeout(()=>{ setDelayTime(delayTimeBase); applyFX(); }, 3800);
  }
  function gestureWash(){ ensureAudio(); if(!AC) return;
    const g=rvGain.gain, t=AC.currentTime, base=fxY*1.5;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(3.2, t+0.5);            // big swell
    g.linearRampToValueAtTime(base, t+5.0);           // long, slow fall
    // briefly widen the reverb tail by lifting the delay feedback too
    const fb=fbGain.gain; fb.cancelScheduledValues(t); fb.setValueAtTime(fb.value,t);
    fb.linearRampToValueAtTime(Math.min(0.85, fxX*0.82+0.4), t+0.5);
    fb.linearRampToValueAtTime(fxX*0.82, t+4.0);
  }
  // TAPE-STOP (y): power-down brake — muffle + dip, then snap back
  function gestureTapeStop(){ ensureAudio(); if(!AC) return;
    const t=AC.currentTime, f=sweepLP.frequency, mg=master.gain, lvl=0.62;
    f.cancelScheduledValues(t); f.setValueAtTime(Math.max(f.value,8000),t);
    f.exponentialRampToValueAtTime(180,t+0.55);
    mg.cancelScheduledValues(t); mg.setValueAtTime(lvl,t); mg.linearRampToValueAtTime(0.0001,t+0.6);
    // snap back
    f.exponentialRampToValueAtTime(18000,t+0.95);
    mg.setValueAtTime(0.0001,t+0.62); mg.linearRampToValueAtTime(lvl,t+0.78);
  }
  function gesturePreset(){ ensureAudio();
    if(ownMode){ const pal=[[0,3,7],[0,4,7],[0,2,7],[0,3,7,10],[0,2,4,7],[0,5,10],[2,5,9],[0,3,8],[0,4,7,11]];
      ownNotes=pick(pal).slice(); buildScale(); syncKeyboard(); previewScale(); }
    else { let i; do{ i=Math.random()*SCALES.length|0; } while(i===scaleIdx && SCALES.length>1); setScale(i, true); }
  }
  function gestureTonart(){ ensureAudio();
    if(ownMode){ xpose=clampX(xpose+pick([3,4,5,7,-3,-5])); buildScale(); previewScale(); }
    else setRoot(rootIdx + pick([3,4,5,7,-3,-5]), true);
  }
  function gestureTranspose(){ ensureAudio();
    xpose=clampX(xpose + pick([-12,-7,-5,5,7,12])); buildScale(); previewScale();
  }
  function gestureStab(){ ensureAudio(); if(!AC||!soundOn) return;
    [3,5,7,9].forEach((idx,k)=> note(FREQS[Math.min(FREQS.length-1,idx)], 0.4, AC.currentTime+k*0.025));
  }
  function clampX(v){ return Math.max(-14, Math.min(14, v)); }
  function jamFlash(label){ const el=document.getElementById('jamflash'); if(!el) return;
    el.textContent=label; el.classList.add('show');
    clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'), 600); }
  const JAM={
    q:['↯ long delay',gestureDub],  h:['↯ long delay',gestureDub],
    e:['wash',gestureWash],
    f:['transpose',gestureTranspose], v:['chord stab',gestureStab],
    y:['tape-stop',gestureTapeStop],
  };
  function ensureAudio(){ if(!AC) initAudio(); if(AC && AC.state==="suspended") AC.resume(); }
  function note(freq, vel, t0){
    if(!AC||!soundOn) return;
    const t = t0 ?? AC.currentTime;
    synthVoice(AC, {dry:master, rev:reverbIn, dly:delay}, freq, vel, t, !!SCALES[scaleIdx].thick);
  }
  function synthVoice(ac, B, freq, vel, t, thick){
    if(voiceId==="sine")  return voiceSine(ac,B,freq,vel,t);
    if(voiceId==="square")return voiceSquare(ac,B,freq,vel,t);
    if(voiceId==="pluck") return voicePluck(ac,B,freq,vel,t);
    if(voiceId==="chip")  return voiceChip(ac,B,freq,vel,t);
    const rel = thick ? 2.5 : 1.7;
    const out = ac.createGain(); out.gain.value = 1;
    out.connect(B.dry); out.connect(B.rev); out.connect(B.dly);
    const tone = ac.createBiquadFilter(); tone.type="lowpass";
    tone.frequency.setValueAtTime(thick?5200:4200, t);
    tone.frequency.exponentialRampToValueAtTime(thick?1500:900, t+1.3);
    tone.connect(out);
    const peak = 0.18*vel;
    const b1 = ac.createOscillator(); b1.type="sine"; b1.frequency.value=freq;
    const b2 = ac.createOscillator(); b2.type="sine"; b2.frequency.value=freq; b2.detune.value=7;
    const bg = ac.createGain();
    bg.gain.setValueAtTime(0,t); bg.gain.linearRampToValueAtTime(peak,t+0.005);
    bg.gain.exponentialRampToValueAtTime(0.0001,t+rel);
    b1.connect(bg); b2.connect(bg); bg.connect(tone);
    const p = ac.createOscillator(); p.type="sine"; p.frequency.value=freq*3.01;
    const pg = ac.createGain();
    pg.gain.setValueAtTime(0,t); pg.gain.linearRampToValueAtTime(peak*(thick?0.22:0.45),t+0.004);
    pg.gain.exponentialRampToValueAtTime(0.0001,t+0.16);
    p.connect(pg); pg.connect(out);
    b1.start(t); b2.start(t); p.start(t);
    b1.stop(t+rel+0.1); b2.stop(t+rel+0.1); p.stop(t+0.25);
    if(thick){
      const ch=ac.createOscillator(); ch.type="sine"; ch.frequency.value=freq; ch.detune.value=-13;
      const cg=ac.createGain(); cg.gain.setValueAtTime(0,t); cg.gain.linearRampToValueAtTime(peak*0.7,t+0.03);
      cg.gain.exponentialRampToValueAtTime(0.0001,t+rel); ch.connect(cg); cg.connect(tone); ch.start(t); ch.stop(t+rel+0.1);
      const oc=ac.createOscillator(); oc.type="sine"; oc.frequency.value=freq*2;
      const og=ac.createGain(); og.gain.setValueAtTime(0,t); og.gain.linearRampToValueAtTime(peak*0.22,t+0.03);
      og.gain.exponentialRampToValueAtTime(0.0001,t+rel*0.7); oc.connect(og); og.connect(tone); oc.start(t); oc.stop(t+rel*0.7+0.1);
    }
  }
  function voiceSine(ac,B,freq,vel,t){
    const out=ac.createGain(); out.gain.value=1; out.connect(B.dry); out.connect(B.rev); out.connect(B.dly);
    const peak=0.20*vel;
    const o=ac.createOscillator(); o.type="sine"; o.frequency.value=freq;
    const g=ac.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(peak,t+0.004);
    g.gain.exponentialRampToValueAtTime(0.0001,t+1.1);
    o.connect(g); g.connect(out); o.start(t); o.stop(t+1.25);
  }
  function voiceSquare(ac,B,freq,vel,t){
    const out=ac.createGain(); out.gain.value=1; out.connect(B.dry); out.connect(B.rev); out.connect(B.dly);
    const lp=ac.createBiquadFilter(); lp.type="lowpass"; lp.Q.value=4;
    lp.frequency.setValueAtTime(Math.min(7000,freq*7), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(450,freq*1.8), t+0.35);
    lp.connect(out);
    const peak=0.18*vel;
    const o=ac.createOscillator(); o.type="square"; o.frequency.value=freq;
    const g=ac.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(peak,t+0.004);
    g.gain.exponentialRampToValueAtTime(0.0001,t+0.45);
    o.connect(g); g.connect(lp);
    o.start(t); o.stop(t+0.55);
  }
  function voicePluck(ac,B,freq,vel,t){
    const out=ac.createGain(); out.gain.value=1; out.connect(B.dry); out.connect(B.rev); out.connect(B.dly);
    const tone=ac.createBiquadFilter(); tone.type="lowpass";
    tone.frequency.setValueAtTime(5000,t); tone.frequency.exponentialRampToValueAtTime(900,t+0.4); tone.connect(out);
    const peak=0.22*vel;
    const o=ac.createOscillator(); o.type="triangle"; o.frequency.value=freq;
    const g=ac.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(peak,t+0.003);
    g.gain.exponentialRampToValueAtTime(0.0001,t+0.5);
    o.connect(g); g.connect(tone);
    const o2=ac.createOscillator(); o2.type="sine"; o2.frequency.value=freq*2.0;
    const g2=ac.createGain(); g2.gain.setValueAtTime(0,t); g2.gain.linearRampToValueAtTime(peak*0.3,t+0.002);
    g2.gain.exponentialRampToValueAtTime(0.0001,t+0.18);
    o2.connect(g2); g2.connect(out);
    o.start(t); o.stop(t+0.6); o2.start(t); o2.stop(t+0.25);
  }
  // duty-cycle pulse wave (NES/Game-Boy character). duty 0.5=square, 0.125=thin lead.
  function makePulseWave(ac, duty, n){
    n = n || 22;
    const real=new Float32Array(n+1), imag=new Float32Array(n+1);
    for(let k=1;k<=n;k++){ imag[k]=(2/(k*Math.PI))*Math.sin(k*Math.PI*duty); }
    return ac.createPeriodicWave(real, imag, {disableNormalization:false});
  }
  function voiceChip(ac,B,freq,vel,t){
    const out=ac.createGain(); out.gain.value=1; out.connect(B.dry); out.connect(B.rev); out.connect(B.dly);
    const peak=0.17*vel, rel=1.05;
    // two pulse layers: a 50% body + a 12.5% bright lead
    const o1=ac.createOscillator(); o1.setPeriodicWave(makePulseWave(ac,0.5,18));  o1.frequency.value=freq;
    const o2=ac.createOscillator(); o2.setPeriodicWave(makePulseWave(ac,0.125,22)); o2.frequency.value=freq;
    // light vibrato, fading in after the attack (classic chiptune lead)
    const vib=ac.createOscillator(); vib.type="sine"; vib.frequency.value=5.6;
    const vibG=ac.createGain();
    vibG.gain.setValueAtTime(0,t); vibG.gain.setValueAtTime(0,t+0.14);
    vibG.gain.linearRampToValueAtTime(6.5,t+0.34);   // ~6.5 cents
    vib.connect(vibG); vibG.connect(o1.detune); vibG.connect(o2.detune);
    // hard-edged envelope: instant attack, small decay to sustain, exp release
    const g=ac.createGain();
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(peak,t+0.005);
    g.gain.linearRampToValueAtTime(peak*0.72,t+0.09);
    g.gain.exponentialRampToValueAtTime(0.0001,t+rel);
    const g2=ac.createGain(); g2.gain.value=0.55;    // lead layer a bit quieter
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(out);
    [o1,o2,vib].forEach(o=>{ o.start(t); o.stop(t+rel+0.05); });
  }
  function chord(rowsCleared){
    if(!AC||!soundOn) return;
    const idxs=[0,2,4,7,9,11];
    idxs.forEach((di,k)=>{
      const fi=Math.min(FREQS.length-1, 3 + di);
      note(FREQS[fi], 0.5, AC.currentTime + k*0.045);
    });
  }

  // ---------- state ----------
  let grid, cur, nextPiece, score, lines, level, gravMs, lastGrav, dropping=false;
  let playCol, markCol=0, stepMs, lastStep, ripples=[];
  let running=false, paused=false, raf=null, lastT=0;
  let fxX=0.33, fxY=0.55;

  function emptyGrid(){ return Array.from({length:ROWS},()=>Array(COLS).fill(null)); }
  function newPiece(){
    const key = KEYS[(Math.random()*KEYS.length)|0];
    const m = SHAPES[key].map(r=>r.slice());
    const w = m[0].length;
    return { key, m, x: Math.floor((COLS-w)/2), y: key==="I"?-1:0 };
  }
  function rotateM(m){ const n=m.length, r=Array.from({length:n},()=>Array(n).fill(0));
    for(let i=0;i<n;i++)for(let j=0;j<n;j++) r[j][n-1-i]=m[i][j]; return r; }

  function collide(p, m=p.m, ox=p.x, oy=p.y){
    for(let i=0;i<m.length;i++)for(let j=0;j<m[i].length;j++){
      if(!m[i][j]) continue;
      const x=ox+j, y=oy+i;
      if(x<0||x>=COLS||y>=ROWS) return true;
      if(y>=0 && grid[y][x]) return true;
    }
    return false;
  }
  function merge(p){
    for(let i=0;i<p.m.length;i++)for(let j=0;j<p.m[i].length;j++){
      if(p.m[i][j]){ const y=p.y+i, x=p.x+j; if(y>=0) grid[y][x]=COLORS[p.key]; }
    }
  }
  function clearLines(){
    let cleared=0;
    for(let y=ROWS-1;y>=0;y--){
      if(grid[y].every(c=>c)){ grid.splice(y,1); grid.unshift(Array(COLS).fill(null)); cleared++; y++; }
    }
    if(cleared){
      lines+=cleared;
      score += [0,40,120,360,1000][cleared]*level;
      level = 1 + Math.floor(lines/6);
      gravMs = Math.max(120, 760 - (level-1)*70);
      chord(cleared);
      updHUD();
    }
  }
  function lock(){
    merge(cur);
    note(FREQS[1], 0.28);
    clearLines();
    cur = nextPiece; nextPiece = newPiece();
    if(collide(cur)){ gameOver(); return; }
    drawNext();
  }

  function move(dx){ if(!cur||!alive()) return; cur.x+=dx; if(collide(cur)) cur.x-=dx; }
  function softDrop(){ if(!cur||!alive()) return; cur.y++; if(collide(cur)){ cur.y--; lock(); } else { score+=1; updHUD(); } lastGrav=performance.now(); }
  function rotate(){
    if(!cur||!alive()) return;
    const r=rotateM(cur.m);
    for(const k of [0,-1,1,-2,2]){ if(!collide(cur,r,cur.x+k)){ cur.m=r; cur.x+=k; return; } }
  }
  function hardDrop(){
    if(!cur||!alive()) return;
    let d=0; while(!collide(cur,cur.m,cur.x,cur.y+1)){ cur.y++; d++; }
    score += d*2; updHUD(); lock();
  }
  function alive(){ return running && !paused; }
  let frozen=false;
  function setFrozen(on){
    if(on && (!running || paused)) on=false;
    if(on===frozen) return;
    frozen=on;
    document.getElementById('holdbadge').classList.toggle('show', frozen);
    document.querySelectorAll('#bHoldTop,#bHold').forEach(b=> b&&b.classList.toggle('on', frozen));
    const modal=document.getElementById('sendModal'); if(modal) modal.classList.toggle('hidden', !frozen);
    if(!frozen){ const er=document.getElementById('exportResult'); if(er){ er.hidden=true; er.innerHTML=''; } }
    if(!frozen){ lastGrav=performance.now(); }
  }

  function pieceCellColor(x,y){
    if(!cur) return null;
    const i=y-cur.y, j=x-cur.x;
    if(i>=0 && i<cur.m.length && j>=0 && j<cur.m[i].length && cur.m[i][j]) return COLORS[cur.key];
    return null;
  }
  function step(){
    let count=0;
    for(let y=0;y<ROWS;y++){ if(grid[y][playCol]||pieceCellColor(playCol,y)) count++; }
    const vScale = count ? Math.pow(count,-0.32) : 1;
    for(let y=0;y<ROWS;y++){
      if(grid[y][playCol] || pieceCellColor(playCol,y)){
        const ni = ROWS-1-y;
        const vel = 0.62 * vScale * (0.82 + 0.18*(ni/(ROWS-1)));
        note(FREQS[ni], vel, AC?AC.currentTime:0);
        ripples.push({x:playCol, y, r:0, a:1});
      }
    }
    markCol = playCol;
    playCol = (playCol+1)%COLS;
  }

  function cellRect(x,y){ return [x*CELL, y*CELL, CELL, CELL]; }
  function roundRect(c,x,y,w,h,r){ c.beginPath(); c.moveTo(x+r,y);
    c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
    c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }

  function drawCell(x,y,color,opts={}){
    const [px,py,w,h]=cellRect(x,y);
    const pad = Math.max(2, CELL*0.10);
    const lit = opts.lit||0;
    ctx.save();
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = (20 + lit*28) * (CELL/38);
    roundRect(ctx, px+pad, py+pad, w-pad*2, h-pad*2, (CELL-pad*2)*0.22);
    ctx.fill();
    ctx.shadowBlur = (9 + lit*16) * (CELL/38);
    ctx.fill();
    if(lit>0){ ctx.shadowBlur=0; ctx.globalAlpha=Math.min(1,lit+0.25); ctx.fillStyle="#ffffff";
      roundRect(ctx, px+pad+ (w-pad*2)*0.26, py+pad+(h-pad*2)*0.26, (w-pad*2)*0.48, (h-pad*2)*0.48, 4);
      ctx.fill(); }
    ctx.restore();
  }

  function render(){
    const px = CELL*COLS;
    ctx.clearRect(0,0,px,px);
    ctx.save();
    for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
      const [cx,cy]=cellRect(x,y);
      ctx.fillStyle = (x+y)%2 ? "rgba(255,178,40,.055)":"rgba(255,178,40,.095)";
      const pad=Math.max(2,CELL*0.10);
      roundRect(ctx, cx+pad, cy+pad, CELL-pad*2, CELL-pad*2, (CELL-pad*2)*0.22);
      ctx.fill();
    }
    ctx.restore();
    if(running){
      const gx = markCol*CELL, r=255, g=178, b=40;
      const grad = ctx.createLinearGradient(gx,0,gx+CELL,0);
      grad.addColorStop(0,`rgba(${r},${g},${b},0)`);
      grad.addColorStop(.5,`rgba(${r},${g},${b},.20)`);
      grad.addColorStop(1,`rgba(${r},${g},${b},0)`);
      ctx.fillStyle=grad; ctx.fillRect(gx,0,CELL,px);
      ctx.fillStyle=`rgba(255,210,120,.7)`;
      ctx.fillRect(gx+CELL-2,0,2,px);
    }
    for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
      if(grid[y][x]) drawCell(x,y,grid[y][x],{lit: x===playCol?0.9:0});
    }
    if(cur && alive()){
      let gy=cur.y; while(!collide(cur,cur.m,cur.x,gy+1)) gy++;
      ctx.save(); ctx.globalAlpha=.18;
      for(let i=0;i<cur.m.length;i++)for(let j=0;j<cur.m[i].length;j++){
        if(cur.m[i][j]){ const [pxx,pyy,w,h]=cellRect(cur.x+j,gy+i); const pad=Math.max(2,CELL*0.10);
          ctx.strokeStyle=COLORS[cur.key]; ctx.lineWidth=1.5;
          roundRect(ctx,pxx+pad,pyy+pad,w-pad*2,h-pad*2,(CELL-pad*2)*0.22); ctx.stroke(); }
      }
      ctx.restore();
    }
    if(cur){
      for(let i=0;i<cur.m.length;i++)for(let j=0;j<cur.m[i].length;j++){
        if(cur.m[i][j] && cur.y+i>=0) drawCell(cur.x+j, cur.y+i, COLORS[cur.key], {lit:0.15});
      }
    }
    ripples.forEach(rp=>{
      const [cx,cy]=cellRect(rp.x,rp.y);
      ctx.save();
      ctx.globalAlpha=rp.a*0.55; ctx.strokeStyle="#ffce7a"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(cx+CELL/2, cy+CELL/2, rp.r, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    });
    ctx.save();
    ctx.fillStyle="rgba(0,0,0,.16)";
    for(let yy=0; yy<px; yy+=3){ ctx.fillRect(0,yy,px,1); }
    ctx.restore();
  }

  function drawNext(){
    nctx.clearRect(0,0,120,120);
    if(!nextPiece) return;
    const m=nextPiece.m, n=m.length, c=COLORS[nextPiece.key], cs=24;
    const offx=(120-n*cs)/2, offy=(120-n*cs)/2;
    for(let i=0;i<n;i++)for(let j=0;j<n;j++){ if(!m[i][j])continue;
      nctx.save(); nctx.shadowColor=c; nctx.shadowBlur=10; nctx.fillStyle=c;
      const x=offx+j*cs+3, y=offy+i*cs+3;
      nctx.beginPath(); const r=5,w=cs-6,h=cs-6;
      nctx.moveTo(x+r,y); nctx.arcTo(x+w,y,x+w,y+h,r); nctx.arcTo(x+w,y+h,x,y+h,r);
      nctx.arcTo(x,y+h,x,y,r); nctx.arcTo(x,y,x+w,y,r); nctx.fill(); nctx.restore();
    }
  }

  function loop(t){
    raf=requestAnimationFrame(loop);
    const dt = t-lastT; lastT=t;
    if(running && !paused){
      if(!frozen && t-lastGrav >= gravMs){ lastGrav=t;
        cur.y++; if(collide(cur)){ cur.y--; lock(); } }
      if(t-lastStep >= stepMs){ lastStep=t; step(); }
    }
    ripples.forEach(rp=>{ rp.r += CELL*0.06; rp.a -= 0.04; });
    ripples = ripples.filter(rp=>rp.a>0);
    render();
    bctx.clearRect(0,0,240,240);
    bctx.drawImage(board, 0,0,240,240);
  }

  function updHUD(){
    document.getElementById("score").textContent=score;
    document.getElementById("lines").textContent=lines;
    document.getElementById("level").textContent=level;
  }
  function reset(){
    grid=emptyGrid(); score=0; lines=0; level=1; gravMs=760;
    playCol=0; markCol=0; stepMs=stepBase; ripples=[];
    frozen=false; const hb=document.getElementById('holdbadge'); if(hb) hb.classList.remove('show');
    cur=newPiece(); nextPiece=newPiece(); updHUD(); drawNext();
    lastGrav=performance.now(); lastStep=performance.now();
  }
  function start(){
    ensureAudio();
    reset(); running=true; paused=false;
    hide("startOv"); hide("overOv"); hide("pauseOv");
    if(soundOn){ note(FREQS[7],0.4); note(FREQS[11],0.4, AC.currentTime+0.06); }
    if(!raf){ lastT=performance.now(); raf=requestAnimationFrame(loop); }
  }
  function gameOver(){
    running=false;
    document.getElementById("finalScore").textContent=score;
    show("overOv");
  }
  function togglePause(){
    if(!running) return;
    paused=!paused;
    const b=document.getElementById("pause");
    if(paused){ show("pauseOv"); b.textContent="▶ resume"; }
    else { hide("pauseOv"); b.textContent="⏸ pause"; lastGrav=performance.now(); lastStep=performance.now(); }
  }
  function show(id){ document.getElementById(id).classList.remove("hidden"); }
  function hide(id){ document.getElementById(id).classList.add("hidden"); }

  window.addEventListener("keydown", e=>{
    ensureAudio();
    if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(e.key)) e.preventDefault();
    if(e.key==="p"||e.key==="P"){ togglePause(); return; }
    const k=e.key.toLowerCase();
    if(k==="a"){ fxY=Math.min(1,fxY+0.06); setDot(); applyFX(); return; }
    if(k==="z"){ fxY=Math.max(0,fxY-0.06); setDot(); applyFX(); return; }
    if(k==="s"){ fxX=Math.min(1,fxX+0.06); setDot(); applyFX(); return; }
    if(k==="x"){ fxX=Math.max(0,fxX-0.06); setDot(); applyFX(); return; }
    if(k==="d"){ ensureAudio(); delayTimeBase=Math.min(0.6, delayTimeBase+0.03); setDelayTime(delayTimeBase); return; }
    if(k==="c"){ ensureAudio(); delayTimeBase=Math.max(0.06, delayTimeBase-0.03); setDelayTime(delayTimeBase); return; }
    if(JAM[k]){ JAM[k][1](); jamFlash(JAM[k][0]); return; }
    if(e.key==="0"){ ensureAudio(); cycleSpread(); return; }
    if(!ownMode && /^[1-8]$/.test(e.key)){ ensureAudio(); setScale(parseInt(e.key,10)-1, true); return; }
    if(!alive() || frozen) return;
    if(e.key==="ArrowLeft") move(-1);
    else if(e.key==="ArrowRight") move(1);
    else if(e.key==="ArrowUp") rotate();
    else if(e.key==="ArrowDown") softDrop();
    else if(e.key===" ") hardDrop();
  });
  window.addEventListener("blur", ()=> setFrozen(false));
  const bind=(id,fn)=>{ const el=document.getElementById(id);
    const wrapped=()=>{ ensureAudio(); fn(); };
    el.addEventListener("click",wrapped);
    el.addEventListener("touchstart",e=>{e.preventDefault();wrapped();},{passive:false}); };
  bind("bL",()=>move(-1)); bind("bR",()=>move(1));
  bind("bRot",rotate); bind("bDown",softDrop); bind("bDrop",hardDrop);
  function toggleFrozen(){ ensureAudio(); setFrozen(!frozen); }
  document.getElementById("bHoldTop").addEventListener("click", toggleFrozen);
  document.getElementById("bHold").addEventListener("click", e=>{ e.preventDefault(); toggleFrozen(); });

  // ---- offline render (shared by WAV export + Audiotool audio send) ----
  function buildOfflineRender(opts){
    ensureAudio();
    const o = Object.assign({loops:4, tail:3.2, pad:0.05, fade:0}, opts||{});
    const LOOPS=o.loops, stepSec=stepMs/1000, pad=o.pad, tail=o.tail;
    const totalSec = pad + LOOPS*COLS*stepSec + tail;
    const rate = AC.sampleRate;
    const octx = new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(2, Math.ceil(totalSec*rate), rate);
    const oMaster=octx.createGain(); oMaster.gain.value=0.62;
    const oSweep=octx.createBiquadFilter(); oSweep.type="lowpass"; oSweep.frequency.value=18000; oSweep.Q.value=3;
    const oHp=octx.createBiquadFilter(); oHp.type="highpass"; oHp.frequency.value=115;
    const oLp=octx.createBiquadFilter(); oLp.type="lowpass"; oLp.frequency.value=7200;
    const oComp=octx.createDynamicsCompressor(); oComp.threshold.value=-16; oComp.ratio.value=4; oComp.attack.value=0.003; oComp.release.value=0.25;
    oMaster.connect(oSweep); oSweep.connect(oHp); oHp.connect(oLp); oLp.connect(oComp); oComp.connect(octx.destination);
    const oRev=octx.createConvolver(); oRev.buffer=makeImpulse(3.2,2.3,octx);
    const oRevIn=octx.createBiquadFilter(); oRevIn.type="highpass"; oRevIn.frequency.value=240; oRevIn.connect(oRev);
    const oRvG=octx.createGain(); oRvG.gain.value = rvGain?rvGain.gain.value:0.6; oRev.connect(oRvG); oRvG.connect(oMaster);
    const oDly=octx.createGain();
    const oDL=octx.createDelay(1.6), oDR=octx.createDelay(1.6);
    oDL.delayTime.value = delayL?delayL.delayTime.value:delayTimeBase;
    oDR.delayTime.value = delayR?delayR.delayTime.value:delayTimeBase;
    const oDlp=octx.createBiquadFilter(); oDlp.type="lowpass"; oDlp.frequency.value=2400;
    const oFb=octx.createGain(); oFb.gain.value = fbGain?fbGain.gain.value:0.27;
    const oPL=octx.createStereoPanner(); oPL.pan.value=-0.85;
    const oPR=octx.createStereoPanner(); oPR.pan.value=0.85;
    const oDwet=octx.createGain(); oDwet.gain.value=0.5;
    oDly.connect(oDL); oDL.connect(oDR); oDR.connect(oDlp); oDlp.connect(oFb); oFb.connect(oDL);
    oDL.connect(oPL); oDR.connect(oPR); oPL.connect(oDwet); oPR.connect(oDwet); oDwet.connect(oMaster); oDwet.connect(oRevIn);
    const B={dry:oMaster, rev:oRevIn, dly:oDly};
    const thick=!!SCALES[scaleIdx].thick;
    const occ=[]; for(let y=0;y<ROWS;y++){ occ.push([]); for(let x=0;x<COLS;x++) occ[y][x]= !!(grid[y][x]||pieceCellColor(x,y)); }
    for(let lp=0; lp<LOOPS; lp++){
      for(let c=0;c<COLS;c++){
        let count=0; for(let y=0;y<ROWS;y++) if(occ[y][c]) count++;
        const vScale = count ? Math.pow(count,-0.32) : 1;
        const t = pad + (lp*COLS + c)*stepSec;
        for(let y=0;y<ROWS;y++){ if(occ[y][c]){
          const ni=ROWS-1-y;
          const vel=0.62*vScale*(0.82+0.18*(ni/(ROWS-1)));
          synthVoice(octx, B, FREQS[ni], vel, t, thick);
        }}
      }
    }
    if(o.fade>0){ const endT = pad + LOOPS*COLS*stepSec; oMaster.gain.setValueAtTime(0.62, Math.max(0,endT-o.fade)); oMaster.gain.linearRampToValueAtTime(0.0001, endT); }
    return octx.startRendering();
  }
  function renderWavBlob(){
    return buildOfflineRender().then(buf => new Blob([encodeWav(buf)], {type:"audio/wav"}));
  }
  // exactly one bar, no lead/tail, tiny fade to avoid a click — for tempo-locked
  // looping inside Audiotool.
  function renderLoopWavClean(){
    return buildOfflineRender({loops:1, tail:0, pad:0, fade:0.012}).then(buf => new Blob([encodeWav(buf)], {type:"audio/wav"}));
  }
  // four bars, seamless: render 4 bars + the full reverb/delay ringout, then wrap
  // the ringout back onto the start (overlap-add). Result is exactly 4 bars long
  // (→ tempo-locked, no stretch) but sounds continuously washed like the live game,
  // with nothing cut off at the loop seam.
  function renderSendWav(){
    const loops=4, stepSec=stepMs/1000;
    return buildOfflineRender({loops:loops, tail:3.4, pad:0, fade:0}).then(buf=>{
      const rate=buf.sampleRate, chs=buf.numberOfChannels;
      const bodyLen=Math.max(1, Math.round(loops*COLS*stepSec*rate));
      const wrapped=AC.createBuffer(chs, bodyLen, rate);
      for(let c=0;c<chs;c++){
        const src=buf.getChannelData(c), dst=wrapped.getChannelData(c);
        const n=Math.min(bodyLen, src.length);
        for(let i=0;i<n;i++) dst[i]=src[i];
        for(let i=bodyLen;i<src.length;i++) dst[(i-bodyLen)%bodyLen]+=src[i];
      }
      return new Blob([encodeWav(wrapped)], {type:"audio/wav"});
    });
  }
  function startExport(){
    ensureAudio();
    if(!AC || recording) return;
    const btn=document.getElementById("exportBtn");
    recording=true; btn.classList.add("rec"); btn.textContent="● rendering…";
    renderWavBlob().then(blob=>{
      const url=URL.createObjectURL(blob);
      const fname="tonefall-loop-"+Date.now().toString().slice(-6)+".wav";
      showExportResult(url, fname);
      try{ const a=document.createElement("a"); a.href=url; a.download=fname;
        document.body.appendChild(a); a.click(); a.remove(); }catch(e){}
    }).catch(err=>{
      const box=document.getElementById("exportResult");
      box.hidden=false; box.innerHTML='<span class="exerr">export failed: '+(err&&err.message?err.message:err)+'</span>';
    }).finally(()=>{
      recording=false; btn.classList.remove("rec"); btn.textContent="● export";
    });
  }
  function showExportResult(url, fname){
    const box=document.getElementById("exportResult");
    box.hidden=false;
    box.innerHTML='';
    const lab=document.createElement("div"); lab.className="exlab"; lab.textContent="loop rendered — play or save:";
    const au=document.createElement("audio"); au.controls=true; au.src=url;
    const a=document.createElement("a"); a.className="exsave"; a.href=url; a.download=fname;
    a.target="_blank"; a.rel="noopener"; a.textContent="⤓ save .wav";
    box.appendChild(lab); box.appendChild(au); box.appendChild(a);
  }
  function encodeWav(buf){
    const nCh=buf.numberOfChannels, len=buf.length, rate=buf.sampleRate;
    const ab=new ArrayBuffer(44 + len*nCh*2), v=new DataView(ab);
    const ws=(o,s)=>{ for(let i=0;i<s.length;i++) v.setUint8(o+i, s.charCodeAt(i)); };
    ws(0,"RIFF"); v.setUint32(4, 36+len*nCh*2, true); ws(8,"WAVE"); ws(12,"fmt ");
    v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,nCh,true);
    v.setUint32(24,rate,true); v.setUint32(28,rate*nCh*2,true); v.setUint16(32,nCh*2,true);
    v.setUint16(34,16,true); ws(36,"data"); v.setUint32(40,len*nCh*2,true);
    const chans=[]; for(let c=0;c<nCh;c++) chans.push(buf.getChannelData(c));
    let o=44; for(let i=0;i<len;i++){ for(let c=0;c<nCh;c++){
      let s=Math.max(-1,Math.min(1,chans[c][i])); v.setInt16(o, s<0?s*0x8000:s*0x7fff, true); o+=2; } }
    return ab;
  }
  document.getElementById("exportBtn").addEventListener("click", startExport);
  { const mc=document.getElementById("modalClose"); if(mc) mc.addEventListener("click", ()=> setFrozen(false)); }

  document.getElementById("startBtn").onclick=start;
  document.getElementById("againBtn").onclick=start;
  document.getElementById("resumeBtn").onclick=togglePause;
  document.getElementById("pause").onclick=togglePause;
  document.getElementById("mute").onclick=function(){
    soundOn=!soundOn; this.classList.toggle("on",soundOn);
    this.textContent = soundOn ? "♪ sound" : "♪ muted";
  };

  const pad=document.getElementById("pad"), dot=document.getElementById("dot");
  function setDot(){ dot.style.left=(fxX*100)+"%"; dot.style.top=((1-fxY)*100)+"%"; }
  function padSet(cx,cy){ const r=pad.getBoundingClientRect();
    fxX=Math.min(1,Math.max(0,(cx-r.left)/r.width));
    fxY=Math.min(1,Math.max(0,1-(cy-r.top)/r.height));
    setDot(); applyFX(); }
  let padDown=false;
  pad.addEventListener("pointerdown",e=>{ ensureAudio(); padDown=true; try{pad.setPointerCapture(e.pointerId);}catch(_){} padSet(e.clientX,e.clientY); });
  pad.addEventListener("pointermove",e=>{ if(padDown) padSet(e.clientX,e.clientY); });
  window.addEventListener("pointerup",()=>{ padDown=false; });
  pad.addEventListener("pointercancel",()=>{ padDown=false; });
  setDot();

  const WHITE=[[0,'C'],[2,'D'],[4,'E'],[5,'F'],[7,'G'],[9,'A'],[11,'B']];
  const BLACK=[[1,1],[3,2],[6,4],[8,5],[10,6]];
  function buildKeyboard(){
    const kb=document.getElementById('kb'); if(!kb) return; kb.innerHTML='';
    WHITE.forEach(([pc,nm])=>{ const d=document.createElement('div'); d.className='w'; d.dataset.pc=pc;
      d.innerHTML='<span>'+nm+'</span>';
      d.addEventListener('pointerdown',e=>{ e.preventDefault(); toggleNote(pc); }); kb.appendChild(d); });
    BLACK.forEach(([pc,b])=>{ const d=document.createElement('div'); d.className='b'; d.dataset.pc=pc;
      d.style.left=(b/7*100)+'%';
      d.addEventListener('pointerdown',e=>{ e.preventDefault(); e.stopPropagation(); toggleNote(pc); }); kb.appendChild(d); });
    syncKeyboard();
  }
  function syncKeyboard(){ const on=new Set(ownSorted());
    document.querySelectorAll('#kb .w, #kb .b').forEach(el=> el.classList.toggle('on', on.has(+el.dataset.pc)));
    const lab=document.getElementById('kblabel'); if(lab) lab.textContent='custom chord · '+ownNoteNames(); }
  function toggleNote(pc){
    ensureAudio();
    const set=new Set(ownNotes);
    if(set.has(pc)) set.delete(pc); else set.add(pc);
    if(set.size===0) set.add(pc);
    ownNotes=[...set];
    buildScale(); syncKeyboard();
    if(AC && soundOn){ const m=60+pc; note(440*Math.pow(2,(m-69)/12), 0.5); }
  }
  function setOwnMode(on){
    ownMode=on;
    document.getElementById('chordSel').style.display = on?'none':'';
    document.getElementById('keySel').style.display   = on?'none':'';
    document.getElementById('kbwrap').style.display   = on?'':'none';
    document.querySelectorAll('#modeToggle .seg').forEach(b=> b.classList.toggle('active', b.dataset.m===(on?'own':'presets')));
    if(on){ document.documentElement.style.setProperty('--accent','#cfd8e6'); accentRGB=hexToRgb('#cfd8e6'); }
    else  { const s=SCALES[scaleIdx]; document.documentElement.style.setProperty('--accent',s.accent); accentRGB=hexToRgb(s.accent); }
    buildScale(); syncKeyboard();
    if(on) previewScale();
  }

  document.getElementById("moodPrev").onclick=()=>{ ensureAudio(); setScale(scaleIdx-1, true); };
  document.getElementById("moodNext").onclick=()=>{ ensureAudio(); setScale(scaleIdx+1, true); };
  document.getElementById("keyPrev").onclick=()=>{ ensureAudio(); setRoot(rootIdx-1, true); };
  document.getElementById("keyNext").onclick=()=>{ ensureAudio(); setRoot(rootIdx+1, true); };
  document.getElementById("octPrev").onclick=()=>{ ensureAudio(); setOctave(regIdx-1); };
  document.getElementById("octNext").onclick=()=>{ ensureAudio(); setOctave(regIdx+1); };
  document.getElementById("voicePrev").onclick=()=>{ ensureAudio(); setVoice(voiceIdx-1); };
  document.getElementById("voiceNext").onclick=()=>{ ensureAudio(); setVoice(voiceIdx+1); };
  document.querySelectorAll(".fxbtn").forEach(b=>{
    const k=b.dataset.k;
    const fire=()=>{ ensureAudio(); if(JAM[k]){ JAM[k][1](); jamFlash(JAM[k][0]); b.classList.add("hit"); setTimeout(()=>b.classList.remove("hit"),180); } };
    b.addEventListener("click", fire);
    b.addEventListener("touchstart", e=>{ e.preventDefault(); fire(); }, {passive:false});
  });
  (function(){
    const BG=[["bg-morph","MORPH"],["bg-original","ORIGINAL"],["bg-pixel","PIXEL"]];
    let bi=0; const btn=document.getElementById("bgToggle");
    function apply(){ bloom.className=BG[bi][0]; if(btn) btn.textContent="BG · "+BG[bi][1]; }
    if(btn){ btn.addEventListener("click", ()=>{ bi=(bi+1)%BG.length; apply(); }); apply(); }
  })();
  document.getElementById("speedPrev").onclick=()=>{ ensureAudio(); setSpeed(speedIdx-1); };
  document.getElementById("speedNext").onclick=()=>{ ensureAudio(); setSpeed(speedIdx+1); };

  const TIPS = {
    modeToggle:"<b>Presets</b> = ready-made chords. <b>Custom</b> lets you pick your own notes on a keyboard.",
    chordSel:"<b>Chord</b> — the set of notes the grid plays. Each row is mapped to one note.",
    keySel:"<b>Key</b> — the root note everything is tuned around.",
    octSel:"<b>Octave</b> — shifts the whole register up or down.",
    voiceSel:"<b>Voice</b> — the synth sound. SINE is closest to the original.",
    speedSel:"<b>Speed</b> — how fast the playhead sweeps. CHILL is the relaxed default.",
    pad:"<b>FX pad</b> — drag inside: left↔right = delay, up↕down = reverb.",
    bHoldTop:"<b>Hold</b> — freeze the current loop so you can send it to Audiotool.",
    exportBtn:"<b>Export</b> — renders 4 loops (with FX tails) and downloads a .wav.",
    mute:"Toggle the <b>sound</b> on or off.",
    pause:"<b>Pause</b> the game.",
    board:"Blocks fall here. <b>← →</b> move · <b>↑</b> rotate · <b>space</b> drop. The playhead turns your stack into music.",
  };
  Object.keys(TIPS).forEach(id=>{ const el=document.getElementById(id); if(el) el.setAttribute("data-tip", TIPS[id]); });

  const tip=document.getElementById("tip");
  const shownTips=new Set();
  let tipTimer=null;
  function showTip(el){
    const msg=el.getAttribute("data-tip"); if(!msg) return;
    tip.innerHTML=msg; tip.classList.add("show");
    const r=el.getBoundingClientRect(), tr=tip.getBoundingClientRect();
    let x=r.left + r.width/2 - tr.width/2;
    let y=r.bottom + 8;
    if(y + tr.height > window.innerHeight-8) y = r.top - tr.height - 8;
    x=Math.max(8, Math.min(x, window.innerWidth - tr.width - 8));
    tip.style.left=x+"px"; tip.style.top=Math.max(8,y)+"px";
    clearTimeout(tipTimer); tipTimer=setTimeout(hideTip, 4500);
  }
  function hideTip(){ tip.classList.remove("show"); }
  document.addEventListener("mouseover", e=>{
    const el=e.target.closest("[data-tip]"); if(!el || shownTips.has(el)) return;
    shownTips.add(el); showTip(el);
  });
  document.addEventListener("mouseout", e=>{
    const el=e.target.closest("[data-tip]"); if(!el) return;
    if(!e.relatedTarget || !el.contains(e.relatedTarget)) hideTip();
  });
  document.querySelectorAll('#modeToggle .seg').forEach(b=> b.addEventListener('click',()=>{ ensureAudio(); setOwnMode(b.dataset.m==='own'); }));
  buildKeyboard();
  setRoot(2, false);
  setScale(0, false);
  setOwnMode(false);

  reset(); running=false; render();

  // ---- hooks for the Audiotool bridge ----
  window.__tonefall = {
    isFrozen: () => frozen,
    getStepMs: () => stepMs,
    getBpm: () => Math.round(60000 / (stepMs * 4)),
    getLoopNotes: () => {
      const SemiBreve = 15360, stepT = SemiBreve / COLS, out = [];
      for (let c = 0; c < COLS; c++) {
        let count = 0; for (let y = 0; y < ROWS; y++) if (grid[y][c] || pieceCellColor(c, y)) count++;
        for (let y = 0; y < ROWS; y++) {
          if (grid[y][c] || pieceCellColor(c, y)) {
            const ni = ROWS - 1 - y, f = FREQS[ni];
            const pitch = Math.round(69 + 12 * Math.log2(f / 440));
            out.push({ pitch, positionTicks: c * stepT, durationTicks: stepT, velocity: 0.7 });
          }
        }
      }
      return out;
    },
    renderWavBlob,
    renderLoopWavClean,
    renderSendWav,
    barTicks: 15360,
    sendDurationTicks: 15360 * 4,
  };
}