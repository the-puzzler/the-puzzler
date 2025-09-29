// posts/self-organising-text.js
// - Keeps your H1 scramble → reveal
// - Adds a 1D Ising space–time ("snake") demo with a T slider
// This file is loaded as a module by your sidecar loader after the post renders.

/* =========================
   Section 1: H1 Scramble
   ========================= */
   (function(){
    function runScramble(){
      try{
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  
        const postRoot = document.querySelector('.post');
        if (!postRoot) return;
        const h1 = postRoot.querySelector('h1');
        if (!h1) return;
  
        const finalText = (h1.getAttribute('data-title') || h1.textContent || '').trim();
        if (!finalText) return;
  
        const ABC   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const slots = [...finalText];
        const revealDelays = slots.map((_, i) => i / Math.max(slots.length - 1, 1));
  
        let done = false;
        function scramble(el, duration = 1400) {
          const t0 = performance.now();
          function frame(now) {
            if (done) return;
            const t = Math.min(1, (now - t0) / duration);
            const out = slots.map((ch, i) => {
              if (ch === ' ') return ' ';
              const thresh = revealDelays[i] * 0.85;
              return t >= thresh ? ch : ABC[(Math.random() * ABC.length) | 0];
            }).join('');
            el.textContent = out;
            if (t < 1) requestAnimationFrame(frame);
            else { el.textContent = finalText; done = true; }
          }
          requestAnimationFrame(frame);
        }
        scramble(h1, 1400);
      }catch(e){ console.debug('scramble failed', e); }
    }
  
    document.addEventListener('post:ready', runScramble, { once:true });
  
    // Fallback if post:ready fired before this script loaded
    if (document.readyState !== 'loading') {
      setTimeout(runScramble, 0);
    } else {
      document.addEventListener('DOMContentLoaded', runScramble, { once:true });
    }
  })();
  
  /* =========================
     Section 2: 1D Ising Demo
     ========================= */
  // Expected HTML somewhere in the post:
  //
  // <h2>Interactive: 1D Ising (Space–Time “Snake”)</h2>
  // <div id="ising-demo" class="ising-widget">
  //   <div class="ising-controls">
  //     <label>Temperature T:
  //       <input id="ising-T" type="range" min="0.01" max="5" step="0.01" value="2.00">
  //     </label>
  //     <output id="ising-T-out">2.00</output>
  //     <button id="ising-toggle">Start</button>
  //     <button id="ising-step">Step</button>
  //     <label class="inline"><input id="ising-reset" type="checkbox"> Randomize on reset</label>
  //     <button id="ising-clear">Clear</button>
  //   </div>
  //   <canvas id="ising-canvas" aria-label="1D Ising space-time visualization"></canvas>
  //   <small class="ising-hint">Each row is one sweep. Dark = spin −1, light = spin +1. Periodic boundary.</small>
  // </div>
  
  (function(){
    function initIsingDemo(){
      const root = document.getElementById('ising-demo');
      if (!root) return; // silently skip if the block isn't in this post
  
      const elT       = root.querySelector('#ising-T');
      const elTOut    = root.querySelector('#ising-T-out');
      const btnToggle = root.querySelector('#ising-toggle');
      const btnStep   = root.querySelector('#ising-step');
      const chkReset  = root.querySelector('#ising-reset');
      const btnClear  = root.querySelector('#ising-clear');
      const canvas    = root.querySelector('#ising-canvas');
      const ctx       = canvas.getContext('2d', { alpha: false });
  
      // ----- Model params -----
      const N  = 256;   // lattice size
      const J  = 1.0;   // coupling
      const kb = 1.0;   // Boltzmann constant (absorbed in T)
      let T    = parseFloat(elT?.value || '2.0');
  
      // ----- State -----
      let spins = new Int8Array(N);
      const randSpin = () => (Math.random() < 0.5 ? -1 : +1);
      const allUp    = () => 1;
  
      function initSpins(randomize = true){
        for (let i = 0; i < N; i++) spins[i] = (randomize ? randSpin() : allUp());
      }
  
      const left  = (i) => (i > 0      ? i - 1 : -1);
        const right = (i) => (i < N - 1  ? i + 1 : -1);

  
      function metropolisSweep(){
        for (let n = 0; n < N; n++){
          const i = (Math.random() * N) | 0;
          const s = spins[i];
          const li = left(i), ri = right(i);
        const sumNbr =
        (li !== -1 ? spins[li] : 0) +
        (ri !== -1 ? spins[ri] : 0);
          const dE = 2 * J * s * sumNbr;
          if (dE <= 0) {
            spins[i] = -s;
          } else {
            const p = Math.exp(-dE / (kb * Math.max(T, 1e-9)));
            if (Math.random() < p) spins[i] = -s;
          }
        }
      }
  
      // ----- Canvas: one sweep = one row -----
      let deviceRatio = Math.max(1, Math.floor(window.devicePixelRatio || 1));
      let pixW = 1;
      let rowCursor = 0;
  
      function resizeCanvas(){
        const cssW = canvas.clientWidth;
        const cssH = canvas.clientHeight || 220;
  
        pixW = Math.max(1, Math.floor((cssW * deviceRatio) / N));
        const backingW = N * pixW;
        const backingH = Math.max(50, Math.floor(cssH * deviceRatio));
  
        canvas.width = backingW;
        canvas.height = backingH; // 1px per row; tall canvas = many rows
  
        rowCursor = 0;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
  
      function drawCurrentRow(){
        for (let x = 0; x < N; x++){
          ctx.fillStyle = spins[x] > 0 ? '#f1f5f9' : '#0f172a';
          ctx.fillRect(x * pixW, rowCursor, pixW, 1);
        }
        rowCursor = (rowCursor + 1) % canvas.height;
      }
  
      function fadeRowAt(y){
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, y, canvas.width, 1);
        ctx.globalAlpha = 1.0;
      }
  
      // ----- Animation -----
      let running = false;
      let rafId = 0;
  
      function frame(){
        // 1 sweep per frame keeps it visually clear
        metropolisSweep();
        drawCurrentRow();
        if (rowCursor === 0) fadeRowAt(canvas.height - 1);
        if (running) rafId = requestAnimationFrame(frame);
      }
  
      function start(){
        if (running) return;
        running = true;
        rafId = requestAnimationFrame(frame);
        if (btnToggle) btnToggle.textContent = 'Pause';
      }
      function pause(){
        running = false;
        cancelAnimationFrame(rafId);
        if (btnToggle) btnToggle.textContent = 'Start';
      }
      function stepOnce(){
        if (running) pause();
        metropolisSweep();
        drawCurrentRow();
      }
  
      // ----- UI wiring -----
      if (elT) elT.addEventListener('input', () => {
        T = parseFloat(elT.value);
        if (elTOut) elTOut.textContent = T.toFixed(2);
      });
      if (btnToggle) btnToggle.addEventListener('click', () => (running ? pause() : start()));
      if (btnStep)   btnStep.addEventListener('click', stepOnce);
      if (btnClear)  btnClear.addEventListener('click', () => {
        pause();
        initSpins(chkReset?.checked);
        resizeCanvas();
        drawCurrentRow();
      });
  
      const doResize = () => {
        deviceRatio = Math.max(1, Math.floor(window.devicePixelRatio || 1));
        resizeCanvas();
      };
      window.addEventListener('resize', doResize);
      window.addEventListener('orientationchange', () => setTimeout(doResize, 60), { passive: true });
  
      // ----- Boot -----
      initSpins(true);
      resizeCanvas();
      drawCurrentRow();
    }
  
    // Ensure MathJax & layout complete (your app dispatches this)
    document.addEventListener('post:ready', initIsingDemo, { once:true });
  
    // Fallback if needed
    if (document.readyState !== 'loading') {
      setTimeout(initIsingDemo, 0);
    } else {
      document.addEventListener('DOMContentLoaded', initIsingDemo, { once:true });
    }
  })();




