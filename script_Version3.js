// DEBUG-friendly script.js for Image → G-Code
// Replaces the original and exposes debug info on window.debugPlotter
(function(){
  const fileInput = document.getElementById('file');
  const thresholdInput = document.getElementById('threshold');
  const canvas = document.getElementById('previewCanvas');
  const ctx = canvas && canvas.getContext && canvas.getContext('2d', {alpha:false});
  const generateBtn = document.getElementById('generate');
  const downloadBtn = document.getElementById('download');
  const gcodeView = document.getElementById('gcodeView');
  const statusEl = document.getElementById('status') || document.createElement('div');

  const scaleInput = document.getElementById('scale');
  const feedInput = document.getElementById('feed');
  const travelInput = document.getElementById('travel');
  const useZInput = document.getElementById('useZ');
  const zUpInput = document.getElementById('zUp');
  const zDownInput = document.getElementById('zDown');
  const laserInput = document.getElementById('laser');

  if (!ctx) {
    console.error('Canvas 2D context not available.');
    if (statusEl) statusEl.textContent = 'Canvas 2D not available in this browser.';
    return;
  }

  // Expose debug object
  window.debugPlotter = { lastPaths: null, lastImage: null, errors: [] };

  function logStatus(msg){
    console.log('[Image→GCode] ' + msg);
    if (statusEl) statusEl.textContent = msg;
  }

  function recordError(e){
    console.error(e);
    window.debugPlotter.errors.push((e && e.stack) ? e.stack : String(e));
    logStatus('Error: ' + (e && e.message ? e.message : String(e)));
  }

  // Safe addEvent wrapper
  try {
    fileInput && fileInput.addEventListener('change', handleFile);
    thresholdInput && thresholdInput.addEventListener('input', () => {
      if (window.debugPlotter.lastImage) drawImageAndTrace(window.debugPlotter.lastImage);
    });
    generateBtn && generateBtn.addEventListener('click', () => {
      try {
        if (!window.debugPlotter.lastPaths) { logStatus('No traced paths found. Load an image first.'); return; }
        const opts = getOptions();
        logStatus('Generating G-Code...');
        const gcode = generateGCode(window.debugPlotter.lastPaths, opts);
        gcodeView.textContent = gcode;
        downloadBtn.disabled = false;
        downloadBtn.onclick = () => downloadText(gcode, 'plot.gcode');
        logStatus('G-Code generated.');
      } catch (err) {
        recordError(err);
      }
    });
  } catch(e){
    recordError(e);
  }

  function handleFile(e){
    try {
      const f = e.target.files && e.target.files[0];
      if (!f) { logStatus('No file selected.'); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          window.debugPlotter.lastImage = img;
          try {
            drawImageAndTrace(img);
            if (generateBtn) generateBtn.disabled = false;
            logStatus('Image loaded and traced. Click "Generate G-Code".');
          } catch (err) { recordError(err); }
        };
        img.onerror = (err) => { recordError(new Error('Image load error')); };
        img.src = ev.target.result;
      };
      reader.onerror = () => recordError(new Error('File read error'));
      reader.readAsDataURL(f);
    } catch (err) { recordError(err); }
  }

  function drawImageAndTrace(img){
    const maxW = canvas.width, maxH = canvas.height;
    let w = img.width, h = img.height;
    const ratio = Math.min(maxW/w, maxH/h, 1);
    w = Math.floor(w * ratio); h = Math.floor(h * ratio);
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img, 0,0,w,h);
    const imageData = ctx.getImageData(0,0,w,h);
    const thresh = parseInt(thresholdInput.value,10) || 128;
    const grid = [];
    for (let y=0;y<h;y++){
      const row=[];
      for (let x=0;x<w;x++){
        const i=(y*w+x)*4;
        const r=imageData.data[i], g=imageData.data[i+1], b=imageData.data[i+2];
        const lum=0.299*r+0.587*g+0.114*b;
        row.push(lum < thresh ? 1 : 0);
      }
      grid.push(row);
    }
    const paths = marchingSquares(grid);
    window.debugPlotter.lastPaths = paths;
    // draw overlay
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,w,h);
    ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 1; ctx.beginPath();
    for (const p of paths){
      if (p.length < 2) continue;
      ctx.moveTo(p[0].x, p[0].y);
      for (let i=1;i<p.length;i++) ctx.lineTo(p[i].x, p[i].y);
    }
    ctx.stroke();
  }

  // marchingSquares (same implementation)
  function marchingSquares(grid){
    try {
      const h=grid.length, w=(h?grid[0].length:0), segments=[];
      function mix(a,b){ return {x:(a.x+b.x)/2, y:(a.y+b.y)/2}; }
      for (let y=0;y<h-1;y++){
        for (let x=0;x<w-1;x++){
          const tl=grid[y][x], tr=grid[y][x+1], bl=grid[y+1][x], br=grid[y+1][x+1];
          const idx=(tl<<3)|(tr<<2)|(br<<1)|(bl<<0);
          const A={x:x+0,y:y+0}, B={x:x+1,y:y+0}, C={x:x+1,y:y+1}, D={x:x+0,y:y+1};
          const mAB=mix(A,B), mBC=mix(B,C), mCD=mix(C,D), mDA=mix(D,A);
          switch(idx){
            case 0: break;
            case 1: segments.push([mCD,mDA]); break;
            case 2: segments.push([mBC,mCD]); break;
            case 3: segments.push([mBC,mDA]); break;
            case 4: segments.push([mAB,mBC]); break;
            case 5: segments.push([mAB,mDA]); segments.push([mBC,mCD]); break;
            case 6: segments.push([mAB,mCD]); break;
            case 7: segments.push([mAB,mDA]); break;
            case 8: segments.push([mAB,mDA]); break;
            case 9: segments.push([mAB,mCD]); break;
            case 10: segments.push([mAB,mBC]); segments.push([mCD,mDA]); break;
            case 11: segments.push([mAB,mBC]); break;
            case 12: segments.push([mBC,mDA]); break;
            case 13: segments.push([mBC,mCD]); break;
            case 14: segments.push([mCD,mDA]); break;
            case 15: break;
          }
        }
      }
      // join segments
      const key=(p)=>`${p.x.toFixed(4)},${p.y.toFixed(4)}`;
      const endMap=new Map(), used=new Array(segments.length).fill(false);
      for (let i=0;i<segments.length;i++){
        const s=segments[i], k1=key(s[0]), k2=key(s[1]);
        if (!endMap.has(k1)) endMap.set(k1,[]); if (!endMap.has(k2)) endMap.set(k2,[]);
        endMap.get(k1).push({seg:i,end:0}); endMap.get(k2).push({seg:i,end:1});
      }
      const paths=[];
      for (let i=0;i<segments.length;i++){
        if (used[i]) continue;
        used[i]=true; const s=segments[i];
        let path=[s[0],s[1]], curEnd=s[1];
        while(true){
          const neighbors = endMap.get(key(curEnd))||[]; let found=false;
          for (const n of neighbors) if (!used[n.seg]){ used[n.seg]=true; const seg=segments[n.seg];
            let next = (Math.abs(seg[0].x-curEnd.x)<1e-6 && Math.abs(seg[0].y-curEnd.y)<1e-6) ? seg[1] : seg[0];
            path.push(next); curEnd=next; found=true; break;
          }
          if (!found) break;
        }
        curEnd = s[0];
        while(true){
          const neighbors = endMap.get(key(curEnd))||[]; let found=false;
          for (const n of neighbors) if (!used[n.seg]){ used[n.seg]=true; const seg=segments[n.seg];
            let next = (Math.abs(seg[0].x-curEnd.x)<1e-6 && Math.abs(seg[0].y-curEnd.y)<1e-6) ? seg[1] : seg[0];
            path.unshift(next); curEnd=next; found=true; break;
          }
          if (!found) break;
        }
        if (path.length>1) paths.push(path.map(p=>({x:p.x,y:p.y})));
      }
      return paths;
    } catch (err){ recordError(err); return []; }
  }

  // G-Code generation (same)
  function generateGCode(paths, opts){
    try {
      const lines=[];
      lines.push('; Generated by Image→G-Code tool');
      lines.push('G21 ; units = mm'); lines.push('G90 ; absolute coords'); lines.push('');
      lines.push(`; scale: ${opts.scale} mm/px`); lines.push(`F${opts.travel}`);
      for (const path of paths){
        if (!path || path.length<1) continue;
        const start = transformPoint(path[0], opts);
        if (opts.useZ && !opts.laser) lines.push(`G0 Z${opts.zUp.toFixed(3)}`); else if (opts.laser) lines.push('M5');
        lines.push(`G0 X${start.x.toFixed(3)} Y${start.y.toFixed(3)}`);
        if (opts.useZ && !opts.laser) lines.push(`G0 Z${opts.zDown.toFixed(3)}`); else if (opts.laser) lines.push('M3');
        lines.push(`F${opts.feed}`);
        for (let i=1;i<path.length;i++){ const p=transformPoint(path[i], opts); lines.push(`G1 X${p.x.toFixed(3)} Y${p.y.toFixed(3)}`); }
        if (opts.useZ && !opts.laser) lines.push(`G0 Z${opts.zUp.toFixed(3)}`); else if (opts.laser) lines.push('M5');
        lines.push('');
      }
      lines.push('; end'); return lines.join('\n');
    } catch (err){ recordError(err); return '; error generating gcode'; }
  }

  function transformPoint(p, opts){
    const bbox = getPathsBBox(window.debugPlotter.lastPaths || []);
    const x_mm = (p.x - bbox.minX) * opts.scale;
    const y_mm = ((bbox.maxY - p.y)) * opts.scale;
    return {x: x_mm, y: y_mm};
  }

  function getPathsBBox(paths){
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    for (const p of paths){ for (const pt of p){ if (pt.x < minX) minX = pt.x; if (pt.y < minY) minY = pt.y; if (pt.x > maxX) maxX = pt.x; if (pt.y > maxY) maxY = pt.y; } }
    if (!isFinite(minX)){ minX=minY=maxX=maxY=0; }
    return {minX,minY,maxX,maxY};
  }

  function getOptions(){
    return {
      scale: parseFloat(scaleInput.value) || 0.25,
      feed: parseFloat(feedInput.value) || 1000,
      travel: parseFloat(travelInput.value) || 3000,
      useZ: useZInput.checked,
      zUp: parseFloat(zUpInput.value) || 5,
      zDown: parseFloat(zDownInput.value) || 0,
      laser: laserInput.checked
    };
  }

  function downloadText(text, filename){
    try {
      const blob = new Blob([text], {type:'text/plain'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err){ recordError(err); }
  }

})();