// --- super lightweight m_min(L) chart ---
(function(){
    function initMChartLite(){
      const root = document.getElementById('m-threshold-lite');
      if (!root) return;
  
      const rT = root.querySelector('#mT');
      const oT = root.querySelector('#mTOut');
      const rJ = root.querySelector('#mJ');
      const oJ = root.querySelector('#mJOut');
      const nLMax = root.querySelector('#mLMax');
      const canvas = root.querySelector('#mCanvasLite');
      const ctx = canvas.getContext('2d', { alpha:false });
  
      // State
      let T = parseFloat(rT.value);
      let J = parseFloat(rJ.value);
      let Lmin = 2;
      let Lmax = Math.max(10, parseInt(nLMax.value || '100000', 10));
      const kB = 1.0;
  
      // Rendering params
      let dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
      const SAMPLES = 256; // small & fast
      let needsRedraw = true;
  
      function schedule(){ if (!needsRedraw){ needsRedraw = true; requestAnimationFrame(draw); } }
  
      function resize(){
        dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
        const cssW = canvas.clientWidth;
        const cssH = canvas.clientHeight || 220;
        canvas.width  = Math.max(320, Math.floor(cssW * dpr));
        canvas.height = Math.max(160, Math.floor(cssH * dpr));
        needsRedraw = true;
        requestAnimationFrame(draw);
      }
  
      function mMin(L){
        const v = (kB * T / J) * Math.log(L);
        return v > 0 ? Math.sqrt(v) : 0;
      }
  
      // Precompute L grid in log-space (cheap & stable)
      let Ls = [];
      function recomputeGrid(){
        Ls.length = 0;
        const a = Math.log(Lmin), b = Math.log(Lmax);
        for (let i = 0; i < SAMPLES; i++){
          const t = i / (SAMPLES - 1);
          Ls.push(Math.exp(a + t * (b - a)));
        }
      }
  
      function draw(){
        if (!needsRedraw) return;
        needsRedraw = false;
  
        const W = canvas.width, H = canvas.height;
        const padL = 44 * dpr, padB = 40 * dpr, padT = 10 * dpr, padR = 10 * dpr;
  
        // Clear
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0,0,W,H);
  
        // Compute curve & yMax once
        let yMax = 0;
        const ys = new Float32Array(SAMPLES);
        for (let i = 0; i < SAMPLES; i++){
          const y = mMin(Ls[i]);
          ys[i] = y;
          if (y > yMax) yMax = y;
        }
        // pad yMax a touch
        yMax = Math.max(1, yMax * 1.1);
  
        // Axes
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, padT);
        ctx.lineTo(padL, H - padB);
        ctx.lineTo(W - padR, H - padB);
        ctx.stroke();
  
        // Simple ticks: y = 0..ceil(yMax) step 0.5
        ctx.fillStyle = '#000';
        ctx.font = `${Math.max(10, 12*dpr)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        const yStep = 0.5;
        for (let y = 0; y <= yMax; y += yStep){
          const py = mapY(y, yMax, H, padT, padB);
          ctx.globalAlpha = 0.08;
          ctx.fillRect(padL+1, Math.round(py)+0.5, W - padL - padR - 1, 1);
          ctx.globalAlpha = 1;
          ctx.fillText(y.toFixed(1), padL - 6, py);
        }
  
        // X ticks: 5 powers between Lmin and Lmax
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const logA = Math.log10(Lmin), logB = Math.log10(Lmax);
        const tickN = 5;
        for (let i = 0; i <= tickN; i++){
          const p = logA + (i/tickN)*(logB - logA);
          const Ltick = Math.pow(10, p);
          const x = mapXLog(Ltick, Lmin, Lmax, W, padL, padR);
          ctx.globalAlpha = 0.08;
          ctx.fillRect(Math.round(x)+0.5, padT, 1, H - padT - padB);
          ctx.globalAlpha = 1;
          ctx.fillText(formatL(Ltick), x, H - padB + 6);
        }
  
        // Shade region m > m_min(L) (super cheap polygon)
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.beginPath();
        for (let i = 0; i < SAMPLES; i++){
          const x = mapXLog(Ls[i], Lmin, Lmax, W, padL, padR);
          const y = mapY(ys[i], yMax, H, padT, padB);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineTo(W - padR, H - padB);
        ctx.lineTo(padL, H - padB);
        ctx.closePath();
        ctx.fill();
  
        // Curve
        ctx.strokeStyle = '#000';
        ctx.lineWidth = Math.max(1, dpr);
        ctx.beginPath();
        for (let i = 0; i < SAMPLES; i++){
          const x = mapXLog(Ls[i], Lmin, Lmax, W, padL, padR);
          const y = mapY(ys[i], yMax, H, padT, padB);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
  
        // Labels
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('sequence length L (log scale)', (padL + (W - padR))/2, H - padB + 22);
        ctx.save();
        ctx.translate(16, (H - padB + padT)/2);
        ctx.rotate(-Math.PI/2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('m', 0, 0);
        ctx.restore();
      }
  
      function mapXLog(L, Lmin, Lmax, W, padL, padR){
        const t = (Math.log(L) - Math.log(Lmin)) / (Math.log(Lmax) - Math.log(Lmin));
        return padL + t * (W - padL - padR);
      }
      function mapY(val, yMax, H, padT, padB){
        const t = val / yMax;
        return (H - padB) - t * (H - padT - padB);
      }
      function formatL(L){
        if (L < 1000) return Math.round(L).toString();
        const e = Math.floor(Math.log10(L));
        const m = L / Math.pow(10, e);
        return m.toFixed(1) + 'e' + e;
      }
  
      // Wire inputs (debounced via rAF)
      rT.addEventListener('input', () => { T = parseFloat(rT.value); oT.textContent = T.toFixed(2); schedule(); });
      rJ.addEventListener('input', () => { J = parseFloat(rJ.value); oJ.textContent = J.toFixed(2); schedule(); });
      nLMax.addEventListener('change', () => {
        Lmax = Math.max(10, parseInt(nLMax.value || '100000', 10));
        recomputeGrid(); schedule();
      });
  
      // Resize
      const onResize = (() => {
        let t = 0;
        return () => { clearTimeout(t); t = setTimeout(resize, 120); };
      })();
      window.addEventListener('resize', onResize, { passive:true });
      window.addEventListener('orientationchange', () => setTimeout(resize, 80), { passive:true });
  
      // Boot
      recomputeGrid();
      resize();
    }
  
    document.addEventListener('post:ready', initMChartLite, { once:true });
    if (document.readyState !== 'loading') setTimeout(initMChartLite, 0);
    else document.addEventListener('DOMContentLoaded', initMChartLite, { once:true });
  })();
  
// --- 1D Ising "snake" with interaction radius m (open boundaries) ---
(function () {
    function initIsingRangeDemo() {
      const root = document.getElementById('ising-range-demo');
      if (!root) return;
  
      // UI
      const elT = root.querySelector('#ir-T');
      const elTOut = root.querySelector('#ir-T-out');
      const elR = root.querySelector('#ir-R');
      const elROut = root.querySelector('#ir-R-out');
      const btnToggle = root.querySelector('#ir-toggle');
      const btnStep = root.querySelector('#ir-step');
      const chkReset = root.querySelector('#ir-reset');
      const btnClear = root.querySelector('#ir-clear');
      const canvas = root.querySelector('#ir-canvas');
      const ctx = canvas.getContext('2d', { alpha: false });
  
      // ----- Model params -----
      const N = 256;     // number of spins (width)
      const J = 1.0;     // coupling
      const kb = 1.0;    // Boltzmann constant (absorbed into T)
      let T = parseFloat(elT.value);
      let R = parseInt(elR.value, 10); // interaction radius m
  
      // ----- State -----
      let spins = new Int8Array(N);
      const randSpin = () => (Math.random() < 0.5 ? -1 : +1);
      const allUp = () => 1;
  
      function initSpins(randomize = true) {
        for (let i = 0; i < N; i++) spins[i] = (randomize ? randSpin() : allUp());
      }
  
      // Open-boundary neighbor sum within radius R
      function neighborSum(i) {
        let s = 0;
        // sum over k = 1..R of both sides if in-bounds
        for (let k = 1; k <= R; k++) {
          const li = i - k;
          const ri = i + k;
          if (li >= 0) s += spins[li];
          if (ri < N) s += spins[ri];
        }
        return s;
      }
  
      // One Metropolis sweep (N attempted flips)
      function metropolisSweep() {
        const beta = 1 / Math.max(T, 1e-9);
        for (let n = 0; n < N; n++) {
          const i = (Math.random() * N) | 0;
          const s = spins[i];
          const sumNbr = neighborSum(i);
          const dE = 2 * J * s * sumNbr;
          if (dE <= 0) {
            spins[i] = -s;
          } else if (Math.random() < Math.exp(-beta * dE)) {
            spins[i] = -s;
          }
        }
      }
  
      // ----- Canvas (space-time snake) -----
      let deviceRatio = Math.max(1, Math.floor(window.devicePixelRatio || 1));
      let pixW = 1;           // pixel width per site horizontally in backing store
      let rowCursor = 0;
  
      function resizeCanvas() {
        const cssW = canvas.clientWidth;
        const cssH = canvas.clientHeight || 220;
  
        pixW = Math.max(1, Math.floor((cssW * deviceRatio) / N));
        const backingW = N * pixW;
        const backingH = Math.max(50, Math.floor(cssH * deviceRatio));
  
        canvas.width = backingW;
        canvas.height = backingH;
  
        rowCursor = 0;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
  
      function drawCurrentRow() {
        for (let x = 0; x < N; x++) {
          ctx.fillStyle = spins[x] > 0 ? '#f1f5f9' : '#0f172a';
          ctx.fillRect(x * pixW, rowCursor, pixW, 1);
        }
        rowCursor = (rowCursor + 1) % canvas.height;
      }
  
      function fadeRowAt(y) {
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, y, canvas.width, 1);
        ctx.globalAlpha = 1.0;
      }
  
      // ----- Animation -----
      let running = false;
      let rafId = 0;
  
      function frame() {
        metropolisSweep();
        drawCurrentRow();
        if (rowCursor === 0) fadeRowAt(canvas.height - 1);
        if (running) rafId = requestAnimationFrame(frame);
      }
  
      function start() {
        if (running) return;
        running = true;
        rafId = requestAnimationFrame(frame);
        btnToggle.textContent = 'Pause';
      }
      function pause() {
        running = false;
        cancelAnimationFrame(rafId);
        btnToggle.textContent = 'Start';
      }
      function stepOnce() {
        if (running) pause();
        metropolisSweep();
        drawCurrentRow();
      }
  
      // ----- UI wiring -----
      elT.addEventListener('input', () => {
        T = parseFloat(elT.value);
        elTOut.textContent = T.toFixed(2);
      });
  
      elR.addEventListener('input', () => {
        R = parseInt(elR.value, 10) || 1;
        elROut.textContent = String(R);
        // No need to clear; the new radius applies from next sweep
      });
  
      btnToggle.addEventListener('click', () => { running ? pause() : start(); });
      btnStep.addEventListener('click', stepOnce);
      btnClear.addEventListener('click', () => {
        pause();
        initSpins(chkReset.checked);
        resizeCanvas();
        drawCurrentRow();
      });
  
      const doResize = () => {
        deviceRatio = Math.max(1, Math.floor(window.devicePixelRatio || 1));
        resizeCanvas();
      };
      window.addEventListener('resize', doResize);
      window.addEventListener('orientationchange', () => setTimeout(doResize, 60), { passive: true });
  
      // ----- Boot -----
      initSpins(true);
      resizeCanvas();
      drawCurrentRow();
    }
  
    // Wait until your post is fully assembled/typeset
    document.addEventListener('post:ready', initIsingRangeDemo, { once: true });
    if (document.readyState !== 'loading') setTimeout(initIsingRangeDemo, 0);
    else document.addEventListener('DOMContentLoaded', initIsingRangeDemo, { once: true });
  })();
  